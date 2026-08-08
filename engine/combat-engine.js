'use strict';
const { DAMAGE_TYPES, damageTypeForSkill, resistanceMultiplier } = require('./damage-types.js');
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const DEFAULT_ACCURACY = 0.8, DEFAULT_DODGE = 0.1, DEFAULT_FOCUS = 0.75, CRIT_MULT = 1.5;
// ── PvP-баланс ──────────────────────────────────────────────────────
// Все бонусы классов-наставников/фракций считались с прицелом на PvE
// (выживание группы против боссов) — без поправки они делают дуэли
// нечестными: танк (Вуаль+Инженер) при равных статах получает ~57%
// снижения урона + 22% шанс отражения, стеклянная пушка получает
// вдвое меньше пробития И огребает отражённый урон сверху. SHIELD_CAP_PVP
// ниже, чем в PvE (60% вместо 85%) — никто не становится
// неубиваемым. CLASS_FX_DAMPENING_PVP вдвое ослабляет "острые" эффекты
// (перегрузка/снятие брони/бонус крит-урона/отражение) конкретно в PvP,
// не трогая базовые статы (огневая мощь/защита/крит-шанс/самолечение
// остаются как есть — это честный рост силы, не всплеск/наказание).
const SHIELD_CAP_PVE = 85;
const SHIELD_CAP_PVP = 60;
const CLASS_FX_DAMPENING_PVP = 0.5;
function critChance(luck, bonus = 0) { return clamp(0.05 + luck * 0.003 + bonus, 0, 0.6); }

/** Отражение урона (Инженер, 3+ ступень) — проверяется на защищающейся
 * стороне, не на атакующей. Не снижает исходный урон (защитник всё
 * равно получает удар полностью) — это ДОПОЛНИТЕЛЬНЫЙ встречный урон
 * атакующему, честная плата за агрессию против танка. rng здесь берётся
 * из замыкания basicAttack/useSkill — передаётся явно, не через
 * Math.random напрямую, чтобы боевые логи оставались детерминированными
 * при тестах с seeded rng. */
