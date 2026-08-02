'use strict';
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const DEFAULT_ACCURACY = 0.8, DEFAULT_DODGE = 0.1, DEFAULT_FOCUS = 0.75, CRIT_MULT = 1.5;
function critChance(luck) { return clamp(0.05 + luck * 0.003, 0, 0.6); }
function basicAttack(attacker, defender, rng = Math.random) {
  const acc = clamp((attacker.accuracy ?? DEFAULT_ACCURACY) - (defender.dodge ?? DEFAULT_DODGE), 0.05, 0.99);
  const hit = rng() < acc;
  if (!hit) return { hit: false, dmg: 0, crit: false };
  const base = attacker.stats.firepower * 0.6 + attacker.stats.power * 0.4;
  const isCrit = rng() < critChance(attacker.luck ?? 0);
  let dmg = base * (isCrit ? CRIT_MULT : 1);
  dmg = dmg * (1 - clamp(defender.stats.shielding ?? 0, 0, 85) / 100);
  return { hit: true, dmg: Math.round(dmg), crit: isCrit };
}
function useSkill(attacker, defender, skill, rng = Math.random) {
  const chance = skill.usesFocus === false
    ? clamp((attacker.accuracy ?? DEFAULT_ACCURACY) - (defender.dodge ?? DEFAULT_DODGE), 0.05, 0.99)
    : clamp((attacker.focus ?? DEFAULT_FOCUS), 0.05, 0.99);
  const hit = rng() < chance;
  if (!hit) return { hit: false, dmg: 0, heal: 0, crit: false };
  const isCrit = rng() < critChance(attacker.luck ?? 0);
  let raw = skill.formula(attacker) * (isCrit ? CRIT_MULT : 1);
  let dmg = 0;
  if (skill.damaging !== false) {
    const baseShielding = defender.stats.shielding ?? 0;
    const effectiveShielding = skill.shieldPierce ? baseShielding * (1 - skill.shieldPierce) : baseShielding;
    dmg = skill.pure ? raw : raw * (1 - clamp(effectiveShielding, 0, 85) / 100);
  }
  if (skill.shieldShred && defender.stats.shielding != null) {
    defender.stats.shielding = Math.max(0, defender.stats.shielding - skill.shieldShred);
  }
  let selfHeal = 0;
  if (skill.selfHealPct) selfHeal += Math.round(attacker.hpMax * skill.selfHealPct);
  if (skill.lifestealPct && dmg > 0) selfHeal += Math.round(dmg * skill.lifestealPct);
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

function resolveTurn({ attacker, defender, stim, skill, rng = Math.random }) {
  const log = [];
  if (stim) { const s = applyStim(attacker, stim); if (s.length) log.push(`Стим: ${s.join(', ')}`); }
  const outMod = attacker.outgoingDmgMod || 1;
  const inMod = defender.incomingDmgMod || 1;
  let result = skill ? useSkill(attacker, defender, skill, rng) : basicAttack(attacker, defender, rng);
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
  const defenderTick = tickPeriodic(defender);
  const attackerTick = tickPeriodic(attacker);
  if (defenderTick.totalDot) log.push(`Периодический урон: ${defenderTick.totalDot}.`);
  if (attackerTick.totalHot) log.push(`Регенерация: ${attackerTick.totalHot}.`);
  const finished = defender.hp <= 0 || attacker.hp <= 0;
  const winner = defender.hp <= 0 && attacker.hp > 0 ? 'attacker' : attacker.hp <= 0 && defender.hp > 0 ? 'defender' : null;
  return { attacker, defender, log, finished, winner };
}
module.exports = { clamp, critChance, basicAttack, useSkill, applyStim, tickPeriodic, resolveTurn };
