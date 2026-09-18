'use strict';

/**
 * PVP НА ЖИЛЕ — отдельный от обычной 1v1-дуэльной системы (pvp/pvp-engine.js)
 * и от засад (lib/ambush-registry.js). Жертва реальна и актуальна прямо
 * сейчас — вызывающий код читает ТЕКУЩЕЕ состояние жертвы из основного
 * стора игроков непосредственно перед боем.
 *
 * Крадётся не весь трюм жертвы — крадётся часть её ВКЛАДА В ЭТУ
 * КОНКРЕТНУЮ ЖИЛУ (damageDealt в vein.participants).
 */
const { resolveTurn } = require('./combat-engine.js');

const STEAL_SHARE_PCT = 0.5;

function resolveVeinAttack({ attacker, defender, skill, rng }) {
  return resolveTurn({ attacker, defender, skill, rng });
}

/**
 * Переносит часть вклада жертвы победителю. Мутирует vein.participants
 * напрямую. Возвращает украденное количество.
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

module.exports = { STEAL_SHARE_PCT, resolveVeinAttack, stealVeinContribution, stealPlayerResources };

// ⚠️ ПО ПРЯМОМУ ЗАПРОСУ ПОЛЬЗОВАТЕЛЯ: stealVeinContribution (выше) крадёт
// только "вклад в жилу" — общий счётчик для дележа НАГРАДЫ ЗА ЖИЛУ В
// КОНЦЕ, не настоящие ресурсы игрока. Это ОТДЕЛЬНАЯ, новая механика —
// честная передача ЧАСТИ реального инвентаря побеждённого победителю,
// то самое "PvP приносит ресурсы", а не абстрактный счётчик.
const RESOURCE_STEAL_PCT = 0.3;

/** Забирает RESOURCE_STEAL_PCT (округление вниз, минимум 1 при наличии
 * стака) от каждого ресурса victim.inventory и добавляет winner'у.
 * Мутирует ОБА объекта на месте (inventory-массивы) — вызывающий код
 * отвечает за сохранение обоих в сторе (victim обычно берётся СВЕЖИМ
 * из deps.store, не из устаревшего снепшота боя). Возвращает список
 * {resource, tier, qty} украденного — для текста победы. */
function stealPlayerResources(winner, victim, pct = RESOURCE_STEAL_PCT) {
  winner.inventory = winner.inventory || [];
  victim.inventory = victim.inventory || [];
  const stolenItems = [];

  for (const item of victim.inventory) {
    const stolenQty = Math.min(item.qty, Math.max(1, Math.floor(item.qty * pct)));
    if (stolenQty <= 0) continue;
    item.qty -= stolenQty;

    const existing = winner.inventory.find((i) => i.resource === item.resource && i.tier === item.tier);
    if (existing) existing.qty += stolenQty;
    else winner.inventory.push({ resource: item.resource, tier: item.tier, qty: stolenQty });

    stolenItems.push({ resource: item.resource, tier: item.tier, qty: stolenQty });
  }
  victim.inventory = victim.inventory.filter((i) => i.qty > 0);

  return stolenItems;
}
