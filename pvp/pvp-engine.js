'use strict';

const { resolveTurn } = require('../engine/combat-engine');
const { PVP_LIMITS, PVP_ERRORS } = require('./pvp-data');

const { TURN_TIMEOUT_MS, MAX_MISSED_TURNS } = PVP_LIMITS;

/*
 * Архитектурная заметка:
 *
 * VK Callback API — вебхук, не постоянное соединение. Оба игрока физически
 * не могут "стоять в бою" одновременно, как в PvE (там ход противника
 * считает сервер сразу же, потому что противник — ИИ). Значит, честный PvP
 * тут может быть только АСИНХРОННЫМ, по переписке: игрок A делает ход →
 * состояние дуэли сохраняется в общем (не per-player!) ключе → игроку B
 * приходит пуш-уведомление через vk/client.js "твой ход" → он открывает
 * бота когда может и отвечает → и так далее, пока кто-то не упадёт.
 *
 * Это ПЕРВАЯ сущность мира, которая меняет состояние ДВУХ игроков сразу,
 * похожая в этом на биржу — но здесь сам Fighter каждого игрока на момент
 * старта дуэли ЗАМОРАЖИВАЕТСЯ (snapshotFighter) в общий ключ дуэли, а не
 * читается заново из player:{id} на каждый ход. Иначе игрок мог бы качнуть
 * характеристики или сменить экипировку посреди боя.
 */

class PvpError extends Error {
  constructor(code) {
    super(code);
    this.name = 'PvpError';
    this.code = code;
  }
}

