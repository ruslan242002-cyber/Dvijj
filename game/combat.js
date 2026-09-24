'use strict';

/**
 * Боевая система целиком: pre_combat -> combat -> combat_stim_select,
 * плюс resolveCombatTurn — единая обработка результата хода (лут, опыт,
 * левел-ап, контракты, бестиарий/трофеи, фрагменты, "успокоение" сектора,
 * маршрутизация в куратор-квест или обратно в вылазку).
 */

const { resolveTurn } = require('../../engine/combat-engine.js');
const { aggregatePassiveEffects } = require('../../engine/passive-skills.js');
const { createStatusState, applyInjury, applyBleeding } = require('../../engine/status/statusEngine.js');
const { STATUS_SEVERITY } = require('../../engine/status/statusTypes.js');
const { resolvePlayerTurn } = require('../../engine/combat-turn.js');
const { SKILLS } = require('../../engine/skills-data.js');
const { stimButtons, stimIdByName } = require('../../engine/stim-buttons.js');
const { rollLoot } = require('../../engine/exploration-engine.js');
const { trackCombatAction } = require('../../engine/combat-training.js');
const { checkAchievements } = require('../../lib/achievements.js');
const { rollCompanionDrop, activeCompanionEffect } = require('../../engine/companions.js');
const { trySurvivalMechanic } = require('../../engine/mentor-classes.js');
const { applyDerivedStats } = require('../../engine/derived-stats.js');
const { returnFromPlanet } = require('./exploration.js');
const { rollLootByEnemyName } = require('../../engine/bestiary.js');
const { xpForKill, grantXp } = require('../../engine/leveling.js');
const { findStage, completeStage } = require('../../lib/npc-arcs.js');
const { recordDiscovery } = require('../../lib/discoveries.js');
const { addFactionReputation } = require('../../engine/reputation.js');
const { collectFragment } = require('../../lore/trakt-mythos.js');
const { loseFullCargo } = require('../../lib/trip-cargo.js');

// ⚠️ ПЕРЕДЕЛАНО ПО ПРЯМОМУ ЗАПРОСУ ПОЛЬЗОВАТЕЛЯ: раньше поражение было
// "бесплатным" — гарантированные 50% HP, эвакуация, ничего не терялось.
// Теперь: РЕДКИЙ шанс (EMERGENCY_POD_CHANCE) на спасение БЕЗ потерь —
// отдельная механика от классового trySurvivalMechanic() (та осталась
// как была, это ДОПОЛНИТЕЛЬНЫЙ, общий для всех, но редкий шанс). Если
// капсула не сработала — честное поражение: весь несданный груз
// теряется (loseFullCargo), HP падает до 1 (0-1% от макс — по прямому
// уточнению пользователя, не 50% и не 15%) И игрока выбрасывает из зоны
// (returnFromPlanet, та же функция, что уже использовалась для
// эвакуации — теперь просто ещё и с реальными потерями, не бесплатно).
const EMERGENCY_POD_CHANCE = 0.12;

async function resolveDefeat(deps, defeatedPlayer, combatLog, rng) {
  if (rng() < EMERGENCY_POD_CHANCE) {
    const toShip = await returnFromPlanet(deps, defeatedPlayer, '');
    const podText = `💥 ${combatLog}\n\n🛟 Аварийная капсула срабатывает в последний момент — редкая удача, груз цел.\n\n`;
    if (toShip) { toShip.reply.text = podText + toShip.reply.text; return toShip; }
    return { reply: { text: podText + 'Ты эвакуирован на станцию.', buttons: [] }, nextState: { scene: 'station', player: defeatedPlayer } };
  }

  const { lostTrip, lostInventory } = loseFullCargo(defeatedPlayer);
  const lostCount = lostTrip.length + lostInventory.reduce((s, i) => s + (i.qty || 0), 0);
  const brokenPlayer = { ...defeatedPlayer, hp: 1 };
  const lossNote = lostCount > 0 ? `📦 Груз потерян (${lostCount} ед.).` : '';
  const toShip = await returnFromPlanet(deps, brokenPlayer, '');
  const defeatText = `💥 ${combatLog}\n\n💀 Поражение. ${lossNote} Тебя вышвыривает из зоны — едва живого.\n\n`;
  if (toShip) { toShip.reply.text = defeatText + toShip.reply.text; return toShip; }
  return { reply: { text: defeatText + 'Ты эвакуирован на станцию.', buttons: [] }, nextState: { scene: 'station', player: brokenPlayer } };
}
const { checkContractProgress } = require('../../contracts/contracts-engine.js');
const { recordKill } = require('../../lib/trophies.js');
const { combatFullCard } = require('../../lib/combat-card.js');
const { explorationStatusCard } = require('../../lib/status-card.js');
const { imageForEnemy } = require('../enemy-images.js');
const { curatorQuestScreen } = require('./quests/curator.js');
const { pickEnemyAction } = require('../../engine/monster-abilities.js');
const { startCooldown, tickCooldowns } = require('../../engine/cooldowns.js');
const {
  stationButtons, skillButtons, skillIdByName, skillCooldownNote, addToInventory, journeyContinueButtons,
} = require('./common.js');
const { SCENES } = require('./ids.js');

