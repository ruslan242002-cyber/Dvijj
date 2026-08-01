'use strict';

/**
 * ПАТРУЛЬ ПРИГРАНИЧНОЙ ЗОНЫ — наказание за PvP слишком близко к городу
 * (см. лор-документ §7). Города не воюют напрямую, но пространство рядом
 * с ними патрулируется: первое нарушение — предупреждение, дальнейшие —
 * штраф на 10 "тиков" вылазок/полёта. Открытый космос (дальше PATROL_
 * RADIUS_TICKS от любого города) вне зоны действия этого модуля вообще —
 * там PvP без каких-либо последствий, ровно как в лоре.
 *
 * Хранится на player.borderPatrol = { violations, penaltyTicksLeft,
 * lastViolationAt } — не общее состояние, каждый игрок отвечает только
 * за свои нарушения.
 */

const PATROL_RADIUS_TICKS = 3;          // "слишком близко к городу" — первые 3 тика дистанции
const PENALTY_DURATION_TICKS = 10;      // длительность штрафа — 10 тиков
const VIOLATION_RESET_MS = 6 * 60 * 60 * 1000; // 6 часов без нарушений — счётчик сбрасывается

/** Достаточно ли близко к городу это PvP-столкновение, чтобы вообще
 * считаться нарушением (а не честным боем в открытом космосе). */
function isNearCity(distance) {
  return distance <= PATROL_RADIUS_TICKS;
}

function freshBorderPatrolState() {
  return { violations: 0, penaltyTicksLeft: 0, lastViolationAt: 0 };
}

/** Есть ли у игрока прямо сейчас активный штраф (действующий дебаф). */
function isPenalized(player) {
  return !!(player.borderPatrol && player.borderPatrol.penaltyTicksLeft > 0);
}

/** Вызывать РОВНО один раз за каждый "тик" вылазки/полёта, пока штраф
 * активен — снижает оставшийся срок на 1. Не мутирует, если штрафа нет. */
function tickPenalty(player) {
  if (!isPenalized(player)) return player;
  player.borderPatrol.penaltyTicksLeft -= 1;
  return player;
}

/**
 * Регистрирует PvP-столкновение рядом с городом (вызывать ТОЛЬКО когда
 * isNearCity(distance) уже истинно — сам модуль дистанцию не проверяет,
 * это ответственность вызывающего кода). Первое нарушение — только
 * предупреждение; второе и далее подряд (без сброса за давностью) —
 * штраф. Возвращает { warned, penalized, violations } для текста ответа.
 */
function registerViolation(player, now = Date.now()) {
  player.borderPatrol = player.borderPatrol || freshBorderPatrolState();
  const bp = player.borderPatrol;

  // Достаточно давно не нарушал — считаем "с чистого листа".
  if (bp.lastViolationAt && now - bp.lastViolationAt > VIOLATION_RESET_MS) {
    bp.violations = 0;
  }

  bp.violations += 1;
  bp.lastViolationAt = now;

  if (bp.violations === 1) {
    return { warned: true, penalized: false, violations: bp.violations };
  }

  bp.penaltyTicksLeft = PENALTY_DURATION_TICKS;
  return { warned: false, penalized: true, violations: bp.violations };
}

module.exports = {
  PATROL_RADIUS_TICKS, PENALTY_DURATION_TICKS, VIOLATION_RESET_MS,
  isNearCity, freshBorderPatrolState, isPenalized, tickPenalty, registerViolation,
};
