'use strict';

const {
  fuelCostForStep, canSafelyGoDeeper, canAffordStep, canAffordReturn,
  returnTripPvpChance, distanceRewardMultiplier, actualReturnFuelCost,
  zoneForDistance, shipLevelRequiredForDistance, canFlyToDistance, FUEL_PRICE_PER_UNIT, TANK_UPGRADE_FUEL_BONUS,
} = require('../../engine/travel.js');
const { rollSpaceEvent } = require('../../engine/space-events.js');
const { generateHostileShip } = require('../../engine/ship-encounters.js');
const { shipToFighter, applyFighterResultToShip } = require('../../engine/ship.js');
const { SHIP_SKILLS, shipSkillButtons, shipSkillCooldownNote, shipSkillIdByName } = require('../../engine/ship-skills.js');
const { startCooldown, tickCooldowns } = require('../../engine/cooldowns.js');
const { resolveTurn } = require('../../engine/combat-engine.js');
const { buyFromTrader } = require('../../engine/trader-encounter.js');
const { addToTripCargo, bankTripCargo, loseFullCargo, tripCargoUnits } = require('../../lib/trip-cargo.js');
const { combatFullCard } = require('../../lib/combat-card.js');
const { rollMicroDiscovery, SPACE_DISCOVERIES } = require('../../lib/micro-discovery.js');
const { createAmbush, AMBUSH_DURATION_MS, pickAmbusher } = require('../../lib/ambush-registry.js');
const { hubMessage, stationButtons, startJourney, addToInventory } = require('./common.js');
const { veinHubEntry } = require('./vein.js');
const { locationsForZone, firstVisitRewardFor } = require('../../lib/named-locations.js');
const { maybeSpeak } = require('../../lib/fifth-voice.js');
const { SCENES } = require('./ids.js');

const ZONE_NAMES = { blue: 'патрулируемая', yellow: 'спорная', red: 'открытый космос' };

/** Клетка карты для засад — та же дистанция полёта, что уже используется
 * для всего остального (топливо/риск/награда), просто с зоной впереди,
 * чтобы клетки в разных зонах на одинаковой дистанции не путались.
 * Соседние клетки — дистанция ±1 (может пересечь границу зоны — это
 * нормально, граница зоны и должна быть местом повышенного риска). */
function cellIdForDistance(distance) {
  return `${zoneForDistance(distance)}_${distance}`;
}
function neighborCellIdsForDistance(distance) {
  return [distance - 1, distance + 1].filter((d) => d >= 0).map(cellIdForDistance);
}

function shipStatusLine(ship, distance) {
  return `🚀 Корабль ур.${ship.level}: ❤️ ${ship.hp}/${ship.hpMax} | ⛽ Топливо ${ship.fuel}/${ship.fuelMax} | 📍 Дистанция: ${distance} (${ZONE_NAMES[zoneForDistance(distance)]})`;
}

function travelButtons(player, distance) {
  const ship = player.ship;
  const buttons = [];
  const blockedByShipLevel = !canFlyToDistance(ship, distance + 1);
  if (canAffordStep(ship) && !blockedByShipLevel) {
    buttons.push(canSafelyGoDeeper(ship, distance) ? '🚀 Лететь дальше' : '🚀 Рискнуть и лететь');
  }
  buttons.push('🕳️ Засада');
  if (distance > 0) buttons.push('🔙 Домой');
  else buttons.push('🔙 Отменить вылет');
  if (distance >= 2) buttons.push('Высадиться на планету');
  return buttons;
}

function travelScreen(player, distance, prefixText = '') {
  const cargo = tripCargoUnits(player);
  const blockedByShipLevel = !canFlyToDistance(player.ship, distance + 1);
  const blockNote = blockedByShipLevel
    ? `\n\n🔒 Дальше не пускают приборы — там нужен корабль не ниже ${shipLevelRequiredForDistance(distance + 1)} уровня (у тебя ${player.ship.level}).`
    : '';
  const zoneGuide = distance === 0
    ? `\n\n📍 Зона зависит от того, как далеко долетишь: патрулируемая — сразу, спорная — с дистанции 5 (нужен корабль ур.4+), открытый космос — с дистанции 10 (нужен корабль ур.8+).`
    : '';
  const text = `${prefixText}${shipStatusLine(player.ship, distance)}\n🎒 Несданный груз: ${cargo} ед.${cargo > 0 ? ' (риск потерять всё при поражении в космосе)' : ''}${blockNote}${zoneGuide}`;
  return {
    reply: { text, buttons: travelButtons(player, distance) },
    nextState: { scene: SCENES.SHIP_TRAVEL, player, distance }
  };
}

