'use strict';

const {
  fuelCostForStep, canSafelyGoDeeper, canAffordStep, canAffordReturn,
  returnTripPvpChance, distanceRewardMultiplier,
} = require('../../engine/travel.js');
const { rollSpaceEvent } = require('../../engine/space-events.js');
const { generateHostileShip } = require('../../engine/ship-encounters.js');
const { shipToFighter, applyFighterResultToShip } = require('../../engine/ship.js');
const { SHIP_SKILLS, shipSkillButtons, shipSkillIdByName } = require('../../engine/ship-skills.js');
const { resolveTurn } = require('../../engine/combat-engine.js');
const { buyFromTrader } = require('../../engine/trader-encounter.js');
const { addToTripCargo, bankTripCargo, loseFullCargo, tripCargoUnits } = require('../../lib/trip-cargo.js');
const { hubMessage, stationButtons, startJourney } = require('./common.js');
const { SCENES } = require('./ids.js');

function shipStatusLine(ship, distance) {
  return `🚀 Корабль: ❤️ ${ship.hp}/${ship.hpMax} | ⛽ Топливо ${ship.fuel}/${ship.fuelMax} | 📍 Дистанция: ${distance}`;
}

function travelButtons(ship, distance) {
  const buttons = [];
  if (canAffordStep(ship)) {
    buttons.push(canSafelyGoDeeper(ship, distance) ? 'Лететь дальше' : 'Рискнуть и лететь дальше');
  }
  if (distance > 0) buttons.push('Развернуться домой');
  else buttons.push('Отменить вылет');
  if (distance >= 2) buttons.push('Высадиться на планету');
  return buttons;
}

function travelScreen(player, distance, prefixText = '') {
  const cargo = tripCargoUnits(player);
  const text = `${prefixText}${shipStatusLine(player.ship, distance)}\n🎒 Несданный груз: ${cargo} ед.${cargo > 0 ? ' (риск потерять всё при поражении в космосе)' : ''}`;
  return {
    reply: { text, buttons: travelButtons(player.ship, distance) },
    nextState: { scene: SCENES.SHIP_TRAVEL, player, distance }
  };
}

function safeReturnToStation(deps, player, prefixText = '') {
  const { banked } = bankTripCargo(player);
  const bankedNote = banked.length ? `\n\n📦 Груз рейса сдан в трюм: ${banked.map((i) => `${i.resource} T${i.tier} ×${i.qty}`).join(', ')}.` : '';
  return {
    reply: { text: `${prefixText}Стыковка прошла штатно.${bankedNote}\n\n${hubMessage(player)}`, buttons: stationButtons(deps, player) },
    nextState: { scene: 'station', player }
  };
}

/** Разрешает попытку вернуться домой — с учётом растущего с дистанцией
 * шанса нарваться на PvP-встречу на обратном пути (engine/travel.js). */
function attemptReturnHome(deps, player, distance, rng) {
  if (distance === 0) return safeReturnToStation(deps, player);

  const pvpChance = returnTripPvpChance(distance);
  if (rng() < pvpChance) {
    const enemy = generateHostileShip(distance, player.ship.level, rng);
    return {
      reply: {
        text: `⚠️ На обратном пути наперерез выходит ${enemy.name} — кто-то ждал именно здесь.`,
        buttons: ['Атаковать', 'Попытаться уйти'],
      },
      nextState: { scene: SCENES.SHIP_PRE_COMBAT, player, distance, enemy, onWinReturnHome: true }
    };
  }
  return safeReturnToStation(deps, player, '🌌 Путь домой свободен.\n\n');
}

