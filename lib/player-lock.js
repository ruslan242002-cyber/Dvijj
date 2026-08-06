'use strict';

/**
 * БЛОКИРОВКА НА ИГРОКА — не патч существующего стора, а небольшая
 * фабрика: передайте ей ваш существующий клиент @upstash/redis (тот же,
 * что уже используется для store.get/store.set player-состояния),
 * получите 2 метода — добавьте их в объект store, который прокидывается
 * в vk/webhook-handler.js (deps.store).
 *
 * Решает баг "Что-то пошло не так" / зависшие диалоги от спам-кликов:
 * store.get()/store.set() не атомарны между собой — при быстрых
 * повторных нажатиях VK присылает несколько webhook-запросов почти
 * одновременно, каждый читает ОДНО И ТО ЖЕ (для одного из них уже
 * устаревшее) состояние до того, как предыдущий успел сохранить своё.
 * Один из процессов бьёт по уже несуществующей стадии диалога/врагу —
 * либо падает в исключение, либо (как в диалогах куратора) молча
 * показывает рассинхронизированный текст. SETNX с TTL не даёт двум
 * почти одновременным запросам одного игрока обрабатываться параллельно
 * над одним и тем же состоянием.
 *
 * Пример подключения (там, где у вас собирается объект store):
 *   const { makePlayerLock } = require('./lib/player-lock.js');
 *   const playerLock = makePlayerLock(redisClient);
 *   const store = { ...existingStore, ...playerLock };
 */
function makePlayerLock(redis, ttlMs = 8000) {
  return {
    /** true — блокировку захватили, можно обрабатывать ход. false —
     * предыдущий ход этого же игрока ещё не сохранён (дубль-клик или
     * повторная доставка события VK) — обрабатывать НЕ нужно. */
    async tryLockPlayer(peerId) {
      const key = `lock:player:${peerId}`;
      const result = await redis.set(key, '1', { nx: true, px: ttlMs });
      // Разные клиенты @upstash/redis возвращают либо 'OK', либо true —
      // оба варианта означают "лок захвачен".
      return result === 'OK' || result === true;
    },

    async unlockPlayer(peerId) {
      await redis.del(`lock:player:${peerId}`);
    },
  };
}

module.exports = { makePlayerLock };
