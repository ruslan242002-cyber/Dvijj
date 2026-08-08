'use strict';

/**
 * ЛЕНТА МИРА — тот самый "МИР ПЕРИФЕРИИ" из MMO-обзора: короткие
 * строки о значимых событиях, которые видны ВСЕМ игрокам, не только
 * участнику. Разница с lib/economy-audit.js: тот — диагностический
 * инструмент для разработчика (сырые числа), этот — то, что реально
 * читает игрок, чтобы почувствовать, что сервер живой прямо сейчас.
 *
 * Хранится как Redis-список (те же принципы, что и economy-audit.js:
 * LPUSH новые события первыми, LTRIM держит только последние
 * MAX_FEED_ENTRIES — вечный архив здесь не нужен, это лента "прямо
 * сейчас", не история сервера). Не блокирует основной поток при сбое
 * записи — как и everywhere в этом файле, вторичная функция никогда не
 * должна ронять первичное действие игрока.
 *
 * НЕ каждое событие попадает в общую ленту — только то, что реально
 * значимо для ДРУГИХ игроков (победа над мировым боссом, создание/рост
 * гильдии, крупная сделка, выполненный легендарный контракт). Обычный
 * бой с рядовым монстром или покупка на 50 кредитов сюда не идёт —
 * иначе лента превратится в шум и потеряет смысл.
 */

const FEED_KEY = 'world:feed';
const MAX_FEED_ENTRIES = 100;

const FEED_EVENT_ICONS = {
  world_boss_defeated: '⚔️',
  raid_boss_defeated: '🎉',
  guild_created: '🏳️',
  guild_upgrade: '🏗️',
  legendary_contract: '🏆',
  big_trade: '💰',
  trade_route_completed: '🚚',
  achievement_rare: '🏅',
};

/**
 * event — { type, actorName, text }. text — уже готовая строка на
 * русском без иконки (иконка добавляется здесь по type, единообразно).
 * Не передавай playerId/внутренние id сюда — лента публичная, показывать
 * стоит только то, что и так видно (имя игрока, а не его технический id).
 */
async function logWorldEvent(deps, event) {
  if (!deps || !deps.redis) return;
  try {
    const icon = FEED_EVENT_ICONS[event.type] || '📡';
    const entry = JSON.stringify({ type: event.type, text: `${icon} ${event.text}`, ts: Date.now() });
    await deps.redis.lpush(FEED_KEY, entry);
    await deps.redis.ltrim(FEED_KEY, 0, MAX_FEED_ENTRIES - 1);
  } catch (err) {
    // намеренно проглатываем — см. пояснение в шапке файла
  }
}

/** Последние N записей ленты, самые новые первыми. */
async function getWorldFeed(deps, limit = 20) {
  if (!deps || !deps.redis) return [];
  try {
    const raw = await deps.redis.lrange(FEED_KEY, 0, limit - 1);
    return raw.map((r) => JSON.parse(r));
  } catch (err) {
    return [];
  }
}

/** Готовый текст для показа в чате/сцене — просто склеенные строки с
 * относительным временем ("2 мин назад"), не сырой JSON. */
function formatWorldFeed(events, now = Date.now()) {
  if (!events.length) return 'Лента пока пуста — будь первым, кто в неё попадёт.';
  return events.map((e) => `${e.text} (${relativeTime(now - e.ts)})`).join('\n');
}

function relativeTime(msAgo) {
  const minutes = Math.floor(msAgo / 60000);
  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  return `${days} дн назад`;
}

module.exports = { FEED_EVENT_ICONS, logWorldEvent, getWorldFeed, formatWorldFeed, FEED_KEY, MAX_FEED_ENTRIES };