/** Разбирает конкретный тип космического события и решает, что показать
 * дальше — большинство просто возвращают на тот же экран путешествия. */
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

    case 'hostile_ship':
      return {
        reply: { text: `${event.text}`, buttons: ['Атаковать', 'Попытаться уйти'] },
        nextState: { scene: SCENES.SHIP_PRE_COMBAT, player, distance, enemy: event.enemy, onWinReturnHome: false }
      };

    case 'ambush_pvp': {
      // Полноценное межигровое разрешение засады (снимок корабля другого
      // живого игрока) — отдельная задача поверх lib/ambush-registry.js,
      // здесь пока честная заглушка: соперник равной с текущей дистанцией
      // силы, без привязки к конкретному живому засадчику.
      const enemy = generateHostileShip(distance + 2, player.ship.level, rng);
      return {
        reply: { text: `${event.text}`, buttons: ['Атаковать', 'Попытаться уйти'] },
        nextState: { scene: SCENES.SHIP_PRE_COMBAT, player, distance, enemy, onWinReturnHome: false }
      };
    }

    default:
      return travelScreen(player, distance, `${event.text || ''}\n\n`);
  }
}

function shipCombatCard(player, enemy) {
  return `👾 ${enemy.name}: ❤️ ${enemy.hp}/${enemy.hpMax}\n❤️ ${player.ship.hpMax ? 'Твой корабль' : ''}: ❤️ ${player.ship.hp}/${player.ship.hpMax}`;
}

function resolveShipCombatTurn(deps, state, playerFighter, enemyFighter, rng) {
  const enemyTurn = resolveTurn({ attacker: enemyFighter, defender: playerFighter, rng });
  applyFighterResultToShip(state.player.ship, enemyTurn.defender);

  if (enemyTurn.defender.hp <= 0) {
    const { lostTrip, lostInventory } = loseFullCargo(state.player);
    state.player.ship.hp = Math.round(state.player.ship.hpMax * 0.2);
    const lostNote = (lostTrip.length || lostInventory.length)
      ? `\n\n📦 Трюм потерян полностью: ${[...lostTrip, ...lostInventory].map((i) => `${i.resource} T${i.tier} ×${i.qty}`).join(', ') || 'пусто'}.`
      : '';
    return {
      reply: { text: `💥 ${enemyTurn.log.join(' ')}\n\n☠️ Корабль обездвижен. Спасательная капсула тянет тебя к ближайшей станции.${lostNote}`, buttons: stationButtons(deps, state.player) },
      nextState: { scene: 'station', player: state.player }
    };
  }

  const buttons = ['Атаковать', ...shipSkillButtons(state.player.ship.equippedSkills || [])];
  return {
    reply: { text: `💥 ${enemyTurn.log.join(' ')}\n\n${shipCombatCard(state.player, enemyTurn.attacker)}`, buttons },
    nextState: { scene: SCENES.SHIP_COMBAT, player: state.player, distance: state.distance, enemy: enemyTurn.attacker, onWinReturnHome: state.onWinReturnHome }
  };
}

