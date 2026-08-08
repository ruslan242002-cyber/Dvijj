'use strict';

const { basicAttack, useSkill } = require('../engine/combat-engine.js');
const { findBoss } = require('./boss-data.js');
const { trySurvivalMechanic, activeClassEffects } = require('../engine/mentor-classes.js');

/**
 * ОТРЯДНЫЙ БОЙ С БОССОМ — принципиально другой режим, чем bosses/boss-
 * engine.js (тот — асинхронный общий пул, этот — синхронные 5 игроков
 * онлайн одновременно, видят друг друга и общий таймер хода).
 *
 * РЯДЫ: перед/тыл — не декорация. Обычная атака босса ВСЕГДА идёт по
 * переду (случайно среди живых в переднем ряду; если передний ряд весь
 * пал — переключается на тыл, некому больше держать удар). АУЕ-навык
 * (раз в raidAoeCadence раундов) бьёт всех разом, ряд тут не важен —
 * это единственный момент, когда тыл тоже реально рискует.
 *
 * ТАЙМЕР ХОДА: 60 секунд на раунд, не жёстко (сервер не может сам
 * прислать сообщение через минуту — VK-бот работает по входящим
 * сообщениям, не по таймерам). Раунд резолвится, когда ЛИБО все 5
 * походили, ЛИБО кто угодно из отряда прислал что-то ПОСЛЕ того, как
 * 60 секунд истекли — тогда все, кто не успел, тихо пропускают раунд
 * (0 урона с их стороны), без штрафа, без выкидывания из боя.
 */
const ROUND_TIMEOUT_MS = 60000;
const MAX_MEMBERS = 5;

