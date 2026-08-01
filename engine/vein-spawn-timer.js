'use strict';

/**
 * ТАЙМЕР ПОЯВЛЕНИЯ ЖИЛЫ — та же ленивая схема, что и у остальных
 * "общемировых" таймеров (шторм, набеги монстров на жиле): раз в
 * SPAWN_CHECK_INTERVAL_MS кто-то из ЛЮБЫХ игроков, зашедших на станцию,
 * невольно "тянет за рычаг" проверки — и с вероятностью SPAWN_CHANCE
 * рождается новая жила. Без этого пришлось бы городить фоновый процесс,
 * которого у Vercel serverless просто нет.
 */

const SPAWN_CHECK_INTERVAL_MS = 30 * 60 * 1000; // проверяем не чаще раза в 30 минут
const SPAWN_CHANCE = 0.15; // и даже тогда — 15% шанс, что жила реально появится

function shouldCheckSpawn(lastCheckAt, now = Date.now()) {
  return !lastCheckAt || now - lastCheckAt >= SPAWN_CHECK_INTERVAL_MS;
}

function rollSpawn(rng = Math.random) {
  return rng() < SPAWN_CHANCE;
}

function randomVeinTier(rng = Math.random) {
  return 3 + Math.floor(rng() * 4); // 3-6 включительно
}

module.exports = { SPAWN_CHECK_INTERVAL_MS, SPAWN_CHANCE, shouldCheckSpawn, rollSpawn, randomVeinTier };
