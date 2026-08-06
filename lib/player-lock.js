'use strict';
/**
* БЛОКИРОВКА НА ИГРОКА — новый небольшой модуль, не патч существующего
* файла (в архиве нет отдельного lib/upstash-store.js — стор для
* player-состояния собран где-то в вашей инфраструктуре за пределами
* этого архива). Экспортирует фабрику: передайте ей ваш существующий
* клиент @upstash/redis (тот же, что уже используется для store.get/
* store.set player-состояния), получите 2 метода — добавьте их в объект
* store, который прокидывается в vk/webhook-handler.js (deps.store).
*
* Используется в исправленном vk/webhook-handler.js (см. STATUS.md) —
* решает баг "Что-то пошло не так" от спам-кликов: SETNX с TTL не даёт
* двум почти одновременным запросам одного игрока обрабатываться
* параллельно над одним и тем же (для одного из них уже устаревшим)
* состоянием.
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
