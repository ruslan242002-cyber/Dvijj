'use strict';

/**
 * БОЕВЫЕ БОНУСЫ ФРАКЦИЙ — та же таблица данных, что и combatBonus в
 * FACTION_KIT (game/scenes/common.js), но вынесена сюда отдельно, чтобы
 * engine/derived-stats.js (и всё, что от него зависит) могли её читать
 * без обратной зависимости engine/ → game/scenes/ (common.js тянет 16
 * других модулей — реальный риск цикла). game/scenes/common.js держит
 * statBias (стартовые очки характеристик) у себя, а combatBonus здесь —
 * единственный источник истины, common.js на него НЕ ссылается сам,
 * только этот файл и то, что читает боевые статы.
 */
const FACTION_COMBAT_BONUS = {
  'Приют':    { selfHealBonus: 0.05 },
  'Терминус': { critChanceBonus: 0.02 },
  'Арсенал':  { firepowerBonus: 4 },
  'Вуаль':    { shieldingBonus: 10 },
  'Кузница':  { shieldingBonus: 4, craftDiscount: 0.05 },
};

function factionCombatBonus(faction) {
  return FACTION_COMBAT_BONUS[faction] || {};
}

module.exports = { FACTION_COMBAT_BONUS, factionCombatBonus };
