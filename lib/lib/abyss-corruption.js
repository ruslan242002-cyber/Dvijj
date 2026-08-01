'use strict';

/**
 * СЧЁТЧИК ЗАРАЖЕНИЯ БЕЗДНОЙ — накопительная версия уже существующего
 * `touched_abyss` (choices/consequence-engine.js: разовый флаг + разовый
 * maxHpPenalty:10 от одного квестового выбора). Здесь — то же самое явление,
 * но как открытая механика: каждое применение технологии Бездны (не один
 * квестовый момент) двигает счётчик, и штраф к максимальному HP растёт
 * ступенчато, а не один раз.
 *
 * player.abyssCorruption — число, растёт монотонно, никогда не убывает
 * (нет "очищения" — сама суть Бездны в необратимости, см. лор-документ).
 */

const CORRUPTION_PER_USE = 8;              // сколько добавляет одно применение технологии Бездны
const CORRUPTION_TIER_SIZE = 25;           // сколько заражения на один "порог"
const HP_PENALTY_PER_TIER = 10;            // штраф к макс. HP за каждый пройденный порог (матчит существующий maxHpPenalty)
const POINT_OF_NO_RETURN_THRESHOLD = 100;  // абсолютный потолок — точка невозврата (см. sector_23 в лоре)

function corruptionTier(player) {
  return Math.floor((player.abyssCorruption || 0) / CORRUPTION_TIER_SIZE);
}

function isAtPointOfNoReturn(player) {
  return (player.abyssCorruption || 0) >= POINT_OF_NO_RETURN_THRESHOLD;
}

/**
 * Применяет технологию Бездны — увеличивает счётчик, и если это пересекло
 * новый порог (CORRUPTION_TIER_SIZE), применяет кумулятивный штраф к
 * максимальному HP немедленно (не откладывая до следующего события).
 * Выставляет тот же флаг player.flags.touched_abyss, что и существующая
 * квестовая ветка — не параллельная система, а расширение той же самой.
 *
 * @returns {{ newTier:number, crossedTier:boolean, atPointOfNoReturn:boolean }}
 */
function useAbyssTech(player, amount = CORRUPTION_PER_USE) {
  const prevTier = corruptionTier(player);
  player.abyssCorruption = (player.abyssCorruption || 0) + amount;
  player.flags = player.flags || {};
  player.flags.touched_abyss = true;

  const newTier = corruptionTier(player);
  if (newTier > prevTier) {
    const extraPenalty = (newTier - prevTier) * HP_PENALTY_PER_TIER;
    player.hpMax = Math.max(50, (player.hpMax || 220) - extraPenalty);
    player.hp = Math.min(player.hp, player.hpMax);
  }

  return {
    newTier,
    crossedTier: newTier > prevTier,
    atPointOfNoReturn: isAtPointOfNoReturn(player),
  };
}

module.exports = {
  CORRUPTION_PER_USE, CORRUPTION_TIER_SIZE, HP_PENALTY_PER_TIER, POINT_OF_NO_RETURN_THRESHOLD,
  corruptionTier, isAtPointOfNoReturn, useAbyssTech,
};
