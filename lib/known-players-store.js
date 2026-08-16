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
 *
 * ДОБАВЛЕНО — репутация между игроками. Три категории вместо одной цифры
 * (торговец/надёжный/опасен) — одна общая "репутация 87/100" ничего не
 * говорит о ЧЁМ игрок известен. Античит-меры: кулдаун на одну и ту же
 * пару игроков (не более 1 оценки в категории раз в 24ч — иначе два
 * друга накручивают друг друга бесконечно), дневной лимит на ОТДАЮЩЕГО
 * (не более 10 оценок в день от одного человека — не даёт фармить много
 * разных жертв подряд ради накрутки чужой видимости).
 */

const KNOWN_PLAYERS_KEY = 'players:known';
const REPUTATION_COOLDOWN_HOURS = 24;
const DAILY_GIVE_CAP = 10;

const CATEGORIES = ['trader', 'reliable', 'dangerous'];

function pairCooldownKey(fromId, toId, category) {
  return `reputation:cooldown:${fromId}:${toId}:${category}`;
}
function dailyGiveCountKey(fromId) {
  const today = new Date().toISOString().slice(0, 10);
  return `reputation:daily:${fromId}:${today}`;
}
function reputationKey(playerId) {
  return `player:${playerId}:reputation`;
}

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

    // ── Репутация между игроками ──

    /** Ставит одну оценку в категории (trader/reliable/dangerous) от
     *  одного игрока другому. Возвращает { success, reason }: false с
     *  причиной COOLDOWN/DAILY_CAP/INVALID_CATEGORY, если оценка
     *  отклонена — вызывающий код решает, показывать ли это игроку. */
    async giveReputation(fromPlayerId, toPlayerId, category) {
      if (!CATEGORIES.includes(category)) return { success: false, reason: 'INVALID_CATEGORY' };
      if (fromPlayerId === toPlayerId) return { success: false, reason: 'SELF' };

      const cdKey = pairCooldownKey(fromPlayerId, toPlayerId, category);
      const onCooldown = await redis.get(cdKey);
      if (onCooldown) return { success: false, reason: 'COOLDOWN' };

      const dailyKey = dailyGiveCountKey(fromPlayerId);
      const givenToday = Number((await redis.get(dailyKey)) || 0);
      if (givenToday >= DAILY_GIVE_CAP) return { success: false, reason: 'DAILY_CAP' };

      await redis.hincrby(reputationKey(toPlayerId), category, 1);
      await redis.set(cdKey, '1', { ex: REPUTATION_COOLDOWN_HOURS * 3600 });
      await redis.set(dailyKey, String(givenToday + 1), { ex: 26 * 3600 }); // чуть больше суток, чтобы не оборваться ровно на границе дня по UTC-сдвигу
      return { success: true };
    },

    /** Репутация игрока по всем категориям — {trader, reliable, dangerous},
     *  0 если оценок ещё не было ни в одной. */
    async getReputation(playerId) {
      const raw = await redis.hgetall(reputationKey(playerId)) || {};
      const result = {};
      for (const cat of CATEGORIES) result[cat] = Number(raw[cat]) || 0;
      return result;
    },
  };
}

module.exports = { createKnownPlayersStore, CATEGORIES, REPUTATION_COOLDOWN_HOURS, DAILY_GIVE_CAP };
