'use strict';

/** Хранилище лобби и активных отрядных боёв — один слот "текущего
 * набора" за раз (не десятки параллельных лобби, простая механика
 * "кто первый начал сбор — тот и держит лобби"). */
function makeRaidStoreUpstash(redis) {
  return {
    async getLobby(slot = 'default') {
      const raw = await redis.get(`raid:lobby:${slot}`);
      return raw ? JSON.parse(raw) : null;
    },
    async saveLobby(lobby, slot = 'default') {
      await redis.set(`raid:lobby:${slot}`, JSON.stringify(lobby));
    },
    async clearLobby(slot = 'default') {
      await redis.del(`raid:lobby:${slot}`);
    },
    async getRaid(slot = 'default') {
      const raw = await redis.get(`raid:active:${slot}`);
      return raw ? JSON.parse(raw) : null;
    },
    async saveRaid(raid, slot = 'default') {
      await redis.set(`raid:active:${slot}`, JSON.stringify(raid));
    },
    async clearRaid(slot = 'default') {
      await redis.del(`raid:active:${slot}`);
    },
  };
}

module.exports = { makeRaidStoreUpstash };
