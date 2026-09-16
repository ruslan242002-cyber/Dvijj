'use strict';

const CAPS = {
  dodge: 0.45,
  accuracy: 0.97,
  focus: 0.97,
  cooldownReductionPct: 0.5,
};

const BASE = {
  dodge: 0.05,
  accuracy: 0.65,
  focus: 0.60,
};

const PER_POINT = {
  dodgePerReaction: 0.004,
  accuracyPerReaction: 0.003,
  hpPerEndurance: 4,
  shieldingPerEndurance: 0.3,
  firepowerPerPower: 0.5,
  focusPerMind: 0.004,
  cooldownReductionPerMind: 0.01,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Считает боевые свойства из 4 основных статов. НЕ мутирует ничего —
 * чистая функция, применение результата — отдельный шаг.
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
const { aggregatePassiveEffects } = require('./passive-skills.js');

/**
 * Применяет производные статы к игроку — пересчитывает accuracy/dodge/
 * focus и добавляет статовые бонусы поверх БАЗОВЫХ firepower/shielding/
 * hpMax. Вызывать после ЛЮБОГО изменения основных статов.
 *
 * player.baseFirepower/baseShielding/baseHpMax хранят стат-НЕЗАВИСИМУЮ
 * часть (от фракции), итоговые значения пересчитываются заново при
 * каждом вызове, не накапливаются.
 */
function applyDerivedStats(player) {
  player.baseFirepower = player.baseFirepower ?? (player.stats.firepower || 0);
  player.baseShielding = player.baseShielding ?? (player.stats.shielding || 0);
  player.baseHpMax = player.baseHpMax ?? (player.hpMax || 0);

  const moduleBonus = aggregateModuleEffects(player);
  const gearBonus = aggregateGearEffects(player);
  const artifactBonus = aggregateArtifactEffects(player);
  const combinedBonus = {
    power: (moduleBonus.power || 0) + (gearBonus.power || 0) + (artifactBonus.power || 0),
    mind: (moduleBonus.mind || 0) + (gearBonus.mind || 0) + (artifactBonus.mind || 0),
    reaction: (moduleBonus.reaction || 0) + (gearBonus.reaction || 0) + (artifactBonus.reaction || 0),
    endurance: (moduleBonus.endurance || 0) + (gearBonus.endurance || 0) + (artifactBonus.endurance || 0),
    firepower: (moduleBonus.firepower || 0) + (gearBonus.firepower || 0) + (artifactBonus.firepower || 0),
    shielding: (moduleBonus.shielding || 0) + (gearBonus.shielding || 0) + (artifactBonus.shielding || 0),
  };
  const effectiveStats = {
    power: (player.stats.power || 0) + combinedBonus.power,
    mind: (player.stats.mind || 0) + combinedBonus.mind,
    reaction: (player.stats.reaction || 0) + combinedBonus.reaction,
    endurance: (player.stats.endurance || 0) + combinedBonus.endurance,
  };

  const derived = computeDerivedStats(effectiveStats);

  // ⚠️ QA-НАХОДКА: focusBonus/cooldownReductionBonus от пассивок
  // (aggregatePassiveEffects) раньше нигде не применялись — оба честные
  // проценты (не плоские числа, проверено по семантике passive-skills.js
  // перед добавлением формулы, тот же урок что и с radiationReduction
  // ранее). Складываются с уже посчитанным derived-значением, те же
  // существующие лимиты (CAPS.focus/CAPS.cooldownReductionPct), не новые.
  const passiveEffects = aggregatePassiveEffects(player.equippedPassives || []);

  player.dodge = clamp(derived.dodge + (passiveEffects.evasionBonus || 0), 0, CAPS.dodge);
  player.accuracy = clamp(derived.accuracy + (passiveEffects.precisionBonus || 0), 0, CAPS.accuracy);
  player.focus = clamp(derived.focus + (passiveEffects.focusBonus || 0), 0, CAPS.focus);
  player.stats.firepower = player.baseFirepower + derived.firepowerBonus + combinedBonus.firepower;
  player.stats.shielding = player.baseShielding + derived.shieldingBonus + combinedBonus.shielding;

  const newHpMax = player.baseHpMax + derived.hpBonus;
  const hpDelta = newHpMax - player.hpMax;
  player.hpMax = newHpMax;
  if (hpDelta > 0) player.hp = Math.min(player.hpMax, (player.hp || 0) + hpDelta);
  player.hp = Math.min(player.hp, player.hpMax);

  player.cooldownReductionPct = clamp(derived.cooldownReductionPct + (passiveEffects.cooldownReductionBonus || 0), 0, CAPS.cooldownReductionPct);

  return player;
}

module.exports = { computeDerivedStats, applyDerivedStats, CAPS, BASE, PER_POINT };