function performLanding(player, distance, rng, stealthMode, location) {
  const { banked } = bankTripCargo(player);
  const bankedNote = banked.length ? '📦 Груз рейса сдан в трюм перед высадкой.\n\n' : '';
  const zone = zoneForDistance(distance);
  // Корабль остаётся ждать на этой дистанции — именно сюда, а не сразу на
  // станцию, нужно вернуться, когда вылазка закончится (см. фикс в
  // game/scenes/exploration.js: 'Вернуться на станцию' раньше вёл прямо
  // на станцию, минуя корабль вообще — реальный баг).
  const landingPlayer = { ...player, zone, pendingShipDistance: distance, currentLocationTheme: location?.theme };
  const landed = startJourney(landingPlayer, 'explore', { zone, depth: 0, stealthMode }, rng);
  const modeNote = stealthMode ? ' Скрытно — риск засады заметно ниже, но и находки скромнее.' : '';
  const placeName = location ? `«${location.name}»` : `зоне «${ZONE_NAMES[zone]}»`;

  // Скромная награда за ПЕРВОЕ посещение конкретного места (не повторные
  // визиты) — стимул реально облететь все точки, не оседать на одной.
  // Бездна Оррин — особый случай, отклик Пятого Голоса вместо ресурсов
  // (место и так лорно обещало это в своём описании).
  let firstVisitNote = '';
  if (location && landed.nextState.player) {
    const finalPlayer = landed.nextState.player;
    finalPlayer.visitedLocations = finalPlayer.visitedLocations || [];
    if (!finalPlayer.visitedLocations.includes(location.id)) {
      finalPlayer.visitedLocations.push(location.id);
      if (location.theme === 'abyss') {
        const voiceLine = maybeSpeak(finalPlayer, 'landed_at_bezdna_orrin');
        if (voiceLine) firstVisitNote = `\n\n${voiceLine}`;
      } else {
        const reward = firstVisitRewardFor(location);
        if (reward?.credits) {
          finalPlayer.credits = (finalPlayer.credits || 0) + reward.credits;
          firstVisitNote = `\n\n🆕 Первое посещение места — 💳 +${reward.credits} кредитов.`;
        } else if (reward?.resource) {
          addToInventory(finalPlayer, reward.resource, reward.tier, reward.qty);
          firstVisitNote = `\n\n🆕 Первое посещение места — 📦 +${reward.qty} ${reward.resource} T${reward.tier}.`;
        }
      }
    }
  }

  landed.reply.text = `${bankedNote}🪐 Высадка на ${placeName}.${modeNote}\n\n${landed.reply.text}${firstVisitNote}`;
  return landed;
}

/** Автодозаправка при стыковке — покупает топлива на столько, на сколько
 * хватает кредитов (вплоть до полного бака), и НЕ покупает ничего, если
 * кредитов нет вообще. Никакой отдельной кнопки не требуется — заправка
 * решается сама, как только корабль в доке. */
function autoRefuelAtStation(player) {
  const needed = player.ship.fuelMax - player.ship.fuel;
  if (needed <= 0) return { units: 0, cost: 0 };

  // Фракционный перк Вуали — бесплатное топливо при стыковке, без лимита.
  if (player.faction === 'Вуаль') {
    player.ship.fuel = player.ship.fuelMax;
    return { units: needed, cost: 0, free: true };
  }

  const affordableUnits = Math.floor((player.credits || 0) / FUEL_PRICE_PER_UNIT);
  const units = Math.min(needed, affordableUnits);
  if (units <= 0) return { units: 0, cost: 0 };
  const cost = units * FUEL_PRICE_PER_UNIT;
  player.credits -= cost;
  player.ship.fuel += units;
  return { units, cost };
}

