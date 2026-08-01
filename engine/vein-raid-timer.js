'use strict';

/**
 * НАБЕГИ МОНСТРОВ НА ЖИЛЕ — "каждые несколько минут" реализовано тем же
 * ленивым приёмом, что уже используется у PvP-таймера хода (peekDuel) и
 * резонансного шторма: никакого фонового процесса (Vercel serverless его
 * и не может иметь) — просто при КАЖДОМ обращении к жиле сверяем, сколько
 * времени прошло с последнего набега, и если хватает — кидаем монстра
 * прямо сейчас, а не по расписанию.
 *
 * В отличие от шторма (чистая функция от времени, без стора) здесь нужно
 * ПОМНИТЬ момент последнего набега — храним прямо на самой жиле
 * (vein.lastMonsterRaidAt), она и так уже целиком живёт в общем сторе.
 */

const RAID_INTERVAL_MS = 4 * 60 * 1000; // "каждые несколько минут" — 4 минуты

function shouldTriggerRaid(vein, now = Date.now()) {
  const last = vein.lastMonsterRaidAt || vein.createdAt || now;
  return now - last >= RAID_INTERVAL_MS;
}

function markRaidTriggered(vein, now = Date.now()) {
  vein.lastMonsterRaidAt = now;
  return vein;
}

/** Сколько миллисекунд осталось до следующего возможного набега — для
 * текста статуса жилы, не для логики (логика всегда через shouldTriggerRaid). */
function raidTimeRemainingMs(vein, now = Date.now()) {
  const last = vein.lastMonsterRaidAt || vein.createdAt || now;
  return Math.max(0, RAID_INTERVAL_MS - (now - last));
}

module.exports = { RAID_INTERVAL_MS, shouldTriggerRaid, markRaidTriggered, raidTimeRemainingMs };
