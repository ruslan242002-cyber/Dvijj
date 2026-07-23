/**
 * ПЕРИФЕРИЯ — боевой движок
 * ---------------------------------------------------------
 * Чистые функции без побочных эффектов и без обращения к сети/БД.
 * Вся "память" — это объект state, который вы храните в переменных
 * SaleBot/BotHelp (как JSON-строку) и передаёте на вход при каждом ходе.
 *
 * Формулы 1:1 повторяют систему, которую мы разбирали для Атраксиса:
 *  - точность vs уклонение решают попадание обычной атаки
 *  - фокус (от Разума) vs уклонение решают попадание навыка
 *  - экранирование (Экранирование%) снижает урон post-factum
 *  - крит — отдельный бросок поверх попадания
 *  - периодические эффекты (яды/кровотечения/регены) затухают на 30% в конце хода
 *
 * Ничего не рандомизировано "втихую" — каждый бросок дайса передаётся
 * явным параметром rng (по умолчанию Math.random), поэтому тесты и
 * симуляция баланса могут подставить детерминированный ГПСЧ.
 */

'use strict';

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

/**
 * @typedef {Object} Fighter
 * @property {number} hp
 * @property {number} hpMax
 * @property {Object} stats   // { power, mind, reaction, endurance, firepower, shielding }
 * @property {number} luck    // влияет на крит, 0..100
 * @property {number} accuracy   // 0..1, базовая точность обычной атаки
 * @property {number} dodge      // 0..1, уклонение от обычной атаки
 * @property {number} focus      // 0..1, фокус (попадание навыком)
 * @property {Array}  periodic   // [{type:'dot'|'hot', amount, turnsLeft}]
 */

const DEFAULT_ACCURACY = 0.8;
const DEFAULT_DODGE = 0.1;
const DEFAULT_FOCUS = 0.75;
const CRIT_MULT = 1.5;

function critChance(luck) {
  // 5% база + 0.3% за каждую единицу удачи, кап 60% — не даём удаче стать автованом
  return clamp(0.05 + luck * 0.003, 0, 0.6);
}

/** Обычная атака: точность атакующего vs уклонение цели */
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

/**
 * Навык. skill.formula — функция (attacker) => number (базовый урон/лечение до крита/брони)
 * skill.usesFocus — булево, попадание считается через фокус, а не точность
 * skill.pure — игнорирует экранирование (чистый урон)
 * skill.selfHeal / skill.lifestealPct — доп. эффекты
 */
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
    dmg = skill.pure ? raw : raw * (1 - clamp(defender.stats.shielding ?? 0, 0, 85) / 100);
  }

  let selfHeal = 0;
  if (skill.selfHealPct) selfHeal += Math.round(attacker.hpMax * skill.selfHealPct);
  if (skill.lifestealPct && dmg > 0) selfHeal += Math.round(dmg * skill.lifestealPct);

  return { hit: true, dmg: Math.round(dmg), heal: selfHeal, crit: isCrit, dot: skill.applyDot || null };
}

/** Применение стим-пакета (аналог инъектора) — не занимает фазу атаки */
function applyStim(target, stim) {
  const log = [];
  if (stim.healFlat || stim.healPct) {
    const heal = Math.round((stim.healFlat || 0) + (stim.healPct || 0) * target.hpMax);
    target.hp = clamp(target.hp + heal, 0, target.hpMax);
    log.push(`+${heal} HP`);
  }
  if (stim.hpMultiplier) {
    const bonus = Math.round(target.hpMax * (stim.hpMultiplier - 1));
    target.hpMax += bonus;
    target.hp += bonus;
    log.push(`HP×${stim.hpMultiplier}`);
  }
  if (stim.incomingDmgMod) {
    target.incomingDmgMod = (target.incomingDmgMod || 1) * stim.incomingDmgMod;
    log.push(`входящий урон ×${stim.incomingDmgMod}`);
  }
  if (stim.outgoingDmgMod) {
    target.outgoingDmgMod = (target.outgoingDmgMod || 1) * stim.outgoingDmgMod;
    log.push(`исходящий урон ×${stim.outgoingDmgMod}`);
  }
  if (stim.focusMod) { target.focus = clamp((target.focus ?? DEFAULT_FOCUS) + stim.focusMod, 0.05, 0.99); log.push(`+фокус`); }
  if (stim.accuracyMod) { target.accuracy = clamp((target.accuracy ?? DEFAULT_ACCURACY) + stim.accuracyMod, 0.05, 0.99); log.push(`+точность`); }
  if (stim.applyDot) { target.periodic = target.periodic || []; target.periodic.push({ ...stim.applyDot }); }
  return log;
}