async function resolveCombatTurn(deps, state, result, rng, { prevPlayerHp = null, prevEnemyHp = null, usedSkillId = null, playerId = null } = {}) {
  // Контракт "применить стим 2 раза" — засчитываем именно в момент, когда
  // стим реально применился в этот ход (false -> true), а не при каждом
  // ходе после этого.
  if (!state.stimUsedThisFight && result.stimUsedThisFight) {
    checkContractProgress(result.attacker, 'stim_used', {});
  }

  if (result.finished) {
    if (result.winner === 'attacker') {
      if (state.trainingFight) {
        return {
          reply: { text: `💥 ${result.log.join(' ')}\n\n✅ Дрон-манекен деактивирован. Тренировка окончена — это была только симуляция, статы и HP полностью восстановлены.`, buttons: ['Доложить куратору'] },
          nextState: { scene: 'quest_report', player: { ...result.attacker, hp: result.attacker.hpMax } }
        };
      }
      if (state.questSiteReturn) {
        // ⚠️ Победа в бою внутри многошагового расследования на месте
        // (lib/quest-sites.js). Возвращаемся к нужному шагу сценария
        // через ту же questSiteScreen — не завершаем квест здесь, шаг
        // сам решает, что дальше (обычно приводит к финальной находке).
        const { questSiteScreen } = require('./quest-site.js');
        const { QUEST_SITES } = require('../../lib/quest-sites.js');
        const player = { ...result.attacker, hp: result.attacker.hpMax };
        const site = { siteId: state.questSiteReturn.siteId, ...QUEST_SITES[state.questSiteReturn.siteId] };
        return questSiteScreen(player, site, state.questSiteReturn.onWinStep, `✅ Победа!\n\n${state.questSiteReturn.onWinText}\n\n`);
      }
      if (state.curatorQuest) {
        return curatorQuestScreen(deps, { ...result.attacker, hp: result.attacker.hpMax }, state.curatorQuest.questId, state.curatorQuest.winNext);
      }
      if (state.npcArcCombat) {
        // ⚠️ Победа в бою внутри квеста арки (см. named-character.js —
        // triggerCombat). Не храним функции/объект выбора в состоянии
        // (не переживёт сохранение между сообщениями) — ищем заново по
        // characterId+stageId+choiceText, тому же способу, каким игрок
        // его выбрал изначально.
        const { characterId, stageId, choiceText, backScene } = state.npcArcCombat;
        const player = { ...result.attacker, hp: result.attacker.hpMax };
        const stage = findStage(characterId, stageId);
        const resolvedChoices = stage ? (typeof stage.choices === 'function' ? stage.choices(player) : stage.choices) : [];
        const choice = resolvedChoices.find((c) => c.text === choiceText);
        if (stage && choice) {
          if (choice.winXp) grantXp(player, choice.winXp);
          if (choice.winLoot) addToInventory(player, choice.winLoot.resource, choice.winLoot.tier, choice.winLoot.qty);
          if (choice.winDiscovery) recordDiscovery(player, choice.winDiscovery);
          if (choice.winDiscoveries) choice.winDiscoveries.forEach((d) => recordDiscovery(player, d));
          if (choice.winArtifact) {
            const { grantQuestArtifact } = require('../../lib/artifacts.js');
            grantQuestArtifact(player, choice.winArtifact);
          }
          if (choice.winTrustDelta) {
            const { grantTrust } = require('../../lib/npc-trust.js');
            grantTrust(player, characterId, choice.winTrustDelta);
          }
          if (choice.winReputation) addFactionReputation(player, player.faction, choice.winReputation);
          completeStage(player, characterId, stageId);
          return {
            reply: { text: `⚔️ ${result.log.join(' ')}\n\n✅ Победа!\n\n${choice.winFlavor || ''}\n\n${stage.closingLine || ''}`, buttons: ['⬅️ Назад'] },
            nextState: { scene: backScene || 'station', player },
          };
        }
        // Стадия/выбор не нашлись (устарели) — не крашимся, просто
        // возвращаем на станцию с честной победой без спец-наград.
        return {
          reply: { text: `⚔️ ${result.log.join(' ')}\n\n✅ Победа!`, buttons: ['⬅️ Назад'] },
          nextState: { scene: backScene || 'station', player },
        };
      }
      const zone = state.zone || 'blue';
      const depth = state.depth || 0;
      const passiveEffects = aggregatePassiveEffects(result.attacker.equippedPassives || []);
      const loot = rollLoot(zone, rng, result.attacker.level || 1, null, passiveEffects.lootMultiplier);
      const companionEffect = activeCompanionEffect(result.attacker);
      if (companionEffect?.type === 'resourceFindBonus') {
        loot.qty = Math.round(loot.qty * (1 + companionEffect.amount));
      }
      const player = { ...result.attacker };
      addToInventory(player, loot.resource, loot.tier, loot.qty);
      // Фракционный перк Терминуса — +25% к кредитам с трофеев убийств
      // (тут и в PvP, см. game/scenes/pvp.js).
      const creditMult = player.faction === 'Терминус' ? 1.25 : 1;
      player.credits = (player.credits || 0) + Math.round(loot.credits * creditMult);
      player.killCount = (player.killCount || 0) + 1;
      if ((state.enemy.tier || 0) >= 5) player.highTierKills = (player.highTierKills || 0) + 1;
      checkContractProgress(player, 'combat_win', { zone });
      checkContractProgress(player, 'loot', { resource: loot.resource, amount: loot.qty });
      const xpGain = xpForKill(state.enemy.tier || 1, player.level || 1);
      const { leveledUp, level } = grantXp(player, xpGain);
      const bestiaryDrops = rollLootByEnemyName(state.enemy.name, rng);
      const chipDrops = bestiaryDrops.filter((d) => d.id.startsWith('chip_'));
      const trophyDrops = bestiaryDrops.filter((d) => !d.id.startsWith('chip_'));
      if (trophyDrops.length) player.bestiaryItems = [...(player.bestiaryItems || []), ...trophyDrops.map((d) => d.id)];
      if (chipDrops.length) player.passiveChips = [...(player.passiveChips || []), ...chipDrops.map((d) => d.id.replace(/^chip_/, ''))];

      let fragmentNote = '';
      if (state.fragmentId) {
        const res = collectFragment(player, state.fragmentId);
        if (res.success) fragmentNote = `\n✨ Фрагмент собран за победу над стражем.`;
      }

      let trophyNote = '';
      const kill = recordKill(player, state.enemy.bestiaryId);
      if (kill.isNew) trophyNote = `\n🏆 Новый трофей: ${kill.trophyName}!`;

      // Достижения (lib/achievements.js) — считаем именной ли это был
      // монстр (bestiaryId есть только у именных, не у процедурных врагов
      // зоны) и не пережил ли игрок близкий вызов на грани смерти.
      if (state.enemy.bestiaryId) player.namedKillCount = (player.namedKillCount || 0) + 1;
      if (zone === 'red' && player.hp > 0 && player.hp <= player.hpMax * 0.05) player.survivedCloseCall = true;

      let companionNote = '';
      if (state.enemy.bestiaryId) {
        const droppedCompanion = rollCompanionDrop(player, state.enemy.bestiaryId, rng);
        if (droppedCompanion) companionNote = `\n\n🐾 Редчайшая находка: компаньон «${droppedCompanion.name}»!`;
      }

      let calmedNote = '';
      if (state.sectorResident) {
        player.flags = player.flags || {};
        player.flags[`sector_${state.sectorResident.sectorId}_calmed`] = true;
        calmedNote = `\n🌌 ${state.enemy.name} наконец умолкла. Отголоски в этом секторе поутихнут.`;
      }

      // Целитель (2+ ступень) — доп. лечение сразу после победы, поверх
      // обычного восстановления от левел-апа (если он тоже случился).
      let postCombatHealNote = '';
      const classFx = player.classEffects || {};
      // ⚠️ QA-НАХОДКА: regenerationPct от пассивок ("+15/30/50% HP при
      // возврате на станцию") — базовой механики именно "возврат на
      // станцию" в игре не нашёл нигде, но ЭТА механика (лечение сразу
      // после победы, "поверх обычного восстановления") — ближайший и
      // единственный реальный аналог, туда же добавляю пассивку —
      // складывается с классовым бонусом, не заменяет его.
      const healPct = (classFx.postCombatHealPct || 0) + (passiveEffects.regenerationPct || 0);
      if (healPct > 0 && player.hp < player.hpMax) {
        const healAmount = Math.round(player.hpMax * healPct);
        const before = player.hp;
        player.hp = Math.min(player.hpMax, player.hp + healAmount);
        if (player.hp > before) postCombatHealNote = `\n💚 Восстановлено ${player.hp - before} HP после боя.`;
      }
      // Штурмовик (5 ступень) — гарантированный крит на СЛЕДУЮЩЕЙ атаке
      // (следующий бой, раз этот уже закончен победой) — читается в
      // engine/combat-engine.js как attacker.guaranteedCritNextAttack.
      if (classFx.guaranteedCritAfterKill) player.guaranteedCritNextAttack = true;

      let victoryText = `💥 ${result.log.join(' ')}\n\n🏆 ${state.enemy.name} уничтожен.\n💳 +${loot.credits} кредитов, +${loot.qty}× ${loot.resource} T${loot.tier}\n✨ +${xpGain} XP${fragmentNote}${trophyNote}${calmedNote}${companionNote}${postCombatHealNote}`;
      if (bestiaryDrops.length) victoryText += `\n🎖️ Особая добыча: ${bestiaryDrops.map((d) => d.name).join(', ')}`;
      if (leveledUp) victoryText += `\n🆙 Новый уровень: ${level}! (+2 очка, +20 HP, полное исцеление)`;

      const newAchievements = checkAchievements(player);
      if (newAchievements.length) victoryText += `\n\n${newAchievements.map((a) => `🏆 Достижение: «${a.title}»`).join('\n')}`;

      // Еженедельный рейтинг станции (lib/leaderboard-store.js) — мягкая
      // деградация, если deps.leaderboardStore не подключён к реальному
      // Redis (как и lib/player-lock.js, не обязательная зависимость).
      if (deps.leaderboardStore && playerId) {
        player.killCount = player.killCount || 0;
        deps.leaderboardStore.updateScore(player.faction, 'kills', playerId, player.name, player.killCount).catch(() => {});
        deps.leaderboardStore.updateScore(player.faction, 'level', playerId, player.name, player.level || 1).catch(() => {});
        deps.leaderboardStore.updateScore(player.faction, 'credits', playerId, player.name, player.credits || 0).catch(() => {});
      }

      return {
        reply: { text: `${victoryText}\n\n${explorationStatusCard(player)}`, buttons: journeyContinueButtons(zone, !!state.fragmentId) },
        nextState: { scene: 'journey_continue', player, zone, depth, isBossContext: !!state.fragmentId }
      };
    }
    if (state.npcArcCombat) {
      // ⚠️ ПОРАЖЕНИЕ ВНУТРИ КВЕСТА (по запросу пользователя — "не
      // ломать квесты, откидывать на разумную контрольную точку, не
      // теряя сути"). Та же общая механика игры, что и везде (нет
      // настоящей смерти — аварийная капсула, 50% HP), НО: квест НЕ
      // завершается (стадия остаётся доступной для повтора), награда
      // НЕ выдаётся (только за реальную победу), и возврат — в САМ
      // ДИАЛОГ с персонажем (backScene плюс характерная фраза), а не в
      // пустое "станция" — так суть попытки не теряется, просто можно
      // прийти и попробовать снова.
      const { characterId, stageId, choiceText, backScene } = state.npcArcCombat;
      const stage = findStage(characterId, stageId);
      const resolvedChoicesLose = stage ? (typeof stage.choices === 'function' ? stage.choices(result.attacker) : stage.choices) : [];
      const choiceLose = resolvedChoicesLose.find((c) => c.text === choiceText);
      const defeatedPlayer = { ...result.attacker, hp: Math.round(result.attacker.hpMax * 0.5) };
      const loseText = (choiceLose && choiceLose.loseFlavor) || 'Бой оказался тебе не по силам — аварийная система эвакуирует тебя, прежде чем станет по-настоящему плохо.';
      return {
        reply: {
          text: `💥 ${result.log.join(' ')}\n\n${loseText}\n\nМожешь вернуться и попробовать снова, когда будешь готов.`,
          buttons: ['⬅️ Назад'],
        },
        nextState: { scene: backScene || 'station', player: defeatedPlayer },
      };
    }
    if (state.curatorQuest) {
      return curatorQuestScreen(deps, { ...result.attacker, hp: Math.round(result.attacker.hpMax * 0.5) }, state.curatorQuest.questId, state.curatorQuest.loseNext);
    }
    {
      const survival = trySurvivalMechanic(result.attacker, state.survivalUsedThisFight);
      if (survival) {
        const survivedPlayer = { ...result.attacker, hp: Math.round(result.attacker.hpMax * survival.hpPct) };
        return {
          reply: { text: `💥 ${result.log.join(' ')}\n\n${survival.note}`, buttons: ['⚔️ Обычная атака', ...skillButtons(survivedPlayer, state.skillCooldowns || {})] },
          nextState: { scene: state.scene, player: survivedPlayer, enemy: result.defender, zone: state.zone, depth: state.depth, skillCooldowns: state.skillCooldowns, survivalUsedThisFight: true }
        };
      }
      return resolveDefeat(deps, { ...result.attacker }, result.log.join(' '), rng);
    }
  }

  const { skill: enemySkill, telegraphText } = pickEnemyAction(result.defender);
  const enemyTurn = resolveTurn({ attacker: result.defender, defender: result.attacker, skill: enemySkill, zone: state.zone, rng });
  if (enemyTurn.hit && enemyTurn.crit) {
    let statusState = enemyTurn.defender.statusState || createStatusState();
    const dmgPct = enemyTurn.dmgDealt / (enemyTurn.defender.hpMax || 1);
    statusState = applyInjury(statusState, { severity: dmgPct > 0.4 ? STATUS_SEVERITY.HIGH : STATUS_SEVERITY.MEDIUM, metadata: { combatCrit: true } });
    if (dmgPct > 0.25) {
      statusState = applyBleeding(statusState, { severity: STATUS_SEVERITY.MEDIUM, intensity: Math.round(dmgPct * 10) });
    }
    enemyTurn.defender.statusState = statusState;
  }
  const telegraphLine = telegraphText ? `${telegraphText}\n` : '';
  const log = `${telegraphLine}${result.log.concat(enemyTurn.log).join(' ')}`;

  if (enemyTurn.finished && enemyTurn.winner === 'attacker') {
    if (state.npcArcCombat) {
      const { characterId, stageId, choiceText, backScene } = state.npcArcCombat;
      const stage = findStage(characterId, stageId);
      const resolvedChoicesLose2 = stage ? (typeof stage.choices === 'function' ? stage.choices(enemyTurn.defender) : stage.choices) : [];
      const choiceLose2 = resolvedChoicesLose2.find((c) => c.text === choiceText);
      const defeatedPlayer2 = { ...enemyTurn.defender, hp: Math.round(enemyTurn.defender.hpMax * 0.5) };
      const loseText2 = (choiceLose2 && choiceLose2.loseFlavor) || 'Бой оказался тебе не по силам — аварийная система эвакуирует тебя, прежде чем станет по-настоящему плохо.';
      return {
        reply: {
          text: `💥 ${log}\n\n${loseText2}\n\nМожешь вернуться и попробовать снова, когда будешь готов.`,
          buttons: ['⬅️ Назад'],
        },
        nextState: { scene: backScene || 'station', player: defeatedPlayer2 },
      };
    }
    if (state.curatorQuest) {
      return curatorQuestScreen(deps, { ...enemyTurn.defender, hp: Math.round(enemyTurn.defender.hpMax * 0.5) }, state.curatorQuest.questId, state.curatorQuest.loseNext);
    }
    {
      const survival = trySurvivalMechanic(enemyTurn.defender, state.survivalUsedThisFight);
      if (survival) {
        const survivedPlayer = { ...enemyTurn.defender, hp: Math.round(enemyTurn.defender.hpMax * survival.hpPct) };
        return {
          reply: { text: `💥 ${log}\n\n${survival.note}`, buttons: ['⚔️ Обычная атака', ...skillButtons(survivedPlayer, state.skillCooldowns || {})] },
          nextState: { scene: state.scene, player: survivedPlayer, enemy: enemyTurn.attacker, zone: state.zone, depth: state.depth, skillCooldowns: state.skillCooldowns, survivalUsedThisFight: true }
        };
      }
      return resolveDefeat(deps, { ...enemyTurn.defender }, log, rng);
    }
  }

  let cooldowns = state.skillCooldowns || {};
  if (usedSkillId) {
    cooldowns = startCooldown(cooldowns, usedSkillId, SKILLS[usedSkillId], state.player.cooldownReductionPct || 0);
  }
  cooldowns = tickCooldowns(cooldowns);

  const buttons = ['⚔️ Обычная атака', ...skillButtons(enemyTurn.defender, cooldowns)];
  if (!result.stimUsedThisFight) buttons.push('Стим');

  // Прокачка от использования (не в тренировочном бою — там статы и так
  // сбрасываются после, счётчик был бы бессмысленным шумом).
  let trainingNote = '';
  if (!state.trainingFight) {
    const dealtDamage = prevEnemyHp !== null && enemyTurn.attacker.hp < prevEnemyHp;
    const tookDamage = prevPlayerHp !== null && enemyTurn.defender.hp < prevPlayerHp;
    const grownStats = [];
    if (dealtDamage) { const r = trackCombatAction(enemyTurn.defender, 'power'); if (r.grew) grownStats.push('Силу'); }
    if (usedSkillId) { const r = trackCombatAction(enemyTurn.defender, 'mind'); if (r.grew) grownStats.push('Интеллект'); }
    if (tookDamage) { const r = trackCombatAction(enemyTurn.defender, 'endurance'); if (r.grew) grownStats.push('Выносливость'); }
    else if (prevPlayerHp !== null) { const r = trackCombatAction(enemyTurn.defender, 'reaction'); if (r.grew) grownStats.push('Реакцию'); }
    if (grownStats.length) {
      applyDerivedStats(enemyTurn.defender);
      trainingNote = `\n\n📈 Практика в бою закалила твою ${grownStats.join(' и ')} (+1).`;
    }
  }

  const card = combatFullCard(enemyTurn.defender, enemyTurn.attacker, { prevPlayerHp, prevEnemyHp });
  const cdNote = skillCooldownNote(enemyTurn.defender, cooldowns);
  const cdLine = cdNote ? `\n\n${cdNote}` : '';
  return {
    reply: { text: `💥 ${log}\n\n${card}${cdLine}${trainingNote}`, buttons, imageKey: imageForEnemy(enemyTurn.attacker.name) },
    nextState: { scene: 'combat', player: enemyTurn.defender, enemy: enemyTurn.attacker, trainingFight: state.trainingFight, zone: state.zone, depth: state.depth, fragmentId: state.fragmentId, stimUsedThisFight: result.stimUsedThisFight, curatorQuest: state.curatorQuest, npcArcCombat: state.npcArcCombat, questSiteReturn: state.questSiteReturn, sectorResident: state.sectorResident, skillCooldowns: cooldowns }
  };
}

