'use strict';

const { imageForLocation } = require('../../location-images.js');
const { hubMessage, stationButtons, sellInventory, sellUnprotectedInventory } = require('../common.js');
const { SCENES } = require('../ids.js');
const { TANK_UPGRADE_FUEL_BONUS } = require('../../../engine/travel.js');
const { SYSTEM_NAMES, repairSystem } = require('../../../engine/ship-systems.js');

const REPAIR_CREDITS_PER_HP = 3;
const FUEL_CREDITS_PER_UNIT = 2;
const TANK_UPGRADE_CREDITS = 400;
const TANK_UPGRADE_RESOURCE = 'Сплавы';
const TANK_UPGRADE_TIER = 2;
const TANK_UPGRADE_QTY = 15;

const TOOL_COSTS = {
  resonance_drill: { name: 'Резонансный бур', credits: 250, resource: 'Изотопы', tier: 2, qty: 10 },
  vein_annihilator: { name: 'Аннигилятор жилы', credits: 900, resource: 'Реголит', tier: 4, qty: 20 },
};

/** Фракционные скидки — Арсенал держит собственную оружейную кузницу,
 * поэтому дешевле держит корабль боеготовым (ремонт корпуса); Кузница
 * сама производит сырьё, поэтому дешевле расширяет ёмкость бака. */
function repairDiscount(faction) {
  return faction === 'Арсенал' ? 0.15 : 0;
}
function tankUpgradeDiscount(faction) {
  return faction === 'Кузница' ? 0.20 : 0;
}
/** ...и наценка на импорт у Кузницы — обратная сторона того же перка. */
function importMarkup(faction) {
  return faction === 'Кузница' ? 0.20 : 0;
}

