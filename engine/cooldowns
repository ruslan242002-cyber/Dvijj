'use strict';

/**
 * ПЕРЕЗАРЯДКА УМЕНИЙ — раньше поле `cd` в engine/skills-data.js существовало,
 * но нигде не проверялось: умение можно было использовать хоть каждый ход.
 * Теперь Интеллект (mind) реально сокращает cd (см. engine/derived-stats.js:
 * cooldownReductionPct), и после применения умение действительно недоступно
 * N ходов.
 *
 * Живёт на СОСТОЯНИИ БОЯ (state.skillCooldowns), не на player — считаем,
 * что каждая новая схватка начинается с чистыми перезарядками. Так проще
 * и куда понятнее игроку, чем тащить "недогретые" кулдауны между разными
 * встречами через полигон станции.
 */

function effectiveCooldown(skill, cooldownReductionPct = 0) {
  const cd = skill.cd || 0;
  if (cd <= 0) return 0;
  return Math.max(1, Math.round(cd * (1 - cooldownReductionPct)));
}

function isOnCooldown(cooldowns, skillId) {
  return !!(cooldowns && cooldowns[skillId] > 0);
}

function turnsRemaining(cooldowns, skillId) {
  return (cooldowns && cooldowns[skillId]) || 0;
}

/** Вызывать сразу после успешного применения умения — ставит его на
 * перезарядку согласно эффективному cd (после сокращения от Интеллекта). */
function startCooldown(cooldowns, skillId, skill, cooldownReductionPct = 0) {
  const next = { ...(cooldowns || {}) };
  const cd = effectiveCooldown(skill, cooldownReductionPct);
  if (cd > 0) next[skillId] = cd;
  return next;
}

/** Вызывать в начале каждого НОВОГО хода игрока (до показа кнопок выбора
 * действия) — снижает все активные перезарядки на 1, убирает те, что дошли
 * до 0. */
function tickCooldowns(cooldowns) {
  const next = {};
  for (const [skillId, turns] of Object.entries(cooldowns || {})) {
    const remaining = turns - 1;
    if (remaining > 0) next[skillId] = remaining;
  }
  return next;
}

module.exports = { effectiveCooldown, isOnCooldown, turnsRemaining, startCooldown, tickCooldowns };
