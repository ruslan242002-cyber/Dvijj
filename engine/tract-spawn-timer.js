'use strict';

/**
 * Тот же ленивый принцип, что и engine/vein-spawn-timer.js: нет фонового
 * процесса (Vercel serverless не умеет), проверка появления нового
 * временного Тракта происходит на любом визите любого игрока на станцию,
 * не чаще, чем раз в CHECK_INTERVAL_MS.
 */
const CHECK_INTERVAL_MS = 20 * 60 * 1000; // раз в ~20 минут реального времени
const SPAWN_CHANCE = 0.35; // при срабатывании проверки — 35% шанс реально появиться
const TRACT_DURATION_MS = 20 * 60 * 1000 + Math.random() * 40 * 60 * 1000; // не используется напрямую, см. rollTractDuration

// Тупиковые узлы (нет постоянного обратного маршрута) — временные Тракты
// спавнятся В ПЕРВУЮ ОЧЕРЕДЬ здесь, это и есть их основной смысл.
const DEAD_END_NODES = ['razlom_kaylara', 'pustosh_tabira'];

function shouldCheckSpawn(lastCheckAt, now = Date.now()) {
  if (!lastCheckAt) return true;
  return now - lastCheckAt > CHECK_INTERVAL_MS;
}

function rollSpawn(rng = Math.random) {
  return rng() < SPAWN_CHANCE;
}

/** Длительность нового Тракта — 20-60 минут реального времени. */
function rollTractDuration(rng = Math.random) {
  return Math.round(20 * 60 * 1000 + rng() * 40 * 60 * 1000);
}

/** Выбирает случайный тупиковый узел как исходную точку нового Тракта —
 *  destination выбирается вызывающим кодом отдельно (из известных
 *  городов, не отсюда — этот файл не знает про полный граф). */
function rollDeadEndOrigin(rng = Math.random) {
  return DEAD_END_NODES[Math.floor(rng() * DEAD_END_NODES.length)];
}

module.exports = { shouldCheckSpawn, rollSpawn, rollTractDuration, rollDeadEndOrigin, DEAD_END_NODES, CHECK_INTERVAL_MS, SPAWN_CHANCE };
