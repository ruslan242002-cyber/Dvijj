'use strict';

/**
 * РЕЕСТР ИЗВЕСТНЫХ ИГРОКОВ — простой Redis SET (не нужен CAS-паттерн,
 * SADD уже атомарен сам по себе). Нужен ТОЛЬКО для рассылки уведомлений
 * о жиле всем игрокам "вне зависимости от того, где находится персонаж" —
 * до этого в коде не было ни одного места, которое хранило бы список
 * всех когда-либо писавших боту peer_id, рассылка была физически не из
 * чего сделать.
 *
 * Вызывать trackPlayer(peerId) один раз при каждом обращении к боту (см.
 * заметку в vk/webhook-handler.js) — SADD идемпотентен, повторные вызовы
 * с тем же id ничего не ломают и не дублируют.
 */

const KNOWN_PLAYERS_KEY = 'players:known';

function createKnownPlayersStore(redis) {
  return {
    async trackPlayer(peerId) {
      await redis.sadd(KNOWN_PLAYERS_KEY, String(peerId));
    },

    async getAllKnownPlayers() {
      return redis.smembers(KNOWN_PLAYERS_KEY);
    },

    async countKnownPlayers() {
      const all = await redis.smembers(KNOWN_PLAYERS_KEY);
      return all.length;
    },
  };
}

module.exports = { createKnownPlayersStore };
