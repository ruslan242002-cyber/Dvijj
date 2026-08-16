'use strict';

/**
 * РАЗВЕДКА ТРАКТОВ — сервер знает точные факты о временном Тракте
 * (реальный to, реальная stability, точный expiresAt), разведчик узнаёт
 * ПРИБЛИЖЁННУЮ картину. Первое сканирование — грубое, повторное на том
 * же Тракте — точнее (scoutCount растёт, шум падает). Отчёт можно
 * показать/продать другому игроку как есть — это и есть "информация как
 * ресурс" из спецификации.
 *
 * Формат вывода соответствует примеру из ТЗ:
 * "Тракт Т-71. Обнаружен 4 минуты назад. Стабильность 67%.
 *  Предполагаемая жизнь 20–60 минут. Выход неизвестен.
 *  Вероятность выхода в сектор Кайлара — 61%."
 */

const { NODES } = require('../engine/tract-network.js');

/** Шум сканирования зависит от scoutCount (1 = первое, грубое; 3+ = уже
 *  довольно точно). Не даёт 100% уверенности НИКОГДА (даже при scoutCount
 *  большом) — иначе разведка перестаёт быть риском/решением. */
function noiseForScoutCount(scoutCount) {
  return Math.max(0.05, 0.4 - scoutCount * 0.1);
}

/** Стабильность — реальное значение ± шум, обрезано в [0,1]. */
function fuzzStability(realStability, noise, rng) {
  const delta = (rng() - 0.5) * 2 * noise;
  return Math.max(0, Math.min(1, realStability + delta));
}

/** Оставшееся время жизни — не точное число, а диапазон, который сужается
 *  с ростом scoutCount. remainingMs — сколько реально осталось. */
function fuzzLifeRange(remainingMs, noise, rng) {
  const remainingMin = remainingMs / 60000;
  const spread = remainingMin * noise * 2;
  const min = Math.max(1, Math.round(remainingMin - spread * rng()));
  const max = Math.round(remainingMin + spread * (1 - rng()) + spread);
  return { minMinutes: min, maxMinutes: Math.max(min + 1, max) };
}

/** Вероятностное распределение по узлу назначения — реальный destination
 *  получает наибольшую вероятность (растёт со scoutCount), остальные
 *  "правдоподобные" соседние узлы делят остаток. При scoutCount=1 отчёт
 *  может даже не называть реальный узел с уверенностью выше шума. */
function fuzzDestination(realDestinationId, scoutCount, rng) {
  const confidence = Math.min(0.95, 0.35 + scoutCount * 0.15);
  const candidateIds = Object.keys(NODES).filter((id) => id !== realDestinationId);
  const decoyCount = Math.min(2, candidateIds.length);
  const decoys = [];
  const pool = [...candidateIds];
  for (let i = 0; i < decoyCount; i++) {
    const idx = Math.floor(rng() * pool.length);
    decoys.push(pool.splice(idx, 1)[0]);
  }
  const remaining = 1 - confidence;
  const perDecoy = decoys.length ? remaining / decoys.length : 0;
  const guesses = [{ nodeId: realDestinationId, probability: Math.round(confidence * 100) }];
  for (const d of decoys) guesses.push({ nodeId: d, probability: Math.round(perDecoy * 100) });
  return guesses.sort((a, b) => b.probability - a.probability);
}

/**
 * @param {object} tract — реальный временной Тракт (from/to/stability/expiresAt)
 * @param {number} scoutCount — сколько раз ЭТОТ игрок уже сканировал именно этот Тракт (1 при первом)
 */
function scoutTract(tract, scoutCount = 1, rng = Math.random, now = Date.now()) {
  const noise = noiseForScoutCount(scoutCount);
  const remainingMs = Math.max(0, tract.expiresAt - now);
  return {
    tractId: tract.id,
    from: tract.from,
    scoutCount,
    discoveredAt: now,
    stabilityShown: Math.round(fuzzStability(tract.stability, noise, rng) * 100),
    lifeRange: fuzzLifeRange(remainingMs, noise, rng),
    destinationGuesses: fuzzDestination(tract.to, scoutCount, rng),
    confidence: Math.round((1 - noise) * 100),
  };
}

/** Текстовое представление отчёта — тот же формат, что в примере ТЗ. */
function formatScoutReport(report, ago = 'только что') {
  const top = report.destinationGuesses[0];
  const destText = top.probability >= 90
    ? `Выход: ${NODES[top.nodeId]?.name || top.nodeId}.`
    : `Выход неизвестен. Вероятность выхода в «${NODES[top.nodeId]?.name || top.nodeId}» — ${top.probability}%.`;
  return `Тракт обнаружен ${ago}. Стабильность ${report.stabilityShown}%. Предполагаемая жизнь ${report.lifeRange.minMinutes}–${report.lifeRange.maxMinutes} минут. ${destText}`;
}

module.exports = { scoutTract, formatScoutReport, noiseForScoutCount };
