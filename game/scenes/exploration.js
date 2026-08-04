'use strict';

/**
 * Вылазки: генерация событий (обычных, секторных, динамических,
 * бестиарных) и все связанные с ними сцены — journey (путь), 
 * journey_continue (углубиться/вернуться/эвакуироваться), 
 * exploration_event_choice (ветвящиеся события), anomaly_choice,
 * neutral_encounter, stealth_explore (Архив теней Терминуса).
 */

const { rollEvent, rollLoot, ZONE_WEIGHTS, generateEnemy } = require('../../engine/exploration-engine.js');

const TICK_RADIATION_GAIN = 2; // % облучения за каждый тик вылазки, независимо от типа события
const EXPLORATION_XP_BY_ZONE = { blue: 5, yellow: 10, red: 15 }; // скромный опыт за успешные небоевые находки — "чуть-чуть", не замена бою
const { rollNamedEncounter, buildBestiaryFighter, BESTIARY } = require('../../engine/bestiary.js');
const { rollEventWithDepth } = require('../../engine/deep-exploration.js');
const { rollMicroDiscovery, GROUND_DISCOVERIES } = require('../../lib/micro-discovery.js');
const { grantXp } = require('../../engine/leveling.js');
const { travelScreen } = require('./travel.js');
const { attemptEvacuation } = require('../../engine/evacuation.js');
const { getEvacChanceBonus, getRadiationDiscount } = require('../../lib/housing.js');
const { pickAnomalyPuzzle, resolvePuzzleAttempt } = require('../../lib/anomaly-puzzles.js');
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
      if (rng() < 0.15) {
        const mimic = buildBestiaryFighter(BESTIARY.trakt_plakalschitsa, player.level);
        return {
          reply: { text: `${prefixText}📡 СИГНАЛ БЕДСТВИЯ\n\nКрик о помощи звучит слишком... правильно. Слишком по учебнику.\n\n${mimic.name} сбрасывает маскировку.`, buttons: ['⚔️ Атаковать', 'Отступить'], imageKey: imageForEnemy(mimic.name) },
          nextState: { scene: 'pre_combat', player, enemy: mimic, zone, depth }
        };
      }
      const mult = stormRewardMult();
      player.credits = (player.credits || 0) + Math.round(event.reward.credits * mult);
      const expXp = EXPLORATION_XP_BY_ZONE[zone] || 5;
      grantXp(player, expXp);
      return safe(`${prefixText}📡 СИГНАЛ БЕДСТВИЯ\n\n${event.text}\n💳 +${Math.round(event.reward.credits * mult)} кредитов за спасательный рейс. ✨ +${expXp} XP.`);
    }
    case 'node': {
      addToInventory(player, event.resource, event.tier, 1);
      checkContractProgress(player, 'loot', { resource: event.resource, amount: 1 });
      const nodeXp = EXPLORATION_XP_BY_ZONE[zone] || 5;
      grantXp(player, nodeXp);
      return safe(`${prefixText}⛏️ ЗАЛЕЖЬ\n\n${event.text}\nВ трюм добавлено: 1× ${event.resource} T${event.tier}. ✨ +${nodeXp} XP.`);
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

  if (stealthMode) {
    const base = ZONE_WEIGHTS[zone] || ZONE_WEIGHTS.blue;
    const spared = Math.round(base.ambush * 0.6);
    const weightsOverride = { ...base, ambush: base.ambush - spared, find: base.find + spared };
    const event = rollEvent(zone, rng, player.level || 1, weightsOverride);
    if (event.type !== 'ambush') {
      player.stealthLog = [...(player.stealthLog || []), `Уклонение в ${ZONE_LABEL[zone] || zone}`].slice(-5);
    }
    return withMicroDiscovery(resolveExplorationEvent(player, event, zone, 0, deps, rng, '', false), rng);
  }

  const event = rollEventWithDepth(player, zone, depth, rng);
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
        if (result.reward.reputation) nextPlayer.reputation = (nextPlayer.reputation || 0) + result.reward.reputation;
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
        reply: { text: `${resultLine} ${attempt.text}${damageNote}\n\n${baseEvent.text}\n❤️ HP: ${player.hp}/${player.hpMax}\n\nЧто делать с находкой?`, buttons: ['Доложить куратору', 'Утаить находку'] },
        nextState: { scene: 'anomaly_choice', player, zone, depth }
      };
    }

    case SCENES.ANOMALY_CHOICE: {
      const player = { ...state.player };
      const zone = state.zone, depth = state.depth;
      if (input === 'Доложить куратору') {
        // Рутинная находка на вылазке — не сюжетный перелом, поэтому не
        // трогает choices/consequence-engine.js (та система — для реальных
        // сюжетных развилок вроде priyut_1_missing/echo_allied). Просто
        // небольшая честная репутация за доклад.
        player.reputation = (player.reputation || 0) + 5;
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
