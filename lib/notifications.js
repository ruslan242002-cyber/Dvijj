'use strict';

/**
 * ЛИЧНЫЕ УВЕДОМЛЕНИЯ — в отличие от lib/world-feed.js (публичная лента,
 * которую все читают сами), это то, что прилетает КОНКРЕТНОМУ игроку:
 * «на тебя напали», «гильдия получила апгрейд», «твоя доля награды с
 * босса начислена», «торговый ордер исполнен».
 *
 * Два независимых канала одновременно:
 * 1. PUSH — сразу пытаемся отправить сообщение через VK (deps.vk.
 *    sendMessage), тот же метод, что уже используется в
 *    lib/broadcast.js и рассылке о жиле в vk/webhook-handler.js. Не
 *    ждём и не блокируем ничего — fire-and-forget, тихо глотаем ошибку
 *    (VK мог заблокировать бота у этого конкретного пользователя,
 *    сообщения могут ограничиваться по частоте и т.п.).
 * 2. ИНБОКС — то же уведомление ещё и складывается в Redis-список на
 *    игрока (с TTL), чтобы даже если push не дошёл (или у игрока
 *    ограничены сообщения от сообществ в VK), он мог увидеть его в
 *    игре сам, зайдя в «📬 Уведомления» на хабе станции.
 *
 * Награды офлайн-игрокам (например доля с мирового босса) УЖЕ
 * начисляются напрямую в их сохранённое состояние (см. game/scenes/
 * boss.js/raid.js: deps.store.get/set для не-текущего playerId) —
 * уведомление здесь не заменяет это начисление, а просто сообщает о
 * нём человеку, который в момент события был не в игре.
 */

const INBOX_KEY_PREFIX = 'player:';
const INBOX_KEY_SUFFIX = ':notifications';
const MAX_INBOX_ENTRIES = 30;
const INBOX_TTL_SECONDS = 14 * 24 * 60 * 60; // 2 недели — дольше смысла нет, инбокс не архив

function inboxKey(playerId) {
  return `${INBOX_KEY_PREFIX}${playerId}${INBOX_KEY_SUFFIX}`;
}

/** Пытается отправить push прямо сейчас. Никогда не бросает — ошибка
 *  доставки не должна ронять код, который её вызвал (награда/бой/etc). */
async function pushNow(deps, playerId, text, buttons = []) {
  if (!deps.vk || typeof deps.vk.sendMessage !== 'function') return false;
  try {
    await deps.vk.sendMessage(playerId, text, buttons, null);
    return true;
  } catch (err) {
    return false;
  }
}

/** Кладёт уведомление в постоянный инбокс игрока (Redis-список, LTRIM
 *  держит только последние MAX_INBOX_ENTRIES, TTL освежается при каждой
 *  записи). Тихо не падает без deps.redis. */
async function queueToInbox(deps, playerId, text) {
  if (!deps.redis) return;
  try {
    const key = inboxKey(playerId);
    const entry = JSON.stringify({ text, ts: Date.now() });
    await deps.redis.lpush(key, entry);
    await deps.redis.ltrim(key, 0, MAX_INBOX_ENTRIES - 1);
    await deps.redis.expire(key, INBOX_TTL_SECONDS);
  } catch (err) {
    // намеренно проглатываем — см. общий принцип в lib/economy-audit.js
  }
}

/** Основная функция — и push, и инбокс разом. Использовать её, а не
 *  pushNow/queueToInbox по отдельности, если явно не нужно только одно
 *  из двух. */
async function notifyPlayer(deps, playerId, text, buttons = []) {
  await Promise.allSettled([pushNow(deps, playerId, text, buttons), queueToInbox(deps, playerId, text)]);
}

/** Уведомить всех участников гильдии разом (например при апгрейде,
 *  победе над мировым боссом гильдией и т.п.) — memberIds передаётся
 *  явно вызывающим кодом (guild-engine.js уже умеет получать состав
 *  гильдии через store), эта функция не знает о гильдиях напрямую,
 *  просто рассылает по списку id. excludePlayerId — чтобы не слать
 *  уведомление тому, кто сам только что совершил действие и уже видит
 *  результат в основном ответе. */
async function notifyGuildMembers(deps, memberIds, text, excludePlayerId = null) {
  const targets = memberIds.filter((id) => id !== excludePlayerId);
  await Promise.allSettled(targets.map((id) => notifyPlayer(deps, id, text)));
}

/** Последние N уведомлений из инбокса, новые первыми. */
async function getInbox(deps, playerId, limit = 20) {
  if (!deps.redis) return [];
  try {
    const raw = await deps.redis.lrange(inboxKey(playerId), 0, limit - 1);
    return raw.map((r) => JSON.parse(r));
  } catch (err) {
    return [];
  }
}

async function clearInbox(deps, playerId) {
  if (!deps.redis) return;
  try {
    await deps.redis.del(inboxKey(playerId));
  } catch (err) {
    // тихо
  }
}

module.exports = { notifyPlayer, notifyGuildMembers, getInbox, clearInbox, pushNow, queueToInbox, MAX_INBOX_ENTRIES };
