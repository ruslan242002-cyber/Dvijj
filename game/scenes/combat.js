'use strict';

/**
 * Боевая система целиком: pre_combat -> combat -> combat_stim_select,
 * плюс resolveCombatTurn — единая обработка результата хода (лут, опыт,
 * левел-ап, контракты, бестиарий/трофеи, фрагменты, "успокоение" сектора,
 * маршрутизация в куратор-квест или обратно в вылазку).
 */

const { resolveTurn } = require('../../engine/combat-engine.js');
const { resolvePlayerTurn } = require('../../engine/combat-turn.js');
const { SKILLS } = require('../../engine/skills-data.js');
const { stimButtons, stimIdByName } = require('../../engine/stim-buttons.js');
const { rollLoot } = require('../../engine/exploration-engine.js');
const { rollLootByEnemyName } = require('../../engine/bestiary.js');
const { xpForTier, grantXp } = require('../../engine/leveling.js');
const { collectFragment } = require('../../lore/trakt-mythos.js');
const { checkContractProgress } = require('../../contracts/contracts-engine.js');
const { recordKill } = require('../../lib/trophies.js');
const { combatFullCard } = require('../../lib/combat-card.js');
const { imageForEnemy } = require('../enemy-images.js');
const { curatorQuestScreen } = require('./quests/curator.js');
const {
  stationButtons, skillButtons, skillIdByName, addToInventory, journeyContinueButtons,
} = require('./common.js');
const { SCENES } = require('./ids.js');

function resolveCombatTurn(deps, state, result, rng, { prevPlayerHp = null, prevEnemyHp = null } = {}) {
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
      if (state.curatorQuest) {
        return curatorQuestScreen(deps, { ...result.attacker, hp: result.attacker.hpMax }, state.curatorQuest.questId, state.curatorQuest.winNext);
      }
      const zone = state.zone || 'blue';
      const depth = state.depth || 0;
      const loot = rollLoot(zone, rng);
      const player = { ...result.attacker };
      addToInventory(player, loot.resource, loot.tier, loot.qty);
      player.credits = (player.credits || 0) + loot.credits;
      player.killCount = (player.killCount || 0) + 1;
      if ((state.enemy.tier || 0) >= 5) player.highTierKills = (player.highTierKills || 0) + 1;
      checkContractProgress(player, 'combat_win', { zone });
      checkContractProgress(player, 'loot', { resource: loot.resource, amount: loot.qty });
      const xpGain = xpForTier(state.enemy.tier || 1);
      const { leveledUp, level } = grantXp(player, xpGain);
      const bestiaryDrops = rollLootByEnemyName(state.enemy.name, rng);
      if (bestiaryDrops.length) player.bestiaryItems = [...(player.bestiaryItems || []), ...bestiaryDrops.map((d) => d.id)];

      let fragmentNote = '';
      if (state.fragmentId) {
        const res = collectFragment(player, state.fragmentId);
        if (res.success) fragmentNote = `\n✨ Фрагмент собран за победу над стражем.`;
      }

      let trophyNote = '';
      const kill = recordKill(player, state.enemy.bestiaryId);
      if (kill.isNew) trophyNote = `\n🏆 Новый трофей: ${kill.trophyName}!`;

      let calmedNote = '';
      if (state.sectorResident) {
        player.flags = player.flags || {};
        player.flags[`sector_${state.sectorResident.sectorId}_calmed`] = true;
        calmedNote = `\n🌌 ${state.enemy.name} наконец умолкла. Отголоски в этом секторе поутихнут.`;
      }

      let victoryText = `💥 ${result.log.join(' ')}\n\n🏆 ${state.enemy.name} уничтожен.\n💳 +${loot.credits} кредитов, +${loot.qty}× ${loot.resource} T${loot.tier}\n✨ +${xpGain} XP${fragmentNote}${trophyNote}${calmedNote}`;
      if (bestiaryDrops.length) victoryText += `\n🎖️ Особая добыча: ${bestiaryDrops.map((d) => d.name).join(', ')}`;
      if (leveledUp) victoryText += `\n🆙 Новый уровень: ${level}! (+2 очка, +20 HP, полное исцеление)`;

      return {
        reply: { text: victoryText, buttons: journeyContinueButtons(zone, !!state.fragmentId) },
        nextState: { scene: 'journey_continue', player, zone, depth, isBossContext: !!state.fragmentId }
      };
    }
    if (state.curatorQuest) {
      return curatorQuestScreen(deps, { ...result.attacker, hp: Math.round(result.attacker.hpMax * 0.5) }, state.curatorQuest.questId, state.curatorQuest.loseNext);
    }
    return {
      reply: { text: `💥 ${result.log.join(' ')}\n\n💀 Скафандр пробит. Аварийная капсула эвакуирует тебя на станцию.`, buttons: stationButtons(deps, state.player) },
      nextState: { scene: 'station', player: { ...result.attacker, hp: Math.round(result.attacker.hpMax * 0.5) } }
    };
  }

  const enemyTurn = resolveTurn({ attacker: result.defender, defender: result.attacker, rng });
  const log = result.log.concat(enemyTurn.log).join(' ');

  if (enemyTurn.finished && enemyTurn.winner === 'attacker') {
    if (state.curatorQuest) {
      return curatorQuestScreen(deps, { ...enemyTurn.defender, hp: Math.round(enemyTurn.defender.hpMax * 0.5) }, state.curatorQuest.questId, state.curatorQuest.loseNext);
    }
    return {
      reply: { text: `💥 ${log}\n\n💀 Скафандр пробит.`, buttons: stationButtons(deps, state.player) },
      nextState: { scene: 'station', player: { ...enemyTurn.defender, hp: Math.round(enemyTurn.defender.hpMax * 0.5) } }
    };
  }

  const buttons = ['Обычная атака', ...skillButtons(enemyTurn.defender)];
  if (!result.stimUsedThisFight) buttons.push('Стим');
  const card = combatFullCard(enemyTurn.defender, enemyTurn.attacker, { prevPlayerHp, prevEnemyHp });
  return {
    reply: { text: `💥 ${log}\n\n${card}`, buttons, imageKey: imageForEnemy(enemyTurn.attacker.name) },
    nextState: { scene: 'combat', player: enemyTurn.defender, enemy: enemyTurn.attacker, trainingFight: state.trainingFight, zone: state.zone, depth: state.depth, fragmentId: state.fragmentId, stimUsedThisFight: result.stimUsedThisFight, curatorQuest: state.curatorQuest, sectorResident: state.sectorResident }
  };
}