function generateDuelId() {
  return `duel_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Замороженный снимок бойца на момент старта дуэли — как объект Fighter,
 * плюс список умений, которые можно выбирать на протяжении всей дуэли. */
function snapshotFighter(player) {
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
  };
}

/** Вызвать другого игрока на дуэль. targetPlayer нужно предварительно
 * загрузить (store.loadPlayer) — эта функция сама его не ищет по имени,
 * это забота вызывающего кода (роутера). */
async function createDuel(deps, challenger, targetPlayer) {
  const { store } = deps;

  if (!targetPlayer) throw new PvpError(PVP_ERRORS.TARGET_NOT_FOUND);
  if (challenger.id === targetPlayer.id) throw new PvpError(PVP_ERRORS.CANNOT_CHALLENGE_SELF);

  if (await store.getActiveDuelId(challenger.id)) throw new PvpError(PVP_ERRORS.ALREADY_IN_DUEL);
  if (await store.getActiveDuelId(targetPlayer.id)) throw new PvpError(PVP_ERRORS.ALREADY_IN_DUEL);

  const duel = {
    id: generateDuelId(),
    fighterA: snapshotFighter(challenger),
    fighterB: snapshotFighter(targetPlayer),
    turnOf: 'A',
    log: [],
    status: 'active',
    winner: null, // 'A' | 'B' | null пока не закончена
    createdAt: Date.now(),
    turnDeadline: Date.now() + TURN_TIMEOUT_MS,
    missedTurns: { A: 0, B: 0 },
  };

  await store.saveDuel(duel);
  await store.setActiveDuelId(challenger.id, duel.id);
  await store.setActiveDuelId(targetPlayer.id, duel.id);

  return duel;
}

async function getDuel(deps, duelId) {
  return deps.store.getDuel(duelId);
}

/**
 * Проверка таймаута хода — ЧИСТАЯ функция (не пишет в стор), безопасна для
 * повторных вызовов внутри CAS-ретраев updateDuelAtomic. Если срок хода
 * (turnDeadline) ещё не истёк — возвращает дуэль как есть, без изменений
 * (тот же объект, чтобы JSON.stringify давал идентичную строку и CAS не
 * делал лишней записи). Если истёк — считает это пропуском хода той
 * стороны, чей был ход: сбрасывает счётчик пропусков соперника (раз он
 * наконец получит ход) и либо передаёт ход дальше с новым дедлайном, либо,
 * если это уже MAX_MISSED_TURNS пропуск подряд, завершает дуэль
 * автопоражением пропустившей стороны.
 */
function checkTurnTimeout(duel, now = Date.now()) {
  if (duel.status === 'finished') return duel;
  if (!duel.turnDeadline || now <= duel.turnDeadline) return duel;

  const side = duel.turnOf;
  const otherSide = side === 'A' ? 'B' : 'A';
  const missed = { ...(duel.missedTurns || { A: 0, B: 0 }) };
  missed[side] = (missed[side] || 0) + 1;
  // ВАЖНО: не трогаем missed[otherSide] здесь — сброс своего счётчика
  // пропусков должен происходить только через настоящий успешный ход
  // (см. submitTurn), а не просто потому что подошла их очередь ходить.
  // Иначе при обоюдном забросе дуэли (оба пропали) счётчики бесконечно
  // пинг-понговали бы 1↔0↔1↔0, ни разу не доходя до автопоражения.

  const sideName = side === 'A' ? duel.fighterA.name : duel.fighterB.name;

  if (missed[side] >= MAX_MISSED_TURNS) {
    return {
      ...duel,
      missedTurns: missed,
      status: 'finished',
      winner: otherSide,
      log: [...duel.log, `${sideName} пропустил ${MAX_MISSED_TURNS}-й ход подряд — поражение по таймауту.`],
    };
  }

  return {
    ...duel,
    missedTurns: missed,
    turnOf: otherSide,
    turnDeadline: now + TURN_TIMEOUT_MS,
    log: [...duel.log, `${sideName} не успел сходить за отведённое время (пропуск ${missed[side]}/${MAX_MISSED_TURNS}) — ход переходит к сопернику.`],
  };
}

/** Заглянуть в дуэль (кнопка "Дуэль"/"Обновить") — в отличие от простого
 * getDuel, проводит эту проверку через атомарное обновление стора, так что
 * если срок хода истёк ИМЕННО в момент просмотра, это фиксируется сразу
 * (счётчик пропусков и возможное автопоражение), а не только при попытке
 * реально сходить. */
async function peekDuel(deps, duelId) {
  return deps.store.updateDuelAtomic(duelId, (duel) => checkTurnTimeout(duel));
}

/**
 * Один ход одного из бойцов. Сторону (A/B) определяем по playerId
 * относительно duel.fighterA.id/fighterB.id — не полагаемся на то, что
 * клиент сам скажет, за кого он играет.
 *
 * SKILLS/STIMS передаются явно (а не импортируются здесь), чтобы движок
 * не тянул на себя знание о конкретных данных умений — ровно как в
 * combat-engine.js.
 */
async function submitTurn(deps, playerId, duelId, { skillId = null, stimId = null } = {}, SKILLS = {}, STIMS = {}, rng = Math.random) {
  const { store } = deps;

  const applyFn = (duelRaw) => {
    const wasFinishedBefore = duelRaw.status === 'finished';
    const duel = checkTurnTimeout(duelRaw);

    if (duel.status === 'finished') {
      if (wasFinishedBefore) throw new PvpError(PVP_ERRORS.DUEL_FINISHED);
      // Дуэль только что завершилась автопоражением по таймеру — отдаём
      // этот результат как есть, попытка сходить, которая это обнаружила,
      // никакого хода не совершает (соревноваться уже не с кем).
      return duel;
    }

    const side = duel.fighterA.id === playerId ? 'A' : duel.fighterB.id === playerId ? 'B' : null;
    if (!side) throw new PvpError(PVP_ERRORS.DUEL_NOT_FOUND);
    if (duel.turnOf !== side) throw new PvpError(PVP_ERRORS.NOT_YOUR_TURN);

    const attacker = side === 'A' ? duel.fighterA : duel.fighterB;
    const defender = side === 'A' ? duel.fighterB : duel.fighterA;

    const skill = skillId ? SKILLS[skillId] : null;
    if (skillId && !skill) throw new PvpError(PVP_ERRORS.UNKNOWN_SKILL);
    const stim = stimId ? STIMS[stimId] : null;

    const result = resolveTurn({ attacker, defender, skill, stim, rng, pvpMode: true });
    duel.log.push(...result.log);

    if (result.finished) {
      duel.status = 'finished';
      duel.winner = result.winner === 'attacker' ? side : side === 'A' ? 'B' : 'A';
    } else {
      duel.turnOf = side === 'A' ? 'B' : 'A';
      duel.turnDeadline = Date.now() + TURN_TIMEOUT_MS;
      // Успешный ход обнуляет СВОЙ же счётчик пропусков — "подряд" считается
      // только пока сторона не сходила вовремя ни разу между пропусками.
      duel.missedTurns = { ...(duel.missedTurns || { A: 0, B: 0 }), [side]: 0 };
    }

    return duel;
  };

  const duel = await store.updateDuelAtomic(duelId, applyFn);

  if (duel.status === 'finished') {
    await store.clearActiveDuelId(duel.fighterA.id);
    await store.clearActiveDuelId(duel.fighterB.id);
  }

  return duel;
}

function winnerReward() {
  return { reputation: PVP_LIMITS.WINNER_REPUTATION, credits: PVP_LIMITS.WINNER_CREDITS };
}

module.exports = { PvpError, createDuel, getDuel, peekDuel, checkTurnTimeout, submitTurn, snapshotFighter, winnerReward };
