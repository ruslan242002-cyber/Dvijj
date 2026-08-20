'use strict';

/**
 * PRESENCE — кто реально активен прямо сейчас и где. Раньше такого не
 * было вообще (единственный трекинг — knownPlayersStore, "писал боту
 * когда-либо", без времени/локации). Один хэш в Redis: peerId → JSON
 * {name, faction, nodeId, lastSeenAt} — обновляется на каждое сообщение
 * (см. vk/webhook-handler.js), не отдельным опросом.
 *
 * ACTIVE_WINDOW_MS — окно "недавней активности" для списка "Люди в
 * городе". 18 минут — компромисс между "видно, кто реально может
 * ответить прямо сейчас" и "список не пустой почти всегда" при
 * скромном онлайне.
 */
const ACTIVE_WINDOW_MS = 18 * 60 * 1000;
const PRESENCE_KEY = 'presence:all';

function makePresenceStore(redis) {
  return {
    async updatePresence(peerId, { name, faction, nodeId }) {
      const raw = await redis.get(PRESENCE_KEY);
      const all = raw ? JSON.parse(raw) : {};
      all[peerId] = { name, faction, nodeId, lastSeenAt: Date.now() };
      await redis.set(PRESENCE_KEY, JSON.stringify(all));
    },

    /** Активные ИМЕННО в этом узле (nodeId) за последние ACTIVE_WINDOW_MS,
     *  кроме самого запрашивающего. */
    async getActivePlayersAtNode(nodeId, excludePeerId, now = Date.now()) {
      const raw = await redis.get(PRESENCE_KEY);
      const all = raw ? JSON.parse(raw) : {};
      return Object.entries(all)
        .filter(([peerId, p]) => peerId !== String(excludePeerId) && p.nodeId === nodeId && now - p.lastSeenAt <= ACTIVE_WINDOW_MS)
        .map(([peerId, p]) => ({ peerId, name: p.name, faction: p.faction }));
    },
  };
}

module.exports = { makePresenceStore, ACTIVE_WINDOW_MS };
