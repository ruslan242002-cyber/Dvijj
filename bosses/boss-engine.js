'use strict';

const { resolveTurn, basicAttack } = require('../engine/combat-engine.js');
const { findBoss } = require('./boss-data.js');
const { pickBossAction, tickBossCooldowns } = require('../engine/world-bosses/boss-phase-engine.js');

/**
 * ГРУППОВОЙ БОЙ С БОССОМ — общая HP-пуля (bossInstance.hp), не
 * пошагово-синхронный бой (игроки VK не онлайн одновременно, ждать
 * "все походили" нереалистично). Каждый участник дерётся со своим
 * "срезом" боя — та же формула resolveTurn, что и в обычном PvE, но
 * урон вычитается из ОБЩЕЙ пули, а не из отдельной копии HP. Босс
 * атакует ТОЛЬКО текущего в своём ходу игрока — его личный HP, не
 * общий пул. Reward при добивании делится пропорционально нанесённому
 * урону, с гарантированным минимумом на участника.
 *
 * Хранится в общем сторе (bosses/boss-store-upstash.js), не на игроке —
 * это МИРОВОЙ объект, тот же принцип, что guilds/wreckage/leaderboard.
 */
const MIN_REWARD_SHARE = 0.1;

function spawnBossInstance(bossId, now = Date.now()) {
  const boss = findBoss(bossId);
  if (!boss) return null;
  return {
    bossId,
    hp: boss.hpPool,
    hpMax: boss.hpPool,
    spawnedAt: now,
    participants: {},
    defeated: false,
  };
}

function joinBoss(instance, playerId, playerName) {
  if (!instance.participants[playerId]) {
    instance.participants[playerId] = { name: playerName, damageDealt: 0 };
  }
  return instance;
}

/** Резолвит ОДИН ход одного участника — использует ту же resolveTurn,
 *  что и обычный бой, поэтому все умения/классы-наставники/сопротивления
 *  типов урона работают без переделки.
 *
 *  guildDamageBonusPct (в процентных пунктах, по умолчанию 0) — бонус от
 *  3-го уровня гильд-апгрейда (guilds/guild-levels.js: worldBossDamagePct),
 *  передаётся явно вызывающим кодом (та же схема, что feeDiscount в
 *  market-engine.js), чтобы движок босса не знал о гильдиях напрямую. */
