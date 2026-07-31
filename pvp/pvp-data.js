'use strict';

const PVP_LIMITS = {
  // Награда победителю дуэли — фиксированная, не зависящая от тиров/уровней
  // (в отличие от PvE, где награда идёт от тира врага). Простой понятный
  // стимул участвовать, без экономики вокруг самого PvP.
  WINNER_REPUTATION: 15,
  WINNER_CREDITS: 100,
  // Сколько времени даётся на один ход, прежде чем он считается пропущенным.
  TURN_TIMEOUT_MS: 80 * 1000, // 1 минута 20 секунд
  // После скольких ПОДРЯД пропущенных ходов одной стороны — автопоражение.
  MAX_MISSED_TURNS: 3,
};

const PVP_ERRORS = {
  TARGET_NOT_FOUND: 'TARGET_NOT_FOUND',
  CANNOT_CHALLENGE_SELF: 'CANNOT_CHALLENGE_SELF',
  ALREADY_IN_DUEL: 'ALREADY_IN_DUEL',
  DUEL_NOT_FOUND: 'DUEL_NOT_FOUND',
  NOT_YOUR_TURN: 'NOT_YOUR_TURN',
  DUEL_FINISHED: 'DUEL_FINISHED',
  UNKNOWN_SKILL: 'UNKNOWN_SKILL',
};

module.exports = { PVP_LIMITS, PVP_ERRORS };
