'use strict';

const { NODES, ROUTE_VARIANTS, availableRoutesFrom, nodeById } = require('../../engine/tract-network.js');
const { rollSpaceEvent } = require('../../engine/space-events.js');
const { shipToFighter, applyFighterResultToShip } = require('../../engine/ship.js');
const { resolveTurn } = require('../../engine/combat-engine.js');
const { addToTripCargo, bankTripCargo, loseFullCargo, tripCargoUnits } = require('../../lib/trip-cargo.js');
const { combatFullCard } = require('../../lib/combat-card.js');
const { hubMessage, stationButtons } = require('./common.js');
const { SCENES } = require('./ids.js');

const FUEL_BASE_COST = 8; // за один переход между узлами, до множителя варианта риска

/** Домашний узел игрока по фракции — где он оказывается впервые/при
 *  возврате, если currentNodeId ещё не установлен (старые игроки без
 *  этого поля из прошлой линейной системы). */
const HOME_NODE_BY_FACTION = { 'Приют': 'priyut', 'Вуаль': 'vual', 'Терминус': 'terminus', 'Арсенал': 'arsenal', 'Кузница': 'kuznitsa' };

function currentNodeId(player) {
  return player.currentNodeId || HOME_NODE_BY_FACTION[player.faction] || 'priyut';
}

function fuelCostForVariant(variant) {
  return Math.round(FUEL_BASE_COST * variant.fuelMult);
}

function riskEmoji(riskLabel) {
  return riskLabel === 'red' ? '🔴' : riskLabel === 'yellow' ? '🟡' : '🟢';
}

async function travelScreen(deps, player, prefixText = '') {
  const nodeId = currentNodeId(player);
  const node = nodeById(nodeId);
  const activeTracts = deps.tractStore ? await deps.tractStore.getActiveTracts() : [];
  const routes = availableRoutesFrom(nodeId, activeTracts);
  const cargo = tripCargoUnits(player);

  if (!routes.length) {
    return {
      reply: { text: `${prefixText}📍 ${node.name}\n⛽ Топливо: ${player.ship.fuel}/${player.ship.fuelMax}\n📦 Несданный груз: ${cargo} ед.\n\nОтсюда сейчас нет ни одного доступного маршрута — Тракт разорван в этой точке. Жди появления временного окна или возвращайся станционным транспортом.`, buttons: ['⬅️ Назад'] },
      nextState: { scene: SCENES.SHIP_TRAVEL, player }
    };
  }

  const byDestination = {};
  for (const r of routes) {
    byDestination[r.to] = byDestination[r.to] || [];
    byDestination[r.to].push(r);
  }
  const lines = Object.entries(byDestination).map(([toId, variants]) => {
    const toNode = nodeById(toId);
    const icons = variants.map((v) => riskEmoji(v.riskLabel)).join('');
    const tempNote = variants[0].temporary ? ` (временный, ~${Math.round((variants[0].expiresAt - Date.now()) / 60000)} мин)` : '';
    return `${icons} ${toNode?.name || toId}${tempNote}`;
  });
  const buttons = Object.keys(byDestination).map((toId) => `→ ${nodeById(toId)?.name || toId}`);
  buttons.push('⬅️ Назад');

  return {
    reply: {
      text: `${prefixText}📍 ${node.name}\n⛽ Топливо: ${player.ship.fuel}/${player.ship.fuelMax}\n📦 Несданный груз: ${cargo} ед.\n\n🗺️ Доступные направления:\n${lines.join('\n')}`,
      buttons,
    },
    nextState: { scene: SCENES.SHIP_TRAVEL, player, availableRoutes: routes }
  };
}

