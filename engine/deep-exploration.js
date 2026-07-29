'use strict';

const { rollEventWithContext } = require('./world-context');

const MAX_DEPTH_TIER_BONUS = 6;
const TIER_BONUS_PER_STEPS = 2;
const REWARD_PER_STEP = 0.12;
const MAX_REWARD_MULTIPLIER = 3.5;

function depthTierBonus(depth) {
  return Math.min(Math.floor(depth / TIER_BONUS_PER_STEPS), MAX_DEPTH_TIER_BONUS);
}

function depthRewardMultiplier(depth) {
  return Math.min(1 + depth * REWARD_PER_STEP, MAX_REWARD_MULTIPLIER);
}

function rollEventWithDepth(player, zone, depth = 0, rng = Math.random) {
  const event = rollEventWithContext(player, zone, rng, depth);

  if (event.source !== 'procedural') return event;

  const rewardMult = depthRewardMultiplier(depth);

  if ((event.type === 'find' || event.type === 'node') && event.loot) {
    event.loot = {
      ...event.loot,
      credits: Math.round(event.loot.credits * rewardMult),
      qty: Math.round(event.loot.qty * Math.min(rewardMult, 2)),
    };
  }

  if (event.type === 'ambush' && event.enemy) {
    event.depthBonusTier = depthTierBonus(depth);
  }

  event.depth = depth;
  event.rewardMultiplier = rewardMult;
  return event;
}

module.exports = { rollEventWithDepth, depthTierBonus, depthRewardMultiplier };
