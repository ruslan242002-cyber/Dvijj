'use strict';

/**
 * ГРУППОВОЙ БОЙ С БОССОМ ЖИЛЫ — отдельный движок, не переиспользует ни
 * обычный 1v1 combat-engine.js, ни корабельный бой. Порядок хода
 * зафиксирован ещё в design-notes.md: сначала действие делают ВСЕ
 * участники команды этого босса (каждый по одному разу за раунд), и
 * только когда все сходили — босс делает свой единственный ход.
 *
 * Раунд хранит, кто уже сходил (readyPlayerIds) — как только это
 * множество покрывает всех живых участников команды, раунд разрешается
 * разом: применяется весь накопленный урон по боссу, затем босс бьёт.
 */

const { resolveTurn } = require('./combat-engine.js');

function createBossRound(participantIds) {
  return {
    pendingActions: {},   // playerId -> { skill, rng-seed или просто заранее посчитанный результат }
    actedPlayerIds: [],
  };
}

/** Регистрирует действие одного игрока в текущем раунде — просто копит,
 * ничего не резолвит, пока не сходят все. */
function submitPlayerAction(round, playerId, action) {
  if (round.actedPlayerIds.includes(playerId)) return round; // уже сходил в этом раунде
  round.pendingActions[playerId] = action;
  round.actedPlayerIds = [...round.actedPlayerIds, playerId];
  return round;
}

/** Все ли ЖИВЫЕ (не выбывшие из боя) участники команды уже сходили в
 * этом раунде — только тогда раунд можно разрешать. */
function isRoundReady(round, aliveParticipantIds) {
  return aliveParticipantIds.every((id) => round.actedPlayerIds.includes(id));
}

/**
 * Разрешает целый раунд разом: применяет действие каждого игрока к боссу
 * по очереди (порядок внутри раунда — по aliveParticipantIds, детерминирован
 * вызывающим кодом), затем, если босс ещё жив, наносит один ответный удар
 * — случайно по одному из живых участников (простая и предсказуемая
 * механика, легко заменить на "по нанёсшему больше всего урона" при
 * необходимости).
 *
 * fighters — { [playerId]: fighterObject } текущие боевые статы каждого
 * участника (уже адаптированные под combat-engine.js форму).
 * boss — { hp, hpMax, stats, ... } тоже в форме Fighter.
 */
function resolveBossRound(round, aliveParticipantIds, fighters, boss, rng) {
  const log = [];
  let bossHp = boss.hp;
  const updatedFighters = { ...fighters };

  for (const playerId of aliveParticipantIds) {
    if (bossHp <= 0) break;
    const action = round.pendingActions[playerId];
    const attacker = updatedFighters[playerId];
    const bossFighter = { ...boss, hp: bossHp };
    const result = resolveTurn({ attacker, defender: bossFighter, skill: action?.skill || null, rng });
    updatedFighters[playerId] = result.attacker;
    bossHp = result.defender.hp;
    log.push(...result.log);
  }

  const bossDefeated = bossHp <= 0;
  let bossCounterattackTargetId = null;

  if (!bossDefeated) {
    // Ответный ход босса — по случайному живому участнику (после того как
    // все успели сходить в этом раунде).
    const targets = aliveParticipantIds.filter((id) => updatedFighters[id].hp > 0);
    if (targets.length) {
      bossCounterattackTargetId = targets[Math.floor(rng() * targets.length)];
      const bossFighter = { ...boss, hp: bossHp };
      const result = resolveTurn({ attacker: bossFighter, defender: updatedFighters[bossCounterattackTargetId], skill: boss.skill || null, rng });
      updatedFighters[bossCounterattackTargetId] = result.defender;
      log.push(...result.log);
    }
  }

  return {
    log,
    fighters: updatedFighters,
    bossHp: Math.max(0, bossHp),
    bossDefeated,
    bossCounterattackTargetId,
    nextRound: createBossRound(),
  };
}

module.exports = { createBossRound, submitPlayerAction, isRoundReady, resolveBossRound };
