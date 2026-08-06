'use strict';

/**
 * Вылазки: генерация событий (обычных, секторных, динамических,
 * бестиарных) и все связанные с ними сцены — journey (путь), 
 * journey_continue (углубиться/вернуться/эвакуироваться), 
 * exploration_event_choice (ветвящиеся события), anomaly_choice,
 * neutral_encounter, stealth_explore (Архив теней Терминуса).
 */

const {
  rollEvent, rollLoot, ZONE_WEIGHTS, generateEnemy,
  resolveDistressChoice, resolveResonancePedestal, resolveTerminalHack,
  resolveEchoPlayback, resolveReactionHazard, resolveCorruptedAi,
} = require('../../engine/exploration-engine.js');

const TICK_RADIATION_GAIN = 2; // % облучения за каждый тик вылазки, независимо от типа события
const EXPLORATION_XP_BY_ZONE = { blue: 5, yellow: 10, red: 15 }; // скромный опыт за успешные небоевые находки — "чуть-чуть", не замена бою
const { rollNamedEncounter, buildBestiaryFighter, BESTIARY } = require('../../engine/bestiary.js');
const { rollEventWithDepth } = require('../../engine/deep-exploration.js');
const { rollMicroDiscovery, GROUND_DISCOVERIES } = require('../../lib/micro-discovery.js');
const { resolvePackRound, packStatusText } = require('../../engine/pack-combat.js');
const { grantXp } = require('../../engine/leveling.js');
const { travelScreen } = require('./travel.js');
const { applyThemeWeightBias } = require('../../lib/named-locations.js');
const { attemptEvacuation } = require('../../engine/evacuation.js');
const { getEvacChanceBonus, getRadiationDiscount } = require('../../lib/housing.js');
const { pickAnomalyPuzzle, resolvePuzzleAttempt } = require('../../lib/anomaly-puzzles.js');
const { pickRandomArtifact } = require('../../lib/artifacts.js');
const { addFactionReputation } = require('../../engine/reputation.js');
const { discoverHypothesis } = require('../../lore/trakt-mythos.js');
const { applyConsequence } = require('../../choices/consequence-engine.js');
const { checkContractProgress } = require('../../contracts/contracts-engine.js');
const { imageForEnemy } = require('../enemy-images.js');
const { imageForLocation } = require('../location-images.js');
const {
  hubMessage, stationButtons, addToInventory, startJourney, buildGuardianEnemy,
  journeyContinueButtons, safeReturnChoice, stormRewardMult,
  ZONE_TRAVEL_PHRASES, STATION_TRAVEL_PHRASES, CURATORS,
} = require('./common.js');
const { SCENES } = require('./ids.js');

/**
 * Переходник к реальному choices/consequence-engine.js: applyConsequence
 * там ожидает НЕ player напрямую, а "state" с вложенным state.player
 * (там читается state.player.reputation, а не player.reputation) — плюс
 * state.flags/state.quests/state.worldState/state.factionStanding отдельно
 * от player. Подсовываем прокси-обёртку, а после — переносим изменения
 * обратно на настоящий player. try/catch — на случай, если реальный файл
 * в будущем снова разъедется по форме с тем, что здесь ожидается.
 */
function applyConsequenceToPlayer(player, consequenceId) {
  const proxyState = {
    player,
    flags: player.flags || {},
    quests: { locked: player.questLocks || [], unlockedEndings: player.unlockedEndings || [] },
    worldState: player.worldState || {},
    factionStanding: player.factionStanding || {},
  };
  try {
    applyConsequence(proxyState, consequenceId);
  } catch (err) {
    console.error(`applyConsequenceToPlayer('${consequenceId}') упал:`, err.message);
    return false;
  }
  player.flags = proxyState.flags;
  player.questLocks = proxyState.quests.locked;
  player.unlockedEndings = proxyState.quests.unlockedEndings;
  player.worldState = proxyState.worldState;
  player.factionStanding = proxyState.factionStanding;
  return true;
}

/** Возврат с планеты — раньше 'Вернуться на станцию' вёл ПРЯМО на
 * станцию, полностью пропуская корабль, который всё это время ждал в
 * открытом космосе (реальный баг, не по лору — как персонаж вообще
 * оказался на станции, если улетал не оттуда?). Теперь — назад к
 * кораблю на ту же дистанцию, откуда была высадка, с возможностью
 * лететь дальше или уже оттуда возвращаться домой по-настоящему.
 * pendingShipDistance ставится в performLanding (game/scenes/travel.js)
 * и живёт на самом player, поэтому переживает всю цепочку вылазки без
 * необходимости менять форму каждого промежуточного state. */
function returnFromPlanet(player, prefixText = '') {
  const distance = player.pendingShipDistance;
  const cleanPlayer = { ...player, pendingShipDistance: undefined };
  if (distance === undefined) {
    // Подстраховка — если поле почему-то не выставлено (старое состояние
    // без него), не ломаем игру, просто ведём как раньше.
    return null;
  }
  return travelScreen(cleanPlayer, distance, prefixText);
}

