'use strict';

/**
 * ГЛОБАЛЬНОЕ СОСТОЯНИЕ МИРА — раньше не существовало как отдельная
 * сущность. choices/consequence-engine.js мутирует state.worldState
 * (echoBehavior/stationTension/traktStatus и т.п.) — по замыслу это
 * общесерверные вещи, но вызывающий код (game/scenes/exploration.js:
 * applyConsequenceToPlayer) подставлял туда player.worldState. Значит
 * каждый игрок фактически жил в собственной отдельной "Периферии" —
 * реальный найденный баг, не архитектурная идея.
 *
 * Один общий ключ в Redis, JSON целиком (как guild:{id} и подобные) —
 * состояние мира небольшое и меняется редко (сюжетные решения, не
 * каждый бой), полноценный CAS тут избыточен: гонка возможна только
 * если два игрока одновременно завершают один и тот же сюжетный выбор
 * в один момент — крайне маловероятно, а последствия гонки (одно из
 * двух изменений перезаписывает другое) не катастрофичны для лорных
 * флагов вроде echoBehavior.
 */
const WORLD_STATE_KEY = 'world:state:global';

const DEFAULT_WORLD_STATE = {
  echoBehavior: 'hostile',
  stationTension: 'low',
  traktStatus: 'broken',
};

function makeWorldStateStore(redis) {
  return {
    /** Текущее глобальное состояние — дефолты, если ключ ещё не создан
     *  (сервер только что запущен, ни одно сюжетное решение ещё не
     *  принято никем). */
    async getWorldState() {
      const raw = await redis.get(WORLD_STATE_KEY);
      return raw ? { ...DEFAULT_WORLD_STATE, ...JSON.parse(raw) } : { ...DEFAULT_WORLD_STATE };
    },

    /** Сливает изменения поверх текущего состояния (Object.assign-подобно,
     *  та же семантика, что и consequence-engine.js использует для
     *  worldChange) и сохраняет целиком. */
    async applyWorldChange(changes) {
      const raw = await redis.get(WORLD_STATE_KEY);
      const current = raw ? JSON.parse(raw) : { ...DEFAULT_WORLD_STATE };
      const next = { ...current, ...changes };
      await redis.set(WORLD_STATE_KEY, JSON.stringify(next));
      return next;
    },
  };
}

module.exports = { makeWorldStateStore, WORLD_STATE_KEY, DEFAULT_WORLD_STATE };
