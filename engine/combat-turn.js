'use strict';

const { resolveTurn } = require('./combat-engine');
const { STIMS } = require('./skills-data');

/**
 * Резолвит один ход игрока против врага, включая опциональный стим —
 * ровно один раз за бой. router.js должен звать ЭТУ функцию из
 * case 'combat' вместо голого resolveTurn(), передавая
 * state.stimUsedThisFight из текущей сцены боя.
 *
 * Возвращает { ...результат resolveTurn, stimUsedThisFight } — это
 * поле нужно сохранить в nextState боя, чтобы кнопка "Стим" пропала
 * до конца боя, как только он использован.
 *
 * Если stimId передан, но стим уже использован в этом бою — стим
 * молча игнорируется (ход всё равно проходит как обычная атака/навык),
 * а не отклоняется с ошибкой: защита от гонки двойного нажатия важнее
 * строгости здесь.
 */
function resolvePlayerTurn({ player, enemy, skill, stimId, stimUsedThisFight, rng = Math.random }) {
  const stim = !stimUsedThisFight && stimId ? STIMS[stimId] : null;
  const result = resolveTurn({ attacker: player, defender: enemy, skill, stim, rng });

  return {
    ...result,
    stimUsedThisFight: stimUsedThisFight || !!stim,
  };
}

module.exports = { resolvePlayerTurn };
