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

/** Компактная полоса без скобок, под доковский стиль "███████░░░ 74%" —
 * обычная progressBar() выше со скобками не влезает в 30-символьную
 * карточку статус-мини-игр вместе с меткой. */
function compactBar(current, max, barLength = 10) {
  const pct = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
  const filled = Math.round(pct * barLength);
  return '█'.repeat(filled) + '░'.repeat(barLength - filled) + ` ${Math.round(pct * 100)}%`;
}

/**
 * STATUS CARD ДЛЯ МИНИ-ИГР — по periferia_status_minigames_TZ.txt.
 * Намеренно ДРУГОЙ визуальный стиль (╔═╗║╚), чем renderCard() выше
 * (┏━┓┃┗) — renderCard уже используется в бою/вылазках/боссах, эту
 * функцию не смешивать визуально с обычными игровыми карточками.
 */
function renderStatusCard({ title, rows, warnings = [], meta = [] }) {
  const WIDTH = 30;
  const pad = (s) => {
    const str = String(s);
    return str.length >= WIDTH ? str.slice(0, WIDTH) : str + ' '.repeat(WIDTH - str.length);
  };
  const center = (s) => {
    const str = String(s);
    const left = Math.floor((WIDTH - str.length) / 2);
    const right = WIDTH - str.length - left;
    return ' '.repeat(Math.max(0, left)) + str + ' '.repeat(Math.max(0, right));
  };

  const lines = [];
  lines.push('╔' + '═'.repeat(WIDTH) + '╗');
  lines.push('║' + center(`◈ ${title} ◈`) + '║');
  lines.push('╠' + '═'.repeat(WIDTH) + '╣');
  for (const row of rows) {
    lines.push('║' + pad(` ${row.label.padEnd(11)} ${row.display}`) + '║');
  }
  if (meta.length) {
    lines.push('╠' + '═'.repeat(WIDTH) + '╣');
    for (const m of meta) lines.push('║' + pad(` ${m}`) + '║');
  }
  if (warnings.length) {
    lines.push('╠' + '═'.repeat(WIDTH) + '╣');
    for (const w of warnings) lines.push('║' + pad(` ${w}`) + '║');
  }
  lines.push('╚' + '═'.repeat(WIDTH) + '╝');
  return lines.join('\n');
}

module.exports = { progressBar, compactBar, explorationStatusCard, renderCard, renderStatusCard };
