'use strict';

const { createDuel, PvpError } = require('./pvp-engine');
const { PVP_ERRORS } = require('./pvp-data');

/*
 * "Случайная встреча с равным противником" — очередь ожидания вместо
 * ручного вызова конкретного игрока. Кто первым войдёт в очередь без
 * подходящей пары — ждёт (в вебхук-модели это значит: висит в очереди,
 * пока кто-то ещё не зайдёт и не совпадёт по силе; уведомление о матче
 * шлётся тем же пушем, что и "твой ход" в pvp-engine.js).
 *
 * Игрок в очереди хранится уже как ЗАМОРОЖЕННЫЙ снимок (snapshotFighter-
 * совместимый объект), а не ссылка на живого player — если соперник нашёлся
 * не сразу, а через час, дуэль всё равно стартует с честными статами на
 * момент входа в очередь, а не с тем, что у него сейчас в профиле.
 */

const POWER_TOLERANCE = 25; // допустимая разница "силы" — всё ещё считается равным противником

function computePower(player) {
  const s = player.stats || {};
  return (player.level || 1) * 10 + (s.power || 0) + (s.mind || 0) + (s.reaction || 0) + (s.endurance || 0) + (s.firepower || 0) + (s.shielding || 0);
}

function snapshotForQueue(player) {
  return {
    id: player.id,
    name: player.name,
    hp: player.hp,
    hpMax: player.hpMax,
    stats: { ...player.stats },
    luck: player.luck,
    accuracy: player.accuracy,
    dodge: player.dodge,
    focus: player.focus,
    periodic: [],
    equippedSkills: [...(player.equippedSkills || [])],
    power: computePower(player),
    joinedAt: Date.now(),
  };
}

/** Ищет в очереди ближайшего по силе кандидата в пределах допуска.
 * Чистая функция над массивом — используется и в реальном сторе (внутри
 * атомарного обновления очереди), и в тестах напрямую. */
function pickOpponent(queue, myEntry) {
  let bestIdx = -1;
  let bestDiff = Infinity;
  queue.forEach((entry, idx) => {
    if (entry.id === myEntry.id) return;
    const diff = Math.abs(entry.power - myEntry.power);
    if (diff <= POWER_TOLERANCE && diff < bestDiff) {
      bestDiff = diff;
      bestIdx = idx;
    }
  });
  if (bestIdx === -1) return { matchedEntry: null, queue: [...queue, myEntry] };
  const matchedEntry = queue[bestIdx];
  const restQueue = queue.filter((_, i) => i !== bestIdx);
  return { matchedEntry, queue: restQueue };
}

/**
 * Найти случайного соперника близкой силы. Если подходящий уже ждёт в
 * очереди — дуэль создаётся сразу (matched: true). Если нет — игрок сам
 * встаёт в очередь (matched: false, queued: true).
 */
async function findRandomOpponent(deps, player) {
  const { store } = deps;

  if (await store.getActiveDuelId(player.id)) {
    throw new PvpError(PVP_ERRORS.ALREADY_IN_DUEL);
  }

  const myEntry = snapshotForQueue(player);
  const { matchedEntry } = await store.matchmakeAtomic(myEntry, (queue) => pickOpponent(queue, myEntry));

  if (!matchedEntry) {
    return { matched: false, queued: true };
  }

  // matchedEntry дольше ждал в очереди — ему первый ход. Раньше первым
  // ходил тот, кто СЕЙЧАС нажал "искать соперника" (myEntry) — это
  // позволяло фармить бесплатный первый удар спамом поиска по тем, кто
  // уже терпеливо ждал в очереди и не в курсе, что матч только что
  // случился. Теперь наоборот: тот, кто ждал — получает первый ход,
  // а свежий инициатор поиска ждёт ответа.
  const duel = await createDuel(deps, matchedEntry, myEntry);
  return { matched: true, duel };
}

/** Выйти из очереди, если соперник так и не нашёлся и игрок передумал. */
async function leaveQueue(deps, playerId) {
  return deps.store.removeFromQueue(playerId);
}

module.exports = { findRandomOpponent, leaveQueue, computePower, pickOpponent, POWER_TOLERANCE };
