'use strict';

/**
 * ХРАНИЛИЩЕ ВРЕМЕННЫХ ТРАКТОВ — один общий JSON-список в Redis (тот же
 * принцип, что lib/world-state-store.js: небольшой объём данных, редкие
 * изменения, полноценный CAS избыточен — гонка при одновременном спавне
 * двух Трактов от разных триггеров не катастрофична, просто оба
 * появятся). Логика доступности маршрутов (engine/tract-network.js)
 * ничего не знает про Redis — читает уже готовый список.
 */
const TEMPORARY_TRACTS_KEY = 'tract:temporary:active';

function generateTractId() {
  return `tract_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeTractStore(redis) {
  return {
    /** Создаёт временный Тракт. stability (0..1) и confidence не
     *  относятся к самому существованию маршрута — это для разведки
     *  (ScoutReport), сервер знает точно, игрок узнаёт с погрешностью. */
    async createTemporaryTract({ from, to, durationMs, stability = 1 }) {
      const tract = {
        id: generateTractId(), from, to,
        createdAt: Date.now(), expiresAt: Date.now() + durationMs,
        stability,
      };
      const raw = await redis.get(TEMPORARY_TRACTS_KEY);
      const list = raw ? JSON.parse(raw) : [];
      list.push(tract);
      await redis.set(TEMPORARY_TRACTS_KEY, JSON.stringify(list));
      return tract;
    },

    /** Все ещё живые временные Тракты — истёкшие тихо отфильтровываются
     *  при каждом чтении (не требует отдельного фонового процесса, тот
     *  же принцип, что и у vein-spawn-timer.js: ленивая проверка на
     *  обращении, не по таймеру). */
    async getActiveTracts(now = Date.now()) {
      const raw = await redis.get(TEMPORARY_TRACTS_KEY);
      const list = raw ? JSON.parse(raw) : [];
      const active = list.filter((t) => t.expiresAt > now);
      if (active.length !== list.length) {
        await redis.set(TEMPORARY_TRACTS_KEY, JSON.stringify(active));
      }
      return active;
    },

    async getLastSpawnCheckAt() {
      const raw = await redis.get('tract:lastSpawnCheck');
      return raw ? Number(raw) : null;
    },
    async markSpawnChecked(now = Date.now()) {
      await redis.set('tract:lastSpawnCheck', String(now));
    },
  };
}

module.exports = { makeTractStore, TEMPORARY_TRACTS_KEY };
