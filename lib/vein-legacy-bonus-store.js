'use strict';

/**
 * ПОСЛЕВКУСИЕ ЖИЛЫ — доминирование (engine/resource-vein.js:dominantFaction)
 * уже даёт блокаду и налог, ПОКА жила открыта. Это расширение: фракция,
 * державшая доминирование на момент закрытия жилы, получает временный
 * бонус к добыче СВОИХ эксклюзивных ресурсов — "контроль сектора не
 * испаряется мгновенно, как только жила иссякла".
 */
const LEGACY_BONUS_DURATION_MS = 6 * 60 * 60 * 1000; // 6 часов реального времени
const LEGACY_BONUS_YIELD_PCT = 12;
const LEGACY_BONUS_KEY = 'vein:legacy_bonus';

function makeVeinLegacyBonusStore(redis) {
  return {
    async setLegacyBonus(faction) {
      if (!faction) return;
      const record = { faction, expiresAt: Date.now() + LEGACY_BONUS_DURATION_MS };
      await redis.set(LEGACY_BONUS_KEY, JSON.stringify(record));
    },
    async getLegacyBonus(now = Date.now()) {
      const raw = await redis.get(LEGACY_BONUS_KEY);
      if (!raw) return null;
      const record = JSON.parse(raw);
      if (record.expiresAt < now) return null;
      return record;
    },
  };
}

async function veinLegacyBonusFor(deps, stationFaction) {
  if (!deps.veinLegacyBonusStore) return 0;
  const bonus = await deps.veinLegacyBonusStore.getLegacyBonus();
  if (!bonus || bonus.faction !== stationFaction) return 0;
  return LEGACY_BONUS_YIELD_PCT;
}

module.exports = { makeVeinLegacyBonusStore, veinLegacyBonusFor, LEGACY_BONUS_DURATION_MS, LEGACY_BONUS_YIELD_PCT };
