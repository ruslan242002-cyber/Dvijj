'use strict';

/**
 * ПОЛОСЫ ТИРОВ ПО УРОВНЮ — раньше потолок тира врага/ресурса считался как
 * playerLevel+2 (bestiary.js, exploration-engine.js, ship-encounters.js) —
 * то есть буквально любой уровень открывал почти весь диапазон тиров за
 * пару шагов. Теперь тир жёстко привязан к уровню персонажа тремя
 * полосами — красные зоны высоких тиров реально требуют прогресса, а не
 * пары удачных вылазок:
 *
 *   Т1-Т2 — уровни 1-29
 *   Т3-Т4 — уровни 30-59
 *   Т5-Т6 — уровни 60+ (Т7 — только у самых опасных именных монстров/
 *           кораблей бестиария, не заходит в обычную полосовую прогрессию)
 */

const TIER_BANDS = [
  { minLevel: 1, maxTier: 2 },
  { minLevel: 30, maxTier: 4 },
  { minLevel: 60, maxTier: 6 },
  { minLevel: 90, maxTier: 7 }, // редкий эндгейм-потолок — S-класс бестиария/кораблей (Нулевой жнец и подобные)
];

/** Максимальный тир, доступный игроку этого уровня по обычной полосовой
 * прогрессии. Тир 7 (высшие именные угрозы бестиария/кораблей) сюда не
 * входит намеренно — это по-прежнему редкий верхний предел, не связанный
 * с обычной полосой. */
function maxTierForLevel(level) {
  let max = TIER_BANDS[0].maxTier;
  for (const band of TIER_BANDS) {
    if (level >= band.minLevel) max = band.maxTier;
  }
  return max;
}

/** На каком уровне открывается конкретный тир — для текстовых подсказок
 * игроку ("Т5 откроется на 60 уровне"), не для самой генерации врагов. */
function levelForTier(tier) {
  for (const band of TIER_BANDS) {
    if (band.maxTier >= tier) return band.minLevel;
  }
  return TIER_BANDS[TIER_BANDS.length - 1].minLevel;
}

module.exports = { TIER_BANDS, maxTierForLevel, levelForTier };
