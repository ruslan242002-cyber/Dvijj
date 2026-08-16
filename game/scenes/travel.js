'use strict';

const { NODES, ROUTE_VARIANTS, availableRoutesFrom, nodeById } = require('../../engine/tract-network.js');
const { rollSpaceEvent } = require('../../engine/space-events.js');
const { shipToFighter, applyFighterResultToShip } = require('../../engine/ship.js');
const { resolveTurn } = require('../../engine/combat-engine.js');
const { addToTripCargo, bankTripCargo, loseFullCargo, tripCargoUnits } = require('../../lib/trip-cargo.js');
const { combatFullCard } = require('../../lib/combat-card.js');
const { hubMessage, stationButtons, addToInventory } = require('./common.js');
const { createAmbush, pickAmbusher, AMBUSH_DURATION_MS } = require('../../lib/ambush-registry.js');
const { shouldDropWreckage } = require('../../lib/wreckage-store.js');
const { rollTraderOffers, buyFromTrader } = require('../../engine/trader-encounter.js');
const { notifyPlayer } = require('../../lib/notifications.js');
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
  buttons.push('🕳️ Засада', '⬅️ Назад');

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

/** Один переход между узлами — расход топлива, проверка реальной засады
 *  (кто-то реально ждёт в узле назначения), обломки, шанс встретить
 *  торговца, затем обычное случайное событие. Безопасный вариант — PvP
 *  отключён совсем (и реальная засада, и случайное событие). */
async function resolveTransit(deps, player, route, rng) {
  const variant = Object.values(ROUTE_VARIANTS).find((v) => v.id === route.variant);
  const fuelCost = fuelCostForVariant(variant);
  if (player.ship.fuel < fuelCost) {
    return { reply: { text: '⛽ Не хватает топлива на этот маршрут.', buttons: ['⬅️ Назад'] }, nextState: { scene: SCENES.SHIP_TRAVEL, player } };
  }
  player.ship.fuel -= fuelCost;

  // Реальная засада — кто-то реально оставил корабль ждать в узле
  // назначения. Безопасный вариант обходит её стороной (за это и платит
  // меньшей скоростью).
  if (variant.pvpAllowed && deps.ambushStore) {
    const activeAmbushes = await deps.ambushStore.listActiveAmbushes();
    const ambusher = pickAmbusher(route.to, activeAmbushes, player.id, rng);
    if (ambusher && ambusher.shipSnapshot) {
      const enemy = shipToFighter(ambusher.shipSnapshot, ambusher.playerName || 'Неизвестный корабль');
      return {
        reply: { text: `⚠️ На подлёте к «${nodeById(route.to)?.name}» наперерез выходит ${enemy.name} — кто-то реально ждал именно здесь.`, buttons: ['⚔️ Атаковать', '🏃 Уйти'] },
        nextState: { scene: SCENES.SHIP_PRE_COMBAT, player, destinationNodeId: route.to, enemy, ambusherPlayerId: ambusher.playerId }
      };
    }
  }

  // Обломки, оставленные погибшими в опасном варианте того же узла —
  // подбираются бесплатно при прибытии.
  let wreckageNote = '';
  if (deps.wreckageStore) {
    const wreck = await deps.wreckageStore.claimWreckage(route.to).catch(() => null);
    if (wreck) {
      for (const item of wreck.cargo) addToInventory(player, item.resource, item.tier, item.qty);
      const items = wreck.cargo.map((i) => `${i.resource} T${i.tier} ×${i.qty}`).join(', ');
      wreckageNote = `📡 Обломки чужого корабля — груз ${wreck.victimName || 'неизвестного'}: ${items}.\n\n`;
    }
  }

  const pseudoDistance = variant.id === 'dangerous' ? 8 : variant.id === 'safe' ? 2 : 5;
  const event = variant.pvpAllowed ? rollSpaceEvent(player, pseudoDistance, rng, null) : { type: 'empty_space', text: 'Безопасный маршрут прошёл спокойно.' };

  if (event.type === 'hostile_ship') {
    return {
      reply: { text: `${wreckageNote}${event.text}`, buttons: ['⚔️ Атаковать', '🏃 Уйти'] },
      nextState: { scene: SCENES.SHIP_PRE_COMBAT, player, destinationNodeId: route.to, enemy: event.enemy }
    };
  }

  if (rng() < 0.12) {
    const offers = rollTraderOffers(rng);
    return {
      reply: { text: `${wreckageNote}🧑‍🚀 Встречный торговец предлагает сделку:\n\n${offers.map((o) => `${o.resource} T${o.tier} ×${o.qty} — 💳${o.price}`).join('\n')}`, buttons: [...offers.map((o) => `Купить: ${o.resource} T${o.tier}`), '🚫 Отказаться'] },
      nextState: { scene: SCENES.SHIP_TRADER, player, destinationNodeId: route.to, offers }
    };
  }

  if (event.type === 'derelict_wreck' || event.type === 'asteroid_field') {
    addToTripCargo(player, event.loot.resource, event.loot.tier, event.loot.qty);
    player.credits = (player.credits || 0) + (event.loot.credits || 0);
  }
  player.currentNodeId = route.to;
  const { banked } = bankTripCargo(player);
  return {
    reply: { text: `${wreckageNote}${event.text ? event.text + '\n\n' : ''}🛰️ Прибытие: ${nodeById(route.to)?.name}.${banked.length ? '\n📦 Груз сдан в трюм.' : ''}`, buttons: stationButtons(deps, player) },
    nextState: { scene: 'station', player }
  };
}

