'use strict';

const { findBoss } = require('../../bosses/boss-data.js');
const {
  createLobby, joinLobby, leaveLobby, startRaidFromLobby,
  isTimedOut, allActed, submitAction, resolveRound, MAX_MEMBERS,
} = require('../../bosses/raid-engine.js');
const { SKILLS } = require('../../engine/skills-data.js');
const { hubMessage, stationButtons, skillButtons, skillIdByName } = require('./common.js');
const { checkAchievements } = require('../../lib/achievements.js');
const { grantXp } = require('../../engine/leveling.js');
const { activeGuildBonuses } = require('../../guilds/guild-levels.js');
const { logWorldEvent } = require('../../lib/world-feed.js');
const { logEconomyEvent, EVENT_TYPES } = require('../../lib/economy-audit.js');
const { notifyPlayer } = require('../../lib/notifications.js');
const { SCENES } = require('./ids.js');

const RAID_SLOT = 'default';
const RAID_BOSS_ID = 'test_colossus';

function hpBar(current, max, width = 16) {
  const filled = Math.round((current / max) * width);
  return `[${'■'.repeat(Math.max(0, filled))}${'□'.repeat(Math.max(0, width - filled))}] ${Math.max(0, current)}/${max}`;
}

/** Тот же принцип, что в game/scenes/boss.js — гильдейский бонус
 *  урона по мировому боссу применяется и к синхронному рейду (одна и
 *  та же цифра guild-levels.js: worldBossDamagePct для обоих режимов). */
async function guildDamageBonusFor(deps, player) {
  if (!player.guildId || !deps.guildStore) return 0;
  const guildLevel = await deps.guildStore.getGuildUpgradeLevel(player.guildId);
  return activeGuildBonuses(guildLevel).worldBossDamagePct;
}

/** Экран лобби — кто уже собрался, свободные места, выбор ряда для
 *  присоединения. Показывает всем одно и то же состояние сбора (общий
 *  стор), не персональную копию — так игроки реально видят друг друга. */
async function raidLobbyScreen(deps, player, playerId, prefixText = '') {
  if (!deps.raidStore) {
    return {
      reply: { text: `${prefixText}⚔️ ОТРЯД ПРОТИВ БОССА\n\nСистема отрядных боёв пока не подключена.`, buttons: ['⬅️ Назад'] },
      nextState: { scene: 'station', player },
    };
  }
  const activeRaid = await deps.raidStore.getRaid(RAID_SLOT);
  if (activeRaid && activeRaid.members[playerId] && !activeRaid.finished) {
    return raidBattleScreen(deps, player, playerId, activeRaid);
  }

  let lobby = await deps.raidStore.getLobby(RAID_SLOT);
  const boss = findBoss(RAID_BOSS_ID);
  if (!lobby) {
    const buttons = ['🛡️ Собрать отряд (перед)', '🏹 Собрать отряд (тыл)', '⬅️ Назад'];
    return {
      reply: { text: `${prefixText}⚔️ ОТРЯД ПРОТИВ БОССА\n\n${boss.name}\n${boss.lore || ''}`, buttons },
      nextState: { scene: SCENES.RAID_LOBBY, player },
    };
  }

  const memberLines = lobby.members.map((m) => `${m.name} — ${m.row === 'front' ? '🛡️ перед' : '🏹 тыл'}`);
  const isJoined = lobby.members.some((m) => m.playerId === playerId);
  const buttons = [];
  if (!isJoined && lobby.members.length < MAX_MEMBERS) buttons.push('🛡️ Вступить (перед)', '🏹 Вступить (тыл)');
  if (isJoined) buttons.push('🚪 Покинуть сбор');
  if (lobby.members.length >= MAX_MEMBERS) buttons.push('⚔️ Начать бой');
  buttons.push('⬅️ Назад');

  return {
    reply: { text: `${prefixText}⚔️ СБОР ОТРЯДА (${lobby.members.length}/${MAX_MEMBERS})\n${memberLines.join('\n')}`, buttons },
    nextState: { scene: SCENES.RAID_LOBBY, player },
  };
}

