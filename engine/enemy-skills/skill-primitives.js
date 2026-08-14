/**
 * engine/enemy-skills/skill-primitives.js
 *
 * Строительные блоки для именных способностей. Каждый примитив — чистая
 * функция (target, params, rng) -> { logText, ...мутация через periodic }.
 * Ничего не знает о конкретных мобах — только о механике.
 */
'use strict';

/** Урон/лечение во времени — расширяет тот же periodic, который уже
 * умеет читать combat-engine (type: 'dot' | 'hot'). */
function dot(target, { kind = 'generic', amount, turns }) {
  target.periodic = target.periodic || [];
  target.periodic.push({ type: 'dot', kind, amount, turnsLeft: turns });
  return { logText: `Наложен периодический урон (${kind}): ${amount}/ход, ${turns} х.` };
}

function hot(target, { amount, turns }) {
  target.periodic = target.periodic || [];
  target.periodic.push({ type: 'hot', amount, turnsLeft: turns });
  return { logText: `Самолечение: ${amount}/ход, ${turns} х.` };
}

/** Новый тип periodic — см. README про правку combat-engine.js.
 * stat: 'accuracy' | 'dodge' | 'focus' | 'reaction'. mult < 1 = дебафф. */
function statmod(target, { stat, mult, turns, label }) {
  target.periodic = target.periodic || [];
  target.periodic.push({ type: 'statmod', stat, mult, turnsLeft: turns });
  return { logText: `${label || 'Эффект'}: ${stat} ×${mult} на ${turns} х.` };
}

/** Временный щит — снижает входящий урон на percent (0..1) следующие turns
 * ходов. Реализован как statmod по "incomingDamageMult", читается тем же
 * местом движка, что и остальные statmod. */
function shield(target, { percent, turns, label }) {
  target.periodic = target.periodic || [];
  target.periodic.push({ type: 'statmod', stat: 'incomingDamageMult', mult: 1 - percent, turnsLeft: turns });
  return { logText: `${label || 'Щит'}: -${Math.round(percent * 100)}% урона на ${turns} х.` };
}

/** Разовый бонус к следующей атаке (не periodic — читается один раз перед
 * следующим броском урона и сразу удаляется вызывающим кодом). */
function nextHitBonus(target, { mult, label }) {
  target.pendingHitMult = mult;
  return { logText: `${label || 'Заряд атаки'}: следующий удар ×${mult}.` };
}

/** При срабатывании (обычно onDeath) наносит урон противнику от текущего
 * оставшегося HP владельца — самоподрыв/последний приказ. */
function selfDestruct(owner, defender, { percentOfOwnerMaxHp, label }) {
  const dmg = Math.round((owner.hpMax || owner.hp) * percentOfOwnerMaxHp);
  defender.hp = Math.max(0, defender.hp - dmg);
  return { logText: `${label || 'Самоподрыв'}: ${dmg} урона по площади.` };
}

/** Полный отказ действий цели на N ходов (оглушение/сбой прицела) —
 * тоже через statmod: и accuracy, и dodge обнуляются. */
function disable(target, { turns, label }) {
  target.periodic = target.periodic || [];
  target.periodic.push({ type: 'statmod', stat: 'disabled', mult: 0, turnsLeft: turns });
  return { logText: `${label || 'Сбой систем'}: цель пропускает действие ${turns} х.` };
}

module.exports = { dot, hot, statmod, shield, nextHitBonus, selfDestruct, disable };
