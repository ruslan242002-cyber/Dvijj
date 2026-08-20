const { NODES } = require('./tract-network.js');

/**
 * Тот же ленивый принцип, что и engine/vein-spawn-timer.js: нет фонового
 * процесса (Vercel serverless не умеет), проверка появления нового
 * временного Тракта происходит на любом визите любого игрока на станцию,
 * не чаще, чем раз в CHECK_INTERVAL_MS.
 */
const CHECK_INTERVAL_MS = 20 * 60 * 1000; // раз в ~20 минут реального времени
const SPAWN_CHANCE = 0.35; // при срабатывании проверки — 35% шанс реально появиться

// ИСПРАВЛЕНО: раньше здесь был жёсткий список "тупиковых" узлов
// (razlom_kaylara/pustosh_tabira) — карта с тех пор расширилась (см.
// engine/tract-network.js), и по дизайну там больше НЕТ настоящих
// тупиков (каждая локация имеет хотя бы один постоянный выход). Смысл
// временных Трактов сместился с "спасение из тупика" на "короткий
// обход/связь удалённых точек" (см. докстринг tract-network.js) — берём
// исходную точку из ЛЮБОЙ локации (type: 'location'), не только старых
// двух.
function locationNodeIds() {
  return Object.values(NODES).filter((n) => n.type === 'location').map((n) => n.id);
}

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

/** Выбирает случайную локацию как исходную точку нового временного
 *  Тракта — destination выбирается вызывающим кодом отдельно. */
function rollDeadEndOrigin(rng = Math.random) {
  const ids = locationNodeIds();
  return ids[Math.floor(rng() * ids.length)];
}

module.exports = { shouldCheckSpawn, rollSpawn, rollTractDuration, rollDeadEndOrigin, locationNodeIds, CHECK_INTERVAL_MS, SPAWN_CHANCE };
