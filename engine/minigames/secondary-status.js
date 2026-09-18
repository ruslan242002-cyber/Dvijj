'use strict';

/**
 * SECONDARY STATUS — по periferia_status_minigames_TZ.txt раздел 5.
 * "Эта механика должна использоваться РЕДКО" — прямая цитата. Айрин,
 * Ворн, аномалии.
 *
 * Механика: рядом с обычной карточкой статуса игрока появляется ВТОРАЯ
 * — с тем же TIME, но LOCATION UNKNOWN и всеми параметрами на 100%.
 * Можно открыть/закрыть, отправить одному из 4 персонажей (каждый даёт
 * СВОЮ подсказку — не общую) или сохранить запись на будущее.
 *
 * Подсказки завязаны на уже существующие темы персонажей из lib/npc-
 * arcs.js квестов — не выдуманы отдельно: Кран(механика/сигналы),
 * Айрин(архив/реакция), Ворн(обратный след/наука), Мара(архив/
 * противоречие) — та же тема "разрыв Тракта", что уже используется в
 * cross-character квестах D4/M4/A4/V4.
 */
const { renderStatusCard, compactBar } = require('../../lib/status-card.js');

function buildPrimaryCard(player) {
  return renderStatusCard({
    title: 'PLAYER STATUS',
    rows: [
      { label: 'HP', display: compactBar(player.hp, player.hpMax) },
      { label: 'ARMOR', display: compactBar(player.stats?.shielding || 0, 100) },
      { label: 'RADIATION', display: compactBar(player.radiation || 0, 100) },
    ],
    meta: [`LOCATION ${player.currentNodeId || 'UNKNOWN'}`],
  });
}

function buildSecondaryCard() {
  return renderStatusCard({
    title: 'SECONDARY STATUS',
    rows: [
      { label: 'HP', display: compactBar(100, 100) },
      { label: 'ARMOR', display: compactBar(91, 100) },
      { label: 'OXYGEN', display: compactBar(100, 100) },
    ],
    meta: ['LOCATION UNKNOWN'],
  });
}

function startSecondaryStatus(player) {
  return {
    card: buildPrimaryCard(player),
    introText: '⚠ SECONDARY STATUS DETECTED',
    actions: [
      { id: 'open_secondary', label: '🔍 Открыть вторичный статус' },
      { id: 'close', label: '❌ Закрыть, не трогать' },
    ],
  };
}

// Каждая отправка даёт СВОЮ подсказку — не общий рандом, конкретная,
// привязанная к теме персонажа.
const SEND_TARGETS = {
  send_kran: {
    label: '📡 Отправить Крану',
    name: 'Кран',
    discovery: 'machine_signature',
    response: '«Сигнатура похожа на корабль, — говорит Кран после долгого молчания, разглядывая данные. — Только вот засечка по времени с точностью до секунды. Такое не подделать случайно».',
  },
  send_airin: {
    label: '📚 Отправить Айрин',
    name: 'Айрин',
    discovery: 'airin_reaction',
    response: 'Айрин молчит необычно долго, прежде чем ответить. «Я видела такую запись раньше. В архиве. Она была помечена как ошибка сканера и удалена. Видимо, не ошибка».',
  },
  send_vorn: {
    label: '🔬 Отправить Ворну',
    name: 'Ворн',
    discovery: 'reverse_trace',
    response: 'Ворн не отвечает сразу — слишком занят, судя по звукам, лихорадочно что-то пересчитывая. «Обратный след указывает не НА момент разрыва Тракта. Он указывает ИЗ него. Это меняет всё».',
  },
  send_mara: {
    label: '💚 Отправить Маре',
    name: 'Мара',
    discovery: 'archive_contradiction_2',
    response: 'Мара долго смотрит на данные, потом на тебя. «Время совпадает день в день с тем, когда пропал Дарен. Совпадение — это то, что случается один раз. Мы это уже проходили».',
  },
};

function resolveSecondaryStatusAction(actionId) {
  if (actionId === 'close') {
    return {
      done: true,
      result: 'closed',
      score: 30,
      closingText: 'Закрываешь запись, не трогая её дальше. Кажется, разумное решение — на этот раз.',
    };
  }

  if (actionId === 'save_record') {
    return {
      done: true,
      result: 'saved',
      score: 60,
      discovery: 'saved_secondary_record',
      closingText: '💾 Запись сохранена — без объяснений, просто на будущее. Может, однажды она понадобится.',
    };
  }

  const target = SEND_TARGETS[actionId];
  if (target) {
    return {
      done: true,
      result: 'sent',
      score: 85,
      discovery: target.discovery,
      closingText: `${target.response}`,
    };
  }

  return null;
}

module.exports = {
  startSecondaryStatus, resolveSecondaryStatusAction, buildSecondaryCard, SEND_TARGETS,
};
