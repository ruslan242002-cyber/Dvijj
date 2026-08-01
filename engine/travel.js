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

const FUEL_PER_STEP = 8;               // топливо за один шаг вглубь (к планете)

const REWARD_PER_STEP = 0.15;          // +15% к добыче рейса за шаг дальности
const MAX_REWARD_MULTIPLIER = 4;

const TIER_BONUS_PER_STEPS = 2;        // +1 к потолку тира вражеского корабля за каждые 2 шага
const MAX_TIER_BONUS = 6;

const RETURN_PVP_CHANCE_PER_STEP = 0.04; // +4% шанс PvP-встречи на ОБРАТНОМ пути за шаг дальности
const MAX_RETURN_PVP_CHANCE = 0.65;      // никогда не 100% — иначе дальние рейсы станут гарантированной смертью, не риском

function safeDistance(distance) {
  return Math.max(0, distance);
}

/** Сколько топлива стоит УГЛУБИТЬСЯ ещё на один шаг (независимо от того,
 * сколько шагов уже пройдено — цена шага постоянна, дорожает не шаг,
 * а общая дистанция, которую потом придётся преодолевать обратно). */
function fuelCostForStep() {
  return FUEL_PER_STEP;
}

/** Сколько топлива нужно, чтобы вернуться на станцию С ТЕКУЩЕЙ дистанции. */
function fuelNeededToReturn(distance) {
  return distance * FUEL_PER_STEP;
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

module.exports = {
  FUEL_PER_STEP,
  fuelCostForStep,
  fuelNeededToReturn,
  canSafelyGoDeeper,
  canAffordStep,
  canAffordReturn,
  distanceRewardMultiplier,
  distanceTierBonus,
  returnTripPvpChance,
};
