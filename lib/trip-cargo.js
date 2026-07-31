'use strict';

/**
 * РАЗДЕЛЕНИЕ ТРЮМА — ключевая связка риска в системе полётов
 * (engine/travel.js): добыча планеты копится в player.tripCargo
 * ("несданный груз этого рейса"), а не сразу в player.inventory
 * (настоящий, уже "забанканный" трюм). Переносится одно в другое ТОЛЬКО
 * при благополучном возврате на станцию.
 *
 * Отсюда и разница в цене поражения:
 *   - Поражение НА ПЛАНЕТЕ (бой ногами, статами персонажа) —
 *     loseTripCargo: теряется только рейсовая добыча, ещё не довезённая.
 *   - Поражение В КОСМОСЕ (случайная встреча/PvP кораблём) —
 *     loseFullCargo: теряется весь трюм целиком, включая всё, что
 *     копилось прошлыми рейсами и ещё не продано на бирже.
 */

function findStack(list, resource, tier) {
  return (list || []).find((i) => i.resource === resource && i.tier === tier);
}

/** Добавляет находку в НЕСДАННЫЙ груз текущего рейса — не в настоящий
 * трюм. Вызывать при любой находке во время полёта к планете (см.
 * engine/travel.js), а не addToInventory напрямую. */
function addToTripCargo(player, resource, tier, qty) {
  player.tripCargo = player.tripCargo || [];
  const existing = findStack(player.tripCargo, resource, tier);
  if (existing) existing.qty += qty;
  else player.tripCargo.push({ resource, tier, qty });
  return player;
}

/** Суммарное количество единиц в несданном грузе — для отображения в
 * духе "везёшь ×N ещё не сданного груза, рискуешь всем этим на обратном
 * пути". */
function tripCargoUnits(player) {
  return (player.tripCargo || []).reduce((sum, i) => sum + i.qty, 0);
}

/** Благополучный возврат на станцию — переносит весь несданный груз в
 * настоящий трюм. Мутирует player.inventory напрямую (та же форма
 * {resource, tier, qty}, что и в game/scenes/common.js: addToInventory) —
 * поэтому не импортирует addToInventory оттуда во избежание цикличной
 * зависимости lib/ <-> game/, сама логика слияния стаков тривиальна. */
function bankTripCargo(player) {
  player.inventory = player.inventory || [];
  for (const item of player.tripCargo || []) {
    const existing = findStack(player.inventory, item.resource, item.tier);
    if (existing) existing.qty += item.qty;
    else player.inventory.push({ resource: item.resource, tier: item.tier, qty: item.qty });
  }
  const banked = player.tripCargo || [];
  player.tripCargo = [];
  return { player, banked };
}

/** Поражение на планете — сгорает только рейсовая добыча. Настоящий
 * трюм (inventory) не трогается вообще. */
function loseTripCargo(player) {
  const lost = player.tripCargo || [];
  player.tripCargo = [];
  return { player, lost };
}

/** Поражение в космосе — сгорает ВСЁ: и рейсовая добыча, и настоящий
 * трюм. Корабль потерян вместе со всем, что вёз. */
function loseFullCargo(player) {
  const lostTrip = player.tripCargo || [];
  const lostInventory = player.inventory || [];
  player.tripCargo = [];
  player.inventory = [];
  return { player, lostTrip, lostInventory };
}

module.exports = { addToTripCargo, tripCargoUnits, bankTripCargo, loseTripCargo, loseFullCargo };