/** Общее завершение перехода — сдача груза в трюм, обновление узла. */
function travelToDestination(deps, player, destinationNodeId, prefixText = '') {
  player.currentNodeId = destinationNodeId;
  const { banked } = bankTripCargo(player);
  return {
    reply: { text: `${prefixText}🛰️ Прибытие: ${nodeById(destinationNodeId)?.name}.${banked.length ? '\n📦 Груз сдан в трюм.' : ''}`, buttons: stationButtons(deps, player) },
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

    if (input === '🕳️ Засада') {
      if (!deps.ambushStore || !player.id) {
        return travelScreen(deps, player, '🕳️ Засады сейчас недоступны.\n\n');
      }
      const nodeId = currentNodeId(player);
      const ambush = createAmbush(player.id, nodeId, { shipSnapshot: { ...player.ship }, playerName: player.name });
      await deps.ambushStore.addAmbush(ambush);
      const minutes = Math.round(AMBUSH_DURATION_MS / 60000);
      return travelScreen(deps, player, `🕳️ Глушишь двигатели и уходишь в тень обломков — засада активна ${minutes} мин в этом узле. Кто-то может не заметить тебя вовремя.\n\n`);
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

  if (state.scene === SCENES.SHIP_TRADER) {
    if (input === '🚫 Отказаться') {
      return travelToDestination(deps, player, state.destinationNodeId);
    }
    const match = /^Купить: (.+) T(\d+)$/.exec(input);
    if (match) {
      const [, resource, tierStr] = match;
      const res = buyFromTrader(player, state.offers, resource, Number(tierStr));
      if (res.success) {
        addToTripCargo(player, res.offer.resource, res.offer.tier, res.offer.qty);
        return travelToDestination(deps, player, state.destinationNodeId, `Сделка заключена: ${res.offer.resource} T${res.offer.tier} ×${res.offer.qty}.\n\n`);
      }
      return { reply: { text: res.reason === 'INSUFFICIENT_CREDITS' ? '💳 Не хватает кредитов.' : 'Не получилось купить.', buttons: [...state.offers.map((o) => `Купить: ${o.resource} T${o.tier}`), '🚫 Отказаться'] }, nextState: state };
    }
    return { reply: { text: 'Выбери предложение кнопкой ниже.', buttons: [...state.offers.map((o) => `Купить: ${o.resource} T${o.tier}`), '🚫 Отказаться'] }, nextState: state };
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
      nextState: { scene: SCENES.SHIP_COMBAT, player, enemy: state.enemy, destinationNodeId: state.destinationNodeId, ambusherPlayerId: state.ambusherPlayerId }
    };
  }

  if (state.scene === SCENES.SHIP_COMBAT) {
    const playerFighter = shipToFighter(player.ship, 'Твой корабль');
    const enemyFighter = state.enemy;
    const result = resolveTurn({ attacker: playerFighter, defender: enemyFighter, rng, pvpMode: !!state.ambusherPlayerId });
    applyFighterResultToShip(player.ship, result.attacker, rng);

    if (result.defender.hp <= 0) {
      return travelToDestination(deps, player, state.destinationNodeId, `⚔️ ${result.log.join(' ')}\n\n${enemyFighter.name} уничтожен. `);
    }

    const enemyTurn = resolveTurn({ attacker: enemyFighter, defender: playerFighter, rng, pvpMode: !!state.ambusherPlayerId });
    applyFighterResultToShip(player.ship, enemyTurn.defender, rng);
    if (enemyTurn.defender.hp <= 0) {
      const { lostTrip, lostInventory } = loseFullCargo(player);
      player.ship.hp = Math.round(player.ship.hpMax * 0.2);
      const allLost = [...lostTrip, ...lostInventory];
      let lostNote = allLost.length ? `\n📦 Груз потерян полностью.` : '';
      if (state.ambusherPlayerId && allLost.length && deps.wreckageStore) {
        // Груз честно уходит в узел, где случился бой — засадчик сам
        // подберёт при следующем прибытии туда (или кто угодно ещё).
        await deps.wreckageStore.dropWreckage(currentNodeId(player), allLost, player.name).catch(() => {});
        notifyPlayer(deps, state.ambusherPlayerId, `🕳️ Твоя засада сработала — жертва потеряла груз, он ждёт в том же узле.`).catch(() => {});
      }
      return {
        reply: { text: `⚔️ ${result.log.join(' ')} ${enemyTurn.log.join(' ')}\n\n💥 Корабль обездвижен. Спасательная капсула тянет тебя на станцию.${lostNote}`, buttons: stationButtons(deps, player) },
        nextState: { scene: 'station', player }
      };
    }

    return {
      reply: { text: `⚔️ ${result.log.join(' ')} ${enemyTurn.log.join(' ')}\n\n${combatFullCard(shipToFighter(player.ship, 'Твой корабль'), enemyFighter)}`, buttons: ['⚔️ Атаковать'] },
      nextState: { scene: SCENES.SHIP_COMBAT, player, enemy: enemyFighter, destinationNodeId: state.destinationNodeId, ambusherPlayerId: state.ambusherPlayerId }
    };
  }

  return null;
}

module.exports = { handleTravel, travelScreen, currentNodeId, HOME_NODE_BY_FACTION };
