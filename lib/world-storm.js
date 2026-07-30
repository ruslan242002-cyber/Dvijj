'use strict';

const CYCLE_MS = 8 * 60 * 60 * 1000;
const STORM_DURATION_MS = 2 * 60 * 60 * 1000;

const STORM_REWARD_MULTIPLIER = 1.5;
const STORM_TIER_BONUS = 1;

function isStormActive(now = Date.now()) {
  return (now % CYCLE_MS) < STORM_DURATION_MS;
}

function stormTimeRemainingMs(now = Date.now()) {
  const posInCycle = now % CYCLE_MS;
  if (posInCycle < STORM_DURATION_MS) return STORM_DURATION_MS - posInCycle;
  return CYCLE_MS - posInCycle;
}

function stormStatusText(now = Date.now()) {
  const active = isStormActive(now);
  const remainingMin = Math.ceil(stormTimeRemainingMs(now) / 60000);
  return active
    ? `🌩️ РЕЗОНАНСНЫЙ ШТОРМ активен ещё ~${remainingMin} мин. Награда и опасность во всех секторах выше обычного.`
    : `Следующий резонансный шторм — примерно через ${remainingMin} мин.`;
}

module.exports = {
  CYCLE_MS, STORM_DURATION_MS, STORM_REWARD_MULTIPLIER, STORM_TIER_BONUS,
  isStormActive, stormTimeRemainingMs, stormStatusText,
};
