'use strict';

/**
 * ПУТЬ ДО ПЛАНЕТЫ — переиспользует уже существующую идею "depth"
 * (engine/deep-exploration.js: чем больше шагов вглубь одной вылазки без
 * возврата на станцию, тем больше награда и опасность), но добавляет то,
 * чего там нет: ТОПЛИВО и явный "путь туда И обратно".
 *
 * distance здесь — то же самое, что depth: счётчик шагов ТЕКУЩЕГО рейса
 * к планете, не характеристика персонажа/корабля. Обнуляется при
 * безопасном возврате на станцию, при потере корабля или при поражении.
 *
 * Философия EVE, которую переносим: чем дальше улетел — тем богаче
 * находка, но тем меньше топлива в запасе и тем опаснее путь домой.
 * Никакого реального "времени полёта" не симулируем — оно и в EVE для
 * геймплея не так важно, как сам факт "ты далеко, и это стоит топлива
 * и риска".
 */

const FUEL_PER_STEP_MIN = 2;           // топливо за один шаг вглубь — раньше фиксированные 8, теперь случайно 2-5
const FUEL_PER_STEP_MAX = 5;
const FUEL_PRICE_PER_UNIT = 2;         // цена дозаправки — 2 кредита за единицу топлива
const TANK_UPGRADE_FUEL_BONUS = 20;    // на сколько расширяет бак один апгрейд (см. game/scenes/locations/repair.js)

const REWARD_PER_STEP = 0.15;          // +15% к добыче рейса за шаг дальности
const MAX_REWARD_MULTIPLIER = 4;

const TIER_BONUS_PER_STEPS = 2;        // +1 к потолку тира вражеского корабля за каждые 2 шага
const MAX_TIER_BONUS = 6;

const RETURN_PVP_CHANCE_PER_STEP = 0.04; // +4% шанс PvP-встречи на ОБРАТНОМ пути за шаг дальности
const MAX_RETURN_PVP_CHANCE = 0.65;      // никогда не 100% — иначе дальние рейсы станут гарантированной смертью, не риском

function safeDistance(distance) {
  return Math.max(0, distance);
}

/** Сколько топлива стоит УГЛУБИТЬСЯ ещё на один шаг. С rng — настоящая
 * случайная цена этого конкретного шага (2-5, включительно). Без rng —
 * консервативная оценка (всегда берём худший случай, 5), используется
 * только в проверках "хватит ли" ДО того, как шаг реально сделан — так
 * предупреждение никогда не соврёт в сторону "должно хватить", когда на
 * самом деле может не хватить. */
function fuelCostForStep(rng = null) {
  if (rng) return FUEL_PER_STEP_MIN + Math.floor(rng() * (FUEL_PER_STEP_MAX - FUEL_PER_STEP_MIN + 1));
  return FUEL_PER_STEP_MAX;
}

/** Сколько топлива нужно, чтобы вернуться на станцию С ТЕКУЩЕЙ дистанции.
 * Тоже консервативная оценка (худший случай на каждый шаг) — реальный
 * расход при самом возврате может оказаться меньше, но никогда больше. */
function fuelNeededToReturn(distance) {
  return distance * FUEL_PER_STEP_MAX;
}

/** Настоящий (не оценочный) расход топлива на обратный путь — честно
 * прокатывает per-tick стоимость для каждого шага дистанции, той же
 * случайностью 2-5, что и полёт туда. Вызывать ИМЕННО в момент возврата
 * (с rng), а не для предварительных прикидок — для тех используется
 * fuelNeededToReturn (консервативная оценка без rng). */
function actualReturnFuelCost(distance, rng) {
  let total = 0;
  for (let i = 0; i < distance; i++) total += fuelCostForStep(rng);
  return total;
}

/** Хватит ли топлива дойти ещё на шаг ДАЛЬШЕ и при этом всё ещё суметь
 * вернуться назад с новой дистанции. Это НЕ запрет — это предупреждение:
 * router.js решает, показывать ли игроку кнопку "Всё равно углубиться"
 * (рискованно, топлива на обратный путь может не хватить) отдельно от
 * обычной "Углубиться дальше" (безопасно, топлива хватит на оба конца). */