function resolvePlayerVsBoss(instance, player, playerId, skill, rng = Math.random, guildDamageBonusPct = 0) {
  const boss = findBoss(instance.bossId);
  if (!boss) return { error: 'BOSS_NOT_FOUND' };
  if (instance.defeated) return { error: 'ALREADY_DEFEATED' };
  joinBoss(instance, playerId, player.name);

  const bossFighter = {
    name: boss.name, hp: instance.hp, hpMax: instance.hp,
    stats: { ...boss.stats }, luck: boss.luck, accuracy: boss.accuracy, dodge: boss.dodge, focus: boss.focus,
    resistances: boss.resistances, periodic: [], bestiaryId: instance.bossId,
  };

  const result = resolveTurn({ attacker: player, defender: bossFighter, skill, rng });
  let dmgDealt = instance.hp - Math.max(0, result.defender.hp);
  if (guildDamageBonusPct > 0 && dmgDealt > 0) {
    dmgDealt = Math.round(dmgDealt * (1 + guildDamageBonusPct / 100));
  }
  instance.participants[playerId].damageDealt += Math.max(0, dmgDealt);

  const uniqueParticipants = Object.keys(instance.participants).length;
  const hpFloor = uniqueParticipants < boss.minParticipants ? Math.round(instance.hpMax * 0.15) : 0;
  instance.hp = Math.max(hpFloor, instance.hp - Math.max(0, dmgDealt));
  if (instance.hp <= 0) instance.defeated = true;

  // ОТДАЧА БОССА — раньше бой был односторонним (игрок бил, босс молчал).
  // Это были "обычные усиленные враги", а не безрисковая пуля HP — теперь
  // босс реально бьёт в ответ и использует именные навыки/фазы (boss.skills,
  // engine/world-bosses/boss-phase-engine.js), кулдауны хранятся прямо на
  // instance (persist между вызовами через Redis, как и весь остальной
  // инстанс). Только если игрок ещё жив и босс не добит — мёртвый босс не
  // должен успевать ударить в ответ на добивающий удар.
  let playerAfterCounter = result.attacker;
  const bossLog = [];
  if (!instance.defeated && playerAfterCounter.hp > 0 && boss.skills?.length) {
    instance.bossCooldowns = instance.bossCooldowns || {};
    instance.bossPhase = instance.bossPhase || 'normal';
    const bossState = { hpShared: instance.hp, hpMax: instance.hpMax, phase: instance.bossPhase, cooldowns: instance.bossCooldowns };
    const action = pickBossAction({ ...boss, skills: boss.skills }, bossState, rng);
    instance.bossPhase = bossState.phase;
    if (action.phaseEvent) bossLog.push(action.phaseEvent.text);

    if (action.type === 'skill') {
      const effect = action.skill.run(bossFighter, playerAfterCounter, rng);
      if (effect?.logText) bossLog.push(effect.logText);
      instance.bossCooldowns[action.skill.id] = action.skill.cooldown;
    }
    instance.bossCooldowns = tickBossCooldowns(instance.bossCooldowns);

    const counter = basicAttack(bossFighter, playerAfterCounter, rng);
    if (counter.hit && counter.dmg > 0) {
      playerAfterCounter = { ...playerAfterCounter, hp: Math.max(0, playerAfterCounter.hp - counter.dmg) };
      bossLog.push(`${boss.name} наносит тебе ${counter.dmg}${counter.crit ? ' (КРИТ)' : ''}.`);
    }
  }

  return {
    instance, player: playerAfterCounter, log: [...result.log, ...bossLog],
    dmgDealt: Math.max(0, dmgDealt), bossDefeated: instance.defeated, playerDefeated: playerAfterCounter.hp <= 0,
  };
}

/** Делит награду пропорционально урону, с гарантированным минимумом. */
function distributeRewards(instance) {
  const boss = findBoss(instance.bossId);
  if (!boss || !instance.defeated) return {};
  const entries = Object.entries(instance.participants).filter(([, p]) => p.damageDealt > 0);
  if (!entries.length) return {};
  const totalDmg = entries.reduce((s, [, p]) => s + p.damageDealt, 0);
  const equalShare = 1 / entries.length;
  const rewards = {};
  for (const [playerId, p] of entries) {
    const proportional = totalDmg > 0 ? p.damageDealt / totalDmg : equalShare;
    const share = Math.max(proportional, equalShare * MIN_REWARD_SHARE);
    rewards[playerId] = {
      name: p.name,
      damageDealt: p.damageDealt,
      credits: Math.round(boss.reward.credits * share),
      xp: Math.round(boss.reward.xp * share),
    };
  }
  return rewards;
}

/** Спавн раз в 30-120 часов (случайно внутри диапазона, не фиксировано
 *  — иначе игроки быстро подстроятся под расписание вместо честного
 *  ожидания). Детерминировано по дню+bossId, чтобы не пересчитывать
 *  заново на каждый вызов — тот же принцип, что у shtorm/isStormActive
 *  в city-engine.js. */
function shouldSpawnBoss(bossId, lastDefeatedAt, now = Date.now()) {
  const boss = findBoss(bossId);
  if (!boss) return false;
  const hoursSince = (now - lastDefeatedAt) / 3600000;
  if (hoursSince < boss.respawnMinHours) return false;
  // Псевдослучайный, но детерминированный порог внутри диапазона —
  // зависит от lastDefeatedAt, не от текущего времени, поэтому не
  // "мигает" туда-сюда между вызовами в одну и ту же эпоху ожидания.
  const seed = Math.floor(lastDefeatedAt / 1000) % 100000;
  const rangeHours = boss.respawnMaxHours - boss.respawnMinHours;
  const threshold = boss.respawnMinHours + ((seed * 9301 + 49297) % 233280) / 233280 * rangeHours;
  return hoursSince >= threshold;
}

module.exports = { spawnBossInstance, joinBoss, resolvePlayerVsBoss, distributeRewards, shouldSpawnBoss };