function applyReflect(attacker, defender, dmg, rng = Math.random, pvpMode = false) {
  if (defender.reflectChance && rng() < defender.reflectChance * (pvpMode ? CLASS_FX_DAMPENING_PVP : 1) && dmg > 0) {
    const reflected = Math.round(dmg * (defender.reflectPct || 0) * (pvpMode ? CLASS_FX_DAMPENING_PVP : 1));
    if (reflected > 0) attacker.hp = clamp(attacker.hp - reflected, 0, attacker.hpMax);
  }
  return dmg;
}
function basicAttack(attacker, defender, rng = Math.random, pvpMode = false) {
  const acc = clamp((attacker.accuracy ?? DEFAULT_ACCURACY) - (defender.dodge ?? DEFAULT_DODGE), 0.05, 0.99);
  const hit = rng() < acc;
  if (!hit) return { hit: false, dmg: 0, crit: false };
  const base = attacker.stats.firepower * 0.6 + attacker.stats.power * 0.4;
  const isCrit = attacker.guaranteedCritNextAttack || rng() < critChance(attacker.luck ?? 0, attacker.critChanceBonus || 0);
  if (attacker.guaranteedCritNextAttack) attacker.guaranteedCritNextAttack = false;
  const critMult = CRIT_MULT + (attacker.critDamageBonusPct || 0) * (pvpMode ? CLASS_FX_DAMPENING_PVP : 1);
  let dmg = base * (isCrit ? critMult : 1);
  const shieldCap = pvpMode ? SHIELD_CAP_PVP : SHIELD_CAP_PVE;
  dmg = dmg * (1 - clamp(defender.stats.shielding ?? 0, 0, shieldCap) / 100);
  dmg *= resistanceMultiplier(defender, DAMAGE_TYPES.KINETIC);
  const overchargeChance = (attacker.overchargeChance || 0) * (pvpMode ? CLASS_FX_DAMPENING_PVP : 1);
  if (overchargeChance && rng() < overchargeChance) dmg *= 1.5;
  if (isCrit && attacker.critShieldShredPct && defender.stats.shielding != null) {
    const shredPct = attacker.critShieldShredPct * (pvpMode ? CLASS_FX_DAMPENING_PVP : 1);
    defender.stats.shielding = Math.max(0, Math.round(defender.stats.shielding * (1 - shredPct)));
  }
  dmg = applyReflect(attacker, defender, dmg, rng, pvpMode);
  return { hit: true, dmg: Math.round(dmg), crit: isCrit };
}
function useSkill(attacker, defender, skill, rng = Math.random, pvpMode = false) {
  const chance = skill.usesFocus === false
    ? clamp((attacker.accuracy ?? DEFAULT_ACCURACY) - (defender.dodge ?? DEFAULT_DODGE), 0.05, 0.99)
    : clamp((attacker.focus ?? DEFAULT_FOCUS), 0.05, 0.99);
  const hit = rng() < chance;
  if (!hit) return { hit: false, dmg: 0, heal: 0, crit: false };
  const isCrit = attacker.guaranteedCritNextAttack || rng() < critChance(attacker.luck ?? 0, attacker.critChanceBonus || 0) * (skill.critModifier ?? 1);
  if (attacker.guaranteedCritNextAttack) attacker.guaranteedCritNextAttack = false;
  const critMult = CRIT_MULT + (attacker.critDamageBonusPct || 0) * (pvpMode ? CLASS_FX_DAMPENING_PVP : 1);
  let raw = skill.formula(attacker) * (isCrit ? critMult : 1);
  let dmg = 0;
  if (skill.damaging !== false) {
    const shieldCap = pvpMode ? SHIELD_CAP_PVP : SHIELD_CAP_PVE;
    const baseShielding = defender.stats.shielding ?? 0;
    const effectiveShielding = skill.shieldPierce ? baseShielding * (1 - skill.shieldPierce) : baseShielding;
    dmg = skill.pure ? raw : raw * (1 - clamp(effectiveShielding, 0, shieldCap) / 100);
    const damageType = skill.damageType || damageTypeForSkill(skill.id);
    dmg *= resistanceMultiplier(defender, damageType);
    const overchargeChance = (attacker.overchargeChance || 0) * (pvpMode ? CLASS_FX_DAMPENING_PVP : 1);
    if (overchargeChance && rng() < overchargeChance) dmg *= 1.5;
    if (isCrit && attacker.critShieldShredPct && defender.stats.shielding != null) {
      const shredPct = attacker.critShieldShredPct * (pvpMode ? CLASS_FX_DAMPENING_PVP : 1);
      defender.stats.shielding = Math.max(0, Math.round(defender.stats.shielding * (1 - shredPct)));
    }
    dmg = applyReflect(attacker, defender, dmg, rng, pvpMode);
  }
  if (skill.shieldShred && defender.stats.shielding != null) {
    defender.stats.shielding = Math.max(0, defender.stats.shielding - skill.shieldShred);
  }
  let selfHeal = 0;
  // Целитель (класс-наставник Ирис Вейл) — усиливает ЛЮБОЕ самолечение
  // умения (и прямое, и лайфстил), не отдельная новая механика.
  const lifestealBonusMult = 1 + (attacker.lifestealBonus || 0);
  if (skill.selfHealPct) selfHeal += Math.round(attacker.hpMax * skill.selfHealPct * lifestealBonusMult);
  if (skill.lifestealPct && dmg > 0) selfHeal += Math.round(dmg * skill.lifestealPct * lifestealBonusMult);
  return { hit: true, dmg: Math.round(dmg), heal: selfHeal, crit: isCrit, dot: skill.applyDot || null };
}
function applyStim(target, stim) {
  const log = [];
  if (stim.healFlat || stim.healPct) {
    const heal = Math.round((stim.healFlat || 0) + (stim.healPct || 0) * target.hpMax);
    target.hp = clamp(target.hp + heal, 0, target.hpMax);
    log.push(`+${heal} HP`);
  }
  if (stim.hpMultiplier) {
    const bonus = Math.round(target.hpMax * (stim.hpMultiplier - 1));
    target.hpMax += bonus; target.hp += bonus;
    log.push(`HP x${stim.hpMultiplier}`);
  }
  if (stim.incomingDmgMod) { target.incomingDmgMod = (target.incomingDmgMod || 1) * stim.incomingDmgMod; log.push('incoming mod'); }
  if (stim.outgoingDmgMod) { target.outgoingDmgMod = (target.outgoingDmgMod || 1) * stim.outgoingDmgMod; log.push('outgoing mod'); }
  if (stim.focusMod) { target.focus = clamp((target.focus ?? DEFAULT_FOCUS) + stim.focusMod, 0.05, 0.99); log.push('focus mod'); }
  if (stim.accuracyMod) { target.accuracy = clamp((target.accuracy ?? DEFAULT_ACCURACY) + stim.accuracyMod, 0.05, 0.99); log.push('acc mod'); }
  if (stim.applyDot) { target.periodic = target.periodic || []; target.periodic.push({ ...stim.applyDot }); }
  return log;
}
function tickPeriodic(fighter) {
  if (!fighter.periodic || fighter.periodic.length === 0) return { totalDot: 0, totalHot: 0 };
  let totalDot = 0, totalHot = 0;
  fighter.periodic = fighter.periodic.map((p) => {
    if (p.type === 'dot') totalDot += p.amount; else totalHot += p.amount;
    return { ...p, amount: p.amount * 0.7, turnsLeft: p.turnsLeft - 1 };
  }).filter((p) => p.turnsLeft > 0 && p.amount >= 1);
  const roundedDot = Math.round(totalDot);
  const roundedHot = Math.round(totalHot);
  fighter.hp = clamp(Math.round(fighter.hp - roundedDot + roundedHot), 0, fighter.hpMax);
  return { totalDot: roundedDot, totalHot: roundedHot };
}
const CRIT_VULNERABLE_POINT_SHRED = 2; // крит бьёт в уязвимую точку — немного снижает броню цели навсегда