function resolveExplorationEvent(player, event, zone, depth, deps, rng, prefixText = '', allowContinue = true) {
  // Радиация теперь чисто временнáя — копится с каждым тиком вылазки
  // (2% за тик), а не от конкретных событий-аномалий. Раньше это было
  // источником "странного" облучения — почему у героя облучение растёт
  // только на аномалиях, а на остальных 90% тиков нет вообще? Теперь
  // логика простая и предсказуемая: сам факт нахождения в поле облучает.
  const radiationDiscount = getRadiationDiscount(player);
  const tickRadiation = Math.max(0, Math.round(TICK_RADIATION_GAIN * (1 - radiationDiscount)));
  player.radiation = Math.min(100, (player.radiation || 0) + tickRadiation);

  // ВАЖНО: применяем event.flag ЗДЕСЬ, для любого типа события, а не только
  // в exploration_event_choice. Раньше это применялось только для веток с
  // выбором — 'story' (curator_message) никогда не ставил свой флаг
  // curator_message_seen, из-за чего сообщение куратора зацикливалось
  // навсегда и блокировало вообще все остальные события в зоне для любого
  // игрока с доступным квестом куратора (реальный баг, не связанный с
  // бестиарием, просто раньше не проявлялся в тестах).
  if (event.flag) {
    player.flags = player.flags || {};
    player.flags[event.flag] = true;
  }

  const safe = (text, extra) => allowContinue
    ? safeReturnChoice(text, player, zone, depth, false, extra)
    : { reply: { text, buttons: stationButtons(deps, player) }, nextState: { scene: 'station', player } };

  switch (event.type) {
    case 'pack_ambush': {
      return {
        reply: { text: `${prefixText}⚠️ Стая (${event.pack.length})!\n\n${packStatusText(event.pack)}`, buttons: ['⚔️ Атаковать', 'Отступить'] },
        nextState: { scene: 'pack_pre_combat', player, zone, depth, pack: event.pack }
      };
    }

    case 'ambush': {
      // Успокоенный сектор (убит "хозяин" вроде эхо-матки) — шанс, что
      // засада вообще не происходит, вместо неё спокойная находка.
      const calmedFlag = player.currentSectorId && `sector_${player.currentSectorId}_calmed`;
      if (calmedFlag && player.flags?.[calmedFlag] && rng() < 0.5) {
        const loot = rollLoot(zone, rng, player.level || 1);
        const mult = stormRewardMult();
        addToInventory(player, loot.resource, loot.tier, loot.qty);
        player.credits = (player.credits || 0) + Math.round(loot.credits * mult);
        return safe(`${prefixText}🔭 Здесь непривычно тихо после того, как что-то в этом секторе умолкло навсегда. ${loot.qty}× ${loot.resource} T${loot.tier} находится без сопротивления.`);
      }

      // Редкий шанс встретить ИМЕННОГО монстра бестиария вместо обычного
      // процедурного врага.
      const namedEnemy = rollNamedEncounter(zone, player.level, rng);
      const enemy = namedEnemy || event.enemy;
      const bonusNote = event.depthBonusTier ? `\n(усилен глубиной вылазки: +${event.depthBonusTier} к тиру)` : '';

      // "Нейтральные" именные монстры (см. engine/bestiary.js: neutral:true,
      // например Кураторский страж) не нападают сами — игроку решать.
      if (enemy.neutral) {
        return {
          reply: { text: `${prefixText}👁️ ${enemy.name}\n\n${enemy.name} пока не проявляет враждебности — патрулирует, не приближаясь.`, buttons: ['Обойти стороной', '⚔️ Атаковать'], imageKey: imageForEnemy(enemy.name) },
          nextState: { scene: 'neutral_encounter', player, enemy, zone, depth }
        };
      }

      const nameLine = namedEnemy ? `⚠️ ${enemy.name}\n\n${BESTIARY[enemy.bestiaryId]?.lore || ''}` : `⚠️ ОТГОЛОСОК\n\n${event.text}`;
      return {
        reply: { text: `${prefixText}${nameLine}${bonusNote}`, buttons: ['⚔️ Атаковать', 'Отступить'], imageKey: imageForEnemy(enemy.name) },
        nextState: { scene: 'pre_combat', player, enemy, zone, depth }
      };
    }
    case 'anomaly': {
      const puzzle = pickAnomalyPuzzle(rng);
      return {
        reply: { text: `${prefixText}🌀 АНОМАЛИЯ: ${puzzle.name}\n\n${puzzle.intro}`, buttons: ['Преодолеть'] },
        nextState: { scene: 'anomaly_puzzle', player, zone, depth, puzzle, baseEvent: event }
      };
    }
    case 'distress': {
      // 15% шанс, что сигнал бедствия — это Тракт-плакальщица под прикрытием
      // (см. engine/bestiary.js: её лор буквально про эксплуатацию distress-сигналов).
      // Это отдельный, более редкий и более "лорный" случай поверх обычной
      // системы выбора — не каждая ловушка одинакова.
      if (rng() < 0.15) {
        const mimic = buildBestiaryFighter(BESTIARY.trakt_plakalschitsa, player.level);
        return {
          reply: { text: `${prefixText}📡 СИГНАЛ БЕДСТВИЯ\n\nКрик о помощи звучит слишком... правильно. Слишком по учебнику.\n\n${mimic.name} сбрасывает маскировку.`, buttons: ['⚔️ Атаковать', 'Отступить'], imageKey: imageForEnemy(mimic.name) },
          nextState: { scene: 'pre_combat', player, enemy: mimic, zone, depth }
        };
      }
      return {
        reply: { text: `${prefixText}📡 СИГНАЛ БЕДСТВИЯ\n\n${event.text}`, buttons: ['Ответить', 'Просканировать издали', 'Игнорировать'] },
        nextState: { scene: 'distress_choice', player, zone, depth, distressEvent: event }
      };
    }
    case 'node': {
      // Охраняемая залежь — сначала бой за доступ, потом добыча.
      if (event.nodeState === 'guarded' && event.guardEnemy) {
        return {
          reply: { text: `${prefixText}⛏️ ЗАЛЕЖЬ\n\n${event.text}`, buttons: ['⚔️ Атаковать', 'Отступить'], imageKey: imageForEnemy(event.guardEnemy.name) },
          nextState: { scene: 'pre_combat', player, enemy: event.guardEnemy, zone, depth, guardedNode: event }
        };
      }
      addToInventory(player, event.resource, event.tier, event.charges || 1);
      checkContractProgress(player, 'loot', { resource: event.resource, amount: event.charges || 1 });
      const nodeXp = EXPLORATION_XP_BY_ZONE[zone] || 5;
      grantXp(player, nodeXp);
      const unstableNote = event.nodeState === 'unstable' ? ' (нестабильная — заряды повышены)' : '';
      return safe(`${prefixText}⛏️ ЗАЛЕЖЬ${unstableNote}\n\n${event.text}\nВ трюм добавлено: ${event.charges || 1}× ${event.resource} T${event.tier}. ✨ +${nodeXp} XP.`);
    }
    case 'find': {
      const mult = stormRewardMult();
      addToInventory(player, event.loot.resource, event.loot.tier, event.loot.qty);
      player.credits = (player.credits || 0) + Math.round(event.loot.credits * mult);
      checkContractProgress(player, 'loot', { resource: event.loot.resource, amount: event.loot.qty });
      const stormNote = mult > 1 ? ` (🌩️ ×${mult} за шторм)` : '';
      const findXp = EXPLORATION_XP_BY_ZONE[zone] || 5;
      grantXp(player, findXp);
      return safe(`${prefixText}🔭 ${event.text}${stormNote} ✨ +${findXp} XP.`);
    }
    case 'cache': {
      const mult = stormRewardMult();
      let totalCredits = 0;
      const parts = [];
      for (const item of event.items) {
        addToInventory(player, item.resource, item.tier, item.qty);
        totalCredits += Math.round(item.credits * mult);
        parts.push(`${item.qty}× ${item.resource} T${item.tier}`);
      }
      player.credits = (player.credits || 0) + totalCredits;
      checkContractProgress(player, 'loot', { resource: event.items[0]?.resource, amount: event.items[0]?.qty || 0 });
      return safe(`${prefixText}📦 ТАЙНИК\n\n${event.text}\nВнутри: ${parts.join(', ')}. 💳 +${totalCredits} кредитов.`);
    }
    case 'resonance_pedestal':
      return {
        reply: { text: `${prefixText}🔮 РЕЗОНАНСНЫЙ ПОСТАМЕНТ\n\n${event.text}`, buttons: ['Дотронуться', 'Пройти мимо'] },
        nextState: { scene: 'resonance_pedestal_choice', player, zone, depth }
      };
    case 'terminal_hack':
      return {
        reply: { text: `${prefixText}💻 ЗАБРОШЕННЫЙ ТЕРМИНАЛ\n\n${event.text}`, buttons: ['Взломать', 'Не рисковать'] },
        nextState: { scene: 'terminal_hack_choice', player, zone, depth }
      };
    case 'echo_playback':
      return {
        reply: { text: `${prefixText}📻 ЭХО-ЗАПИСЬ\n\n${event.text}`, buttons: ['Послушать немного', 'Дослушать до конца', 'Пройти мимо'] },
        nextState: { scene: 'echo_playback_choice', player, zone, depth }
      };
    case 'reaction_hazard':
      return {
        reply: { text: `${prefixText}⚡ ЧТО-ТО НЕ ТАК\n\n${event.text}`, buttons: ['Среагировать'] },
        nextState: { scene: 'reaction_hazard_choice', player, zone, depth }
      };
    case 'corrupted_ai':
      return {
        reply: { text: `${prefixText}🤖 ИСКАЖЁННЫЙ ИИ\n\n${event.text}`, buttons: ['Спросить про Тракт', 'Спросить про станцию', 'Отключить'] },
        nextState: { scene: 'corrupted_ai_choice', player, zone, depth }
      };
    case 'sector': {
      player.currentSectorId = event.sectorId;
      // У сектора есть "хозяин" (см. worldgen/sector-map.js: resident) —
      // не случайная засада, а осознанный выбор атаковать или пройти мимо.
      if (event.residentId && event.residentAlive && BESTIARY[event.residentId]) {
        const residentName = BESTIARY[event.residentId].name;
        return {
          reply: { text: `${prefixText}${event.text}`, buttons: [`⚔️ Атаковать: ${residentName}`, ...journeyContinueButtons(zone, false)] },
          nextState: { scene: 'journey_continue', player, zone, depth, sectorResident: { sectorId: event.sectorId, residentId: event.residentId } }
        };
      }
      return safe(`${prefixText}${event.text}`);
    }
    case 'story': {
      return safe(`${prefixText}📨 ${event.text}`);
    }
    case 'discovery': {
      if (event.hypothesisConfirm) discoverHypothesis(player, event.hypothesisConfirm);
      if (event.reward?.credits) player.credits = (player.credits || 0) + event.reward.credits;
      return safe(`${prefixText}📖 ${event.text}`);
    }
    case 'choice':
    case 'combat_choice': {
      if (!allowContinue) {
        return safe(`${prefixText}${event.text}`);
      }
      return {
        reply: { text: `${prefixText}${event.text}`, buttons: event.choices.map((c) => c.text) },
        nextState: { scene: 'exploration_event_choice', player, zone, depth, event }
      };
    }
    case 'boss': {
      const enemy = buildGuardianEnemy(event.combat?.guardianName, event.combat?.tier || 5, rng);
      return {
        reply: { text: `${prefixText}👁️ ${event.text}`, buttons: ['⚔️ Атаковать', 'Отступить'], imageKey: imageForEnemy(enemy.name) },
        nextState: { scene: 'pre_combat', player, enemy, zone, depth, fragmentId: event.fragmentId }
      };
    }
    default:
      return safe(`${prefixText}${event.text || 'Ничего не произошло.'}`);
  }
}

