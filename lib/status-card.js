'use strict';

const { xpToNext } = require('../engine/leveling.js');

function progressBar(current, max, { length = 16, decimals = 0 } = {}) {
  const pct = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
  const filled = Math.round(pct * length);
  const bar = '■'.repeat(filled) + '□'.repeat(length - filled);
  return `[${bar}] ${(pct * 100).toFixed(decimals)}%`;
}

function explorationStatusCard(player) {
  const next = xpToNext(player.level || 1);
  const xpBar = progressBar(player.xp || 0, next, { decimals: 2 });
  const radBar = progressBar(player.radiation || 0, 100, { decimals: 0 });
  const hpBar = progressBar(player.hp, player.hpMax, { decimals: 0 });

  return (
    `🌟 Уровень ${player.level || 1}\n${xpBar}\n` +
    `☢️ Облучение\n${radBar}\n` +
    `❤️ HP: ${player.hp} / ${player.hpMax}\n${hpBar}`
  );
}

module.exports = { progressBar, explorationStatusCard };