function handleRepair(state, input, rng, deps) {
  if (state.scene !== SCENES.LOC_REPAIR) return null;

  if (input === '💳 Продать всё') {
    const player = { ...state.player };
    const gained = sellInventory(player);
    return { reply: { text: gained ? `Завхоз отсчитывает ${gained} кредитов за находки.` : 'Продавать нечего.', buttons: stationButtons(deps, player) }, nextState: { scene: 'station', player } };
  }
  if (input === '📦 Продать лишнее') {
    const player = { ...state.player };
    const { total, keptCount } = sellUnprotectedInventory(player);
    const keptNote = keptCount ? ` Оставлено ${keptCount} видов ресурсов — они ещё нужны для крафта.` : '';
    return { reply: { text: total ? `Завхоз отсчитывает ${total} кредитов за второстепенное.${keptNote}` : 'Продавать нечего.', buttons: stationButtons(deps, player) }, nextState: { scene: 'station', player } };
  }
  if (input.startsWith('🔧 Ремонт')) {
    const player = { ...state.player, ship: { ...state.player.ship } };
    const missingHp = Math.max(0, player.ship.hpMax - player.ship.hp);
    if (missingHp === 0) {
      return { reply: { text: 'Корабль и так в полном порядке.', buttons: stationButtons(deps, player) }, nextState: { scene: 'station', player } };
    }
    const cost = Math.round(missingHp * REPAIR_CREDITS_PER_HP * (1 - repairDiscount(player.faction)));
    if ((player.credits || 0) < cost) {
      return {
        reply: { text: `Не хватает кредитов на полный ремонт (нужно 💳${cost}, есть 💳${player.credits || 0}).`, buttons: stationButtons(deps, player) },
        nextState: { scene: 'station', player },
      };
    }
    player.credits -= cost;
    player.ship.hp = player.ship.hpMax;
    return { reply: { text: `Механики латают корпус — корабль как новый. Списано 💳${cost}.`, buttons: stationButtons(deps, player) }, nextState: { scene: 'station', player } };
  }
  if (input.startsWith('⛽ Заправка')) {
    const player = { ...state.player, ship: { ...state.player.ship } };
    const missingFuel = Math.max(0, player.ship.fuelMax - player.ship.fuel);
    if (missingFuel === 0) {
      return { reply: { text: 'Баки и так полны.', buttons: stationButtons(deps, player) }, nextState: { scene: 'station', player } };
    }
    const cost = Math.round(missingFuel * FUEL_CREDITS_PER_UNIT * (1 + importMarkup(player.faction)));
    if ((player.credits || 0) < cost) {
      const perUnit = FUEL_CREDITS_PER_UNIT * (1 + importMarkup(player.faction));
      const affordableUnits = Math.floor((player.credits || 0) / perUnit);
      if (affordableUnits <= 0) {
        return { reply: { text: `Не хватает кредитов даже на минимальную заправку (нужно ${Math.round(perUnit)} за единицу).`, buttons: stationButtons(deps, player) }, nextState: { scene: 'station', player } };
      }
      const partialCost = Math.round(affordableUnits * perUnit);
      player.credits -= partialCost;
      player.ship.fuel += affordableUnits;
      return { reply: { text: `Заправлено ${affordableUnits} ед. топлива (на большее не хватило). Списано 💳${partialCost}.`, buttons: stationButtons(deps, player) }, nextState: { scene: 'station', player } };
    }
    player.credits -= cost;
    player.ship.fuel = player.ship.fuelMax;
    return { reply: { text: `Баки полны под завязку. Списано 💳${cost}.`, buttons: stationButtons(deps, player) }, nextState: { scene: 'station', player } };
  }
  if (input.startsWith('🛢️ Расширить бак')) {
    const player = { ...state.player, ship: { ...state.player.ship }, inventory: (state.player.inventory || []).map((i) => ({ ...i })) };
    const stack = player.inventory.find((i) => i.resource === TANK_UPGRADE_RESOURCE && i.tier === TANK_UPGRADE_TIER);
    const haveQty = stack ? stack.qty : 0;
    const tankCost = Math.round(TANK_UPGRADE_CREDITS * (1 - tankUpgradeDiscount(player.faction)));
    if (haveQty < TANK_UPGRADE_QTY || (player.credits || 0) < tankCost) {
      return {
        reply: { text: `Не хватает материалов для расширения бака (нужно ${TANK_UPGRADE_RESOURCE} T${TANK_UPGRADE_TIER} ×${TANK_UPGRADE_QTY} и 💳${tankCost}).`, buttons: stationButtons(deps, player) },
        nextState: { scene: 'station', player },
      };
    }
    stack.qty -= TANK_UPGRADE_QTY;
    player.inventory = player.inventory.filter((i) => i.qty > 0);
    player.credits -= tankCost;
    player.ship.fuelMax += TANK_UPGRADE_FUEL_BONUS;
    player.ship.fuel += TANK_UPGRADE_FUEL_BONUS;
    return { reply: { text: `Инженеры вваривают дополнительную секцию бака — вместимость топлива выросла на ${TANK_UPGRADE_FUEL_BONUS}.`, buttons: stationButtons(deps, player) }, nextState: { scene: 'station', player } };
  }

  const systemRepairMatch = /^🔩 Чинить: (.+)$/.exec(input);
  if (systemRepairMatch) {
    const sysName = systemRepairMatch[1];
    const sysId = Object.keys(SYSTEM_NAMES).find((id) => SYSTEM_NAMES[id] === sysName);
    if (!sysId) return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player) }, nextState: { scene: 'station', player: state.player } };
    const player = { ...state.player, ship: { ...state.player.ship }, inventory: (state.player.inventory || []).map((i) => ({ ...i })) };
    const result = repairSystem(player, sysId);
    if (!result.success) {
      const reasonText = result.reason === 'ALREADY_FULL' ? 'уже в полном порядке.' : `не хватает ${result.cost?.resource || 'ресурсов'}.`;
      return { reply: { text: `${sysName}: ${reasonText}`, buttons: stationButtons(deps, player) }, nextState: { scene: 'station', player } };
    }
    return { reply: { text: `Механики восстанавливают узел «${sysName}» до 100%. Списано ${result.cost.resource} T${result.cost.tier} ×${result.cost.qty} и 💳${result.cost.credits}.`, buttons: stationButtons(deps, player) }, nextState: { scene: 'station', player } };
  }

  const toolMatch = /^Купить: (.+)$/.exec(input);
  if (toolMatch) {
    const toolId = Object.keys(TOOL_COSTS).find((id) => TOOL_COSTS[id].name === toolMatch[1]);
    if (toolId) {
      const cost = TOOL_COSTS[toolId];
      const player = { ...state.player, inventory: (state.player.inventory || []).map((i) => ({ ...i })), tools: [...(state.player.tools || [])] };
      if (player.tools.includes(toolId)) {
        return { reply: { text: `${cost.name} у тебя уже есть.`, buttons: stationButtons(deps, player) }, nextState: { scene: 'station', player } };
      }
      const stack = player.inventory.find((i) => i.resource === cost.resource && i.tier === cost.tier);
      const haveQty = stack ? stack.qty : 0;
      if (haveQty < cost.qty || (player.credits || 0) < cost.credits) {
        return {
          reply: { text: `Не хватает на ${cost.name} (нужно ${cost.resource} T${cost.tier} ×${cost.qty} и 💳${cost.credits}).`, buttons: stationButtons(deps, player) },
          nextState: { scene: 'station', player },
        };
      }
      stack.qty -= cost.qty;
      player.inventory = player.inventory.filter((i) => i.qty > 0);
      player.credits -= cost.credits;
      player.tools.push(toolId);
      return { reply: { text: `Инструмент собран: ${cost.name}. Списано ${cost.resource} T${cost.tier} ×${cost.qty} и 💳${cost.credits}.`, buttons: stationButtons(deps, player) }, nextState: { scene: 'station', player } };
    }
  }
  return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player) }, nextState: { scene: 'station', player: state.player } };
}

module.exports = { handleRepair, REPAIR_CREDITS_PER_HP, FUEL_CREDITS_PER_UNIT, TANK_UPGRADE_CREDITS, repairDiscount, tankUpgradeDiscount, importMarkup, TOOL_COSTS };
