'use strict';

/**
 * ЗАСАДЫ — игрок оставляет корабль в засаде в конкретном УЗЛЕ (не ячейке
 * дистанции, как в старой линейной системе — Тракт устроен по-другому).
 * Кто угодно, прибывающий в этот узел (по любому маршруту), может
 * наткнуться на затаившегося. Snapshot корабля берётся на момент
 * установки засады — сила ambusher'а не меняется, пока он ждёт.
 */
const AMBUSH_DURATION_MS = 20 * 60 * 1000; // 20 минут реального времени

function ambushKey(nodeId) {
  return `ambush:node:${nodeId}`;
}

function createAmbush(playerId, nodeId, { shipSnapshot, playerName }) {
  return {
    playerId, nodeId, shipSnapshot, playerName,
    createdAt: Date.now(), expiresAt: Date.now() + AMBUSH_DURATION_MS,
  };
}

/** Выбирает случайную не-истёкшую засаду в этом узле, кроме собственной
 *  игрока (нельзя попасться в свою же). */
function pickAmbusher(nodeId, activeAmbushes, excludePlayerId, rng = Math.random) {
  const now = Date.now();
  const candidates = activeAmbushes.filter((a) => a.nodeId === nodeId && a.playerId !== excludePlayerId && a.expiresAt > now);
  if (!candidates.length) return null;
  return candidates[Math.floor(rng() * candidates.length)];
}

function makeAmbushStore(redis) {
  return {
    async addAmbush(ambush) {
      const raw = await redis.get(ambushKey(ambush.nodeId));
      const list = raw ? JSON.parse(raw) : [];
      list.push(ambush);
      await redis.set(ambushKey(ambush.nodeId), JSON.stringify(list));
      const indexRaw = await redis.get('ambush:node_index');
      const nodeIds = indexRaw ? JSON.parse(indexRaw) : [];
      if (!nodeIds.includes(ambush.nodeId)) {
        nodeIds.push(ambush.nodeId);
        await redis.set('ambush:node_index', JSON.stringify(nodeIds));
      }
    },
    /** Все активные засады across всех узлов — простая реализация:
     *  один общий индекс-ключ со списком занятых узлов, чтобы не
     *  сканировать все ключи Redis (KEYS запрещён/дорог на managed Redis). */
    async listActiveAmbushes() {
      const indexRaw = await redis.get('ambush:node_index');
      const nodeIds = indexRaw ? JSON.parse(indexRaw) : [];
      const now = Date.now();
      const all = [];
      for (const nodeId of nodeIds) {
        const raw = await redis.get(ambushKey(nodeId));
        if (!raw) continue;
        const list = JSON.parse(raw).filter((a) => a.expiresAt > now);
        all.push(...list);
      }
      return all;
    },
    async removeAmbush(nodeId, playerId) {
      const raw = await redis.get(ambushKey(nodeId));
      if (!raw) return;
      const list = JSON.parse(raw).filter((a) => a.playerId !== playerId);
      await redis.set(ambushKey(nodeId), JSON.stringify(list));
    },
  };
}

module.exports = { AMBUSH_DURATION_MS, createAmbush, pickAmbusher, makeAmbushStore };
