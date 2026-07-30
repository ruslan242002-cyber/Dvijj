'use strict';

/**
 * Вылазки: генерация событий (обычных, секторных, динамических,
 * бестиарных) и все связанные с ними сцены — journey (путь), 
 * journey_continue (углубиться/вернуться/эвакуироваться), 
 * exploration_event_choice (ветвящиеся события), anomaly_choice,
 * neutral_encounter, stealth_explore (Архив теней Терминуса).
 */

const { rollEvent, rollLoot, ZONE_WEIGHTS, generateEnemy } = require('../../engine/exploration-engine.js');
const { rollNamedEncounter, buildBestiaryFighter, BESTIARY } = require('../../engine/bestiary.js');
const { rollEventWithDepth } = require('../../engine/deep-exploration.js');
const { attemptEvacuation } = require('../../engine/evacuation.js');
const { getEvacChanceBonus, getRadiationDiscount } = require('../../lib/housing.js');
const { discoverHypothesis } = require('../../lore/trakt-mythos.js');
const { applyConsequence, CONSEQUENCE_TRIGGERS } = require('../../choices/consequence-engine.js');
const { checkContractProgress } = require('../../contracts/contracts-engine.js');
const { imageForEnemy } = require('../enemy-images.js');
const { imageForLocation } = require('../location-images.js');
const {
  hubMessage, stationButtons, addToInventory, startJourney, buildGuardianEnemy,
  journeyContinueButtons, safeReturnChoice, stormRewardMult,
  ZONE_TRAVEL_PHRASES, STATION_TRAVEL_PHRASES, CURATORS,
} = require('./common.js');
const { SCENES } = require('./ids.js');

function resolveExplorationEvent(player, event, zone, depth, deps, rng, prefixText = '', allowContinue = true) {
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
    case 'ambush': {
      // Успокоенный сектор (убит "хозяин" вроде эхо-матки) — шанс, что
      // засада вообще не происходит, вместо неё спокойная находка.
      const calmedFlag = player.currentSectorId && `sector_${player.currentSectorId}_calmed`;
      if (calmedFlag && player.flags?.[calmedFlag] && rng() < 0.5) {
        const loot = rollLoot(zone, rng);
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
          reply: { text: `${prefixText}👁️ ${enemy.name}\n\n${enemy.name} пока не проявляет враждебности — патрулирует, не приближаясь.`, buttons: ['Обойти стороной', 'Атаковать'], imageKey: imageForEnemy(enemy.name) },
          nextState: { scene: 'neutral_encounter', player, enemy, zone, depth }
        };
      }

      const nameLine = namedEnemy ? `⚠️ ${enemy.name}\n\n${BESTIARY[enemy.bestiaryId]?.lore || ''}` : `⚠️ ОТГОЛОСОК\n\n${event.text}`;
      return {
        reply: { text: `${prefixText}${nameLine}${bonusNote}`, buttons: ['Атаковать', 'Отступить'], imageKey: imageForEnemy(enemy.name) },
        nextState: { scene: 'pre_combat', player, enemy, zone, depth }
      };
    }
    case 'anomaly': {
      const discount = getRadiationDiscount(player);
      const gain = Math.max(0, Math.round(event.radiationGain * (1 - discount)));
      player.radiation = Math.min(100, (player.radiation || 0) + gain);
      return {
        reply: { text: `${prefixText}🌀 АНОМАЛИЯ\n\n${event.text}\n☢️ Облучение: ${player.radiation}%\n\nЧто делать с находкой?`, buttons: ['Доложить куратору', 'Утаить находку'] },
        nextState: { scene: 'anomaly_choice', player, zone, depth }
      };
    }
    case 'distress': {
      // 15% шанс, что сигнал бедствия — это Тракт-плакальщица под прикрытием
      // (см. engine/bestiary.js: её лор буквально про эксплуатацию distress-сигналов).
      if (rng() < 0.15) {
        const mimic = buildBestiaryFighter(BESTIARY.trakt_plakalschitsa, player.level);
        return {
          reply: { text: `${prefixText}📡 СИГНАЛ БЕДСТВИЯ\n\nКрик о помощи звучит слишком... правильно. Слишком по учебнику.\n\n${mimic.name} сбрасывает маскировку.`, buttons: ['Атаковать', 'Отступить'], imageKey: imageForEnemy(mimic.name) },
          nextState: { scene: 'pre_combat', player, enemy: mimic, zone, depth }
        };
      }
      const mult = stormRewardMult();
      player.credits = (player.credits || 0) + Math.round(event.reward.credits * mult);
      return safe(`${prefixText}📡 СИГНАЛ БЕДСТВИЯ\n\n${event.text}\n💳 +${Math.round(event.reward.credits * mult)} кредитов за спасательный рейс.`);
    }
    case 'node': {
      addToInventory(player, event.resource, event.tier, 1);
      checkContractProgress(player, 'loot', { resource: event.resource, amount: 1 });
      return safe(`${prefixText}⛏️ ЗАЛЕЖЬ\n\n${event.text}\nВ трюм добавлено: 1× ${event.resource} T${event.tier}.`);
    }
    case 'find': {
      const mult = stormRewardMult();
      addToInventory(player, event.loot.resource, event.loot.tier, event.loot.qty);
      player.credits = (player.credits || 0) + Math.round(event.loot.credits * mult);
      checkContractProgress(player, 'loot', { resource: event.loot.resource, amount: event.loot.qty });
      const stormNote = mult > 1 ? ` (🌩️ ×${mult} за шторм)` : '';
      return safe(`${prefixText}🔭 ${event.text}${stormNote}`);
    }
    case 'sector': {
      player.currentSectorId = event.sectorId;
      // У сектора есть "хозяин" (см. worldgen/sector-map.js: resident) —
      // не случайная засада, а осознанный выбор атаковать или пройти мимо.
      if (event.residentId && event.residentAlive && BESTIARY[event.residentId]) {
        const residentName = BESTIARY[event.residentId].name;
        return {
          reply: { text: `${prefixText}${event.text}`, buttons: [`Атаковать: ${residentName}`, ...journeyContinueButtons(zone, false)] },
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
        reply: { text: `${prefixText}👁️ ${event.text}`, buttons: ['Атаковать', 'Отступить'], imageKey: imageForEnemy(enemy.name) },
        nextState: { scene: 'pre_combat', player, enemy, zone, depth, fragmentId: event.fragmentId }
      };
    }
    default:
      return safe(`${prefixText}${event.text || 'Ничего не произошло.'}`);
  }
}