function handleTravel(state, input, rng, deps) {
  switch (state.scene) {
    case SCENES.SHIP_TRAVEL: {
      const player = state.player;
      const distance = state.distance || 0;

      if (input === 'Лететь дальше' || input === 'Рискнуть и лететь дальше') {
        if (!canAffordStep(player.ship)) {
          return travelScreen(player, distance, '⛽ Топлива не хватает даже на шаг — пора разворачиваться.\n\n');
        }
        player.ship.fuel -= fuelCostForStep();
        const newDistance = distance + 1;
        const event = rollSpaceEvent(player, newDistance, rng);
        return resolveSpaceEvent(deps, player, event, newDistance, rng);
      }

      if (input === 'Развернуться домой' || input === 'Отменить вылет') {
        return attemptReturnHome(deps, player, distance, rng);
      }

      if (input === 'Высадиться на планету') {
        const { banked } = bankTripCargo(player);
        const bankedNote = banked.length ? '📦 Груз рейса сдан в трюм перед высадкой.\n\n' : '';
        const landed = startJourney(player, 'explore', { zone: player.zone || 'blue', depth: 0 }, rng);
        landed.reply.text = `${bankedNote}${landed.reply.text}`;
        return landed;
      }

      return travelScreen(player, distance);
    }

    case SCENES.SHIP_TRADER: {
      if (input === 'Отказаться') {
        return travelScreen(state.player, state.distance, 'Ты вежливо отказываешься. Торговец пожимает плечами и отчаливает.\n\n');
      }
      const match = /^Купить: (.+) T(\d+)$/.exec(input);
      if (!match) {
        return { reply: { text: 'Выбери товар кнопкой ниже.', buttons: [...(state.offers || []).map((o) => `Купить: ${o.resource} T${o.tier}`), 'Отказаться'] }, nextState: state };
      }
      const [, resource, tierStr] = match;
      const res = buyFromTrader(state.player, state.offers, resource, Number(tierStr));
      if (!res.success) {
        return travelScreen(state.player, state.distance, res.reason === 'INSUFFICIENT_CREDITS' ? '💳 Не хватает кредитов на эту сделку.\n\n' : '');
      }
      addToTripCargo(state.player, res.offer.resource, res.offer.tier, res.offer.qty);
      return travelScreen(state.player, state.distance, `Сделка заключена: ${res.offer.resource} T${res.offer.tier} ×${res.offer.qty}.\n\n`);
    }

    case SCENES.SHIP_PRE_COMBAT: {
      if (input === 'Попытаться уйти') {
        // Побег из боя корабля — без гарантии: шанс уйти зависит от того,
        // насколько глубоко зашёл (дальше — сложнее оторваться).
        const escapeChance = Math.max(0.3, 0.7 - (state.distance || 0) * 0.02);
        if (rng() < escapeChance) {
          return travelScreen(state.player, state.distance, '💨 Манёвр удался — отрываешься на форсаже.\n\n');
        }
        // не удалось уйти — бой всё равно начинается
      }
      const buttons = ['Атаковать', ...shipSkillButtons(state.player.ship.equippedSkills || [])];
      return {
        reply: { text: `${shipCombatCard(state.player, state.enemy)}\n\nВыбери действие:`, buttons },
        nextState: { scene: SCENES.SHIP_COMBAT, player: state.player, distance: state.distance, enemy: state.enemy, onWinReturnHome: state.onWinReturnHome }
      };
    }

    case SCENES.SHIP_COMBAT: {
      const skillId = input === 'Атаковать' ? null : shipSkillIdByName(input);
      const skill = skillId ? SHIP_SKILLS[skillId] : null;
      if (input !== 'Атаковать' && !skill) {
        const buttons = ['Атаковать', ...shipSkillButtons(state.player.ship.equippedSkills || [])];
        return { reply: { text: 'Выбери действие кнопкой ниже.', buttons }, nextState: state };
      }

      const playerFighter = shipToFighter(state.player.ship, 'Твой корабль');
      const enemyFighter = state.enemy;
      const result = resolveTurn({ attacker: playerFighter, defender: enemyFighter, skill, rng });
      applyFighterResultToShip(state.player.ship, result.attacker);

      if (result.defender.hp <= 0) {
        const mult = distanceRewardMultiplier(state.distance || 0);
        const reward = Math.round((20 + (result.defender.tier || 1) * 15) * mult);
        state.player.credits = (state.player.credits || 0) + reward;
        const doneText = `💥 ${result.log.join(' ')}\n\n🏆 ${result.defender.name} уничтожен. 💳 +${reward} кредитов.`;

        if (state.onWinReturnHome) {
          return safeReturnToStation(deps, state.player, `${doneText}\n\n`);
        }
        return travelScreen(state.player, state.distance, `${doneText}\n\n`);
      }

      return resolveShipCombatTurn(deps, { ...state, player: state.player }, result.attacker, result.defender, rng);
    }

    default:
      return null;
  }
}

module.exports = { handleTravel, travelScreen };