async function raidBattleScreen(deps, player, playerId, raid, prefixText = '') {
  const boss = findBoss(raid.bossId);
  const memberLines = Object.values(raid.members).map((m) =>
    `${m.hp > 0 ? (m.row === 'front' ? '🛡️' : '🏹') : '💀'} ${m.name} ${hpBar(m.hp, m.hpMax)}`
  );
  const myMember = raid.members[playerId];
  const iActed = myMember && myMember.actionThisRound !== null;
  const buttons = iActed || myMember?.hp <= 0
    ? ['🔄 Проверить раунд', '🚪 Выйти из боя']
    : ['⚔️ Обычная атака', ...skillButtons(player, {})];
  const aoeWarning = raid.aoeIncoming ? '\n\n⚠️ Босс копит энергию — этот удар придётся по ВСЕМУ отряду!' : '';

  return {
    reply: {
      text: `${prefixText}👹 ${boss.name} — раунд ${raid.round}\n${hpBar(raid.bossHp, boss.hp)}\n\n${memberLines.join('\n')}${aoeWarning}`,
      buttons,
    },
    nextState: { scene: SCENES.RAID_BATTLE, player },
  };
}

/** Строит карту playerId -> % гильдейского бонуса урона по боссу для
 *  ВСЕХ участников рейда разом (не только текущего) — гильдия читается
 *  из player.guildId, который дублируется в fighterSnapshot при старте
 *  рейда (startRaidFromLobby спредит весь player). Игроки без гильдии
 *  или без deps.guildStore просто не попадают в карту — resolveRound
 *  трактует отсутствие записи как 0%, деградация тихая. */
async function buildGuildDamageBonusMap(deps, raid) {
  if (!deps.guildStore) return {};
  const map = {};
  for (const [pid, member] of Object.entries(raid.members)) {
    const guildId = member.fighterSnapshot?.guildId;
    if (!guildId) continue;
    const guildLevel = await deps.guildStore.getGuildUpgradeLevel(guildId).catch(() => 0);
    const pct = activeGuildBonuses(guildLevel).worldBossDamagePct;
    if (pct > 0) map[pid] = pct;
  }
  return map;
}

