'use strict';

/**
 * Карточка статуса после вылазки — тот же визуальный язык прогресс-баров
 * (■/□), что и в Атраксисе, но под лор Периферии: вместо "Заражения" —
 * "Облучение" (у нас это уже есть как player.radiation), плюс уровень/XP
 * и HP. Показывается после КАЖДОГО события вылазки — не отдельный экран,
 * а хвост, который дописывается к тексту любого исхода.
 */

const { xpToNext } = require('../engine/leveling.js');

function progressBar(current, max, { length = 16, decimals = 0 } = {}) {
  const pct = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
  const filled = Math.round(pct * length);
  const bar = '■'.repeat(filled) + '□'.repeat(length - filled);
  return `[${bar}] ${(pct * 100).toFixed(decimals)}%`;
}

function explorationStatusCard(player) {
  const next = xpToNext(player.level || 1);
  const hp = Math.round(player.hp);
  const hpMax = Math.round(player.hpMax);
  const xpBar = progressBar(player.xp || 0, next, { decimals: 2 });
  const radBar = progressBar(player.radiation || 0, 100, { decimals: 0 });
  const hpBar = progressBar(hp, hpMax, { decimals: 0 });

  return (
    `🌟 Уровень ${player.level || 1}\n${xpBar}\n` +
    `☢️ Облучение\n${radBar}\n` +
    `❤️ HP: ${hp} / ${hpMax}\n${hpBar}`
  );
}

module.exports = { progressBar, explorationStatusCard };
