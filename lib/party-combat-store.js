'use strict';

function sessionKey(partyId) { return `party_combat:${partyId}`; }

function makePartyCombatStore(redis) {
  return {
    async getSession(partyId) {
      const raw = await redis.get(sessionKey(partyId));
      return raw ? JSON.parse(raw) : null;
    },
    async saveSession(partyId, session) {
      await redis.set(sessionKey(partyId), JSON.stringify(session));
    },
    async clearSession(partyId) {
      await redis.del(sessionKey(partyId));
    },
  };
}

module.exports = { makePartyCombatStore };
