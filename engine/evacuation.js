'use strict';


module.exports = { evacChance, attemptEvacuation };
const BASE_EVAC_CHANCE = 0.9;
const EVAC_CHANCE_PER_DEPTH = 0.02;
const MIN_EVAC_CHANCE = 0.35;
const MAX_EVAC_CHANCE = 0.98;

function evacChance(depth, bonus = 0) {
  const base = Math.max(BASE_EVAC_CHANCE - depth * EVAC_CHANCE_PER_DEPTH, MIN_EVAC_CHANCE);
  return Math.min(base + bonus, MAX_EVAC_CHANCE);
}

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