async function variantPickScreen(player, routesToDestination, destinationName) {
  const buttons = routesToDestination.map((r) => {
    const v = Object.values(ROUTE_VARIANTS).find((rv) => rv.id === r.variant);
    return `${riskEmoji(r.riskLabel)} ${r.variant === 'dangerous' ? 'Опасный' : r.variant === 'safe' ? 'Безопасный' : 'Обычный'} (⛽${fuelCostForVariant(v)})`;
  });
  buttons.push('⬅️ Назад');
  return {
    reply: { text: `Маршрут до «${destinationName}» — выбери вариант:\n🔴 опасный — быстро, PvP разрешён\n🟡 обычный — баланс\n🟢 безопасный — медленно, без PvP`, buttons },
    nextState: { scene: SCENES.SHIP_TRAVEL, player, pendingRoutes: routesToDestination }
  };
}

/** Один переход между узлами — расход топлива, событие в пути (шанс
 *  зависит от риска варианта), прибытие. Безопасный вариант — PvP
 *  отключён совсем, даже если rollSpaceEvent сгенерировал бы засаду. */
async function resolveTransit(deps, player, route, rng) {
  const variant = Object.values(ROUTE_VARIANTS).find((v) => v.id === route.variant);
  const fuelCost = fuelCostForVariant(variant);
  if (player.ship.fuel < fuelCost) {
    return { reply: { text: '⛽ Не хватает топлива на этот маршрут.', buttons: ['⬅️ Назад'] }, nextState: { scene: SCENES.SHIP_TRAVEL, player } };
  }
  player.ship.fuel -= fuelCost;

  const pseudoDistance = variant.id === 'dangerous' ? 8 : variant.id === 'safe' ? 2 : 5;
  const event = rollSpaceEvent(player, pseudoDistance, rng, null);
  const isPvpEvent = event.type === 'hostile_ship' || event.type === 'ambush_pvp';

  if (isPvpEvent && !variant.pvpAllowed) {
    // Безопасный вариант — PvP-событие тихо заменяется мирным исходом,
    // именно за это игрок платит меньшей скоростью/большим временем.
    player.currentNodeId = route.to;
    const { banked } = bankTripCargo(player);
    return {
      reply: { text: `🛰️ Прибытие: ${nodeById(route.to)?.name}.\nБезопасный маршрут прошёл спокойно.${banked.length ? '\n📦 Груз сдан в трюм.' : ''}`, buttons: stationButtons(deps, player) },
      nextState: { scene: 'station', player }
    };
  }

  if (event.type === 'hostile_ship') {
    return {
      reply: { text: `${event.text}`, buttons: ['⚔️ Атаковать', '🏃 Уйти'] },
      nextState: { scene: SCENES.SHIP_PRE_COMBAT, player, destinationNodeId: route.to, enemy: event.enemy }
    };
  }

  // Мирное событие/добыча по пути — доезжаем.
  if (event.type === 'derelict_wreck' || event.type === 'asteroid_field') {
    addToTripCargo(player, event.loot.resource, event.loot.tier, event.loot.qty);
    player.credits = (player.credits || 0) + (event.loot.credits || 0);
  }
  player.currentNodeId = route.to;
  const { banked } = bankTripCargo(player);
  return {
    reply: { text: `${event.text ? event.text + '\n\n' : ''}🛰️ Прибытие: ${nodeById(route.to)?.name}.${banked.length ? '\n📦 Груз сдан в трюм.' : ''}`, buttons: stationButtons(deps, player) },
    nextState: { scene: 'station', player }
  };
}