function safeReturnToStation(deps, player, distance, rng, prefixText = '') {
  if (distance > 0) {
    const cost = actualReturnFuelCost(distance, rng);
    player.ship.fuel = Math.max(0, player.ship.fuel - cost);
  }
  const { banked } = bankTripCargo(player);
  const bankedNote = banked.length ? `\n\n📦 Груз рейса сдан в трюм: ${banked.map((i) => `${i.resource} T${i.tier} ×${i.qty}`).join(', ')}.` : '';
  const { units, cost: refuelCost } = autoRefuelAtStation(player);
  const refuelNote = units > 0
    ? (refuelCost > 0 ? `\n⛽ Автозаправка: +${units} топлива за 💳${refuelCost}.` : `\n⛽ Баки заправлены бесплатно (${units} ед.) — привилегия Вуали.`)
    : '';
  return {
    reply: { text: `${prefixText}Стыковка прошла штатно.${bankedNote}${refuelNote}\n\n${hubMessage(player)}`, buttons: stationButtons(deps, player) },
    nextState: { scene: 'station', player }
  };
}

/** Разрешает попытку вернуться домой — с учётом растущего с дистанцией
 * шанса нарваться на PvP-встречу на обратном пути (engine/travel.js).
 * Сначала проверяет НАСТОЯЩИЙ реестр засад (кто-то реально устроил
 * ловушку в этой клетке) — и только если там пусто, порождает случайного
 * фантомного противника тем же шансом, чтобы риск не пропадал вовсе там,
 * где никто не устраивал засад. */
/** Один тик пути домой — раньше "Домой" мгновенно телепортировал на
 * любой дистанции разом (единственный currentDistance-зависимый бросок
 * шанса встречи на ВСЮ дорогу сразу). Теперь это настоящий многошаговый
 * перелёт: 1 тик = 10 секунд полёта, дистанция снижается на 1 за раз,
 * топливо тратится за каждый тик (как и при полёте вперёд), реальные
 * засады (реестр deps.ambushStore) проверяются на каждом шаге. */
async function attemptReturnHome(deps, player, distance, rng) {
  if (distance <= 0) return safeReturnToStation(deps, player, 0, rng);

  player.ship.fuel = Math.max(0, player.ship.fuel - fuelCostForStep(rng));
  const newDistance = distance - 1;

  if (deps.ambushStore) {
    const activeAmbushes = await deps.ambushStore.listActiveAmbushes();
    const cellId = cellIdForDistance(newDistance);
    const neighborCellIds = neighborCellIdsForDistance(newDistance);
    const ambusher = pickAmbusher(cellId, neighborCellIds, activeAmbushes, player.id, rng);
    if (ambusher && ambusher.shipSnapshot) {
      const enemy = shipToFighter(ambusher.shipSnapshot, ambusher.playerName || 'Незнакомый корабль');
      return {
        reply: { text: `⚠️ На обратном пути наперерез выходит ${enemy.name} — кто-то реально ждал именно здесь.`, buttons: ['⚔️ Атаковать', '🏃 Уйти'] },
        nextState: { scene: SCENES.SHIP_PRE_COMBAT, player, distance: newDistance, enemy, onWinReturnHome: true, ambusherPlayerId: ambusher.playerId, returningHome: true }
      };
    }
  }

  // Небольшой шанс случайной (не настоящей игрок-установленной) встречи
  // за ОДИН тик — суммарно за весь обратный путь по-прежнему растёт с
  // дистанцией, просто размазано по тикам, а не одним броском разом.
  const perTickPvpChance = Math.min(0.08, returnTripPvpChance(distance) / Math.max(1, distance));
  if (rng() < perTickPvpChance) {
    const enemy = generateHostileShip(newDistance, player.ship.level, rng);
    return {
      reply: { text: `⚠️ На обратном пути наперерез выходит ${enemy.name} — кто-то ждал именно здесь.`, buttons: ['⚔️ Атаковать', '🏃 Уйти'] },
      nextState: { scene: SCENES.SHIP_PRE_COMBAT, player, distance: newDistance, enemy, onWinReturnHome: true, returningHome: true }
    };
  }

  if (newDistance <= 0) {
    return safeReturnToStation(deps, player, 0, rng, '🌌 Ты выходишь на посадочную траекторию.\n\n');
  }

  return {
    reply: { text: `🚀 Летишь домой... Осталось ${newDistance} (~${newDistance * 10} сек полёта).\n⛽ Топливо: ${player.ship.fuel}/${player.ship.fuelMax}`, buttons: ['🔙 Продолжить домой'] },
    nextState: { scene: SCENES.SHIP_RETURNING, player, distance: newDistance }
  };
}

/** Настоящая засада, сработавшая на пути ВПЕРЁД (не на обратном) — бой
 * идёт против РЕАЛЬНОГО снимка корабля засадчика, не сгенерированного
 * фантома. Засада одноразовая — срабатывает и снимается независимо от
 * исхода (иначе один и тот же капкан ловил бы всех подряд бесконечно). */
