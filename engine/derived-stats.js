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

const { aggregateModuleEffects } = require('../crafting/crafting-engine.js');
const { aggregateGearEffects } = require('./gear-engine.js');
const { aggregateArtifactEffects } = require('../lib/artifacts.js');
const { activeClassEffects } = require('./mentor-classes.js');
const { factionCombatBonus } = require('./faction-combat.js');

/**
 * Применяет производные статы к игроку — пересчитывает accuracy/dodge/focus
 * и добавляет статовые бонусы поверх БАЗОВЫХ firepower/shielding/hpMax
 * (тех, что даёт фракция при создании персонажа). Нужно вызывать после
 * ЛЮБОГО изменения основных статов: левел-ап (см. engine/leveling.js),
 * ручное распределение очков (api/profile.js — allocateStat), экипировка
 * модулей (crafting/crafting-engine.js).
 *
 * ВАЖНО про идемпотентность: player.baseFirepower/baseShielding/baseHpMax
 * хранят стат-НЕЗАВИСИМУЮ часть (от фракции), а итоговые
 * stats.firepower/stats.shielding/hpMax = база + бонус от статов + бонус
 * от экипированных модулей — пересчитывается заново при каждом вызове, не
 * накапливается. Модули к power/mind/reaction/endurance тоже НЕ мутируют
 * player.stats напрямую (это испортило бы настоящее распределение очков
 * персонажа навсегда) — они складываются только во "временный" набор
 * effectiveStats, который идёт на вход в computeDerivedStats.
 */
function applyDerivedStats(player) {
  player.baseFirepower = player.baseFirepower ?? (player.stats.firepower || 0);
  player.baseShielding = player.baseShielding ?? (player.stats.shielding || 0);
  player.baseHpMax = player.baseHpMax ?? (player.hpMax || 0);

  const moduleBonus = aggregateModuleEffects(player);
  const gearBonus = aggregateGearEffects(player);
  const artifactBonus = aggregateArtifactEffects(player);
  // Класс-наставник — теперь полноценный объект эффектов текущей ступени
  // (engine/mentor-classes.js), не одно число. Firepower/shielding — тот
  // же аддитивный принцип, что у модулей/снаряжения/артефактов. Остальные
  // поля (crit/lifesteal/overcharge/reflect/...) не аддитивные статы —
  // читаются напрямую из player.classEffects в combat-engine.js, где
  // именно эти механики реально считаются.
  const classEffects = activeClassEffects(player);
  player.classEffects = classEffects; // кэш на этот пересчёт — combat-engine.js читает отсюда
  // Боевой бонус родной фракции (engine/faction-combat.js) — отдельный
  // ВСЕГДА включённый источник, складывается с классом-наставником, не
  // конкурирует с ним (Вуаль + класс Инженера = защита из двух мест разом).
  const factionBonus = factionCombatBonus(player.faction);
  const mentorFirepowerBonus = (classEffects.firepowerBonus || 0) + (factionBonus.firepowerBonus || 0);
  const mentorShieldingBonus = (classEffects.shieldingBonus || 0) + (factionBonus.shieldingBonus || 0);
  player.critChanceBonus = (classEffects.critChanceBonus || 0) + (factionBonus.critChanceBonus || 0);
  player.lifestealBonus = (classEffects.selfHealBonus || 0) + (factionBonus.selfHealBonus || 0);
  const combinedBonus = {
    power: (moduleBonus.power || 0) + (gearBonus.power || 0) + (artifactBonus.power || 0),
    mind: (moduleBonus.mind || 0) + (gearBonus.mind || 0) + (artifactBonus.mind || 0),
    reaction: (moduleBonus.reaction || 0) + (gearBonus.reaction || 0) + (artifactBonus.reaction || 0),
    endurance: (moduleBonus.endurance || 0) + (gearBonus.endurance || 0) + (artifactBonus.endurance || 0),
    firepower: (moduleBonus.firepower || 0) + (gearBonus.firepower || 0) + (artifactBonus.firepower || 0) + mentorFirepowerBonus,
    shielding: (moduleBonus.shielding || 0) + (gearBonus.shielding || 0) + (artifactBonus.shielding || 0) + mentorShieldingBonus,
  };
  const effectiveStats = {
    power: (player.stats.power || 0) + combinedBonus.power,
    mind: (player.stats.mind || 0) + combinedBonus.mind,
    reaction: (player.stats.reaction || 0) + combinedBonus.reaction,
    endurance: (player.stats.endurance || 0) + combinedBonus.endurance,
  };

  const derived = computeDerivedStats(effectiveStats);

  player.dodge = derived.dodge;
  player.accuracy = derived.accuracy;
  player.focus = derived.focus;
  player.stats.firepower = player.baseFirepower + derived.firepowerBonus + combinedBonus.firepower;
  player.stats.shielding = player.baseShielding + derived.shieldingBonus + combinedBonus.shielding;

  // +50 HP за каждый уровень сверх первого — раньше прокачка уровня
  // ощутимо не меняла максимум HP вообще (только statPoints, которые
  // ещё нужно было руками распределить в Выносливость, чтобы это
  // сказалось на HP хоть как-то). Теперь level-up сам по себе всегда
  // заметен, независимо от того, куда пошли очки характеристик.
  const levelHpBonus = Math.max(0, (player.level || 1) - 1) * 50;
  const newHpMax = player.baseHpMax + derived.hpBonus + levelHpBonus;
  const hpDelta = newHpMax - player.hpMax;
  player.hpMax = newHpMax;
  if (hpDelta > 0) player.hp = Math.min(player.hpMax, (player.hp || 0) + hpDelta);
  player.hp = Math.min(player.hp, player.hpMax);

  player.cooldownReductionPct = derived.cooldownReductionPct;

  return player;
}

module.exports = { computeDerivedStats, applyDerivedStats, CAPS, BASE, PER_POINT };
