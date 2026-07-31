'use strict';

/*
 * Тот же CAS-паттерн, что и в pvp-store-upstash.js для очереди
 * матчмейкинга: одна общая запись (список активных засад), читаем,
 * применяем чистую функцию, пишем обратно только если никто не успел
 * записать между чтением и записью. Гонка возможна (много игроков могут
 * ставить/снимать засады одновременно), в отличие от дуэлей 1-на-1 —
 * поэтому ретраи здесь куда уместнее, чем в pvp-store-upstash.js.
 */

const CAS_MAX_RETRIES = 5;
const MISSING_SENTINEL = '\0MISSING';
const CAS_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if current == false then current = ARGV[3] end
if current ~= ARGV[1] then
  return 0
end
redis.call('SET', KEYS[1], ARGV[2])
return 1
`;

const AMBUSH_KEY = 'ambush:active';

function createUpstashAmbushStore(redis) {
  async function updateAmbushesAtomic(applyFn) {
    for (let attempt = 0; attempt < CAS_MAX_RETRIES; attempt += 1) {
      const rawBefore = await redis.get(AMBUSH_KEY);
      const list = rawBefore ? JSON.parse(rawBefore) : [];
      const updated = applyFn(list);
      const rawAfter = JSON.stringify(updated);
      const expected = rawBefore === null ? MISSING_SENTINEL : rawBefore;

      const casResult = await redis.eval(CAS_SCRIPT, [AMBUSH_KEY], [expected, rawAfter, MISSING_SENTINEL]);
      if (casResult === 1) return updated;
      // Кто-то успел записать между чтением и записью — повторяем с начала.
    }
    throw new Error('AMBUSH_CAS_CONFLICT_RETRIES_EXHAUSTED');
  }

  return {
    async listActiveAmbushes() {
      const raw = await redis.get(AMBUSH_KEY);
      return raw ? JSON.parse(raw) : [];
    },

    /** Ставит засаду — если у этого же игрока уже была активная засада
     * (в любой клетке), она заменяется новой, а не складывается —
     * один игрок держит не более одной засады одновременно. */
    async addAmbush(ambush) {
      return updateAmbushesAtomic((list) => [
        ...list.filter((a) => a.playerId !== ambush.playerId),
        ambush,
      ]);
    },

    async removeAmbush(playerId) {
      return updateAmbushesAtomic((list) => list.filter((a) => a.playerId !== playerId));
    },

    /** Чистит все просроченные засады разом — удобно вызывать походя,
     * например при каждом обращении к списку активных засад, чтобы
     * реестр не рос бесконечно старыми записями. */
    async pruneExpired(now = Date.now()) {
      return updateAmbushesAtomic((list) => list.filter((a) => now < a.expiresAt));
    },
  };
}

module.exports = { createUpstashAmbushStore };