async function handleRaid(state, input, rng, deps, playerId) {
  if (state.scene === SCENES.RAID_LOBBY) {
    if (input === '⬅️ Назад') {
      return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player) }, nextState: { scene: 'station', player: state.player } };
    }
    const rowMatch = /^(🛡️ Собрать отряд|🏹 Собрать отряд|🛡️ Вступить|🏹 Вступить) \((перед|тыл)\)$/.exec(input);
    if (rowMatch) {
      const row = rowMatch[2] === 'перед' ? 'front' : 'back';
      let lobby = await deps.raidStore.getLobby(RAID_SLOT);
      if (!lobby) {
        lobby = createLobby(RAID_BOSS_ID, playerId, state.player.name, row);
      } else {
        const result = joinLobby(lobby, playerId, state.player.name, row);
        if (!result.success) return raidLobbyScreen(deps, state.player, playerId, 'Не получилось присоединиться.\n\n');
      }
      await deps.raidStore.saveLobby(lobby, RAID_SLOT);
      return raidLobbyScreen(deps, state.player, playerId);
    }
    if (input === '🚪 Покинуть сбор') {
      const lobby = await deps.raidStore.getLobby(RAID_SLOT);
      if (lobby) {
        leaveLobby(lobby, playerId);
        if (lobby.members.length === 0) await deps.raidStore.clearLobby(RAID_SLOT);
        else await deps.raidStore.saveLobby(lobby, RAID_SLOT);
      }
      return raidLobbyScreen(deps, state.player, playerId);
    }
    if (input === '⚔️ Начать бой') {
      const lobby = await deps.raidStore.getLobby(RAID_SLOT);
      if (!lobby || lobby.members.length < MAX_MEMBERS) return raidLobbyScreen(deps, state.player, playerId);
      const playersById = {};
      for (const m of lobby.members) {
        if (m.playerId === playerId) { playersById[m.playerId] = state.player; continue; }
        const otherState = await deps.store.get(m.playerId).catch(() => null);
        playersById[m.playerId] = otherState?.player || { name: m.name, hp: 200, hpMax: 200 };
      }
      const raid = startRaidFromLobby(lobby, playersById);
      await deps.raidStore.saveRaid(raid, RAID_SLOT);
      await deps.raidStore.clearLobby(RAID_SLOT);
      return raidBattleScreen(deps, state.player, playerId, raid, '⚔️ Отряд в сборе — бой начинается!\n\n');
    }
    return raidLobbyScreen(deps, state.player, playerId);
  }

  if (state.scene === SCENES.RAID_BATTLE) {
    const raid = await deps.raidStore.getRaid(RAID_SLOT);
    if (!raid || !raid.members[playerId]) {
      return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player) }, nextState: { scene: 'station', player: state.player } };
    }

    if (input === '🚪 Выйти из боя') {
      return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player) }, nextState: { scene: 'station', player: state.player } };
    }

    if (input !== '🔄 Проверить раунд' && raid.members[playerId].actionThisRound === null) {
      const skillId = input === '⚔️ Обычная атака' ? null : skillIdByName(input);
      if (input !== '⚔️ Обычная атака' && !skillId) {
        return raidBattleScreen(deps, state.player, playerId, raid, 'Выбери действие кнопкой ниже.\n\n');
      }
      submitAction(raid, playerId, skillId);
      await deps.raidStore.saveRaid(raid, RAID_SLOT);
    }

    // Резолв раунда — когда все походили ИЛИ таймер истёк, независимо от
    // того, кто именно сейчас прислал сообщение (любой участник может
    // "разбудить" резолв раунда своим действием, включая "Проверить раунд"
    // тех, кто уже походил и просто ждёт остальных).
    if (allActed(raid) || isTimedOut(raid)) {
      const guildBonusMap = await buildGuildDamageBonusMap(deps, raid);
      resolveRound(raid, (id) => SKILLS[id], rng, guildBonusMap);
      await deps.raidStore.saveRaid(raid, RAID_SLOT);

      if (raid.finished) {
        await deps.raidStore.clearRaid(RAID_SLOT);
        if (raid.victory) {
          const boss = findBoss(raid.bossId);
          // Лента мира — победа синхронного отряда видна всем, тот же
          // принцип, что и у мирового босса в game/scenes/boss.js.
          logWorldEvent(deps, { type: 'raid_boss_defeated', text: `Отряд из ${Object.keys(raid.members).length} игроков разбивает ${boss.name} в синхронном бою!` }).catch(() => {});

          const totalDmg = Object.values(raid.members).reduce((s, m) => s + m.damageDealt, 0);
          let myResultText = null;
          for (const [pid, member] of Object.entries(raid.members)) {
            const share = member.damageDealt / totalDmg;
            const credits = Math.round(boss.reward.credits * Math.max(share, 0.15));
            const xp = Math.round(boss.reward.xp * Math.max(share, 0.15));
            logEconomyEvent(deps, { type: EVENT_TYPES.BOSS_REWARD, playerId: pid, credits, note: 'raid_victory' }).catch(() => {});
            if (pid === playerId) {
              const player = { ...state.player, credits: (state.player.credits || 0) + credits };
              grantXp(player, xp);
              const newAchievements = checkAchievements(player);
              const achNote = newAchievements.length ? `\n\n🏆 Новые достижения: ${newAchievements.map((a) => a.title).join(', ')}` : '';
              myResultText = {
                reply: { text: `🎉 ОТРЯД ПОБЕДИЛ!\n\n${raid.log.join('\n')}\n\nТвоя доля: +${credits} кредитов, +${xp} опыта.${achNote}`, buttons: stationButtons(deps, player) },
                nextState: { scene: 'station', player },
              };
              continue;
            }
            const otherState = await deps.store.get(pid).catch(() => null);
            if (otherState?.player) {
              otherState.player.credits = (otherState.player.credits || 0) + credits;
              grantXp(otherState.player, xp);
              await deps.store.set(pid, otherState).catch(() => {});
              notifyPlayer(deps, pid, `🎉 Отряд повержил ${boss.name}! Твоя доля: +${credits} кредитов, +${xp} опыта.`).catch(() => {});
            }
          }
          if (myResultText) return myResultText;
        }
        return {
          reply: { text: `💀 ОТРЯД ПОВЕРЖЕН\n\n${raid.log.join('\n')}\n\nБосс ещё стоит — можно собрать новый отряд.`, buttons: stationButtons(deps, state.player) },
          nextState: { scene: 'station', player: state.player },
        };
      }

      return raidBattleScreen(deps, state.player, playerId, raid);
    }

    return raidBattleScreen(deps, state.player, playerId, raid);
  }

  return null;
}

module.exports = { raidLobbyScreen, handleRaid };