function explore(player, zone, rng, deps, stealthMode = false, depth = 0) {
  player.zoneVisits = player.zoneVisits || { blue: 0, yellow: 0, red: 0 };
  player.zoneVisits[zone] = (player.zoneVisits[zone] || 0) + 1;
  checkContractProgress(player, 'explore', { zone });

  if (stealthMode) {
    const base = ZONE_WEIGHTS[zone] || ZONE_WEIGHTS.blue;
    const spared = Math.round(base.ambush * 0.6);
    const weightsOverride = { ...base, ambush: base.ambush - spared, find: base.find + spared };
    const event = rollEvent(zone, rng, player.level || 1, weightsOverride);
    if (event.type !== 'ambush') {
      player.stealthLog = [...(player.stealthLog || []), `Уклонение в ${ZONE_LABEL[zone] || zone}`].slice(-5);
    }
    return resolveExplorationEvent(player, event, zone, 0, deps, rng, '', false);
  }

  const event = rollEventWithDepth(player, zone, depth, rng);
  return resolveExplorationEvent(player, event, zone, depth, deps, rng);
}

function handleExploration(state, input, rng, deps) {
  switch (state.scene) {
    case SCENES.STEALTH_EXPLORE: {
      if (input === 'Назад') {
        return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player), imageKey: imageForLocation('station', state.player.faction) }, nextState: { scene: 'station', player: state.player } };
      }
      if (input === 'Уйти в тень') {
        return explore({ ...state.player }, state.player.zone || 'blue', rng, deps, true);
      }
      return { reply: { text: 'Выбери действие кнопкой ниже.', buttons: ['Уйти в тень', 'Назад'] }, nextState: state };
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
        return explore(state.player, state.payload.zone, rng, deps, false, state.payload.depth || 0);
      }
      const player = { ...state.player, faction: state.payload.targetFaction };
      const curator = CURATORS[player.faction] || '';
      return {
        reply: { text: `Стыковка завершена. Станция «${player.faction}» приветствует тебя — куратор ${curator} на связи.`, buttons: stationButtons(deps, player) },
        nextState: { scene: 'station', player }
      };
    }

    case SCENES.JOURNEY_CONTINUE: {
      const { player, zone, depth, isBossContext, sectorResident } = state;
      if (sectorResident && input === `Атаковать: ${BESTIARY[sectorResident.residentId]?.name}`) {
        const enemy = buildBestiaryFighter(BESTIARY[sectorResident.residentId], player.level);
        return {
          reply: { text: `⚔️ ${enemy.name} наконец обращает на тебя внимание.`, buttons: ['Атаковать', 'Отступить'], imageKey: imageForEnemy(enemy.name) },
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
          return { reply: { text: `🛰️ ${result.text}`, buttons: stationButtons(deps, player) }, nextState: { scene: 'station', player } };
        }
        return resolveExplorationEvent(player, result.blockingEvent, zone, depth || 0, deps, rng, `⚠️ ${result.text}\n\n`);
      }
      if (input === 'Вернуться на станцию') {
        return { reply: { text: 'Ты не торопясь идёшь назад пешком — вылазка окончена, всё добытое уже в трюме.', buttons: stationButtons(deps, player) }, nextState: { scene: 'station', player } };
      }
      const fallbackButtons = sectorResident
        ? [`Атаковать: ${BESTIARY[sectorResident.residentId]?.name}`, ...journeyContinueButtons(zone, isBossContext)]
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
          reply: { text: `⚔️ ${event.text}`, buttons: ['Атаковать', 'Отступить'], imageKey: imageForEnemy(enemy.name) },
          nextState: { scene: 'pre_combat', player, enemy, zone, depth }
        };
      }
      const nextPlayer = { ...player };
      const result = choice.result || {};
      if (result.reward) {
        if (result.reward.credits) nextPlayer.credits = (nextPlayer.credits || 0) + result.reward.credits;
        if (result.reward.reputation) nextPlayer.reputation = (nextPlayer.reputation || 0) + result.reward.reputation;
        if (result.reward.flag) { nextPlayer.flags = nextPlayer.flags || {}; nextPlayer.flags[result.reward.flag] = true; }
      }
      if (result.flag) { nextPlayer.flags = nextPlayer.flags || {}; nextPlayer.flags[result.flag] = true; }
      if (choice.consequenceId) applyConsequence(nextPlayer, choice.consequenceId);
      if (event.flag) { nextPlayer.flags = nextPlayer.flags || {}; nextPlayer.flags[event.flag] = true; }
      return safeReturnChoice(result.text || event.text, nextPlayer, zone, depth);
    }

    case SCENES.ANOMALY_CHOICE: {
      const player = { ...state.player };
      const zone = state.zone, depth = state.depth;
      if (input === 'Доложить куратору') {
        applyConsequence(player, 'report_anomaly_find');
        const rep = CONSEQUENCE_TRIGGERS.report_anomaly_find.immediate.reputation;
        return safeReturnChoice(`Куратор внимательно выслушивает доклад и кивает. +${rep} репутации станции.`, player, zone, depth);
      }
      if (input === 'Утаить находку') {
        applyConsequence(player, 'hide_anomaly_find');
        return safeReturnChoice('Ты решаешь промолчать об увиденном. Что-то в этом решении отзывается в теле неприятным холодом — но, возможно, не только в теле.', player, zone, depth);
      }
      return { reply: { text: 'Выбери: доложить куратору или утаить находку.', buttons: ['Доложить куратору', 'Утаить находку'] }, nextState: state };
    }

    case SCENES.NEUTRAL_ENCOUNTER: {
      if (input === 'Обойти стороной') {
        return safeReturnChoice(`Ты обходишь ${state.enemy.name} по широкой дуге — оно провожает тебя взглядом, но не двигается.`, state.player, state.zone, state.depth);
      }
      if (input === 'Атаковать') {
        return {
          reply: { text: `⚔️ Ты решаешь спровоцировать ${state.enemy.name}.`, buttons: ['Атаковать', 'Отступить'], imageKey: imageForEnemy(state.enemy.name) },
          nextState: { scene: 'pre_combat', player: state.player, enemy: state.enemy, zone: state.zone, depth: state.depth }
        };
      }
      return { reply: { text: 'Выбери действие кнопкой ниже.', buttons: ['Обойти стороной', 'Атаковать'] }, nextState: state };
    }

    default:
      return null;
  }
}

module.exports = { handleExploration, explore, resolveExplorationEvent };