function createLobby(bossId, hostId, hostName, hostRow = 'front') {
  return {
    lobbyId: `lobby_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    bossId,
    members: [{ playerId: hostId, name: hostName, row: hostRow }],
    createdAt: Date.now(),
    started: false,
  };
}

function joinLobby(lobby, playerId, playerName, row = 'back') {
  if (lobby.started) return { success: false, reason: 'ALREADY_STARTED' };
  if (lobby.members.some((m) => m.playerId === playerId)) return { success: false, reason: 'ALREADY_JOINED' };
  if (lobby.members.length >= MAX_MEMBERS) return { success: false, reason: 'LOBBY_FULL' };
  lobby.members.push({ playerId, name: playerName, row });
  return { success: true };
}

function leaveLobby(lobby, playerId) {
  lobby.members = lobby.members.filter((m) => m.playerId !== playerId);
  return lobby;
}

/** Превращает заполненное лобби (5/5) в реальную боевую сессию — снимок
 * полного боевого профиля каждого участника на старте (fighterSnapshot —
 * статы/крит/лайфстил/классы-наставники уже посчитаны через
 * applyDerivedStats ДО вызова этой функции, снимок просто фиксирует
 * состояние на момент старта рейда, не пересчитывает на лету). */
function startRaidFromLobby(lobby, playersById) {
  const boss = findBoss(lobby.bossId);
  if (!boss) return null;
  const members = {};
  for (const m of lobby.members) {
    const player = playersById[m.playerId];
    members[m.playerId] = {
      name: m.name, row: m.row,
      hp: player.hp, hpMax: player.hpMax,
      fighterSnapshot: { ...player, hp: player.hp, hpMax: player.hpMax, classEffects: activeClassEffects(player) },
      actionThisRound: null,
      damageDealt: 0,
    };
  }
  return {
    raidId: lobby.lobbyId,
    bossId: lobby.bossId,
    bossHp: boss.raidHp,
    bossHpMax: boss.raidHp,
    round: 1,
    roundStartedAt: Date.now(),
    members,
    log: [],
    finished: false,
    victory: false,
  };
}

function isTimedOut(raid, now = Date.now()) {
  return now - raid.roundStartedAt >= ROUND_TIMEOUT_MS;
}

function allActed(raid) {
  return Object.values(raid.members).every((m) => m.hp <= 0 || m.actionThisRound !== null);
}

/** Записывает выбор действия игрока на этот раунд — не резолвит сразу,
 * просто фиксирует намерение. skill=null означает обычную атаку. */
function submitAction(raid, playerId, skillId) {
  const member = raid.members[playerId];
  if (!member || member.hp <= 0) return { success: false, reason: 'NOT_IN_RAID_OR_DOWN' };
  if (member.actionThisRound !== null) return { success: false, reason: 'ALREADY_ACTED' };
  member.actionThisRound = skillId || 'basic';
  return { success: true, allActed: allActed(raid), timedOut: isTimedOut(raid) };
}

/** Резолвит раунд целиком — вызывать, когда submitAction сообщил
 * allActed=true ИЛИ timedOut=true. Каждый живой участник с заполненным
 * actionThisRound бьёт босса. Молчащие — тихо пропускают, без
 * последствий лично для них и без провала всего рейда. Затем ход
 * босса: раз в raidAoeCadence раундов — АУЕ по всем живым; иначе —
 * обычная атака по случайной живой цели из переднего ряда. */
function resolveRound(raid, skillLookup, rng = Math.random) {
  const boss = findBoss(raid.bossId);
  if (!boss || raid.finished) return raid;
  const roundLog = [];

  const bossFighterTemplate = () => ({
    name: boss.name, hp: raid.bossHp, hpMax: raid.bossHp,
    stats: { ...boss.stats }, luck: boss.luck, accuracy: boss.accuracy, dodge: boss.dodge, focus: boss.focus,
    resistances: boss.resistances, periodic: [], bestiaryId: raid.bossId,
  });

  for (const member of Object.values(raid.members)) {
    if (member.hp <= 0) continue;
    if (member.actionThisRound === null) {
      roundLog.push(`${member.name} не успел(а) среагировать — раунд прошёл мимо.`);
      continue;
    }
    const skillId = member.actionThisRound === 'basic' ? null : member.actionThisRound;
    const skill = skillId ? skillLookup(skillId) : null;
    const attackerFighter = member.fighterSnapshot;
    const bossFighter = bossFighterTemplate();
    const result = skill ? useSkill(attackerFighter, bossFighter, skill, rng) : basicAttack(attackerFighter, bossFighter, rng);
    if (result.hit) {
      const actualDmg = result.dmg || 0;
      raid.bossHp = Math.max(0, raid.bossHp - actualDmg);
      member.damageDealt += actualDmg;
      roundLog.push(`${member.name} наносит боссу ${actualDmg}${result.crit ? ' (крит!)' : ''}.`);
      if (result.heal) {
        // Самолечение (result.heal) раньше нигде не применялось в
        // отрядном режиме вообще — считалось useSkill, но результат
        // просто отбрасывался. Теперь честно лечит себя, а с 3+
        // ступенью Целителя ("Забота о ближнем") ещё и долю — живым
        // союзникам вокруг, впервые есть реальный групповой контекст,
        // где это имеет смысл проверять.
        member.hp = Math.min(member.hpMax, member.hp + result.heal);
        roundLog.push(`${member.name} восстанавливает себе ${result.heal} HP.`);
        const allyShare = member.fighterSnapshot.classEffects?.allyHealSharePct;
        if (allyShare) {
          const shareAmount = Math.round(result.heal * allyShare);
          for (const other of Object.values(raid.members)) {
            if (other === member || other.hp <= 0) continue;
            const before = other.hp;
            other.hp = Math.min(other.hpMax, other.hp + shareAmount);
            if (other.hp > before) roundLog.push(`${member.name} делится заботой — ${other.name} +${other.hp - before} HP.`);
          }
        }
      }
    } else {
      roundLog.push(`${member.name} промахивается.`);
    }
    member.actionThisRound = null;
  }

  if (raid.bossHp <= 0) {
    raid.finished = true;
    raid.victory = true;
    raid.log = [...roundLog, `🏆 ${boss.name} повержен всем отрядом!`];
    return raid;
  }

  const isAoeRound = raid.round % boss.raidAoeCadence === 0;
  const isTelegraphRound = raid.round % boss.raidAoeCadence === boss.raidAoeCadence - 1;
  if (isAoeRound) {
    roundLog.push(`⚠️ ${boss.name} бьёт по всему отряду разом!`);
    for (const member of Object.values(raid.members)) {
      if (member.hp <= 0) continue;
      const dmg = Math.round(member.hpMax * boss.raidAoeDamagePct);
      const wouldDie = member.hp - dmg <= 0;
      if (wouldDie) {
        const survival = trySurvivalMechanic(member.fighterSnapshot, member.survivalUsedThisFight);
        if (survival) {
          member.hp = Math.round(member.hpMax * survival.hpPct);
          member.survivalUsedThisFight = true;
          roundLog.push(`${member.name}: ${survival.note}`);
          continue;
        }
      }
      member.hp = Math.max(0, member.hp - dmg);
      roundLog.push(`${member.name} получает ${dmg} урона от АУЕ.`);
    }
  } else {
    const frontRowAlive = Object.values(raid.members).filter((m) => m.row === 'front' && m.hp > 0);
    const pool = frontRowAlive.length ? frontRowAlive : Object.values(raid.members).filter((m) => m.hp > 0);
    if (pool.length) {
      const target = pool[Math.floor(rng() * pool.length)];
      const bossFighter = bossFighterTemplate();
      const targetFighter = target.fighterSnapshot;
      const result = basicAttack(bossFighter, targetFighter, rng);
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
            roundLog.push(`${boss.name} бьёт ${target.name} (${target.row === 'front' ? 'передний ряд' : 'тыл'}) на ${result.dmg}${result.crit ? ' (крит!)' : ''}.`);
          }
        } else {
          target.hp = Math.max(0, target.hp - result.dmg);
          roundLog.push(`${boss.name} бьёт ${target.name} (${target.row === 'front' ? 'передний ряд' : 'тыл'}) на ${result.dmg}${result.crit ? ' (крит!)' : ''}.`);
        }
      } else {
        roundLog.push(`${boss.name} промахивается по ${target.name}.`);
      }
    }
  }

  if (isTelegraphRound) {
    // Предупреждение ЗАРАНЕЕ, на раунд раньше самого удара — по мотивам
    // обычных телеграфов боссов в популярных играх (Атраксис и не
    // только): даёт отряду шанс приготовиться (стим на щит и т.п.),
    // не бьёт совсем без предупреждения.
    roundLog.push(`🔮 ${boss.name} начинает копить энергию — следующий удар придётся по всем сразу. Приготовьтесь!`);
  }
  raid.aoeIncoming = isTelegraphRound; // читает UI (game/scenes/raid.js) для явного предупреждения на экране боя

  const allDown = Object.values(raid.members).every((m) => m.hp <= 0);
  if (allDown) {
    raid.finished = true;
    raid.victory = false;
    roundLog.push('💀 Весь отряд повержен.');
  }

  raid.log = roundLog;
  raid.round += 1;
  raid.roundStartedAt = Date.now();
  return raid;
}

module.exports = {
  ROUND_TIMEOUT_MS, MAX_MEMBERS,
  createLobby, joinLobby, leaveLobby, startRaidFromLobby,
  isTimedOut, allActed, submitAction, resolveRound,
};
