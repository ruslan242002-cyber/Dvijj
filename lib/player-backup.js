'use strict';

/**
 * БЭКАП/ВОССТАНОВЛЕНИЕ ИГРОКА — история проекта уже показала цену
 * отсутствия этого: баг с перепутанными местами lib/housing.js и
 * game/scenes/housing.js несколько раз ронял прод, а откатить состояние
 * конкретного игрока после испорченного сохранения было нечем. Не
 * претендую на полноценную систему версионирования — это простой
 * "один шаг назад": перед КАЖДЫМ перезаписыванием состояния игрока
 * предыдущая версия копируется в отдельный ключ с TTL. Если новое
 * сохранение окажется испорченным (баг в коде, оборванный запрос
 * посреди записи, что угодно) — есть куда откатиться руками.
 *
 * НЕ пытается быть автоматическим — восстановление всегда явное
 * действие (вызывается вручную или через админ-команду), никогда не
 * происходит само по себе при следующем шаге игрока. Автоматический
 * откат без участия человека рискует откатить ЛЕГИТИМНОЕ изменение
 * (например если баг воспроизводится не при записи, а при следующем
 * чтении) и создать ещё больше путаницы, чем решить.
 *
 * ИНТЕГРАЦИЯ — вызывать backupPlayerState(deps, playerId, currentState)
 * ПЕРЕД deps.store.set(playerId, newState) в основном пути сохранения
 * (там, где сейчас происходит запись состояния после каждого step()
 * router.js — вероятно vk/webhook-handler.js или сам store-модуль).
 * currentState — то, что было ДО этого шага (старая версия), не новая.
 */

const BACKUP_TTL_SECONDS = 7 * 24 * 60 * 60; // неделя — достаточно, чтобы заметить проблему и откатить, не бесконечный архив

function backupKey(playerId) {
  return `player:${playerId}:backup`;
}

/**
 * Сохраняет currentState как бэкап ПЕРЕД тем, как он будет перезаписан
 * новым состоянием. Тихо не падает при ошибке Redis — бэкап вторичен
 * по отношению к самому сохранению игрока (тот же принцип, что и в
 * lib/economy-audit.js: диагностика не должна блокировать игру).
 */
async function backupPlayerState(deps, playerId, currentState) {
  if (!deps || !deps.redis || !currentState) return false;
  try {
    await deps.redis.set(backupKey(playerId), JSON.stringify({ state: currentState, backedUpAt: Date.now() }), { ex: BACKUP_TTL_SECONDS });
    return true;
  } catch (err) {
    return false;
  }
}

/** Возвращает { state, backedUpAt } последнего бэкапа или null, если
 *  бэкапа нет (новый игрок, TTL истёк, или Redis недоступен). */
async function getPlayerBackup(deps, playerId) {
  if (!deps || !deps.redis) return null;
  try {
    const raw = await deps.redis.get(backupKey(playerId));
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

/**
 * Откатывает игрока к последнему бэкапу — ЯВНОЕ действие (см. пояснение
 * в шапке файла), должно вызываться только вручную (например, админ-
 * командой в ответ на жалобу игрока), никогда автоматически.
 * Записывает откаченное состояние туда же, где обычно живёт состояние
 * игрока (deps.store), НЕ трогает сам бэкап-ключ — можно откатить ещё
 * раз, если первый откат тоже оказался неудачным.
 */
async function restorePlayerFromBackup(deps, playerId) {
  const backup = await getPlayerBackup(deps, playerId);
  if (!backup) return { success: false, reason: 'NO_BACKUP' };
  if (!deps.store || typeof deps.store.set !== 'function') return { success: false, reason: 'NO_STORE' };
  await deps.store.set(playerId, backup.state);
  return { success: true, restoredFrom: backup.backedUpAt };
}

module.exports = { backupPlayerState, getPlayerBackup, restorePlayerFromBackup, BACKUP_TTL_SECONDS };