/**
 * ЗОНАЛЬНЫЕ МОДИФИКАТОРЫ БОЯ — жёлтая зона: 10% шанс "помехи" (сенсоры
 * сбоят, -10% точности ОБОИМ на этот ход). Красная зона: 20% шанс
 * "резонанса" (случайный урон 5-15 по ОБОИМ, не зависит от щита/брони —
 * это фон, а не атака). Синяя зона — без модификаторов. Один ролл на
 * ход, применяется в resolveTurn() одинаково для игрока и врага.
 */
const ZONE_MOD_CHANCE = { yellow: 0.1, red: 0.2 };
function applyZoneMod(zone, rng) {
  if (zone === 'yellow' && rng() < ZONE_MOD_CHANCE.yellow) {
    return { type: 'interference', accuracyDelta: -0.1 };
  }
  if (zone === 'red' && rng() < ZONE_MOD_CHANCE.red) {
    return { type: 'resonance', dmg: 5 + Math.floor(rng() * 11) };
  }
  return null;
}

function resolveTurn({ attacker, defender, stim, skill, zone, rng = Math.random, pvpMode = false }) {
  const log = [];
  if (stim) { const s = applyStim(attacker, stim); if (s.length) log.push(`Стим: ${s.join(', ')}`); }
  const zoneEvent = zone ? applyZoneMod(zone, rng) : null;
  let savedAttAcc, savedDefAcc;
  if (zoneEvent?.type === 'interference') {
    savedAttAcc = attacker.accuracy ?? DEFAULT_ACCURACY;
    savedDefAcc = defender.accuracy ?? DEFAULT_ACCURACY;
    attacker.accuracy = clamp(savedAttAcc + zoneEvent.accuracyDelta, 0.05, 0.99);
    defender.accuracy = clamp(savedDefAcc + zoneEvent.accuracyDelta, 0.05, 0.99);
    log.push('Жёлтая зона: помеха сбивает сенсоры — точность обоих падает.');
  }
  const outMod = attacker.outgoingDmgMod || 1;
  const inMod = defender.incomingDmgMod || 1;
  let result = skill ? useSkill(attacker, defender, skill, rng, pvpMode) : basicAttack(attacker, defender, rng, pvpMode);
  if (!result.hit) {
    log.push(`${attacker.name || 'Атакующий'} промахивается.`);
  } else {
    const finalDmg = Math.round(result.dmg * outMod * inMod);
    defender.hp = clamp(defender.hp - finalDmg, 0, defender.hpMax);
    if (finalDmg > 0) log.push(`${attacker.name || 'Атакующий'} наносит ${finalDmg} урона${result.crit ? ' (КРИТ)' : ''}.`);
    if (result.crit && finalDmg > 0 && defender.stats?.shielding != null) {
      // Крит — не просто больше урона, а попадание в уязвимую точку:
      // немного портит броню цели на оставшийся бой (тот же приём, что и
      // у shieldShred-умений, не отдельная новая система).
      const before = defender.stats.shielding;
      defender.stats.shielding = Math.max(0, defender.stats.shielding - CRIT_VULNERABLE_POINT_SHRED);
      if (defender.stats.shielding < before) log.push('Удар пришёлся в уязвимую точку — броня повреждена.');
    }
    if (result.heal > 0) { attacker.hp = clamp(attacker.hp + result.heal, 0, attacker.hpMax); log.push(`восстанавливает ${result.heal} HP.`); }
    if (result.dot) { defender.periodic = defender.periodic || []; defender.periodic.push({ ...result.dot }); log.push('Наложен периодический эффект.'); }
  }
  if (zoneEvent?.type === 'interference') {
    attacker.accuracy = savedAttAcc;
    defender.accuracy = savedDefAcc;
  }
  if (zoneEvent?.type === 'resonance') {
    attacker.hp = clamp(attacker.hp - zoneEvent.dmg, 0, attacker.hpMax);
    defender.hp = clamp(defender.hp - zoneEvent.dmg, 0, defender.hpMax);
    log.push(`Красная зона: резонанс бьёт по обоим на ${zoneEvent.dmg}.`);
  }
  const defenderTick = tickPeriodic(defender);
  const attackerTick = tickPeriodic(attacker);
  if (defenderTick.totalDot) log.push(`Периодический урон: ${defenderTick.totalDot}.`);
  if (attackerTick.totalHot) log.push(`Регенерация: ${attackerTick.totalHot}.`);
  const finished = defender.hp <= 0 || attacker.hp <= 0;
  const winner = defender.hp <= 0 && attacker.hp > 0 ? 'attacker' : attacker.hp <= 0 && defender.hp > 0 ? 'defender' : null;
  return { attacker, defender, log, finished, winner };
}
module.exports = { clamp, critChance, basicAttack, useSkill, applyStim, tickPeriodic, applyZoneMod, resolveTurn };