async function handleTravel(state, input, rng, deps, playerId) {
  const player = state.player;
  if (playerId) player.id = playerId;

  if (state.scene === SCENES.SHIP_TRAVEL) {
    if (input === '⬅️ Назад') {
      if (state.pendingRoutes) return travelScreen(deps, player);
      return { reply: { text: hubMessage(player), buttons: stationButtons(deps, player) }, nextState: { scene: 'station', player } };
    }

    if (state.pendingRoutes) {
      const match = /^(?:🔴|🟡|🟢) (Опасный|Обычный|Безопасный)/u.exec(input);
      if (!match) return variantPickScreen(player, state.pendingRoutes, nodeById(state.pendingRoutes[0].to)?.name || '');
      const wantVariant = match[1] === 'Опасный' ? 'dangerous' : match[1] === 'Безопасный' ? 'safe' : 'normal';
      const route = state.pendingRoutes.find((r) => r.variant === wantVariant);
      if (!route) return variantPickScreen(player, state.pendingRoutes, '');
      return resolveTransit(deps, player, route, rng);
    }

    const destMatch = /^→ (.+)$/.exec(input);
    if (destMatch && state.availableRoutes) {
      const toNode = Object.values(NODES).find((n) => n.name === destMatch[1]);
      if (toNode) {
        const routesToDestination = state.availableRoutes.filter((r) => r.to === toNode.id);
        if (routesToDestination.length) return variantPickScreen(player, routesToDestination, toNode.name);
      }
    }
    return travelScreen(deps, player);
  }

  if (state.scene === SCENES.SHIP_PRE_COMBAT) {
    if (input === '🏃 Уйти') {
      const escapeChance = 0.6;
      if (rng() < escapeChance) return travelScreen(deps, player, '🏃 Манёвр удался — отрываешься на форсаже.\n\n');
    }
    const buttons = ['⚔️ Атаковать'];
    const playerFighter = shipToFighter(player.ship, 'Твой корабль');
    return {
      reply: { text: `${combatFullCard(playerFighter, state.enemy)}\n\nВыбери действие:`, buttons },
      nextState: { scene: SCENES.SHIP_COMBAT, player, enemy: state.enemy, destinationNodeId: state.destinationNodeId }
    };
  }

  if (state.scene === SCENES.SHIP_COMBAT) {
    const playerFighter = shipToFighter(player.ship, 'Твой корабль');
    const enemyFighter = state.enemy;
    const result = resolveTurn({ attacker: playerFighter, defender: enemyFighter, rng });
    applyFighterResultToShip(player.ship, result.attacker, rng);

    if (result.defender.hp <= 0) {
      player.currentNodeId = state.destinationNodeId;
      const { banked } = bankTripCargo(player);
      return {
        reply: { text: `⚔️ ${result.log.join(' ')}\n\n${enemyFighter.name} уничтожен. 🛰️ Прибытие: ${nodeById(state.destinationNodeId)?.name}.${banked.length ? '\n📦 Груз сдан в трюм.' : ''}`, buttons: stationButtons(deps, player) },
        nextState: { scene: 'station', player }
      };
    }

    const enemyTurn = resolveTurn({ attacker: enemyFighter, defender: playerFighter, rng });
    applyFighterResultToShip(player.ship, enemyTurn.defender, rng);
    if (enemyTurn.defender.hp <= 0) {
      const { lostTrip, lostInventory } = loseFullCargo(player);
      player.ship.hp = Math.round(player.ship.hpMax * 0.2);
      const allLost = [...lostTrip, ...lostInventory];
      return {
        reply: { text: `⚔️ ${result.log.join(' ')} ${enemyTurn.log.join(' ')}\n\n💥 Корабль обездвижен. Спасательная капсула тянет тебя на станцию.${allLost.length ? '\n📦 Груз потерян полностью.' : ''}`, buttons: stationButtons(deps, player) },
        nextState: { scene: 'station', player }
      };
    }

    return {
      reply: { text: `⚔️ ${result.log.join(' ')} ${enemyTurn.log.join(' ')}\n\n${combatFullCard(shipToFighter(player.ship, 'Твой корабль'), enemyFighter)}`, buttons: ['⚔️ Атаковать'] },
      nextState: { scene: SCENES.SHIP_COMBAT, player, enemy: enemyFighter, destinationNodeId: state.destinationNodeId }
    };
  }

  return null;
}

module.exports = { handleTravel, travelScreen, currentNodeId, HOME_NODE_BY_FACTION };