function canSafelyGoDeeper(ship, distance) {
  const nextDistance = distance + 1;
  const fuelAfterStep = ship.fuel - fuelCostForStep();
  return fuelAfterStep >= fuelNeededToReturn(nextDistance);
}

/** Есть ли вообще топливо ФИЗИЧЕСКИ сделать ещё шаг (не важно, хватит ли
 * потом на обратный путь). */
function canAffordStep(ship) {
  return ship.fuel >= fuelCostForStep();
}

/** Хватает ли топлива вернуться домой ПРЯМО СЕЙЧАС, с текущей дистанции. */
function canAffordReturn(ship, distance) {
  return ship.fuel >= fuelNeededToReturn(distance);
}

/** Множитель добычи рейса — растёт с дистанцией, есть потолок. */
function distanceRewardMultiplier(distance) {
  const d = safeDistance(distance);
  return Math.min(1 + d * REWARD_PER_STEP, MAX_REWARD_MULTIPLIER);
}

/** На сколько тиров может подняться потолок вражеского корабля в
 * космических встречах на этой дистанции. */
function distanceTierBonus(distance) {
  const d = safeDistance(distance);
  return Math.min(Math.floor(d / TIER_BONUS_PER_STEPS), MAX_TIER_BONUS);
}

/** Шанс, что на ОБРАТНОМ пути (когда игрок решает вернуться на станцию с
 * текущей дистанции) встреча окажется враждебным PvP, а не обычной
 * пустой дорогой домой. Это и есть тот самый риск "довезти трюм живым". */
function returnTripPvpChance(distance) {
  const d = safeDistance(distance);
  return Math.min(d * RETURN_PVP_CHANCE_PER_STEP, MAX_RETURN_PVP_CHANCE);
}

/**
 * ЗОНЫ ПО ДИСТАНЦИИ — раньше зона (патрулируемая/спорная/открытый космос)
 * выбиралась отдельной кнопкой «Врата Тракта» независимо от того, летал
 * ли игрок вообще. Теперь зона — это то, ГДЕ ты оказался, пролетев
 * достаточно далеко на достаточно сильном корабле: без нужного уровня
 * корабля дальше определённой дистанции просто не пускают.
 */
const ZONE_DISTANCE_BANDS = [
  { minDistance: 0, zone: 'blue', minShipLevel: 1 },
  { minDistance: 5, zone: 'yellow', minShipLevel: 4 },
  { minDistance: 10, zone: 'red', minShipLevel: 8 },
];

/** Какая зона соответствует текущей дистанции полёта — используется при
 * высадке на планету, чтобы решить, какого уровня враги там ждут. */
function zoneForDistance(distance) {
  let band = ZONE_DISTANCE_BANDS[0];
  for (const b of ZONE_DISTANCE_BANDS) {
    if (distance >= b.minDistance) band = b;
  }
  return band.zone;
}

/** Минимальный уровень корабля, чтобы долететь до этой дистанции вообще
 * (не просто высадиться там — само пространство здесь опаснее). */
function shipLevelRequiredForDistance(distance) {
  let required = ZONE_DISTANCE_BANDS[0].minShipLevel;
  for (const b of ZONE_DISTANCE_BANDS) {
    if (distance >= b.minDistance) required = b.minShipLevel;
  }
  return required;
}

/** Хватает ли уровня корабля, чтобы сделать ещё один шаг вглубь (к
 * СЛЕДУЮЩЕЙ дистанции, не текущей — проверяем НАПЕРЁД). */
function canFlyToDistance(ship, distance) {
  return (ship.level || 1) >= shipLevelRequiredForDistance(distance);
}

module.exports = {
  FUEL_PER_STEP_MIN,
  FUEL_PER_STEP_MAX,
  FUEL_PRICE_PER_UNIT,
  TANK_UPGRADE_FUEL_BONUS,
  fuelCostForStep,
  fuelNeededToReturn,
  actualReturnFuelCost,
  canSafelyGoDeeper,
  canAffordStep,
  canAffordReturn,
  distanceRewardMultiplier,
  distanceTierBonus,
  returnTripPvpChance,
  ZONE_DISTANCE_BANDS,
  zoneForDistance,
  shipLevelRequiredForDistance,
  canFlyToDistance,
};
