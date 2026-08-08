'use strict';

/**
 * Хранилище боевого инстанса босса — тот же паттерн, что guild-store-
 * upstash.js: JSON целиком под одним ключом, простая find/replace
 * логика поверх (не нужна атомарность на уровне полей, как у банка
 * гильдии — здесь один активный босс за раз, конфликтов записи почти
 * не бывает при редком трафике групповых боёв).
 */
function makeBossStoreUpstash(redis) {
  return {
    async getActiveBoss(bossSlot = 'default') {
      const raw = await redis.get(`boss:active:${bossSlot}`);
      return raw ? JSON.parse(raw) : null;
    },
    async saveBoss(instance, bossSlot = 'default') {
      await redis.set(`boss:active:${bossSlot}`, JSON.stringify(instance));
    },
    async clearBoss(bossSlot = 'default') {
      await redis.del(`boss:active:${bossSlot}`);
    },
    async getLastDefeatedAt(bossSlot = 'default') {
      const raw = await redis.get(`boss:last-defeated:${bossSlot}`);
      return raw ? Number(raw) : 0;
    },
    async setLastDefeatedAt(bossSlot = 'default', timestamp = Date.now()) {
      await redis.set(`boss:last-defeated:${bossSlot}`, String(timestamp));
    },
  };
}

module.exports = { makeBossStoreUpstash };
