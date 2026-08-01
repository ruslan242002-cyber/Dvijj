'use strict';

/**
 * PVP НА ЖИЛЕ — отдельный от обычной 1v1-дуэльной системы (pvp/pvp-engine.js)
 * и от засад (снимок корабля на момент установки, lib/ambush-registry.js).
 * Здесь ЖЕРТВА реальна и актуальна прямо сейчас — оба игрока физически
 * "на месте" жилы одновременно, поэтому нет смысла делать снимок заранее:
 * вызывающий код читает ТЕКУЩЕЕ состояние жертвы из основного стора
 * игроков (deps.store) непосредственно перед боем.
 *
 * Крадётся не весь трюм жертвы (это не открытый космос с полной потерей
 * груза, см. lib/trip-cargo.js) — крадётся часть её ВКЛАДА В ЭТУ
 * КОНКРЕТНУЮ ЖИЛУ (damageDealt в vein.participants), что напрямую
 * уменьшает её будущую долю награды при разделе (engine/resource-vein.js:
 * distributeVeinRewards теперь пропорциональна вкладу — без этого кража
 * была бы чисто косметической).
 */

const { resolveTurn } = require('./combat-engine.js');

const STEAL_SHARE_PCT = 0.5; // победитель забирает половину вклада жертвы на этой жиле

/** Один ход PvP-атаки на жиле — тонкая обёртка над обычным resolveTurn,
 * чтобы явно зафиксировать: механика боя та же самая (базовая атака или
 * умение персонажа), меняется только КТО с кем дерётся и что происходит
 * после победы. */
function resolveVeinAttack({ attacker, defender, skill, rng }) {
  return resolveTurn({ attacker, defender, skill, rng });
}

/**
 * Переносит часть вклада жертвы победителю. Мутирует vein.participants
 * напрямую (тот же объект, что живёт в сторе жилы — вызывающий код сам
 * решает, через updateVeinAtomic или как иначе это сохранить).
 * Возвращает украденное количество (для текста ответа).
 */
function stealVeinContribution(vein, winnerId, victimId) {
  const victimEntry = vein.participants[victimId];
  if (!victimEntry || victimEntry.damageDealt <= 0) return 0;

  const stolen = Math.floor(victimEntry.damageDealt * STEAL_SHARE_PCT);
  if (stolen <= 0) return 0;

  victimEntry.damageDealt -= stolen;
  vein.participants[winnerId] = vein.participants[winnerId] || { level: null, damageDealt: 0 };
  vein.participants[winnerId].damageDealt += stolen;

  return stolen;
}

module.exports = { STEAL_SHARE_PCT, resolveVeinAttack, stealVeinContribution };
