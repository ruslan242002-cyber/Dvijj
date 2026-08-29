'use strict';

/**
 * Карточка статуса после вылазки — визуальный язык прогресс-баров (■/□),
 * показывается после КАЖДОГО события вылазки — не отдельный экран, а
 * хвост, который дописывается к тексту любого исхода.
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

  return renderCard('СТАТУС', [
    `Уровень ${player.level || 1}`,
    xpBar,
    '',
    `HP: ${hp} / ${hpMax}`,
    hpBar,
    '',
    'Облучение',
    radBar,
  ]);
}

/**
 * ОБЩАЯ РАМКА В СТИЛЕ ТЕРМИНАЛА — ▁▂▃ прогресс-бары уже были, добавляем
 * обрамление под тот же визуальный язык (по референсу: чёткая рамка,
 * КАПС-заголовок, секции). VK не гарантирует моноширинный шрифт, так что
 * рамка не претендует на идеальное выравнивание "в столбик" — она про
 * структуру и привычность взгляду, не про пиксель-перфект таблицу.
 *
 * @param {string} title — заголовок карточки (сам оборачивается в КАПС)
 * @param {string[]} lines — тело карточки, одна строка = одна строка вывода;
 *   пустая строка '' даёт визуальный разрыв секции без лишней рамки
 */
function renderCard(title, lines) {
  const body = lines
    .map((line) => (line === '' ? '' : `┃ ${line}`))
    .join('\n');
  return (
    `┏━━━ ${title.toUpperCase()} ━━━┓\n` +
    `${body}\n` +
    `┗━━━━━━━━━━━━━━━━━━┛`
  );
}

module.exports = { progressBar, explorationStatusCard, renderCard };