function handleCombat(state, input, rng, deps) {
  switch (state.scene) {
    case SCENES.PRE_COMBAT: {
      if (input === 'Отступить') {
        return { reply: { text: 'Ты отступаешь на безопасное расстояние.', buttons: stationButtons(deps, state.player) }, nextState: { scene: 'station', player: state.player } };
      }
      const buttons = ['Обычная атака', ...skillButtons(state.player), 'Стим'];
      return {
        reply: { text: `${combatFullCard(state.player, state.enemy)}\n\nВыбери действие:`, buttons, imageKey: imageForEnemy(state.enemy.name) },
        nextState: { scene: 'combat', player: state.player, enemy: state.enemy, trainingFight: state.trainingFight, zone: state.zone, depth: state.depth, fragmentId: state.fragmentId, stimUsedThisFight: false, curatorQuest: state.curatorQuest, sectorResident: state.sectorResident }
      };
    }
    case SCENES.COMBAT_STIM_SELECT: {
      const backButtons = ['Обычная атака', ...skillButtons(state.player)];
      if (!state.stimUsedThisFight) backButtons.push('Стим');
      if (input === 'Назад') {
        return {
          reply: { text: `${combatFullCard(state.player, state.enemy)}\n\nВыбери действие:`, buttons: backButtons, imageKey: imageForEnemy(state.enemy.name) },
          nextState: { scene: 'combat', player: state.player, enemy: state.enemy, trainingFight: state.trainingFight, zone: state.zone, depth: state.depth, fragmentId: state.fragmentId, stimUsedThisFight: state.stimUsedThisFight, curatorQuest: state.curatorQuest, sectorResident: state.sectorResident }
        };
      }
      const prevPlayerHp = state.player.hp;
      const prevEnemyHp = state.enemy.hp;
      const stimId = stimIdByName(input);
      if (!stimId) {
        return { reply: { text: 'Выбери стим кнопкой ниже.', buttons: [...stimButtons(), 'Назад'] }, nextState: state };
      }
      const result = resolvePlayerTurn({ player: state.player, enemy: state.enemy, skill: null, stimId, stimUsedThisFight: state.stimUsedThisFight, rng });
      return resolveCombatTurn(deps, state, result, rng, { prevPlayerHp, prevEnemyHp });
    }
    case SCENES.COMBAT: {
      if (input === 'Стим') {
        if (state.stimUsedThisFight) {
          const buttons = ['Обычная атака', ...skillButtons(state.player)];
          return { reply: { text: 'Стим уже использован в этом бою.', buttons }, nextState: state };
        }
        return {
          reply: { text: 'Выбери стим:', buttons: [...stimButtons(), 'Назад'] },
          nextState: { scene: 'combat_stim_select', player: state.player, enemy: state.enemy, trainingFight: state.trainingFight, zone: state.zone, depth: state.depth, fragmentId: state.fragmentId, stimUsedThisFight: state.stimUsedThisFight, curatorQuest: state.curatorQuest, sectorResident: state.sectorResident }
        };
      }
      const skillId = input === 'Обычная атака' ? null : skillIdByName(input);
      const skill = skillId ? SKILLS[skillId] : null;
      if (input !== 'Обычная атака' && !skill) {
        const buttons = ['Обычная атака', ...skillButtons(state.player)];
        if (!state.stimUsedThisFight) buttons.push('Стим');
        return { reply: { text: 'Выбери действие кнопкой ниже.', buttons }, nextState: state };
      }

      const prevPlayerHp = state.player.hp;
      const prevEnemyHp = state.enemy.hp;
      const result = resolvePlayerTurn({ player: state.player, enemy: state.enemy, skill, stimId: null, stimUsedThisFight: state.stimUsedThisFight, rng });
      return resolveCombatTurn(deps, state, result, rng, { prevPlayerHp, prevEnemyHp });
    }
    default:
      return null;
  }
}

module.exports = { handleCombat, resolveCombatTurn };