/** Прикрепляет всплывающую находку к итогу тика — только если игроку
 * реально есть куда "продолжить" (сцена journey_continue: не бой, не
 * диалог, не конец вылазки). Роллит заново на каждый вызов — то есть на
 * каждый отдельный тик, а не переносит старую находку дальше. */
function withMicroDiscovery(result, rng) {
  if (!result || result.nextState?.scene !== 'journey_continue') return result;
  const discovery = rollMicroDiscovery(GROUND_DISCOVERIES, rng);
  if (!discovery) return result;
  return {
    reply: { ...result.reply, text: `${result.reply.text}\n\n🔍 ${discovery.text}`, buttons: [`Изучить: ${discovery.name}`, ...result.reply.buttons] },
    nextState: { ...result.nextState, microDiscovery: discovery }
  };
}

function explore(player, zone, rng, deps, stealthMode = false, depth = 0) {
  player.zoneVisits = player.zoneVisits || { blue: 0, yellow: 0, red: 0 };
  player.zoneVisits[zone] = (player.zoneVisits[zone] || 0) + 1;
  checkContractProgress(player, 'explore', { zone });

  const zoneBase = ZONE_WEIGHTS[zone] || ZONE_WEIGHTS.blue;
  const themedWeights = applyThemeWeightBias(zoneBase, player.currentLocationTheme);

  if (stealthMode) {
    const spared = Math.round(themedWeights.ambush * 0.6);
    const weightsOverride = { ...themedWeights, ambush: themedWeights.ambush - spared, find: themedWeights.find + spared };
    const event = rollEvent(zone, rng, player.level || 1, weightsOverride, player.currentLocationTheme);
    if (event.type !== 'ambush') {
      player.stealthLog = [...(player.stealthLog || []), `Уклонение в ${ZONE_LABEL[zone] || zone}`].slice(-5);
    }
    return withMicroDiscovery(resolveExplorationEvent(player, event, zone, 0, deps, rng, '', false), rng);
  }

  const event = rollEventWithDepth(player, zone, depth, rng, themedWeights, player.currentLocationTheme);
  return withMicroDiscovery(resolveExplorationEvent(player, event, zone, depth, deps, rng), rng);
}

