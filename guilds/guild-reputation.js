'use strict';

/**
 * ГИЛЬД-РЕПУТАЦИЯ ПО НАПРАВЛЕНИЯМ — раньше сила гильдии была одной
 * цифрой (уровень апгрейда). Три направления вместо одной шкалы —
 * гильдия из десяти торговцев и гильдия из десяти рейдеров теперь
 * выглядят по-разному в списке, не одинаково "прокачанными".
 *
 * Триггеры (уже существующие точки в коде, не новая механика сверху):
 * - TRADE: пожертвование в банк гильдии (guild-engine.js:donateCredits/donateResource)
 * - COMBAT: победа в рейде (raid-engine.js)
 * - EXPLORATION: завершение Guild Project типа "разведка" (recon_network)
 */
const CATEGORIES = ['trade', 'combat', 'exploration'];

function reputationKey(guildId) {
  return `guild:${guildId}:reputation`;
}

function makeGuildReputationStore(redis) {
  return {
    async addReputation(guildId, category, amount) {
      if (!CATEGORIES.includes(category) || amount <= 0) return;
      await redis.hincrby(reputationKey(guildId), category, amount);
    },
    async getReputation(guildId) {
      const raw = await redis.hgetall(reputationKey(guildId)) || {};
      const result = {};
      for (const cat of CATEGORIES) result[cat] = Number(raw[cat]) || 0;
      return result;
    },
  };
}

/** Ведущее направление гильдии — для отображения в списке/профиле
 *  ("Стальные Вороны — боевая гильдия" вместо просто уровня). Ничья
 *  между направлениями → 'balanced'. */
function dominantDirection(reputation) {
  const entries = Object.entries(reputation);
  const max = Math.max(...entries.map(([, v]) => v));
  if (max === 0) return 'none';
  const leaders = entries.filter(([, v]) => v === max);
  if (leaders.length > 1) return 'balanced';
  return leaders[0][0];
}

const DIRECTION_LABEL = { trade: 'Торговая', combat: 'Боевая', exploration: 'Исследовательская', balanced: 'Многопрофильная', none: 'Начинающая' };

module.exports = { CATEGORIES, makeGuildReputationStore, dominantDirection, DIRECTION_LABEL };
