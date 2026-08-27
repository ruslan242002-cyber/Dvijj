'use strict';

const { basicAttack, useSkill } = require('./combat-engine.js');
const { pickEnemyAction } = require('./monster-abilities.js');
const { trySurvivalMechanic, activeClassEffects } = require('./mentor-classes.js');

const ROUND_TIMEOUT_MS = 60000;
const MAX_PARTY_COMBAT_MEMBERS = 5;

function startPartyCombat(members, enemyFighter) {
  const memberState = {};
  for (const m of members) {
    memberState[m.peerId] = {
      name: m.name, row: m.row || 'front',
      hp: m.player.hp, hpMax: m.player.hpMax,
      fighterSnapshot: { ...m.player, hp: m.player.hp, hpMax: m.player.hpMax, classEffects: activeClassEffects(m.player) },
      actionThisRound: null,
      damageDealt: 0,
    };
  }
  return {
    combatId: `pcombat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    enemy: enemyFighter,
    enemyHp: enemyFighter.hp,
    enemyHpMax: enemyFighter.hpMax,
    round: 1,
    roundStartedAt: Date.now(),
    members: memberState,
    log: [],
    finished: false,
    victory: false,
  };
}

function isTimedOut(session, now = Date.now()) {
  return now - session.roundStartedAt >= ROUND_TIMEOUT_MS;
}

function allActed(session) {
  return Object.values(session.members).every((m) => m.hp <= 0 || m.actionThisRound !== null);
}

function submitAction(session, playerId, skillId) {
  const member = session.members[playerId];
  if (!member || member.hp <= 0) return { success: false, reason: 'NOT_IN_COMBAT_OR_DOWN' };
  if (member.actionThisRound !== null) return { success: false, reason: 'ALREADY_ACTED' };
  member.actionThisRound = skillId || 'basic';
  return { success: true, allActed: allActed(session), timedOut: isTimedOut(session) };
}

function resolveRound(session, skillLookup, rng = Math.random, guildDamageBonusByPlayerId = {}) {
  if (session.finished) return session;
  const roundLog = [];

  const enemyFighterTemplate = () => ({ ...session.enemy, hp: session.enemyHp, hpMax: session.enemyHpMax, periodic: session.enemy.periodic || [] });

  for (const [memberId, member] of Object.entries(session.members)) {
    if (member.hp <= 0) continue;
    if (member.actionThisRound === null) {
      roundLog.push(`${member.name} не успел(а) среагировать — раунд прошёл мимо.`);
      continue;
    }
    const skillId = member.actionThisRound === 'basic' ? null : member.actionThisRound;
    const skill = skillId ? skillLookup(skillId) : null;
    const attackerFighter = member.fighterSnapshot;
    const enemyFighter = enemyFighterTemplate();
    const result = skill ? useSkill(attackerFighter, enemyFighter, skill, rng) : basicAttack(attackerFighter, enemyFighter, rng);

    if (result.hit) {
      let actualDmg = result.dmg || 0;
      const memberBonusPct = guildDamageBonusByPlayerId[memberId] || 0;
      if (memberBonusPct > 0 && actualDmg > 0) actualDmg = Math.round(actualDmg * (1 + memberBonusPct / 100));
      session.enemyHp = Math.max(0, session.enemyHp - actualDmg);
      member.damageDealt += actualDmg;
      roundLog.push(`${member.name} наносит врагу ${actualDmg}${result.crit ? ' (крит!)' : ''}.`);
      if (result.heal) {
        member.hp = Math.min(member.hpMax, member.hp + result.heal);
        roundLog.push(`${member.name} восстанавливает себе ${result.heal} HP.`);
        const allyShare = member.fighterSnapshot.classEffects?.allyHealSharePct;
        if (allyShare) {
          const shareAmount = Math.round(result.heal * allyShare);
          for (const other of Object.values(session.members)) {
            if (other === member || other.hp <= 0) continue;
            const before = other.hp;
            other.hp = Math.min(other.hpMax, other.hp + shareAmount);
            if (other.hp > before) roundLog.push(`${member.name} делится заботой — ${other.name} восстанавливает ${other.hp - before} HP.`);
          }
        }
      }
    } else {
      roundLog.push(`${member.name} промахивается.`);
    }
    member.actionThisRound = null;
  }

  if (session.enemyHp <= 0) {
    session.finished = true;
    session.victory = true;
    session.log = [...roundLog, `🎉 ${session.enemy.name} повержен всем отрядом!`];
    return session;
  }

  const aliveMembers = Object.values(session.members).filter((m) => m.hp > 0);
  if (aliveMembers.length) {
    const enemyFighterForTurn = enemyFighterTemplate();
    const { skill: enemySkill, telegraphText } = pickEnemyAction(enemyFighterForTurn);
    if (telegraphText) roundLog.push(telegraphText);
    const target = aliveMembers[Math.floor(rng() * aliveMembers.length)];
    const targetFighter = target.fighterSnapshot;
    const result = enemySkill ? useSkill(enemyFighterForTurn, targetFighter, enemySkill, rng) : basicAttack(enemyFighterForTurn, targetFighter, rng);
    if (result.hit) {
      const wouldDie = target.hp - result.dmg <= 0;
      if (wouldDie) {
        const survival = trySurvivalMechanic(target.fighterSnapshot, target.survivalUsedThisFight);
        if (survival) {
          target.hp = Math.round(target.hpMax * survival.hpPct);
          target.survivalUsedThisFight = true;
          roundLog.push(`${target.name}: ${survival.note}`);
        } else {
          target.hp = Math.max(0, target.hp - result.dmg);
          roundLog.push(`${session.enemy.name} бьёт ${target.name} на ${result.dmg}${result.crit ? ' (крит!)' : ''}.`);
        }
      } else {
        target.hp = Math.max(0, target.hp - result.dmg);
        roundLog.push(`${session.enemy.name} бьёт ${target.name} на ${result.dmg}${result.crit ? ' (крит!)' : ''}.`);
      }
    } else {
      roundLog.push(`${session.enemy.name} промахивается по ${target.name}.`);
    }
  }

  const allDown = Object.values(session.members).every((m) => m.hp <= 0);
  if (allDown) {
    session.finished = true;
    session.victory = false;
    roundLog.push('💀 Весь отряд повержен.');
  }

  session.log = roundLog;
  session.round += 1;
  session.roundStartedAt = Date.now();
  return session;
}

module.exports = {
  ROUND_TIMEOUT_MS, MAX_PARTY_COMBAT_MEMBERS,
  startPartyCombat, isTimedOut, allActed, submitAction, resolveRound,
};
