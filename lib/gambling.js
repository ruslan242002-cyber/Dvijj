'use strict';

/**
 * КОСТИ — простая азартная игра на ставку, по мотивам сцен с игрой в
 * кости/карты в барах (Последний Глоток у Приюта, бар Арсенала).
 * Игрок против заведения: два броска 2к6 каждому, выше сумма — выигрыш.
 * Ничья — ставка возвращается, не потеряна и не удвоена.
 */
const MIN_BET = 10;
const MAX_BET = 5000;

function rollTwoDice(rng) {
  return (1 + Math.floor(rng() * 6)) + (1 + Math.floor(rng() * 6));
}

/** Не мутирует player — вызывающий код сам решает, когда списать/начислить
 * кредиты, основываясь на возвращённом outcome. */
function playDice(betAmount, rng = Math.random) {
  const playerRoll = rollTwoDice(rng);
  const houseRoll = rollTwoDice(rng);
  if (playerRoll > houseRoll) return { outcome: 'win', payout: betAmount * 2, playerRoll, houseRoll };
  if (playerRoll === houseRoll) return { outcome: 'push', payout: betAmount, playerRoll, houseRoll };
  return { outcome: 'lose', payout: 0, playerRoll, houseRoll };
}

module.exports = { MIN_BET, MAX_BET, playDice, rollTwoDice };
