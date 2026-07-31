'use strict';

/**
 * ЗАСАДЫ В СЕКТОРЕ — игрок может "залечь" в конкретной клетке карты
 * (той же, по которой считается дистанция полёта в engine/travel.js).
 * Пока засада активна, у ДРУГИХ игроков, пролетающих через эту клетку
 * ИЛИ соседние, повышается шанс, что случайная встреча на маршруте
 * окажется PvP с засадчиком, а не обычной пустой/PvE встречей.
 *
 * Это ОБЩЕМИРОВОЕ состояние (как очередь матчмейкинга PvP), не
 * принадлежит одному игроку — реестр активных засад нужно хранить в
 * общем сторе (см. lib/ambush-store-upstash.js), не в player-объекте.
 * Здесь — только чистая логика, без обращений к стору.
 */

const AMBUSH_DURATION_MS = 20 * 60 * 1000; // засада активна 20 минут реального времени
const AMBUSH_CELL_PVP_CHANCE = 0.35;       // шанс сработать, если корабль в ТОЙ ЖЕ клетке
const AMBUSH_NEIGHBOR_PVP_CHANCE = 0.15;   // шанс сработать в СОСЕДНЕЙ клетке

function isAmbushActive(ambush, now = Date.now()) {
  return !!ambush && now < ambush.expiresAt;
}

function createAmbush(playerId, cellId, now = Date.now()) {
  return {
    playerId,
    cellId,
    createdAt: now,
    expiresAt: now + AMBUSH_DURATION_MS,
  };
}

/**
 * Шанс, что случайная космическая встреча в этой клетке окажется
 * PvP-засадой — с учётом всех активных засад в самой клетке и в соседних.
 * Своя же засада (playerId совпадает с проходящим игроком) не считается —
 * нельзя устроить засаду самому себе.
 */
function ambushEncounterChance(cellId, neighborCellIds, activeAmbushes, travelingPlayerId, now = Date.now()) {
  const relevant = (activeAmbushes || []).filter(
    (a) => isAmbushActive(a, now) && a.playerId !== travelingPlayerId
  );
  if (relevant.some((a) => a.cellId === cellId)) return AMBUSH_CELL_PVP_CHANCE;
  if (relevant.some((a) => (neighborCellIds || []).includes(a.cellId))) return AMBUSH_NEIGHBOR_PVP_CHANCE;
  return 0;
}

/** Если засада сработала — выбирает, чья именно (может быть несколько
 * засадчиков разом в одной клетке). Отдаёт приоритет засадам В ТОЙ ЖЕ
 * клетке над соседними — устроивший засаду прямо на пути опаснее того,
 * кто просто патрулирует по соседству. */
function pickAmbusher(cellId, neighborCellIds, activeAmbushes, travelingPlayerId, rng = Math.random, now = Date.now()) {
  const relevant = (activeAmbushes || []).filter(
    (a) => isAmbushActive(a, now) && a.playerId !== travelingPlayerId
  );
  const inCell = relevant.filter((a) => a.cellId === cellId);
  const pool = inCell.length ? inCell : relevant.filter((a) => (neighborCellIds || []).includes(a.cellId));
  if (!pool.length) return null;
  return pool[Math.floor(rng() * pool.length)];
}

module.exports = {
  AMBUSH_DURATION_MS, AMBUSH_CELL_PVP_CHANCE, AMBUSH_NEIGHBOR_PVP_CHANCE,
  isAmbushActive, createAmbush, ambushEncounterChance, pickAmbusher,
};
