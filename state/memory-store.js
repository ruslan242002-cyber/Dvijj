/**
 * Хранилище состояния игрока — минимальный интерфейс:
 *   await store.get(userId)          -> object | null
 *   await store.set(userId, state)   -> void
 *
 * Эта реализация — в памяти процесса. Годится для тестов и для локальной
 * разработки, но НЕ для продакшена на Vercel: serverless-функция не хранит
 * память между запросами (каждый вызов может стартовать с нуля). Для
 * реальной игры используйте state/upstash-store.js (тоже в этой папке).
 */
'use strict';

function memoryStore() {
  const map = new Map();
  return {
    async get(userId) {
      return map.has(userId) ? map.get(userId) : null;
    },
    async set(userId, state) {
      map.set(userId, state);
    },
    // только для тестов — не часть публичного интерфейса
    _dump() { return Object.fromEntries(map); }
  };
}

module.exports = { memoryStore };
