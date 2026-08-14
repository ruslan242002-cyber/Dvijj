/**
 * engine/enemy-skills/enemy-ai.js
 *
 * Выбор действия врага на его ходу. Использование в game/router.js на
 * ходу врага, ДО вызова resolveTurn:
 *
 *   const { pickEnemyAction } = require('../engine/enemy-skills/enemy-ai.js');
 *   const action = pickEnemyAction(state.enemy, state.enemyCooldowns || {}, rng);
 *   if (action.type === 'skill') {
 *     const result = action.skill.run(state.enemy, player, rng);
 *     state.enemyCooldowns = { ...(state.enemyCooldowns || {}), [action.skill.id]: action.skill.cooldown };
 *     // затем всё равно можно продолжить обычным resolveTurn для базовой атаки в тот же ход,
 *     // либо считать это отдельным действием — зависит от вашего темпа боя.
 *   } else {
 *     // обычная атака — как сейчас, через resolveTurn
 *   }
 *
 * Кулдауны храните в state (в той же переменной, что и весь бой), а не в
 * enemy.skills — они per-бой, а не per-моб.
 */
'use strict';

/**
 * @param {object} enemy — Fighter с полем enemy.skillIds/enemy.skills
 * @param {object} cooldowns — { [skillId]: ходов_до_готовности }, мутируется вызывающим кодом
 * @param {function} rng
 * @returns {{ type: 'skill', skill: object } | { type: 'basicAttack' }}
 */
function pickEnemyAction(enemy, cooldowns, rng = Math.random) {
  const skills = enemy.skills || [];
  if (!skills.length) return { type: 'basicAttack' };

  const hpFrac = enemy.hp / (enemy.hpMax || enemy.hp || 1);
  const usable = skills.filter((s) => {
    if ((cooldowns[s.id] || 0) > 0) return false;
    if (s.trigger === 'always') return true;
    const m = /^hpBelow:([\d.]+)$/.exec(s.trigger || '');
    if (m) return hpFrac < Number(m[1]);
    return false;
  });
  if (!usable.length) return { type: 'basicAttack' };

  // hp-триггерные ("паника"/самоподрыв) — приоритет над обычными "always",
  // иначе моб может никогда не дожить до применения коронного приёма.
  const urgent = usable.filter((s) => /^hpBelow:/.test(s.trigger || ''));
  const pool = urgent.length ? urgent : usable;
  const skill = pool[Math.floor(rng() * pool.length)];
  return { type: 'skill', skill };
}

/** Списывает кулдауны в конце хода — вызывать один раз за ход, для обеих сторон боя. */
function tickCooldowns(cooldowns) {
  const next = {};
  for (const [id, left] of Object.entries(cooldowns || {})) {
    if (left > 1) next[id] = left - 1;
  }
  return next;
}

/**
 * Запасной путь, если менять combat-engine.js под periodic.type==='statmod'
 * не хочется прямо сейчас — применяет активные statmod-эффекты цели как
 * временные множители статов ПЕРЕД броском попадания/урона, на стороне
 * вызывающего кода (game/router.js), не трогая сам движок.
 *
 * Пример использования перед вызовом resolveTurn:
 *   const modifiedAttacker = applyStatmodsBeforeRoll(attacker);
 *   const modifiedDefender = applyStatmodsBeforeRoll(defender);
 *   const result = resolveTurn({ attacker: modifiedAttacker, defender: modifiedDefender, ... });
 *
 * Возвращает НОВЫЙ объект (не мутирует fighter) — стат-поля статистически
 * умножены на произведение всех активных statmod того же stat.
 */
function applyStatmodsBeforeRoll(fighter) {
  const periodic = fighter.periodic || [];
  const statmods = periodic.filter((p) => p.type === 'statmod' && p.turnsLeft > 0);
  if (!statmods.length) return fighter;

  const clone = { ...fighter, stats: { ...(fighter.stats || {}) } };
  for (const mod of statmods) {
    if (mod.stat === 'disabled') {
      clone.disabled = true;
      continue;
    }
    if (mod.stat === 'incomingDamageMult') {
      clone.incomingDamageMult = (clone.incomingDamageMult ?? 1) * mod.mult;
      continue;
    }
    // accuracy/dodge/focus/reaction и т.п. — прямые поля бойца, не stats{}
    if (mod.stat in clone) {
      clone[mod.stat] = clone[mod.stat] * mod.mult;
    } else if (mod.stat in clone.stats) {
      clone.stats[mod.stat] = clone.stats[mod.stat] * mod.mult;
    }
  }
  return clone;
}

module.exports = { pickEnemyAction, tickCooldowns, applyStatmodsBeforeRoll };