async function handleCombat(state, input, rng, deps, playerId) {
  switch (state.scene) {
    case SCENES.PRE_COMBAT: {
      if (input === 'Отступить') {
        const toShip = await returnFromPlanet(deps, state.player, '');
        if (toShip) {
          toShip.reply.text = `Ты отступаешь на безопасное расстояние.\n\n${toShip.reply.text}`;
          return toShip;
        }
        return { reply: { text: 'Ты отступаешь на безопасное расстояние.', buttons: stationButtons(deps, state.player) }, nextState: { scene: 'station', player: state.player } };
      }
      const buttons = ['⚔️ Обычная атака', ...skillButtons(state.player, {}), 'Стим'];
      return {
        reply: { text: `${combatFullCard(state.player, state.enemy)}\n\nВыбери действие:`, buttons, imageKey: imageForEnemy(state.enemy.name) },
        nextState: { scene: 'combat', player: state.player, enemy: state.enemy, trainingFight: state.trainingFight, zone: state.zone, depth: state.depth, fragmentId: state.fragmentId, stimUsedThisFight: false, curatorQuest: state.curatorQuest, npcArcCombat: state.npcArcCombat, questSiteReturn: state.questSiteReturn, sectorResident: state.sectorResident, skillCooldowns: {} }
      };
    }
    case SCENES.COMBAT_STIM_SELECT: {
      const backButtons = ['⚔️ Обычная атака', ...skillButtons(state.player, state.skillCooldowns)];
      if (!state.stimUsedThisFight) backButtons.push('Стим');
      if (input === '⬅️ Назад') {
        return {
          reply: { text: `${combatFullCard(state.player, state.enemy)}\n\nВыбери действие:`, buttons: backButtons, imageKey: imageForEnemy(state.enemy.name) },
          nextState: { scene: 'combat', player: state.player, enemy: state.enemy, trainingFight: state.trainingFight, zone: state.zone, depth: state.depth, fragmentId: state.fragmentId, stimUsedThisFight: state.stimUsedThisFight, curatorQuest: state.curatorQuest, npcArcCombat: state.npcArcCombat, questSiteReturn: state.questSiteReturn, sectorResident: state.sectorResident, skillCooldowns: state.skillCooldowns }
        };
      }
      const prevPlayerHp = state.player.hp;
      const prevEnemyHp = state.enemy.hp;
      const stimId = stimIdByName(input);
      if (!stimId) {
        return { reply: { text: 'Выбери стим кнопкой ниже.', buttons: [...stimButtons(), '⬅️ Назад'] }, nextState: state };
      }
      const result = resolvePlayerTurn({ player: state.player, enemy: state.enemy, skill: null, stimId, stimUsedThisFight: state.stimUsedThisFight, zone: state.zone, rng });
      return resolveCombatTurn(deps, state, result, rng, { prevPlayerHp, prevEnemyHp, playerId });
    }
    case SCENES.COMBAT: {
      if (input === 'Стим') {
        if (state.stimUsedThisFight) {
          const buttons = ['⚔️ Обычная атака', ...skillButtons(state.player, state.skillCooldowns)];
          return { reply: { text: 'Стим уже использован в этом бою.', buttons }, nextState: state };
        }
        return {
          reply: { text: 'Выбери стим:', buttons: [...stimButtons(), '⬅️ Назад'] },
          nextState: { scene: 'combat_stim_select', player: state.player, enemy: state.enemy, trainingFight: state.trainingFight, zone: state.zone, depth: state.depth, fragmentId: state.fragmentId, stimUsedThisFight: state.stimUsedThisFight, curatorQuest: state.curatorQuest, npcArcCombat: state.npcArcCombat, questSiteReturn: state.questSiteReturn, sectorResident: state.sectorResident, skillCooldowns: state.skillCooldowns }
        };
      }
      const skillId = input === '⚔️ Обычная атака' ? null : skillIdByName(input);
      const skill = skillId ? SKILLS[skillId] : null;
      if (input !== '⚔️ Обычная атака' && !skill) {
        const buttons = ['⚔️ Обычная атака', ...skillButtons(state.player, state.skillCooldowns)];
        if (!state.stimUsedThisFight) buttons.push('Стим');
        return { reply: { text: 'Выбери действие кнопкой ниже.', buttons }, nextState: state };
      }
      if (skillId && state.skillCooldowns?.[skillId] > 0) {
        const buttons = ['⚔️ Обычная атака', ...skillButtons(state.player, state.skillCooldowns)];
        if (!state.stimUsedThisFight) buttons.push('Стим');
        return { reply: { text: `${skill.name} ещё перезаряжается (${state.skillCooldowns[skillId]} х.) — выбери другое действие.`, buttons }, nextState: state };
      }

      const prevPlayerHp = state.player.hp;
      const prevEnemyHp = state.enemy.hp;
      const result = resolvePlayerTurn({ player: state.player, enemy: state.enemy, skill, stimId: null, stimUsedThisFight: state.stimUsedThisFight, zone: state.zone, rng });
      return resolveCombatTurn(deps, state, result, rng, { prevPlayerHp, prevEnemyHp, usedSkillId: skillId, playerId });
    }
    default:
      return null;
  }
}

module.exports = { handleCombat, resolveCombatTurn };
