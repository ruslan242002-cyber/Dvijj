'use strict';

/**
 * МОДУЛИ КОРАБЛЯ — отдельная от engine/skills-data.js система. Те навыки
 * (Плазменный залп и т.д.) — личные умения ПЕРСОНАЖА, применяются в бою
 * ногами на планетах. Модули здесь — то, чем стреляет и защищается сам
 * КОРАБЛЬ в космосе: случайные встречи на маршруте и PvP между кораблями
 * (engine/travel.js).
 *
 * Формат — тот же, что и у SKILLS (formula/damaging/pure/shieldPierce/
 * shieldShred/lifestealPct/selfHealPct/applyDot/cd) — намеренно, чтобы
 * useSkill()/resolveTurn() из combat-engine.js работали без единой правки:
 * "боец" в бою — просто объект нужной формы, будь то персонаж или корабль
 * (см. shipToFighter в engine/ship.js).
 *
 * По одному сигнатурному модулю на станцию — тот же паттерн, что и у
 * личных умений, только тема — корабельные системы, а не тело/психика:
 *   Приют    — ремонтные наниты (поддержка/лечение)
 *   Терминус — бронебойный залп (гарнизонная точность)
 *   Арсенал  — ракетный шквал (грубая огневая мощь)
 *   Вуаль    — РЭБ-подавление (радиоэлектронная борьба, глушит щиты)
 */

const SHIP_SKILLS = {
  nanite_repair: {
    id: 'nanite_repair', name: 'Ремонтные наниты', station: 'Приют', cd: 3, usesFocus: true,
    damaging: true, pure: true, selfHealPct: 0.22,
    formula: (a) => a.hpMax * 0.08,
  },
  armor_piercing_volley: {
    id: 'armor_piercing_volley', name: 'Бронебойный залп', station: 'Терминус', cd: 3, usesFocus: true,
    damaging: true, shieldPierce: 0.55,
    formula: (a) => a.stats.firepower * 0.75 + a.stats.reaction * 0.3,
  },
  missile_barrage: {
    id: 'missile_barrage', name: 'Ракетный шквал', station: 'Арсенал', cd: 3, usesFocus: true,
    damaging: true,
    formula: (a) => a.stats.firepower * 0.9 + a.stats.power * 0.4,
    applyDot: { type: 'dot', amount: 14, turnsLeft: 2 },
  },
  ecm_jam: {
    id: 'ecm_jam', name: 'РЭБ-подавление', station: 'Вуаль', cd: 3, usesFocus: true,
    damaging: true, shieldShred: 10,
    formula: (a) => a.stats.mind * 0.5 + a.stats.reaction * 0.4,
  },
  forge_cannon: {
    id: 'forge_cannon', name: 'Плавильный залп', station: 'Кузница', cd: 3, usesFocus: true,
    damaging: true, pure: true,
    formula: (a) => a.stats.firepower * 0.7 + a.stats.power * 0.5,
    applyDot: { type: 'dot', amount: 16, turnsLeft: 3 },
  },
};

/** Стартовый корабельный модуль по фракции — тот же принцип, что и у
 * личных умений персонажа (по одному сигнатурному на станцию). */
const SHIP_SKILL_BY_FACTION = {
  'Приют': 'nanite_repair',
  'Терминус': 'armor_piercing_volley',
  'Арсенал': 'missile_barrage',
  'Вуаль': 'ecm_jam',
  'Кузница': 'forge_cannon',
};

/** Раньше поле cd существовало у каждого умения корабля, но нигде не
 * проверялось — можно было жать одно и то же умение каждый ход без
 * ограничений. Теперь честная перезарядка через engine/cooldowns.js,
 * тот же самый движок, что уже работает для умений персонажа. */
function shipSkillButtons(equippedShipSkillIds = [], cooldowns = {}) {
  return equippedShipSkillIds
    .filter((id) => !(cooldowns[id] > 0))
    .map((id) => SHIP_SKILLS[id]?.name)
    .filter(Boolean);
}
function shipSkillCooldownNote(equippedShipSkillIds = [], cooldowns = {}) {
  return equippedShipSkillIds
    .filter((id) => cooldowns[id] > 0)
    .map((id) => `⏳ ${SHIP_SKILLS[id]?.name}: ещё ${cooldowns[id]} х.`);
}
function shipSkillIdByName(name) {
  return Object.values(SHIP_SKILLS).find((s) => s.name === name)?.id || null;
}

module.exports = { SHIP_SKILLS, SHIP_SKILL_BY_FACTION, shipSkillButtons, shipSkillCooldownNote, shipSkillIdByName };
