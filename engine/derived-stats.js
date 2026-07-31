'use strict';

/**
 * ПРОИЗВОДНЫЕ СТАТЫ — превращает 4 основных стата в реальные боевые числа.
 * Схема — плоское линейное масштабирование (как в Diablo 2/3): каждое
 * очко стата даёт ФИКСИРОВАННУЮ прибавку к конкретному свойству. Просто
 * объяснить игроку ("каждое очко Ловкости — это +0.4% уворота"), легко
 * балансировать (один коэффициент — один рычаг), и полностью прозрачно —
 * никакой скрытой нелинейной кривой, к которой не подобраться.
 *
 * Маппинг на 4 классических стата, о которых просили:
 *   Ловкость   (reaction)  -> уворот + меткость
 *   Выносливость (endurance) -> HP + экранирование ("тип брони")
 *   Сила       (power)     -> огневая мощь (урон оружием)
 *   Интеллект  (mind)      -> фокус (сила/крит навыков) + перезарядка умений
 *
 * Всё имеет мягкий потолок (капы ниже) — иначе на высоких уровнях уворот
 * или меткость улетают к 100% и бой перестаёт быть боем.
 */

const CAPS = {
  dodge: 0.45,       // максимум 45% уворота
  accuracy: 0.97,    // максимум 97% меткости — промах должен оставаться возможным
  focus: 0.97,
  cooldownReductionPct: 0.5, // максимум -50% к перезарядке
};

const BASE = {
  dodge: 0.05,
  accuracy: 0.65,
  focus: 0.60,
};

const PER_POINT = {
  dodgePerReaction: 0.004,       // Ловкость -> уворот
  accuracyPerReaction: 0.003,    // Ловкость -> меткость
  hpPerEndurance: 4,             // Выносливость -> HP
  shieldingPerEndurance: 0.3,    // Выносливость -> экранирование ("тип брони")
  firepowerPerPower: 0.5,        // Сила -> огневая мощь
  focusPerMind: 0.004,           // Интеллект -> фокус навыков
  cooldownReductionPerMind: 0.01, // Интеллект -> % сокращения перезарядки умений
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Считает боевые свойства из 4 основных статов. НЕ мутирует ничего — это
 * чистая функция, применение результата (запись в player) — отдельный шаг.
 * @param {object} stats — { power, mind, reaction, endurance }
 * @returns {{ dodge:number, accuracy:number, focus:number, hpBonus:number, firepowerBonus:number, shieldingBonus:number, cooldownReductionPct:number }}
 */
function computeDerivedStats(stats) {
  const reaction = stats.reaction || 0;
  const endurance = stats.endurance || 0;
  const power = stats.power || 0;
  const mind = stats.mind || 0;

  return {
    dodge: clamp(BASE.dodge + reaction * PER_POINT.dodgePerReaction, 0, CAPS.dodge),
    accuracy: clamp(BASE.accuracy + reaction * PER_POINT.accuracyPerReaction, 0, CAPS.accuracy),
    focus: clamp(BASE.focus + mind * PER_POINT.focusPerMind, 0, CAPS.focus),
    hpBonus: Math.round(endurance * PER_POINT.hpPerEndurance),
    firepowerBonus: Math.round(power * PER_POINT.firepowerPerPower),
    shieldingBonus: Math.round(endurance * PER_POINT.shieldingPerEndurance),
    cooldownReductionPct: clamp(mind * PER_POINT.cooldownReductionPerMind, 0, CAPS.cooldownReductionPct),
  };
}

/**
 * Применяет производные статы к игроку — пересчитывает accuracy/dodge/focus
 * и добавляет статовые бонусы поверх БАЗОВЫХ firepower/shielding/hpMax
 * (тех, что даёт фракция при создании персонажа + крафт). Нужно вызывать
 * после ЛЮБОГО изменения основных статов: левел-ап (см. engine/leveling.js),
 * ручное распределение очков (api/profile.js — allocateStat), крафт модулей.
 *
 * ВАЖНО про идемпотентность: player.baseFirepower/baseShielding/baseHpMax
 * хранят стат-НЕЗАВИСИМУЮ часть (от фракции/крафта), а итоговые
 * stats.firepower/stats.shielding/hpMax = база + бонус от статов. Без этого
 * разделения повторный вызов applyDerivedStats задваивал бы бонус при
 * каждом пересчёте.
 */
function applyDerivedStats(player) {
  player.baseFirepower = player.baseFirepower ?? (player.stats.firepower || 0);
  player.baseShielding = player.baseShielding ?? (player.stats.shielding || 0);
  player.baseHpMax = player.baseHpMax ?? (player.hpMax || 0);

  const derived = computeDerivedStats(player.stats);

  player.dodge = derived.dodge;
  player.accuracy = derived.accuracy;
  player.focus = derived.focus;
  player.stats.firepower = player.baseFirepower + derived.firepowerBonus;
  player.stats.shielding = player.baseShielding + derived.shieldingBonus;

  const newHpMax = player.baseHpMax + derived.hpBonus;
  const hpDelta = newHpMax - player.hpMax;
  player.hpMax = newHpMax;
  if (hpDelta > 0) player.hp = Math.min(player.hpMax, (player.hp || 0) + hpDelta);
  player.hp = Math.min(player.hp, player.hpMax);

  player.cooldownReductionPct = derived.cooldownReductionPct;

  return player;
}

module.exports = { computeDerivedStats, applyDerivedStats, CAPS, BASE, PER_POINT };
