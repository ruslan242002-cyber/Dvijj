'use strict';

/**
 * Хранилище боевого инстанса босса — тот же паттерн, что guild-store-
 * upstash.js: JSON целиком под одним ключом, простая find/replace
 * логика поверх (не нужна атомарность на уровне полей, как у банка
 * гильдии — здесь один активный босс за раз, конфликтов записи почти
 * не бывает при редком трафике групповых боёв).
 *
 * ДОБАВЛЕНО — атомарные методы для НАЗВАННЫХ мировых боссов
 * (engine/world-bosses/boss-data.js, 11 штук с фиксированным shared HP).
 * Раньше group-encounter.js (присланный отдельно) ожидал state/world-
 * store.js с getNode/spawnNode/takeFromNode — этого файла нет, поэтому
 * та же идея (общий HP-пул, который бьют параллельно несколько игроков)
 * реализована прямо здесь, тем же способом, что уже работает для гильдий/
 * жил/засад в этом проекте (Lua CAS), а не через getActiveBoss/saveBoss —
 * та пара методов делает read-modify-write ЦЕЛОГО JSON-инстанса, что
 * годится для одиночного async-босса (test_colossus, где гонка редка),
 * но НЕ годится для сценария "несколько игроков одновременно бьют одного
 * из 11 именных боссов" — там гонка реальна и должна быть исключена.
 */
function makeBossStoreUpstash(redis) {
  return {
    async getActiveBoss(bossSlot = 'default') {
      const raw = await redis.get(`boss:active:${bossSlot}`);
      return raw ? JSON.parse(raw) : null;
    },
    async saveBoss(instance, bossSlot = 'default') {
      await redis.set(`boss:active:${bossSlot}`, JSON.stringify(instance));
    },
    async clearBoss(bossSlot = 'default') {
      await redis.del(`boss:active:${bossSlot}`);
    },
    async getLastDefeatedAt(bossSlot = 'default') {
      const raw = await redis.get(`boss:last-defeated:${bossSlot}`);
      return raw ? Number(raw) : 0;
    },
    async setLastDefeatedAt(bossSlot = 'default', timestamp = Date.now()) {
      await redis.set(`boss:last-defeated:${bossSlot}`, String(timestamp));
    },

    // ── Именные мировые боссы (engine/world-bosses/) — общий HP-пул ──

    /** Начинает энкаунтер, если его ещё нет — атомарно (SETNX), чтобы
     *  два игрока, одновременно первыми напавшие на босса, не создали
     *  два параллельных счётчика HP с разным стартовым значением. */
    async startNamedBossEncounter(bossId, hpMax) {
      const hpKey = `boss:named:${bossId}:hp`;
      const startedAtKey = `boss:named:${bossId}:startedAt`;
      const lastActionKey = `boss:named:${bossId}:lastAction`;
      const created = await redis.setnx(hpKey, String(hpMax));
      if (created) {
        const now = Date.now();
        await redis.set(startedAtKey, String(now));
        await redis.set(lastActionKey, String(now));
      }
      return this.getNamedBossEncounter(bossId);
    },

    async getNamedBossEncounter(bossId) {
      const hpRaw = await redis.get(`boss:named:${bossId}:hp`);
      if (hpRaw === null) return null;
      const startedAtRaw = await redis.get(`boss:named:${bossId}:startedAt`);
      const lastActionRaw = await redis.get(`boss:named:${bossId}:lastAction`);
      return {
        hpShared: Number(hpRaw),
        startedAt: startedAtRaw ? Number(startedAtRaw) : Date.now(),
        lastActionAt: lastActionRaw ? Number(lastActionRaw) : Date.now(),
      };
    },

    /** Атомарно списывает урон — не даёт пулу уйти в минус даже если два
     *  игрока добивают босса одновременно (второй получит меньше, чем
     *  пытался нанести, а не отрицательный остаток). Возвращает РЕАЛЬНО
     *  списанное количество (может быть меньше запрошенного amount). */
    async applyNamedBossDamageAtomic(bossId, amount) {
      const script = `
local hpKey = KEYS[1]
local lastActionKey = KEYS[2]
local amount = tonumber(ARGV[1])
local now = ARGV[2]

local current = tonumber(redis.call('GET', hpKey) or '0')
if current <= 0 then
  return 0
end
local taken = math.min(current, amount)
redis.call('SET', hpKey, current - taken)
redis.call('SET', lastActionKey, now)
return taken
`;
      const taken = await redis.eval(
        script,
        [`boss:named:${bossId}:hp`, `boss:named:${bossId}:lastAction`],
        [String(Math.max(0, Math.round(amount))), String(Date.now())]
      );
      return Number(taken);
    },

    /** Регенерация — прибавляет regenAmount, не превышая hpMax. Тоже
     *  атомарно (два одновременных regen-тика не должны задвоить). */
    async regenNamedBossHpAtomic(bossId, regenAmount, hpMax) {
      const script = `
local hpKey = KEYS[1]
local regen = tonumber(ARGV[1])
local cap = tonumber(ARGV[2])
local current = tonumber(redis.call('GET', hpKey) or '0')
if current <= 0 then return current end
local next = math.min(cap, current + regen)
redis.call('SET', hpKey, next)
return next
`;
      const next = await redis.eval(
        script,
        [`boss:named:${bossId}:hp`],
        [String(Math.max(0, Math.round(regenAmount))), String(hpMax)]
      );
      return Number(next);
    },

    async clearNamedBossEncounter(bossId) {
      await redis.del(`boss:named:${bossId}:hp`);
      await redis.del(`boss:named:${bossId}:startedAt`);
      await redis.del(`boss:named:${bossId}:lastAction`);
    },
  };
}

module.exports = { makeBossStoreUpstash };
