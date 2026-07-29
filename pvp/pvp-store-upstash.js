'use strict';

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

        const casResult = await redis.eval(CAS_SCRIPT, [key], [rawBefore, rawAfter, MISSING_SENTINEL]);
        if (casResult === 1) return updated;
      }
      throw new Error('PVP_CAS_CONFLICT_RETRIES_EXHAUSTED');
    },

    async matchmakeAtomic(myEntry, applyFn) {
      const key = 'pvp:mm:queue';
      for (let attempt = 0; attempt < CAS_MAX_RETRIES; attempt += 1) {
        const rawBefore = await redis.get(key);
        const queue = rawBefore ? JSON.parse(rawBefore) : [];
        const { matchedEntry, queue: newQueue } = applyFn(queue);
        const rawAfter = JSON.stringify(newQueue);
        const expected = rawBefore === null ? MISSING_SENTINEL : rawBefore;

        const casResult = await redis.eval(CAS_SCRIPT, [key], [expected, rawAfter, MISSING_SENTINEL]);
        if (casResult === 1) return { matchedEntry };
      }
      throw new Error('MM_CAS_CONFLICT_RETRIES_EXHAUSTED');
    },

    async removeFromQueue(playerId) {
      return this.matchmakeAtomic({ id: playerId }, (queue) => ({
        matchedEntry: null,
        queue: queue.filter((e) => e.id !== playerId),
      }));
    },
  };
}

module.exports = { createUpstashPvpStore };

