'use strict';

const { resolveTurn } = require('../engine/combat-engine');
const { PVP_LIMITS, PVP_ERRORS } = require('./pvp-data');

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
    winner: null,
    createdAt: Date.now(),
  };

  await store.saveDuel(duel);
  await store.setActiveDuelId(challenger.id, duel.id);
  await store.setActiveDuelId(targetPlayer.id, duel.id);

  return duel;
}

async function getDuel(deps, duelId) {
  return deps.store.getDuel(duelId);
}

async function submitTurn(deps, playerId, duelId, { skillId = null, stimId = null } = {}, SKILLS = {}, STIMS = {}, rng = Math.random) {
  const { store } = deps;

  const applyFn = (duel) => {
    if (duel.status === 'finished') throw new PvpError(PVP_ERRORS.DUEL_FINISHED);

    const side = duel.fighterA.id === playerId ? 'A' : duel.fighterB.id === playerId ? 'B' : null;
    if (!side) throw new PvpError(PVP_ERRORS.DUEL_NOT_FOUND);
    if (duel.turnOf !== side) throw new PvpError(PVP_ERRORS.NOT_YOUR_TURN);

    const attacker = side === 'A' ? duel.fighterA : duel.fighterB;
    const defender = side === 'A' ? duel.fighterB : duel.fighterA;

    const skill = skillId ? SKILLS[skillId] : null;
    if (skillId && !skill) throw new PvpError(PVP_ERRORS.UNKNOWN_SKILL);
    const stim = stimId ? STIMS[stimId] : null;

    const result = resolveTurn({ attacker, defender, skill, stim, rng });
    duel.log.push(...result.log);

    if (result.finished) {
      duel.status = 'finished';
      duel.winner = result.winner === 'attacker' ? side : side === 'A' ? 'B' : 'A';
    } else {
      duel.turnOf = side === 'A' ? 'B' : 'A';
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

module.exports = { PvpError, createDuel, getDuel, submitTurn, snapshotFighter, winnerReward };
