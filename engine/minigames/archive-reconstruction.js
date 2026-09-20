'use strict';

/**
 * ARCHIVE RECONSTRUCTION — по periferia_status_minigames_TZ.txt раздел 4.
 * Назначение: Мара, расследования, архивы.
 *
 * ГЛАВНАЯ МЕХАНИКА (прямая цитата документа): "не обязательно
 * существует одна правильная запись" — UNRESOLVED может быть ЧЕСТНЫМ
 * правильным результатом, не провалом. Единственная из 4 мини-игр, где
 * "оставить как есть, не выбирать" — валидный, иногда лучший ответ.
 *
 * Связь с историей игрока: если у него уже есть подходящий discovery
 * (см. lib/discoveries.js — используем существующие "разрыв Тракта"
 * открытия этой же партии, не выдумываем отдельную систему), появляется
 * ДОПОЛНИТЕЛЬНЫЙ вариант trust_memory — история игрока реально влияет
 * на мини-игру, как и просит документ.
 */
const { renderStatusCard } = require('../../lib/status-card.js');

const RECORDS = [
  { id: 'A', ship: 'X17', date: '2181', status: 'ACTIVE' },
  { id: 'B', ship: 'X17', date: '2184', status: 'DESTROYED' },
  { id: 'C', ship: 'X17', date: '2184', crew: 5 },
];

// Если у игрока есть ЛЮБОЕ из этих открытий — сигнал совпадает, история
// игрока реально имеет вес (та самая связь с "разрыв Тракта", что уже
// построена в lib/npc-arcs.js этой сессии).
const RELEVANT_DISCOVERIES = ['daren_survived_theory', 'tract_remembers_routes', 'ayrin_rupture_pattern', 'vorn_rupture_research'];

function buildCard(showTrustMemory = false) {
  const rows = RECORDS.flatMap((r) => [
    { label: `RECORD ${r.id}`, display: '' },
    { label: 'SHIP', display: r.ship },
    { label: 'DATE', display: r.date },
    { label: r.status ? 'STATUS' : 'CREW', display: r.status || String(r.crew) },
  ]);
  return renderStatusCard({ title: 'ARCHIVE RECONSTRUCTION', rows: [], meta: RECORDS.flatMap((r) => [
    `[RECORD ${r.id}] ${r.ship}`,
    `DATE ${r.date} ${r.status ? 'STATUS ' + r.status : 'CREW ' + r.crew}`,
  ]) });
}

function startArchiveReconstruction(player) {
  const hasRelevantMemory = RELEVANT_DISCOVERIES.some((id) => player.discoveries?.[id]);
  return {
    card: buildCard(),
    introText: 'Три записи об одном корабле. Не совпадают друг с другом.',
    actions: [
      { id: 'accept_A_error', label: 'RECORD A — ошибка' },
      { id: 'accept_B_error', label: 'RECORD B — ошибка' },
      { id: 'accept_C_error', label: 'RECORD C — ошибка' },
      { id: 'preserve_all', label: 'Сохранить все как есть' },
      { id: 'cross_check_signal', label: 'Сверить с сигналом' },
    ],
    hasRelevantMemory,
  };
}

/** Первый выбор. Если cross_check_signal И есть подходящая память —
 * НЕ завершает мини-игру, а открывает ВТОРОЙ раунд с новым вариантом
 * trust_memory (ровно как в примере документа — "появляется новый
 * вариант"). Остальные выборы завершают сразу. */
function resolveArchiveStep1(actionId, hasRelevantMemory) {
  if (actionId === 'cross_check_signal' && hasRelevantMemory) {
    return {
      done: false,
      card: buildCard(),
      text: 'SIGNATURE MATCH: 97%\n\nТы уже сталкивался с чем-то похожим на X17 раньше.',
      actions: [
        { id: 'trust_memory', label: 'Довериться своей памяти' },
        { id: 'preserve_all', label: 'Всё равно сохранить как есть' },
      ],
    };
  }

  if (actionId === 'cross_check_signal') {
    return {
      done: true,
      result: 'unresolved',
      score: 55,
      archiveAnomaly: true,
      closingText: 'Сигнал не даёт однозначного ответа. UNRESOLVED — и это честный результат, не провал.',
    };
  }

  if (actionId === 'preserve_all') {
    return {
      done: true,
      result: 'unresolved',
      score: 60,
      archiveAnomaly: true,
      closingText: 'Ты оставляешь все три записи как есть, с пометкой о противоречии. Иногда честность важнее ложной ясности.',
    };
  }

  // accept_X_error — игрок УВЕРЕН, что нашёл, где ошибка. Может быть
  // прав, может — нет; документ не требует давать игроку знать заранее.
  const guessedRight = actionId === 'accept_B_error'; // B(DESTROYED,2184) реально противоречит и A, и C сильнее всего
  return {
    done: true,
    result: guessedRight ? 'resolved' : 'archive_missing',
    score: guessedRight ? 85 : 25,
    archiveMissing: !guessedRight,
    closingText: guessedRight
      ? 'Запись B помечена как ошибочная — с ней действительно рассинхронизация. Остальные две встают на место.'
      : 'Ты стираешь запись, которая на деле была верной. Часть истории потеряна безвозвратно.',
  };
}

function resolveArchiveStep2(actionId) {
  if (actionId === 'trust_memory') {
    return {
      done: true,
      result: 'resolved',
      score: 95,
      discovery: 'x17_timeline_break',
      closingText: 'Ты доверяешь собственной памяти больше, чем противоречивым записям — и оказываешься прав. Связь найдена: разрыв в хронологии X17 не случаен.',
    };
  }
  return {
    done: true,
    result: 'unresolved',
    score: 60,
    archiveAnomaly: true,
    closingText: 'Ты всё равно оставляешь записи как есть, не полагаясь на смутное совпадение. Осторожность — тоже выбор.',
  };
}

module.exports = { startArchiveReconstruction, resolveArchiveStep1, resolveArchiveStep2, RECORDS, RELEVANT_DISCOVERIES };