/** Конец хода: периодические эффекты тикают и затухают на 30% */
function tickPeriodic(fighter) {
  if (!fighter.periodic || fighter.periodic.length === 0) return { totalDot: 0, totalHot: 0 };
  let totalDot = 0, totalHot = 0;
  fighter.periodic = fighter.periodic
    .map((p) => {
      if (p.type === 'dot') totalDot += p.amount; else totalHot += p.amount;
      return { ...p, amount: p.amount * 0.7, turnsLeft: p.turnsLeft - 1 };
    })
    .filter((p) => p.turnsLeft > 0 && p.amount >= 1);

  fighter.hp = clamp(fighter.hp - totalDot + totalHot, 0, fighter.hpMax);
  return { totalDot: Math.round(totalDot), totalHot: Math.round(totalHot) };
}

/**
 * Один полный ход: фаза стима (опционально) + фаза атаки (обычная атака ИЛИ навык).
 * Возвращает новое состояние (мутирует переданные объекты — сохраните копию
 * до вызова, если нужен старый снапшот) и текстовый лог для подстановки в шаблон.
 */
function resolveTurn({ attacker, defender, stim, skill, rng = Math.random }) {
  const log = [];

  if (stim) {
    const stimLog = applyStim(attacker, stim);
    if (stimLog.length) log.push(`Стим: ${stimLog.join(', ')}`);
  }

  const outMod = attacker.outgoingDmgMod || 1;
  const inMod = defender.incomingDmgMod || 1;

  let result;
  if (skill) {
    result = useSkill(attacker, defender, skill, rng);
  } else {
    result = basicAttack(attacker, defender, rng);
  }

  if (!result.hit) {
    log.push(`${attacker.name || 'Атакующий'} промахивается.`);
  } else {
    const finalDmg = Math.round(result.dmg * outMod * inMod);
    defender.hp = clamp(defender.hp - finalDmg, 0, defender.hpMax);
    if (finalDmg > 0) log.push(`${attacker.name || 'Атакующий'} наносит ${finalDmg} урона${result.crit ? ' (КРИТ)' : ''}.`);
    if (result.heal > 0) {
      attacker.hp = clamp(attacker.hp + result.heal, 0, attacker.hpMax);
      log.push(`${attacker.name || 'Атакующий'} восстанавливает ${result.heal} HP.`);
    }
    if (result.dot) {
      defender.periodic = defender.periodic || [];
      defender.periodic.push({ ...result.dot });
      log.push(`Наложен периодический эффект.`);
    }
  }

  const defenderTick = tickPeriodic(defender);
  const attackerTick = tickPeriodic(attacker);
  if (defenderTick.totalDot) log.push(`Периодический урон по цели: ${defenderTick.totalDot}.`);
  if (attackerTick.totalHot) log.push(`Регенерация атакующего: ${attackerTick.totalHot}.`);

  const finished = defender.hp <= 0 || attacker.hp <= 0;
  const winner = defender.hp <= 0 && attacker.hp > 0 ? 'attacker'
    : attacker.hp <= 0 && defender.hp > 0 ? 'defender'
    : null;

  return { attacker, defender, log, finished, winner };
}

module.exports = {
  clamp, critChance, basicAttack, useSkill, applyStim, tickPeriodic, resolveTurn,
  DEFAULT_ACCURACY, DEFAULT_DODGE, DEFAULT_FOCUS, CRIT_MULT
};