async function resolveRealAmbush(deps, player, event, activeAmbushes, distance) {
  const ambush = activeAmbushes.find((a) => a.playerId === event.ambusherPlayerId);
  if (deps.ambushStore && ambush) {
    await deps.ambushStore.removeAmbush(ambush.playerId);
  }
  if (!ambush || !ambush.shipSnapshot) {
    // Засада числилась в реестре, но снимок корабля не сохранился —
    // подстраховка тем же фантомным противником, чтобы игрок не завис.
    const enemy = generateHostileShip(distance, player.ship.level, () => Math.random());
    return {
      reply: { text: event.text, buttons: ['⚔️ Атаковать', '🏃 Уйти'] },
      nextState: { scene: SCENES.SHIP_PRE_COMBAT, player, distance, enemy, onWinReturnHome: false }
    };
  }
  const enemy = shipToFighter(ambush.shipSnapshot, ambush.playerName || 'Незнакомый корабль');
  return {
    reply: { text: event.text, buttons: ['⚔️ Атаковать', '🏃 Уйти'] },
    nextState: { scene: SCENES.SHIP_PRE_COMBAT, player, distance, enemy, onWinReturnHome: false, ambusherPlayerId: ambush.playerId }
  };
}

/** Разбирает конкретный тип космического события и решает, что показать
 * дальше — большинство просто возвращают на тот же экран путешествия. */
/** Тот же принцип, что и на планетах (game/scenes/exploration.js) —
 * прикрепляет всплывающую находку только когда игрок реально остаётся в
 * ship_travel (не бой, не торговец), роллит заново на каждый тик. */
function withSpaceMicroDiscovery(result, rng) {
  if (!result || result.nextState?.scene !== SCENES.SHIP_TRAVEL) return result;
  const discovery = rollMicroDiscovery(SPACE_DISCOVERIES, rng);
  if (!discovery) return result;
  return {
    reply: { ...result.reply, text: `${result.reply.text}\n\n🔍 ${discovery.text}`, buttons: [`Изучить: ${discovery.name}`, ...result.reply.buttons] },
    nextState: { ...result.nextState, microDiscovery: discovery }
  };
}

function resolveSpaceEvent(deps, player, event, distance, rng) {
  switch (event.type) {
    case 'empty_space':
    case 'patrol_greeting':
      return travelScreen(player, distance, `${event.text}\n\n`);

    case 'derelict_wreck':
    case 'asteroid_field': {
      let prefix = `${event.text}\n`;
      if (event.hullRisk && rng() < event.hullRisk) {
        const dmg = Math.round(player.ship.hpMax * 0.08);
        player.ship.hp = Math.max(1, player.ship.hp - dmg);
        prefix += `⚠️ Обломки задели корпус — -${dmg} HP кораблю.\n`;
      }
      addToTripCargo(player, event.loot.resource, event.loot.tier, event.loot.qty);
      player.credits = (player.credits || 0) + (event.loot.credits || 0);
      return travelScreen(player, distance, `${prefix}\n`);
    }

    case 'distress_signal':
      player.credits = (player.credits || 0) + event.reward.credits;
      return travelScreen(player, distance, `${event.text}\n💳 +${event.reward.credits} кредитов.\n\n`);

    case 'space_anomaly':
    case 'gravity_anomaly':
      player.ship.fuel = Math.max(0, player.ship.fuel - event.fuelDrain);
      return travelScreen(player, distance, `${event.text}\n\n`);

    case 'wandering_trader':
      return {
        reply: { text: event.text, buttons: event.buttons },
        nextState: { scene: SCENES.SHIP_TRADER, player, distance, offers: event.offers }
      };

    case 'hostile_ship': {
      const objectivesText = event.objectives
        ? `\n\n🎯 ЦЕЛИ:\n${event.objectives.map((o) => `${o.done ? '✅' : '◻️'} ${o.label}`).join('\n')}`
        : '';
      return {
        reply: { text: `${event.text}${objectivesText}`, buttons: ['⚔️ Атаковать', '🏃 Уйти'] },
        nextState: { scene: SCENES.SHIP_PRE_COMBAT, player, distance, enemy: event.enemy, escort: event.escort, objectives: event.objectives, onWinReturnHome: false, hpAtEncounterStart: player.ship.hp }
      };
    }

    case 'ambush_pvp': {
      // Полноценное межигровое разрешение засады (снимок корабля другого
      // живого игрока) — отдельная задача поверх lib/ambush-registry.js,
      // здесь пока честная заглушка: соперник равной с текущей дистанцией
      // силы, без привязки к конкретному живому засадчику.
      const enemy = generateHostileShip(distance + 2, player.ship.level, rng);
      return {
        reply: { text: `${event.text}`, buttons: ['⚔️ Атаковать', '🏃 Уйти'] },
        nextState: { scene: SCENES.SHIP_PRE_COMBAT, player, distance, enemy, onWinReturnHome: false }
      };
    }

    default:
      return travelScreen(player, distance, `${event.text || ''}\n\n`);
  }
}