function handleExploration(state, input, rng, deps) {
  switch (state.scene) {
    case SCENES.STEALTH_EXPLORE: {
      if (input === '⬅️ Назад') {
        return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player), imageKey: imageForLocation('station', state.player.faction) }, nextState: { scene: 'station', player: state.player } };
      }
      if (input === 'Уйти в тень') {
        return explore({ ...state.player }, state.player.zone || 'blue', rng, deps, true);
      }
      return { reply: { text: 'Выбери действие кнопкой ниже.', buttons: ['Уйти в тень', '⬅️ Назад'] }, nextState: state };
    }

    case SCENES.PACK_PRE_COMBAT: {
      if (input === 'Отступить') {
        return { reply: { text: 'Ты отступаешь, не связываясь со стаей.', buttons: ['Углубиться дальше', 'Вернуться на станцию'] }, nextState: { scene: 'journey_continue', player: state.player, zone: state.zone, depth: state.depth } };
      }
      const targets = state.pack.map((p) => `⚔️ Атаковать: ${p.name}`);
      return {
        reply: { text: `⚠️ Стая окружает — бей по одной цели за раз, но отвечают все живые разом.\n\n${packStatusText(state.pack)}`, buttons: targets },
        nextState: { scene: SCENES.PACK_COMBAT, player: state.player, zone: state.zone, depth: state.depth, pack: state.pack }
      };
    }

    case SCENES.PACK_COMBAT: {
      const match = /^⚔️ Атаковать: (.+)$/.exec(input);
      const targetIndex = match ? state.pack.findIndex((p) => p.name === match[1] && p.hp > 0) : -1;
      if (targetIndex === -1) {
        const targets = state.pack.filter((p) => p.hp > 0).map((p) => `⚔️ Атаковать: ${p.name}`);
        return { reply: { text: 'Выбери живую цель кнопкой ниже.', buttons: targets }, nextState: state };
      }
      const result = resolvePackRound(state.player, state.pack, targetIndex, null, rng);
      const player = result.playerFighter;

      if (result.playerDefeated) {
        const defeatedPlayer = { ...player, hp: Math.round(player.hpMax * 0.3) };
        const toShip = returnFromPlanet(defeatedPlayer, '');
        if (toShip) {
          toShip.reply.text = `💥 ${result.log.join(' ')}\n\n💀 Стая берёт числом. Аварийная капсула тянет тебя обратно к кораблю.\n\n${toShip.reply.text}`;
          return toShip;
        }
        return { reply: { text: `💥 ${result.log.join(' ')}\n\n💀 Стая берёт числом. Эвакуация на станцию.`, buttons: stationButtons(deps, defeatedPlayer) }, nextState: { scene: 'station', player: defeatedPlayer } };
      }

      if (result.packDefeated) {
        const loot = rollLoot(state.zone, rng, player.level || 1);
        const mult = stormRewardMult();
        addToInventory(player, loot.resource, loot.tier, loot.qty);
        player.credits = (player.credits || 0) + Math.round(loot.credits * mult);
        grantXp(player, (EXPLORATION_XP_BY_ZONE[state.zone] || 5) * state.pack.length);
        return {
          reply: { text: `💥 ${result.log.join(' ')}\n\n🏆 Стая выбита целиком. 📦 +${loot.qty} ${loot.resource} T${loot.tier}, 💳 +${Math.round(loot.credits * mult)}.`, buttons: ['Углубиться дальше', 'Вернуться на станцию'] },
          nextState: { scene: 'journey_continue', player, zone: state.zone, depth: state.depth }
        };
      }

      const targets = result.pack.filter((p) => p.hp > 0).map((p) => `⚔️ Атаковать: ${p.name}`);
      return {
        reply: { text: `💥 ${result.log.join(' ')}\n\n❤️ Ты: ${player.hp}/${player.hpMax}\n${packStatusText(result.pack)}`, buttons: targets },
        nextState: { scene: SCENES.PACK_COMBAT, player, zone: state.zone, depth: state.depth, pack: result.pack }
      };
    }

    case 'distress_choice': {
      const player = { ...state.player };
      const { zone, depth, distressEvent } = state;
      const journeyButtons = ['Углубиться дальше', 'Вернуться на станцию'];
      const backToJourney = (text) => ({ reply: { text, buttons: journeyButtons }, nextState: { scene: 'journey_continue', player, zone, depth } });

      const choiceMap = { 'Ответить': 'respond', 'Просканировать издали': 'scan', 'Игнорировать': 'ignore' };
      const choice = choiceMap[input];
      if (!choice) return { reply: { text: 'Выбери: Ответить, Просканировать издали или Игнорировать.', buttons: ['Ответить', 'Просканировать издали', 'Игнорировать'] }, nextState: state };

      const result = resolveDistressChoice(choice, distressEvent, player);
      if (result.outcome === 'ambush') {
        return {
          reply: { text: `📡 ${result.text}`, buttons: ['⚔️ Атаковать', 'Отступить'], imageKey: imageForEnemy(result.enemy.name) },
          nextState: { scene: 'pre_combat', player, enemy: result.enemy, zone, depth }
        };
      }
      if (result.outcome === 'rewarded') {
        const mult = stormRewardMult();
        player.credits = (player.credits || 0) + Math.round(result.reward.credits * mult);
        addFactionReputation(player, player.faction, result.reward.reputation);
        return backToJourney(`📡 ${result.text}\n💳 +${Math.round(result.reward.credits * mult)} кредитов, ⭐ +${result.reward.reputation} репутации.`);
      }
      if (result.outcome === 'scan_trap_revealed' || result.outcome === 'scan_genuine_revealed') {
        return {
          reply: { text: `📡 ${result.text}`, buttons: ['Ответить', 'Игнорировать'] },
          nextState: { scene: 'distress_choice', player, zone, depth, distressEvent }
        };
      }
      return backToJourney(`📡 ${result.text}`);
    }

    case 'resonance_pedestal_choice': {
      const player = { ...state.player };
      const { zone, depth } = state;
      if (input === 'Пройти мимо') {
        return { reply: { text: 'Решаешь не трогать постамент.', buttons: ['Углубиться дальше', 'Вернуться на станцию'] }, nextState: { scene: 'journey_continue', player, zone, depth } };
      }
      if (input !== 'Дотронуться') return { reply: { text: 'Выбери: Дотронуться или Пройти мимо.', buttons: ['Дотронуться', 'Пройти мимо'] }, nextState: state };

      const result = resolveResonancePedestal(rng, player.level || 1);
      let note = '';
      if (result.xp) { grantXp(player, result.xp); note = ` ✨ +${result.xp} XP.`; }
      if (result.radiationGain) { player.radiation = Math.min(100, (player.radiation || 0) + result.radiationGain); note = ` ☢️ +${result.radiationGain}%.`; }
      if (result.loot) { addToInventory(player, result.loot.resource, result.loot.tier, result.loot.qty); note = ` 📦 +${result.loot.qty}× ${result.loot.resource} T${result.loot.tier}.`; }
      if (result.reputationGain) { addFactionReputation(player, player.faction, result.reputationGain); note = ` ⭐ +${result.reputationGain} репутации.`; }
      return { reply: { text: `🔮 ${result.text}${note}`, buttons: ['Углубиться дальше', 'Вернуться на станцию'] }, nextState: { scene: 'journey_continue', player, zone, depth } };
    }

    case 'terminal_hack_choice': {
      const player = { ...state.player };
      const { zone, depth } = state;
      if (input === 'Не рисковать') {
        return { reply: { text: 'Решаешь не рисковать со взломом.', buttons: ['Углубиться дальше', 'Вернуться на станцию'] }, nextState: { scene: 'journey_continue', player, zone, depth } };
      }
      if (input !== 'Взломать') return { reply: { text: 'Выбери: Взломать или Не рисковать.', buttons: ['Взломать', 'Не рисковать'] }, nextState: state };

      const result = resolveTerminalHack('hack', player, rng, player.level || 1);
      if (result.outcome === 'fail_alarm') {
        return {
          reply: { text: `💻 ${result.text}`, buttons: ['⚔️ Атаковать', 'Отступить'], imageKey: imageForEnemy(result.enemy.name) },
          nextState: { scene: 'pre_combat', player, enemy: result.enemy, zone, depth }
        };
      }
      let note = '';
      if (result.xp) { grantXp(player, result.xp); note += ` ✨ +${result.xp} XP.`; }
      if (result.loot) { addToInventory(player, result.loot.resource, result.loot.tier, result.loot.qty); note += ` 📦 +${result.loot.qty}× ${result.loot.resource} T${result.loot.tier}.`; }
      return { reply: { text: `💻 ${result.text}${note}`, buttons: ['Углубиться дальше', 'Вернуться на станцию'] }, nextState: { scene: 'journey_continue', player, zone, depth } };
    }

    case 'echo_playback_choice': {
      const player = { ...state.player };
      const { zone, depth } = state;
      const choiceMap = { 'Послушать немного': 'listen_short', 'Дослушать до конца': 'listen_full', 'Пройти мимо': 'skip' };
      const choice = choiceMap[input];
      if (!choice) return { reply: { text: 'Выбери один из вариантов.', buttons: ['Послушать немного', 'Дослушать до конца', 'Пройти мимо'] }, nextState: state };

      const result = resolveEchoPlayback(choice, rng, player.level || 1);
      if (result.outcome === 'ambushed') {
        return {
          reply: { text: `📻 ${result.text}`, buttons: ['⚔️ Атаковать', 'Отступить'], imageKey: imageForEnemy(result.enemy.name) },
          nextState: { scene: 'pre_combat', player, enemy: result.enemy, zone, depth }
        };
      }
      let note = '';
      if (result.xp) { grantXp(player, result.xp); note += ` ✨ +${result.xp} XP.`; }
      if (result.loot) { addToInventory(player, result.loot.resource, result.loot.tier, result.loot.qty); note += ` 📦 +${result.loot.qty}× ${result.loot.resource} T${result.loot.tier}.`; }
      return { reply: { text: `📻 ${result.text}${note}`, buttons: ['Углубиться дальше', 'Вернуться на станцию'] }, nextState: { scene: 'journey_continue', player, zone, depth } };
    }

    case 'reaction_hazard_choice': {
      const player = { ...state.player };
      const { zone, depth } = state;
      if (input !== 'Среагировать') return { reply: { text: 'Выбери: Среагировать.', buttons: ['Среагировать'] }, nextState: state };

      const result = resolveReactionHazard(player, rng, player.level || 1);
      let note = '';
      if (result.loot) { addToInventory(player, result.loot.resource, result.loot.tier, result.loot.qty); note += ` 📦 +${result.loot.qty}× ${result.loot.resource} T${result.loot.tier}.`; }
      if (result.dmg) { player.hp = Math.max(0, player.hp - result.dmg); note += ` -${result.dmg} HP.`; }
      if (player.hp <= 0) {
        const toShip = returnFromPlanet({ ...player, hp: Math.round(player.hpMax * 0.3) }, `⚡ ${result.text}${note}\n\n☠️ Слишком сильный удар. Аварийная капсула тянет тебя обратно к кораблю.\n\n`);
        if (toShip) return toShip;
        return { reply: { text: `⚡ ${result.text}${note}\n\n☠️ Эвакуация на станцию.`, buttons: stationButtons(deps, player) }, nextState: { scene: 'station', player: { ...player, hp: Math.round(player.hpMax * 0.3) } } };
      }
      return { reply: { text: `⚡ ${result.text}${note}`, buttons: ['Углубиться дальше', 'Вернуться на станцию'] }, nextState: { scene: 'journey_continue', player, zone, depth } };
    }

    case 'corrupted_ai_choice': {
      const player = { ...state.player };
      const { zone, depth } = state;
      const choiceMap = { 'Спросить про Тракт': 'ask_about_trakt', 'Спросить про станцию': 'ask_about_station', 'Отключить': 'shut_down' };
      const choice = choiceMap[input];
      if (!choice) return { reply: { text: 'Выбери один из вариантов.', buttons: ['Спросить про Тракт', 'Спросить про станцию', 'Отключить'] }, nextState: state };

      const result = resolveCorruptedAi(choice, player);
      let note = '';
      if (result.flag) { player.flags = player.flags || {}; player.flags[result.flag] = true; }
      if (result.reputationGain) { addFactionReputation(player, result.faction || player.faction, result.reputationGain); note = ` ⭐ +${result.reputationGain} репутации.`; }
      return { reply: { text: `🤖 ${result.text}${note}`, buttons: ['Углубиться дальше', 'Вернуться на станцию'] }, nextState: { scene: 'journey_continue', player, zone, depth } };
    }

    case SCENES.JOURNEY: {
      const stepsLeft = state.stepsLeft - 1;
      if (stepsLeft > 0) {
        const pool = state.kind === 'explore' ? (ZONE_TRAVEL_PHRASES[state.payload.zone] || ZONE_TRAVEL_PHRASES.blue) : STATION_TRAVEL_PHRASES;
        const phraseText = pool[Math.floor(rng() * pool.length)];
        return {
          reply: { text: phraseText, buttons: ['Продолжить путь'] },
          nextState: { scene: 'journey', player: state.player, kind: state.kind, payload: state.payload, stepsLeft }
        };
      }
      if (state.kind === 'explore') {
        return explore(state.player, state.payload.zone, rng, deps, !!state.payload.stealthMode, state.payload.depth || 0);
      }
      const player = { ...state.player, faction: state.payload.targetFaction };
      const curator = CURATORS[player.faction] || '';
      return {
        reply: { text: `Стыковка завершена. Станция «${player.faction}» приветствует тебя — куратор ${curator} на связи.`, buttons: stationButtons(deps, player) },
        nextState: { scene: 'station', player }
      };
    }

    case SCENES.JOURNEY_CONTINUE: {
      const { player, zone, depth, isBossContext, sectorResident, microDiscovery } = state;
      if (microDiscovery && input === `Изучить: ${microDiscovery.name}`) {
        const rewardedPlayer = { ...player };
        let rewardNote;
        if (microDiscovery.reward.credits) {
          rewardedPlayer.credits = (rewardedPlayer.credits || 0) + microDiscovery.reward.credits;
          rewardNote = `💳 +${microDiscovery.reward.credits} кредитов.`;
        } else {
          addToInventory(rewardedPlayer, microDiscovery.reward.resource, microDiscovery.reward.tier, microDiscovery.reward.qty);
          rewardNote = `📦 +${microDiscovery.reward.qty} ${microDiscovery.reward.resource} T${microDiscovery.reward.tier}.`;
        }
        const baseButtons = sectorResident
          ? [`⚔️ Атаковать: ${BESTIARY[sectorResident.residentId]?.name}`, ...journeyContinueButtons(zone, isBossContext)]
          : journeyContinueButtons(zone, isBossContext);
        return {
          reply: { text: `Забираешь находку. ${rewardNote}`, buttons: baseButtons },
          nextState: { scene: 'journey_continue', player: rewardedPlayer, zone, depth, isBossContext, sectorResident }
        };
      }
      if (sectorResident && input === `⚔️ Атаковать: ${BESTIARY[sectorResident.residentId]?.name}`) {
        const enemy = buildBestiaryFighter(BESTIARY[sectorResident.residentId], player.level);
        return {
          reply: { text: `⚔️ ${enemy.name} наконец обращает на тебя внимание.`, buttons: ['⚔️ Атаковать', 'Отступить'], imageKey: imageForEnemy(enemy.name) },
          nextState: { scene: 'pre_combat', player, enemy, zone, depth, sectorResident }
        };
      }
      if (input === 'Углубиться дальше') {
        return startJourney(player, 'explore', { zone, depth: (depth || 0) + 1 }, rng);
      }
      if (input === 'Эвакуироваться') {
        if (zone !== 'red' && !isBossContext) {
          // Эвакуация не предлагалась в этой ситуации — не даём случайно
          // сработать на нераспознанном вводе.
          return { reply: { text: 'Выбери действие кнопкой ниже.', buttons: journeyContinueButtons(zone, isBossContext) }, nextState: state };
        }
        const bonus = getEvacChanceBonus(player);
        const result = attemptEvacuation(player, zone, depth || 0, rng, bonus);
        if (result.success) {
          const toShip = returnFromPlanet(player, `🛰️ ${result.text}\n\n`);
          if (toShip) return toShip;
          return { reply: { text: `🛰️ ${result.text}`, buttons: stationButtons(deps, player) }, nextState: { scene: 'station', player } };
        }
        return withMicroDiscovery(resolveExplorationEvent(player, result.blockingEvent, zone, depth || 0, deps, rng, `⚠️ ${result.text}\n\n`), rng);
      }
      if (input === 'Вернуться на станцию') {
        const toShip = returnFromPlanet(player, '🪐 Ты не торопясь идёшь назад к кораблю — вылазка окончена, всё добытое уже в трюме.\n\n');
        if (toShip) return toShip;
        return { reply: { text: 'Ты не торопясь идёшь назад пешком — вылазка окончена, всё добытое уже в трюме.', buttons: stationButtons(deps, player) }, nextState: { scene: 'station', player } };
      }
      const fallbackButtons = sectorResident
        ? [`⚔️ Атаковать: ${BESTIARY[sectorResident.residentId]?.name}`, ...journeyContinueButtons(zone, isBossContext)]
        : journeyContinueButtons(zone, isBossContext);
      return { reply: { text: 'Выбери действие кнопкой ниже.', buttons: fallbackButtons }, nextState: state };
    }

    case SCENES.EXPLORATION_EVENT_CHOICE: {
      const { player, zone, depth, event } = state;
      const choice = (event.choices || []).find((c) => c.text === input);
      if (!choice) {
        return { reply: { text: `${event.text}`, buttons: event.choices.map((c) => c.text) }, nextState: state };
      }
      if (choice.combat) {
        const combatZone = choice.combat.zoneOverride || zone;
        const enemy = generateEnemy(combatZone, rng, player.level || 1);
        return {
          reply: { text: `⚔️ ${event.text}`, buttons: ['⚔️ Атаковать', 'Отступить'], imageKey: imageForEnemy(enemy.name) },
          nextState: { scene: 'pre_combat', player, enemy, zone, depth }
        };
      }
      const nextPlayer = { ...player };
      const result = choice.result || {};
      if (result.reward) {
        if (result.reward.credits) nextPlayer.credits = (nextPlayer.credits || 0) + result.reward.credits;
        if (result.reward.reputation) addFactionReputation(nextPlayer, nextPlayer.faction, result.reward.reputation);
        if (result.reward.flag) { nextPlayer.flags = nextPlayer.flags || {}; nextPlayer.flags[result.reward.flag] = true; }
      }
      if (result.flag) { nextPlayer.flags = nextPlayer.flags || {}; nextPlayer.flags[result.flag] = true; }
      if (choice.consequenceId) applyConsequenceToPlayer(nextPlayer, choice.consequenceId);
      if (event.flag) { nextPlayer.flags = nextPlayer.flags || {}; nextPlayer.flags[event.flag] = true; }
      return safeReturnChoice(result.text || event.text, nextPlayer, zone, depth);
    }

    case SCENES.ANOMALY_PUZZLE: {
      if (input !== 'Преодолеть') {
        return { reply: { text: 'Нажми «Преодолеть», чтобы попытаться пройти аномалию.', buttons: ['Преодолеть'] }, nextState: state };
      }
      const player = { ...state.player };
      const { puzzle, baseEvent, zone, depth } = state;
      const attempt = resolvePuzzleAttempt(puzzle, player);
      player.hp = Math.max(0, player.hp - attempt.hpDamage);
      const damageNote = attempt.hpDamage > 0 ? ` -${attempt.hpDamage} HP (${puzzle.failDamagePercent}% макс.).` : '';
      const resultLine = attempt.passed ? '✅ Преодолено.' : '⚠️ Не преодолено.';

      if (player.hp <= 0) {
        return {
          reply: { text: `${resultLine} ${attempt.text}${damageNote}\n\n☠️ Ловушка оказалась смертельной. Спасательная капсула вытаскивает тебя на станцию.`, buttons: stationButtons(deps, player) },
          nextState: { scene: 'station', player: { ...player, hp: Math.round(player.hpMax * 0.3) } }
        };
      }

      return {
        reply: { text: `${resultLine} ${attempt.text}${damageNote}\n\n${baseEvent.text}\n❤️ HP: ${player.hp}/${player.hpMax}\n\nПока не улеглась пыль, можно ещё поискать в обломках аномалии.`, buttons: ['🔍 Искать артефакт', 'Доложить куратору', 'Утаить находку'] },
        nextState: { scene: 'anomaly_choice', player, zone, depth, puzzleStat: puzzle.stat }
      };
    }

    case SCENES.ANOMALY_CHOICE: {
      const player = { ...state.player };
      const zone = state.zone, depth = state.depth;
      if (input === '🔍 Искать артефакт') {
        const statValue = (player.stats && player.stats[state.puzzleStat]) || 0;
        const searchChance = Math.min(0.6, 0.15 + statValue * 0.01); // растёт с тем же статом, что и сама головоломка
        const searchDamage = Math.round(player.hpMax * 0.08);
        if (rng() < searchChance) {
          const artifact = pickRandomArtifact(rng);
          player.artifacts = player.artifacts || [];
          player.artifacts.push(artifact.id);
          return {
            reply: { text: `🔍 В обломках находится нечто целое — «${artifact.name}». ${artifact.blurb}\n\nЧто делать с находкой?`, buttons: ['Доложить куратору', 'Утаить находку'] },
            nextState: { scene: 'anomaly_choice', player, zone, depth }
          };
        }
        player.hp = Math.max(0, player.hp - searchDamage);
        if (player.hp <= 0) {
          return { reply: { text: `🔍 Поиск оборачивается новым выбросом резонанса. -${searchDamage} HP.\n\n☠️ Смертельно. Спасательная капсула вытаскивает тебя на станцию.`, buttons: stationButtons(deps, player) }, nextState: { scene: 'station', player: { ...player, hp: Math.round(player.hpMax * 0.3) } } };
        }
        return {
          reply: { text: `🔍 Ничего не находится, только новый выброс резонанса. -${searchDamage} HP.\n\nЧто делать с находкой?`, buttons: ['Доложить куратору', 'Утаить находку'] },
          nextState: { scene: 'anomaly_choice', player, zone, depth }
        };
      }
      if (input === 'Доложить куратору') {
        // Рутинная находка на вылазке — не сюжетный перелом, поэтому не
        // трогает choices/consequence-engine.js (та система — для реальных
        // сюжетных развилок вроде priyut_1_missing/echo_allied). Просто
        // небольшая честная репутация за доклад.
        addFactionReputation(player, player.faction, 5);
        return safeReturnChoice('Куратор внимательно выслушивает доклад и кивает. +5 репутации станции.', player, zone, depth);
      }
      if (input === 'Утаить находку') {
        return safeReturnChoice('Ты решаешь промолчать об увиденном. Что-то в этом решении отзывается в теле неприятным холодом — но, возможно, не только в теле.', player, zone, depth);
      }
      return { reply: { text: 'Выбери: доложить куратору или утаить находку.', buttons: ['Доложить куратору', 'Утаить находку'] }, nextState: state };
    }

    case SCENES.NEUTRAL_ENCOUNTER: {
      if (input === 'Обойти стороной') {
        return safeReturnChoice(`Ты обходишь ${state.enemy.name} по широкой дуге — оно провожает тебя взглядом, но не двигается.`, state.player, state.zone, state.depth);
      }
      if (input === '⚔️ Атаковать') {
        return {
          reply: { text: `⚔️ Ты решаешь спровоцировать ${state.enemy.name}.`, buttons: ['⚔️ Атаковать', 'Отступить'], imageKey: imageForEnemy(state.enemy.name) },
          nextState: { scene: 'pre_combat', player: state.player, enemy: state.enemy, zone: state.zone, depth: state.depth }
        };
      }
      return { reply: { text: 'Выбери действие кнопкой ниже.', buttons: ['Обойти стороной', '⚔️ Атаковать'] }, nextState: state };
    }

    default:
      return null;
  }
}

module.exports = { handleExploration, explore, resolveExplorationEvent, returnFromPlanet };
