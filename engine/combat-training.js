'use strict';

/**
 * ПРОКАЧКА ОТ ИСПОЛЬЗОВАНИЯ (как в Skyrim) — статы растут не только от
 * очков за левел-ап, а от самого факта регулярной практики в бою:
 *
 *   power     — растёт от нанесения урона (силовой напор)
 *   mind      — растёт от применения умений (тактика/интеллект)
 *   reaction  — растёт от уклонения от вражеских атак (рефлексы)
 *   endurance — растёт от получения урона и выживания (закалка)
 *
 * Копится счётчик по каждому стату отдельно; при достижении порога —
 * тихий +1 к стату НАВСЕГДА, счётчик сбрасывается на остаток (не
 * теряется прогресс сверх порога). Не заменяет обычную систему очков
 * за уровень — это отдельная, медленная прибавка поверх неё.
 */

const TRAINING_THRESHOLD = 40; // столько действий одного типа = +1 к стату

function trackCombatAction(player, statId) {
  player.combatTraining = player.combatTraining || { power: 0, mind: 0, reaction: 0, endurance: 0 };
  player.combatTraining[statId] = (player.combatTraining[statId] || 0) + 1;

  if (player.combatTraining[statId] >= TRAINING_THRESHOLD) {
    player.combatTraining[statId] -= TRAINING_THRESHOLD;
    player.stats = player.stats || {};
    player.stats[statId] = (player.stats[statId] || 0) + 1;
    return { grew: true, stat: statId };
  }
  return { grew: false, stat: statId, progress: player.combatTraining[statId], threshold: TRAINING_THRESHOLD };
}

module.exports = { TRAINING_THRESHOLD, trackCombatAction };
