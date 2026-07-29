'use strict';

/*
 * Почему здесь compare-and-swap, а не Lua-скрипт, как в market-store-upstash.js:
 * логика хода (resolveTurn) слишком сложна, чтобы переписывать её на Lua
 * внутри Redis — там и формулы урона, и криты, и стимы, и периодические
 * эффекты. Вместо этого: читаем сырую JSON-строку дуэли, применяем applyFn
 * в обычном JS, и пишем результат обратно ТОЛЬКО если строка не изменилась
 * с момента чтения (проверяется маленьким Lua-скриптом — само сравнение
 * атомарно, а не сложная логика). Если кто-то успел записать между чтением
 * и записью — повторяем попытку с начала.
 *
 * Гонка здесь маловероятна по конструкции: только два конкретных игрока
 * могут писать в один и тот же duel, и делают это строго по очереди
 * (turnOf), так что несколько попыток ретрая — с большим запасом.
 */

const CAS_MAX_RETRIES = 5;

const CAS_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if current ~= ARGV[1] then
  return 0
end
redis.call('SET', KEYS[1], ARGV[2])
return 1
`;

function createUpstashPvpStore(redis) {
  return {
    async getDuel(id) {
      const raw = await redis.get(`pvp:duel:${id}`);
      return raw ? JSON.parse(raw) : null;
    },

    async saveDuel(duel) {
      await redis.set(`pvp:duel:${duel.id}`, JSON.stringify(duel));
    },

    async getActiveDuelId(playerId) {
      return redis.get(`pvp:active:${playerId}`);
    },

    async setActiveDuelId(playerId, duelId) {
      await redis.set(`pvp:active:${playerId}`, duelId);
    },

    async clearActiveDuelId(playerId) {
      await redis.del(`pvp:active:${playerId}`);
    },

    async loadPlayer(playerId) {
      const raw = await redis.get(`player:${playerId}`);
      return raw ? JSON.parse(raw) : null;
    },

    async updateDuelAtomic(duelId, applyFn) {
      const key = `pvp:duel:${duelId}`;
      for (let attempt = 0; attempt < CAS_MAX_RETRIES; attempt += 1) {
        const rawBefore = await redis.get(key);
        if (!rawBefore) {
          const err = new Error('DUEL_NOT_FOUND');
          err.code = 'DUEL_NOT_FOUND';
          throw err;
        }

        const duel = JSON.parse(rawBefore);
        const updated = applyFn(duel);
        const rawAfter = JSON.stringify(updated);

        const casResult = await redis.eval(CAS_SCRIPT, [key], [rawBefore, rawAfter]);
        if (casResult === 1) return updated;
      }
      throw new Error('PVP_CAS_CONFLICT_RETRIES_EXHAUSTED');
    },
  };
}

module.exports = { createUpstashPvpStore };
