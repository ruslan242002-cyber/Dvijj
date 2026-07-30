'use strict';

const { CONTRACT_POOL, REPUTATION_TIERS } = require('./contracts-data.js');
const { makeRng } = require('../engine/seeded-rng.js');

const DAY_MS = 24 * 60 * 60 * 1000;

function getDaySeed(now = Date.now()) {
  return Math.floor(now / DAY_MS);
}

function pickContracts(seed, count = 3) {
  const rng = makeRng(seed);
  const pool = [...CONTRACT_POOL];
  const picked = [];
  for (let i = 0; i < count && pool.length; i++) {
    const idx = Math.floor(rng() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked.map((c) => ({ ...c, current: 0, completed: false }));
}

function getDailyContracts(player, now = Date.now()) {
  const today = getDaySeed(now);
  if (!player.contracts || player.contracts.day !== today) {
    return { day: today, list: pickContracts(today), claimed: [] };
  }
  return player.contracts;
}

function checkContractProgress(player, eventType, details = {}) {
  if (!player.contracts) return player;

  for (const c of player.contracts.list) {
    if (c.completed) continue;

    let match = false;
    if (c.type === 'kill' && eventType === 'combat_win') {
      if (!c.zone || details.zone === c.zone) match = true;
    }
    if (c.type === 'loot' && eventType === 'loot') {
      if (details.resource === c.resource) match = true;
    }
    if (c.type === 'explore' && eventType === 'explore') {
      if (!c.zone || details.zone === c.zone) match = true;
    }
    if (c.type === 'use_stim' && eventType === 'stim_used') {
      match = true;
    }

    if (match) {
      c.current += details.amount || 1;
      if (c.current >= c.target) c.completed = true;
    }
  }
  return player;
}

function claimContractRewards(player, contractId) {
  const c = player.contracts?.list.find((x) => x.id === contractId);
  if (!c || !c.completed || player.contracts.claimed.includes(contractId)) {
    return { success: false, player };
  }
  player.contracts.claimed.push(contractId);
  player.reputation = (player.reputation || 0) + c.reward.reputation;
  player.credits = (player.credits || 0) + c.reward.credits;
  return { success: true, reward: c.reward, player };
}

function getReputationTitle(reputation = 0) {
  let title = 'Незнакомец';
  for (const [threshold, name] of Object.entries(REPUTATION_TIERS)) {
    if (reputation >= Number(threshold)) title = name;
  }
  return title;
}

module.exports = {
  getDaySeed, pickContracts, getDailyContracts, checkContractProgress,
  claimContractRewards, getReputationTitle
};
