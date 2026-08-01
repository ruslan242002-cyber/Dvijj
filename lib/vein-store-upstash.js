'use strict';

/*
 * Тот же CAS-паттерн, что и в ambush-store-upstash.js/pvp-store-upstash.js,
 * но с бОльшим числом ретраев (CAS_MAX_RETRIES) — на жиле одновременно
 * могут копать/драться много игроков разом, конкуренция за запись выше,
 * чем у засад (которые правит в основном один игрок за раз) или дуэлей
 * (строго 1-на-1). Одна активная жила единовременно — если нужно
 * несколько сразу, ключ легко параметризовать по id жилы позже.
 */

const CAS_MAX_RETRIES = 10;
const MISSING_SENTINEL = '\0MISSING';
const CAS_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if current == false then current = ARGV[3] end
if current ~= ARGV[1] then
  return 0
end
if ARGV[2] == '\0DELETE' then
  redis.call('DEL', KEYS[1])
else
  redis.call('SET', KEYS[1], ARGV[2])
end
return 1
`;

const VEIN_KEY = 'vein:active';
const SPAWN_CHECK_KEY = 'vein:lastSpawnCheck';

function createUpstashVeinStore(redis) {
  async function updateVeinAtomic(applyFn) {
    for (let attempt = 0; attempt < CAS_MAX_RETRIES; attempt += 1) {
      const rawBefore = await redis.get(VEIN_KEY);
      const vein = rawBefore ? JSON.parse(rawBefore) : null;
      const updated = applyFn(vein);
      const rawAfter = updated === null ? '\0DELETE' : JSON.stringify(updated);
      const expected = rawBefore === null ? MISSING_SENTINEL : rawBefore;

      const casResult = await redis.eval(CAS_SCRIPT, [VEIN_KEY], [expected, rawAfter, MISSING_SENTINEL]);
      if (casResult === 1) return updated;
      // Кто-то успел записать между чтением и записью — повторяем с начала.
    }
    throw new Error('VEIN_CAS_CONFLICT_RETRIES_EXHAUSTED');
  }

  return {
    async getActiveVein() {
      const raw = await redis.get(VEIN_KEY);
      return raw ? JSON.parse(raw) : null;
    },

    /** Создаёт новую активную жилу — падает, если уже есть активная
     * (сознательно: одна жила единовременно, см. заметку в шапке). */
    async createVein(vein) {
      return updateVeinAtomic((existing) => {
        if (existing) throw new Error('VEIN_ALREADY_ACTIVE');
        return vein;
      });
    },

    /** Основной путь для добычи/боя/спавна боссов — applyFn получает
     * ТЕКУЩУЮ жилу (или null, если её больше нет — например, кто-то
     * успел её закрыть) и должен вернуть новую версию. */
    updateVeinAtomic,

    /** Жила закрыта (награда роздана или истекло время без активности). */
    async clearVein() {
      return updateVeinAtomic(() => null);
    },

    /** Для engine/vein-spawn-timer.js — отдельный ключ, не часть самой
     * жилы (должен помнить момент проверки даже когда жилы нет вообще). */
    async getLastSpawnCheckAt() {
      const raw = await redis.get(SPAWN_CHECK_KEY);
      return raw ? Number(raw) : null;
    },
    async markSpawnChecked(now = Date.now()) {
      await redis.set(SPAWN_CHECK_KEY, String(now));
    },
  };
}

module.exports = { createUpstashVeinStore };
