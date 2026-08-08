'use strict';

/**
 * РЕДКОСТЬ ПРЕДМЕТОВ — цветные кружки + список "Добыто:" в уведомлениях.
 * НЕ новая параллельная система: редкость выводится из уже существующего
 * тира ресурса (T1-T7) или явного флага предмета (чертёж/легендарный
 * контракт), а не хранится отдельным полем на каждом предмете.
 *
 * T1-2 → ⚪ Обычный · T3-4 → 🔵 Необычный · T5-6 → 🟣 Редкий ·
 * T7 / чертежи с боссов / легендарные контракты → 🟡 Легендарный.
 */
const RARITY = {
  COMMON: { key: 'common', label: 'Обычный', icon: '⚪' },
  UNCOMMON: { key: 'uncommon', label: 'Необычный', icon: '🔵' },
  RARE: { key: 'rare', label: 'Редкий', icon: '🟣' },
  LEGENDARY: { key: 'legendary', label: 'Легендарный', icon: '🟡' },
};

/** tier — число T1-T7 (или выше, на будущее). forceLegendary — для вещей
 * без тира вообще (чертежи, "Осколок Тракта" и т.п.), где редкость не
 * выводится из тира, а известна заранее. */
function rarityForTier(tier, forceLegendary = false) {
  if (forceLegendary) return RARITY.LEGENDARY;
  if (tier >= 7) return RARITY.LEGENDARY;
  if (tier >= 5) return RARITY.RARE;
  if (tier >= 3) return RARITY.UNCOMMON;
  return RARITY.COMMON;
}

/** Одна строка добычи: "⚪ Название ×2" — кружок + название + количество,
 * количество опускается для qty=1. */
function lootLine(name, qty, tier, forceLegendary = false) {
  const rarity = rarityForTier(tier, forceLegendary);
  const qtyPart = qty && qty > 1 ? ` ×${qty}` : '';
  return `${rarity.icon} ${name}${qtyPart}`;
}

/** Собирает целый блок "🎁 Добыто:" из списка находок —
 * items: [{ name, qty, tier, forceLegendary }]. */
function lootNotification(items) {
  if (!items || !items.length) return '';
  const lines = items.map((i) => lootLine(i.name, i.qty, i.tier, i.forceLegendary));
  return `🎁 Добыто:\n${lines.join('\n')}`;
}

module.exports = { RARITY, rarityForTier, lootLine, lootNotification };
