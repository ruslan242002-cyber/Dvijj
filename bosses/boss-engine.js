'use strict';

const { resolveTurn } = require('../engine/combat-engine.js');
const { findBoss } = require('./boss-data.js');

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
 * что и обычный бой, поэтому все умения/классы-наставники/сопротивления
 * типов урона работают без переделки. */
function resolvePlayerVsBoss(instance, player, playerId, skill, rng = Math.random) {
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
  const dmgDealt = instance.hp - Math.max(0, result.defender.hp);
  instance.participants[playerId].damageDealt += Math.max(0, dmgDealt);

  // Пока не набралось минимум разных участников (boss.minParticipants) —
  // HP не может упасть ниже "пола" (15% от максимума). Раньше это было
  // только в комментарии данных, реально нигде не проверялось — один
  // игрок мог не спеша соло-затащить всю пулю и забрать 100% награды.
  // Пол не блокирует урон совсем (прогресс всё равно засчитывается и
  // виден), просто не даёт добить в одиночку.
  const uniqueParticipants = Object.keys(instance.participants).length;
  const hpFloor = uniqueParticipants < boss.minParticipants ? Math.round(instance.hpMax * 0.15) : 0;
  instance.hp = Math.max(hpFloor, instance.hp - Math.max(0, dmgDealt));
  if (instance.hp <= 0) instance.defeated = true;

  return {
    instance, player: result.attacker, log: result.log,
    dmgDealt: Math.max(0, dmgDealt), bossDefeated: instance.defeated, playerDefeated: result.attacker.hp <= 0,
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
 * — иначе игроки быстро подстроятся под расписание вместо честного
 * ожидания). Детерминировано по дню+bossId, чтобы не пересчитывать
 * заново на каждый вызов — тот же принцип, что у shtorm/isStormActive
 * в city-engine.js. */
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

module.exports = { spawnBossInstance, joinBoss, resolvePlayerVsBoss, distributeRewards, shouldSpawnBoss, MIN_REWARD_SHARE };