/**
 * Переносит потерянный груз реальному засадчику — читает его сохранённое
 * состояние из основного стора игроков (deps.store, тот же, что и весь
 * router.js использует для загрузки/сохранения прогресса), добавляет
 * добычу в его настоящий трюм, сохраняет обратно. Если засадчик за это
 * время сам сбросился/удалился (state.get вернёт null) — просто теряем
 * добычу, как и было раньше, без падения.
 */
async function creditLootToAmbusher(deps, ambusherPlayerId, lostItems) {
  if (!deps.store || !ambusherPlayerId || !lostItems.length) return false;
  try {
    const ambusherState = await deps.store.get(ambusherPlayerId);
    if (!ambusherState || !ambusherState.player) return false;
    const ambusherPlayer = ambusherState.player;
    ambusherPlayer.inventory = ambusherPlayer.inventory || [];
    for (const item of lostItems) {
      const existing = ambusherPlayer.inventory.find((i) => i.resource === item.resource && i.tier === item.tier);
      if (existing) existing.qty += item.qty;
      else ambusherPlayer.inventory.push({ resource: item.resource, tier: item.tier, qty: item.qty });
    }
    await deps.store.set(ambusherPlayerId, ambusherState);
    return true;
  } catch (err) {
    console.error('creditLootToAmbusher: не удалось начислить трофей засадчику:', err.message);
    return false;
  }
}

async function resolveShipCombatTurn(deps, state, playerFighter, enemyFighter, rng) {
  const enemyTurn = resolveTurn({ attacker: enemyFighter, defender: playerFighter, rng });
  applyFighterResultToShip(state.player.ship, enemyTurn.defender, rng);

  if (enemyTurn.defender.hp <= 0) {
    const { lostTrip, lostInventory } = loseFullCargo(state.player);
    state.player.ship.hp = Math.round(state.player.ship.hpMax * 0.2);
    const allLost = [...lostTrip, ...lostInventory];
    const lostNote = allLost.length
      ? `\n\n📦 Трюм потерян полностью: ${allLost.map((i) => `${i.resource} T${i.tier} ×${i.qty}`).join(', ')}.`
      : '';

    let ambushNote = '';
    if (state.ambusherPlayerId) {
      const credited = await creditLootToAmbusher(deps, state.ambusherPlayerId, allLost);
      if (credited) ambushNote = '\n\n💀 Это была не случайность — твой груз забрал тот, кто устроил здесь засаду.';
    }

    return {
      reply: { text: `💥 ${enemyTurn.log.join(' ')}\n\n☠️ Корабль обездвижен. Спасательная капсула тянет тебя к ближайшей станции.${lostNote}${ambushNote}`, buttons: stationButtons(deps, state.player) },
      nextState: { scene: 'station', player: state.player }
    };
  }

  const tickedCooldowns = tickCooldowns(state.shipSkillCooldowns || {});
  const buttons = ['⚔️ Атаковать', ...shipSkillButtons(state.player.ship.equippedSkills || [], tickedCooldowns)];
  const cdNote = shipSkillCooldownNote(state.player.ship.equippedSkills || [], tickedCooldowns);
  const playerFighterNow = shipToFighter(state.player.ship, 'Твой корабль');
  return {
    reply: { text: `💥 ${enemyTurn.log.join(' ')}\n\n${combatFullCard(playerFighterNow, enemyTurn.attacker, { prevPlayerHp: state.prevPlayerHp, prevEnemyHp: state.prevEnemyHp })}${cdNote.length ? `\n\n${cdNote.join('\n')}` : ''}`, buttons },
    nextState: { scene: SCENES.SHIP_COMBAT, player: state.player, distance: state.distance, enemy: enemyTurn.attacker, escort: state.escort, objectives: state.objectives, fightingEscort: state.fightingEscort, hpAtEncounterStart: state.hpAtEncounterStart, onWinReturnHome: state.onWinReturnHome, ambusherPlayerId: state.ambusherPlayerId, prevPlayerHp: playerFighterNow.hp, prevEnemyHp: enemyTurn.attacker.hp, shipSkillCooldowns: tickedCooldowns }
  };
}

