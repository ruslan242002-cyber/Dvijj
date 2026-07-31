'use strict';

const { rollEventWithDepth } = require('./deep-exploration');

/*
 * Эвакуация — не бесплатная кнопка "выйти", иначе весь смысл риска
 * "чем глубже, тем опаснее" пропадает: игрок просто нырял бы на
 * максимальную глубину и тут же жал эвакуацию без единого боя.
 * Вместо этого — шанс на чистый уход, падающий с глубиной; при неудаче
 * путь назад перегораживает последнее событие (почти всегда бой), его
 * нужно пройти, прежде чем эвакуация станет снова доступна.
 */

const BASE_EVAC_CHANCE = 0.9;
const EVAC_CHANCE_PER_DEPTH = 0.02;
const MIN_EVAC_CHANCE = 0.35; // даже на максимальной глубине путь назад не безнадёжен
const MAX_EVAC_CHANCE = 0.98; // даже с бонусом дома всегда остаётся ненулевой риск

/** bonus — суммарный бонус от жилья (lib/housing.js: getEvacChanceBonus),
 * передаётся явно, а не читается отсюда, чтобы движок эвакуации не знал
 * о жилье напрямую. */
function evacChance(depth, bonus = 0) {
  const base = Math.max(BASE_EVAC_CHANCE - depth * EVAC_CHANCE_PER_DEPTH, MIN_EVAC_CHANCE);
  return Math.min(base + bonus, MAX_EVAC_CHANCE);
}

/**
 * Попытка эвакуации с текущей глубины вылазки.
 *
 * Успех: { success: true } — router.js сбрасывает depth и возвращает
 * player на станцию. Вся награда, полученная по ходу вылазки, уже у
 * игрока (она начисляется по каждому событию через rollEventWithDepth,
 * а не отдельным призом здесь) — эвакуация просто останавливает риск,
 * не даёт и не забирает ничего сама по себе.
 *
 * Неудача: { success: false, blockingEvent } — blockingEvent такой же
 * формы, что и обычное событие вылазки (см. deep-exploration.js), почти
 * всегда это ambush на текущей глубине. Router.js должен провести игрока
 * через это событие как обычно (в т.ч. бой), и только после этого снова
 * предложить кнопку эвакуации.
 */
function attemptEvacuation(player, zone, depth, rng = Math.random, evacBonus = 0) {
  if (rng() < evacChance(depth, evacBonus)) {
    return {
      success: true,
      text: 'Эвакуационный маяк засекает чистый коридор — путь на станцию свободен.',
    };
  }

  const blockingEvent = rollEventWithDepth(player, zone, depth, rng);
  return {
    success: false,
    text: 'Что-то встаёт на пути между вами и эвакуационным коридором.',
    blockingEvent,
  };
}

module.exports = { evacChance, attemptEvacuation };
