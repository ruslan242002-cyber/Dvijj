'use strict';

/**
 * SENSOR LAYERS — по periferia_status_minigames_TZ.txt раздел 3.
 * Назначение: разведка. MVP: сенсор MK1 (потолок 3 слоя из 7
 * возможных — SIGNATURE/MOVEMENT доступны, WEAPON/CARGO/IDENTITY/
 * ANOMALY нужны сенсоры получше, задел на будущее).
 *
 * КЛЮЧЕВОЙ ПРИНЦИП: "push your luck" — каждый следующий скан даёт
 * больше информации, но и повышает шанс быть обнаруженным. После
 * обнаружения — риск уже случился, откатить нельзя (прямая цитата
 * документа: "после обнаружения нельзя просто отменить риск").
 */
const { renderStatusCard } = require('../../lib/status-card.js');

const MK1_MAX_LAYER = 3;

// Детали объекта раскрываются заранее (фиксированные для MVP-сценария,
// как в примере документа) — не рандомные при каждом запуске, чтобы
// сценарий был воспроизводим и тестируем.
const LAYER_DATA = {
  1: { name: 'OBJECT', line: 'OBJECT DETECTED', detectionRisk: 0 },
  2: { name: 'SIGNATURE', line: 'CIVILIAN SIGNATURE\nCONFIDENCE 64%', detectionRisk: 0.10 },
  3: { name: 'MOVEMENT', line: 'VELOCITY 182 m/s\nVECTOR UNKNOWN', detectionRisk: 0.20 },
};

function buildCard(revealedLayers) {
  const rows = revealedLayers.map((n) => ({
    label: `L${n} ${LAYER_DATA[n].name}`,
    display: '',
  }));
  return renderStatusCard({
    title: 'SENSOR SCAN — MK1',
    rows: [],
    meta: revealedLayers.flatMap((n) => [`[${LAYER_DATA[n].name}]`, ...LAYER_DATA[n].line.split('\n')]),
  });
}

function startSensorLayers() {
  return {
    card: buildCard([1]),
    revealedLayers: [1],
    actions: [
      { id: 'scan', label: '🔍 SCAN SIGNATURE' },
      { id: 'stop', label: '🛑 STOP' },
    ],
  };
}

/** Один шаг — либо STOP (фиксирует текущий результат), либо SCAN
 * (раскрывает следующий слой, с шансом обнаружения). currentLayer —
 * последний РАСКРЫТЫЙ слой (1 после старта). */
function resolveSensorLayersStep(currentLayer, action, rng = Math.random) {
  if (action === 'stop') {
    const score = currentLayer >= 2 ? 65 : 40;
    return {
      done: true,
      detected: false,
      result: currentLayer >= 2 ? 'good' : 'survived',
      score,
      card: buildCard(range(1, currentLayer)),
      closingText: `🛑 Остановился на слое ${currentLayer} (${LAYER_DATA[currentLayer].name}). Тихо, без обнаружения — но и без максимума информации.`,
    };
  }

  const nextLayer = currentLayer + 1;
  if (nextLayer > MK1_MAX_LAYER) {
    // Предел сенсора MK1 — дальше сканировать нечем, честный потолок.
    return {
      done: true,
      detected: false,
      result: 'excellent',
      score: 90,
      card: buildCard(range(1, currentLayer)),
      closingText: `✔✔ Достигнут предел сенсора MK1 (слой ${currentLayer}) — максимум информации, что можно было получить, без обнаружения.`,
    };
  }

  const detected = rng() < LAYER_DATA[nextLayer].detectionRisk;
  if (detected) {
    return {
      done: true,
      detected: true,
      result: nextLayer >= 3 ? 'survived' : 'critical_loss',
      score: nextLayer >= 3 ? 35 : 15,
      card: buildCard(range(1, nextLayer)),
      closingText: `⚠ YOU HAVE BEEN DETECTED на слое ${nextLayer} (${LAYER_DATA[nextLayer].name}). Информация получена, но объект теперь знает о сканировании — риск уже случился, отменить нельзя.`,
    };
  }

  return {
    done: nextLayer >= MK1_MAX_LAYER,
    detected: false,
    layer: nextLayer,
    card: buildCard(range(1, nextLayer)),
    actions: nextLayer >= MK1_MAX_LAYER
      ? null
      : [
          { id: 'scan', label: `🔍 SCAN ${LAYER_DATA[nextLayer + 1].name}` },
          { id: 'stop', label: '🛑 STOP' },
        ],
    result: nextLayer >= MK1_MAX_LAYER ? 'excellent' : undefined,
    score: nextLayer >= MK1_MAX_LAYER ? 90 : undefined,
    closingText: nextLayer >= MK1_MAX_LAYER
      ? `✔✔ Достигнут предел сенсора MK1 (слой ${nextLayer}) — максимум информации без обнаружения.`
      : undefined,
  };
}

function range(from, to) {
  const arr = [];
  for (let i = from; i <= to; i++) arr.push(i);
  return arr;
}

module.exports = { startSensorLayers, resolveSensorLayersStep, MK1_MAX_LAYER, LAYER_DATA };
