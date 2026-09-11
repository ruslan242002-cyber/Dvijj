'use strict';

/**
 * POWER CONTROL — по periferia_status_minigames_TZ.txt раздел 2.
 * Назначение: бой/побег/скрытность/исследование. MVP: одна ситуация.
 *
 * КЛЮЧЕВОЙ ПРИНЦИП ИЗ ДОКУМЕНТА: "нельзя просто найти один оптимальный
 * ответ" — игрок распределяет мощность ПЕРВЫМ, не зная, какое событие
 * случится ВТОРЫМ. Здесь: 4 пресета распределения (не свободный
 * слайдер — сложно для текстового чат-интерфейса), каждый со своим
 * явным перекосом сильных/слабых сторон, потом честный случайный
 * бросок одного из 4 событий, потом оценка — подошёл ли выбор.
 */
const { renderStatusCard, compactBar } = require('../../lib/status-card.js');

const AVAILABLE_POWER = 18;

const DISTRIBUTIONS = {
  attack: { label: '⚔️ Ударный', weapons: 9, shields: 3, engines: 3, sensors: 3 },
  defense: { label: '🛡️ Защитный', weapons: 3, shields: 9, engines: 3, sensors: 3 },
  mobility: { label: '🚀 Манёвренный', weapons: 3, shields: 3, engines: 9, sensors: 3 },
  recon: { label: '📡 Разведывательный', weapons: 3, shields: 3, engines: 3, sensors: 9 },
};

function buildCard(dist) {
  return renderStatusCard({
    title: 'POWER DISTRIBUTION',
    rows: [
      { label: 'WEAPONS', display: compactBar(dist.weapons, AVAILABLE_POWER) },
      { label: 'SHIELDS', display: compactBar(dist.shields, AVAILABLE_POWER) },
      { label: 'ENGINES', display: compactBar(dist.engines, AVAILABLE_POWER) },
      { label: 'SENSORS', display: compactBar(dist.sensors, AVAILABLE_POWER) },
    ],
    meta: [`AVAILABLE POWER: ${AVAILABLE_POWER}`],
  });
}

function startPowerControl() {
  return {
    card: renderStatusCard({
      title: 'POWER CONTROL',
      rows: [],
      meta: [`AVAILABLE POWER: ${AVAILABLE_POWER}`],
    }),
    introText: 'Распредели мощность — не зная, что случится дальше.',
    actions: Object.entries(DISTRIBUTIONS).map(([id, d]) => ({ id, label: d.label })),
  };
}

// Какое распределение "подходит" под какое событие — не одно
// единственно верное, у каждого события 1-2 подходящих варианта.
const EVENT_MATCH = {
  missile_lock: { text: 'MISSILE LOCK', goodFor: ['defense', 'mobility'] },
  unknown_contact: { text: 'UNKNOWN CONTACT', goodFor: ['recon'] },
  engine_failure: { text: 'ENGINE FAILURE', goodFor: ['mobility'] },
  signal_spike: { text: 'SIGNAL SPIKE', goodFor: ['recon', 'defense'] },
};

function resolvePowerControlAction(distributionId, rng = Math.random) {
  const dist = DISTRIBUTIONS[distributionId];
  if (!dist) return null;

  const eventKeys = Object.keys(EVENT_MATCH);
  const eventKey = eventKeys[Math.floor(rng() * eventKeys.length)];
  const event = EVENT_MATCH[eventKey];
  const matched = event.goodFor.includes(distributionId);

  let result, score, closingText;
  if (matched && rng() < 0.5) {
    result = 'excellent';
    score = 95;
    closingText = `✔✔ ${event.text}! Распределение оказалось именно тем, что нужно — ситуация решена без потерь.`;
  } else if (matched) {
    result = 'good';
    score = 75;
    closingText = `✔ ${event.text}. Распределение подошло — справились, хоть и не идеально.`;
  } else {
    const survived = rng() < 0.6;
    if (survived) {
      result = 'survived';
      score = 45;
      closingText = `△ ${event.text}. Распределение не подходило под это — выкрутились, но дорогой ценой.`;
    } else {
      result = 'critical_loss';
      score = 15;
      closingText = `✖ ${event.text}. Распределение оказалось совсем не тем — серьёзная потеря.`;
    }
  }

  return {
    result, score,
    card: buildCard(dist),
    eventText: event.text,
    closingText,
  };
}

module.exports = { startPowerControl, resolvePowerControlAction, DISTRIBUTIONS };