async function handleTravel(state, input, rng, deps, playerId) {
  switch (state.scene) {
    case SCENES.SHIP_TRAVEL: {
      const player = state.player;
      player.id = playerId;
      const distance = state.distance || 0;

      if (state.microDiscovery && input === `Изучить: ${state.microDiscovery.name}`) {
        let rewardNote;
        if (state.microDiscovery.reward.credits) {
          player.credits = (player.credits || 0) + state.microDiscovery.reward.credits;
          rewardNote = `💳 +${state.microDiscovery.reward.credits} кредитов.`;
        } else {
          addToTripCargo(player, state.microDiscovery.reward.resource, state.microDiscovery.reward.tier, state.microDiscovery.reward.qty);
          rewardNote = `📦 +${state.microDiscovery.reward.qty} ${state.microDiscovery.reward.resource} T${state.microDiscovery.reward.tier}.`;
        }
        return travelScreen(player, distance, `Забираешь находку. ${rewardNote}\n\n`);
      }

      if (input === '🕳️ Засада') {
        if (!deps.ambushStore || !playerId) {
          return travelScreen(player, distance, '⚠️ Засады сейчас недоступны.\n\n');
        }
        const cellId = cellIdForDistance(distance);
        const ambush = createAmbush(playerId, cellId, { shipSnapshot: { ...player.ship }, playerName: player.name });
        await deps.ambushStore.addAmbush(ambush);
        const minutes = Math.round(AMBUSH_DURATION_MS / 60000);
        return travelScreen(player, distance, `🕳️ Глушишь двигатели и уходишь в тень обломков — засада установлена в этой клетке на ${minutes} мин. Пролетающие мимо (или через соседние клетки) рискуют напороться прямо на твой корабль.\n\n`);
      }

      if (input === '🚀 Лететь дальше' || input === '🚀 Рискнуть и лететь') {
        if (!canAffordStep(player.ship)) {
          return travelScreen(player, distance, '⛽ Топлива не хватает даже на шаг — пора разворачиваться.\n\n');
        }
        if (!canFlyToDistance(player.ship, distance + 1)) {
          return travelScreen(player, distance, `🔒 Приборы отказывают лететь дальше — нужен корабль не ниже ${shipLevelRequiredForDistance(distance + 1)} уровня.\n\n`);
        }
        player.ship.fuel -= fuelCostForStep(rng);
        const newDistance = distance + 1;

        if (deps.veinStore) {
          const activeVein = await deps.veinStore.getActiveVein();
          if (activeVein && cellIdForDistance(activeVein.distance) === cellIdForDistance(newDistance)) {
            return {
              reply: { text: `⛏️ Прямо по курсу — жила ресурса (Т${activeVein.tier}, ${activeVein.resource})! Уже видно чужие корабли на месте добычи.`, buttons: ['⛏️ Пристыковаться', '🚀 Лететь мимо'] },
              nextState: { scene: SCENES.SHIP_TRAVEL, player, distance: newDistance, veinSighted: true }
            };
          }
        }

        let ambushContext = null;
        if (deps.ambushStore) {
          const activeAmbushes = await deps.ambushStore.listActiveAmbushes();
          ambushContext = {
            cellId: cellIdForDistance(newDistance),
            neighborCellIds: neighborCellIdsForDistance(newDistance),
            activeAmbushes,
          };
        }

        const event = rollSpaceEvent(player, newDistance, rng, ambushContext);
        if (event.type === 'ambush_pvp' && deps.ambushStore) {
          return resolveRealAmbush(deps, player, event, ambushContext.activeAmbushes, newDistance);
        }
        return withSpaceMicroDiscovery(resolveSpaceEvent(deps, player, event, newDistance, rng), rng);
      }

      if (input === '⛏️ Пристыковаться' && state.veinSighted) {
        return veinHubEntry(deps, player, playerId);
      }
      if (input === '🚀 Лететь мимо' && state.veinSighted) {
        return travelScreen(player, distance, 'Решаешь не отвлекаться на жилу и лететь дальше своим курсом.\n\n');
      }

      if (input === '🔙 Домой' || input === '🔙 Отменить вылет') {
        return attemptReturnHome(deps, player, distance, rng);
      }

      if (input === 'Высадиться на планету') {
        const zone = zoneForDistance(distance);
        const locations = locationsForZone(zone);
        return {
          reply: { text: `🪐 На этой дистанции — несколько мест для высадки:\n\n${locations.map((l) => `• ${l.name} — ${l.blurb}`).join('\n')}`, buttons: [...locations.map((l) => l.name), '⬅️ Назад'] },
          nextState: { scene: SCENES.SHIP_TRAVEL, player, distance, awaitingLocationChoice: true }
        };
      }

      if (state.awaitingLocationChoice) {
        if (input === '⬅️ Назад') return travelScreen(player, distance);
        const zone = zoneForDistance(distance);
        const chosen = locationsForZone(zone).find((l) => l.name === input);
        if (!chosen) return travelScreen(player, distance);
        if (player.faction === 'Терминус') {
          return {
            reply: { text: `🪐 Как высаживаемся на «${chosen.name}»?`, buttons: ['Обычная высадка', 'Скрытная высадка (Архив теней)', '⬅️ Назад'] },
            nextState: { scene: SCENES.SHIP_TRAVEL, player, distance, awaitingLandingChoice: true, chosenLocation: chosen }
          };
        }
        return performLanding(player, distance, rng, false, chosen);
      }

      if (state.awaitingLandingChoice && (input === 'Обычная высадка' || input.startsWith('Скрытная высадка'))) {
        return performLanding(player, distance, rng, input.startsWith('Скрытная высадка'), state.chosenLocation);
      }

      return travelScreen(player, distance);
    }

    case SCENES.SHIP_TRADER: {
      if (input === '❌ Отказаться') {
        return travelScreen(state.player, state.distance, 'Ты вежливо отказываешься. Торговец пожимает плечами и отчаливает.\n\n');
      }
      const match = /^Купить: (.+) T(\d+)$/.exec(input);
      if (!match) {
        return { reply: { text: 'Выбери товар кнопкой ниже.', buttons: [...(state.offers || []).map((o) => `Купить: ${o.resource} T${o.tier}`), '❌ Отказаться'] }, nextState: state };
      }
      const [, resource, tierStr] = match;
      const res = buyFromTrader(state.player, state.offers, resource, Number(tierStr));
      if (!res.success) {
        return travelScreen(state.player, state.distance, res.reason === 'INSUFFICIENT_CREDITS' ? '💳 Не хватает кредитов на эту сделку.\n\n' : '');
      }
      addToTripCargo(state.player, res.offer.resource, res.offer.tier, res.offer.qty);
      return travelScreen(state.player, state.distance, `Сделка заключена: ${res.offer.resource} T${res.offer.tier} ×${res.offer.qty}.\n\n`);
    }

    case SCENES.SHIP_RETURNING: {
      if (input === '🔙 Продолжить домой') {
        return await attemptReturnHome(deps, state.player, state.distance, rng);
      }
      return {
        reply: { text: `🚀 Летишь домой... Осталось ${state.distance} (~${state.distance * 10} сек полёта).\n⛽ Топливо: ${state.player.ship.fuel}/${state.player.ship.fuelMax}`, buttons: ['🔙 Продолжить домой'] },
        nextState: state
      };
    }

    case SCENES.SHIP_PRE_COMBAT: {
      if (input === '🏃 Уйти') {
        // Побег из боя корабля — без гарантии: шанс уйти зависит от того,
        // насколько глубоко зашёл (дальше — сложнее оторваться).
        const escapeChance = Math.max(0.3, 0.7 - (state.distance || 0) * 0.02);
        if (rng() < escapeChance) {
          return travelScreen(state.player, state.distance, '💨 Манёвр удался — отрываешься на форсаже.\n\n');
        }
        // не удалось уйти — бой всё равно начинается
      }
      const buttons = ['⚔️ Атаковать', ...shipSkillButtons(state.player.ship.equippedSkills || [])];
      const playerFighterStart = shipToFighter(state.player.ship, 'Твой корабль');
      return {
        reply: { text: `${combatFullCard(playerFighterStart, state.enemy)}\n\nВыбери действие:`, buttons },
        nextState: { scene: SCENES.SHIP_COMBAT, player: state.player, distance: state.distance, enemy: state.enemy, escort: state.escort, objectives: state.objectives, fightingEscort: state.fightingEscort, hpAtEncounterStart: state.hpAtEncounterStart, onWinReturnHome: state.onWinReturnHome, ambusherPlayerId: state.ambusherPlayerId, prevPlayerHp: playerFighterStart.hp, prevEnemyHp: state.enemy.hp, shipSkillCooldowns: {} }
      };
    }

    case SCENES.SHIP_COMBAT: {
      const skillId = input === '⚔️ Атаковать' ? null : shipSkillIdByName(input);
      const skill = skillId ? SHIP_SKILLS[skillId] : null;
      if (input !== '⚔️ Атаковать' && !skill) {
        const buttons = ['⚔️ Атаковать', ...shipSkillButtons(state.player.ship.equippedSkills || [], state.shipSkillCooldowns || {})];
        return { reply: { text: 'Выбери действие кнопкой ниже.', buttons }, nextState: state };
      }

      const playerFighter = shipToFighter(state.player.ship, 'Твой корабль');
      const enemyFighter = state.enemy;
      const result = resolveTurn({ attacker: playerFighter, defender: enemyFighter, skill, rng });
      applyFighterResultToShip(state.player.ship, result.attacker, rng);
      const cooldownsAfterUse = skillId ? startCooldown(state.shipSkillCooldowns || {}, skillId, skill, 0) : (state.shipSkillCooldowns || {});

      if (result.defender.hp <= 0) {
        const killedEscort = !!state.fightingEscort;
        const updatedObjectives = (state.objectives || []).map((o) => {
          if (o.id === 'main' && !killedEscort) return { ...o, done: true };
          if (o.id === 'escort' && killedEscort) return { ...o, done: true };
          return o;
        });

        // Если это была основная цель и остался неразобранный эскорт —
        // бой продолжается сразу против него, без возврата на экран
        // полёта между схватками (эскорт "переходит в атаку" тут же).
        if (state.escort && !killedEscort) {
          return {
            reply: { text: `💥 ${result.log.join(' ')}\n\n🏆 ${result.defender.name} уничтожен.\n\n⚠️ Сопровождение переходит в атаку — ${state.escort.name}!`, buttons: ['⚔️ Атаковать', '🏃 Уйти'] },
            nextState: { scene: SCENES.SHIP_PRE_COMBAT, player: state.player, distance: state.distance, enemy: state.escort, escort: null, fightingEscort: true, objectives: updatedObjectives, onWinReturnHome: state.onWinReturnHome, hpAtEncounterStart: state.hpAtEncounterStart }
          };
        }

        // Финальная победа (эскорта не было, или он уже уничтожен) —
        // считаем бонус награды по выполненным целям.
        const noDamageObjective = updatedObjectives.find((o) => o.id === 'no_damage');
        if (noDamageObjective) {
          noDamageObjective.done = state.player.ship.hp >= (state.hpAtEncounterStart ?? state.player.ship.hpMax);
        }

        const mult = distanceRewardMultiplier(state.distance || 0);
        const creditMult = state.player.faction === 'Терминус' ? 1.25 : 1;
        let reward = Math.round((20 + (result.defender.tier || 1) * 15) * mult * creditMult);

        let objectivesNote = '';
        if (updatedObjectives.length > 1) {
          const bonusObjectives = updatedObjectives.filter((o) => o.id !== 'main');
          const completedBonus = bonusObjectives.filter((o) => o.done).length;
          reward = Math.round(reward * (1 + completedBonus * 0.15));
          objectivesNote = `\n\n🎯 Итог целей:\n${updatedObjectives.map((o) => `${o.done ? '✅' : '❌'} ${o.label}`).join('\n')}`;
        }

        state.player.credits = (state.player.credits || 0) + reward;
        const doneText = `💥 ${result.log.join(' ')}\n\n🏆 ${result.defender.name} уничтожен. 💳 +${reward} кредитов.${objectivesNote}`;

        if (state.onWinReturnHome) {
          const continued = await attemptReturnHome(deps, state.player, state.distance, rng);
          continued.reply.text = `${doneText}\n\n${continued.reply.text}`;
          return continued;
        }
        return travelScreen(state.player, state.distance, `${doneText}\n\n`);
      }

      return await resolveShipCombatTurn(deps, { ...state, player: state.player, shipSkillCooldowns: cooldownsAfterUse }, result.attacker, result.defender, rng);
    }

    default:
      return null;
  }
}

module.exports = { handleTravel, travelScreen };
