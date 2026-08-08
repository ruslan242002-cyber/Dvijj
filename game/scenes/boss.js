'use strict';

const { findBoss } = require('../../bosses/boss-data.js');
const { spawnBossInstance, resolvePlayerVsBoss, distributeRewards, shouldSpawnBoss } = require('../../bosses/boss-engine.js');
const { SKILLS } = require('../../engine/skills-data.js');
const { hubMessage, stationButtons, skillButtons, skillIdByName, skillCooldownNote } = require('./common.js');
const { startCooldown, tickCooldowns } = require('../../engine/cooldowns.js');
const { checkAchievements } = require('../../lib/achievements.js');
const { grantXp } = require('../../engine/leveling.js');
const { SCENES } = require('./ids.js');

const BOSS_SLOT = 'default';
const ACTIVE_BOSS_ID = 'test_colossus'; // единственный существующий на сейчас — сменится/расширится, когда пришлёте реальных боссов

function hpBar(current, max, width = 20) {
  const filled = Math.round((current / max) * width);
  return `[${'■'.repeat(Math.max(0, filled))}${'□'.repeat(Math.max(0, width - filled))}] ${Math.round((current / max) * 100)}%`;
}

async function bossHub(deps, player, playerId, prefixText = '') {
  if (!deps.bossStore) {
    return {
      reply: { text: `${prefixText}⚔️ МИРОВОЙ БОСС\n\nСистема групповых боссов пока не подключена к общему хранилищу — загляни позже.`, buttons: stationButtons(deps, player) },
      nextState: { scene: 'station', player }
    };
  }

  let instance = await deps.bossStore.getActiveBoss(BOSS_SLOT);
  if (!instance) {
    const lastDefeated = await deps.bossStore.getLastDefeatedAt(BOSS_SLOT);
    if (shouldSpawnBoss(ACTIVE_BOSS_ID, lastDefeated)) {
      instance = spawnBossInstance(ACTIVE_BOSS_ID);
      await deps.bossStore.saveBoss(instance, BOSS_SLOT);
    } else {
      const boss = findBoss(ACTIVE_BOSS_ID);
      const hoursLeft = Math.max(0, Math.round(boss.respawnMinHours - (Date.now() - lastDefeated) / 3600000));
      return {
        reply: { text: `${prefixText}⚔️ МИРОВОЙ БОСС\n\nСейчас никто не потревожил Периферию. ${boss.name} появится не раньше, чем через ~${hoursLeft} ч. — точное время держится в секрете, чтобы не превращать охоту в расписание.`, buttons: ['⬅️ Назад'] },
        nextState: { scene: 'station', player }
      };
    }
  }

  const boss = findBoss(instance.bossId);
  if (instance.defeated) {
    return {
      reply: { text: `${prefixText}⚔️ ${boss.name} уже повержен — награды разошлись участникам. Ждите следующего появления.`, buttons: ['⬅️ Назад'] },
      nextState: { scene: 'station', player }
    };
  }

  const participantLines = Object.values(instance.participants)
    .sort((a, b) => b.damageDealt - a.damageDealt)
    .map((p) => `${p.name}: ${p.damageDealt} урона`);
  const uniqueCount = Object.keys(instance.participants).length;
  const floorNote = uniqueCount < boss.minParticipants
    ? `\n\n⚠️ Нужно минимум ${boss.minParticipants} разных участников, чтобы добить босса (сейчас ${uniqueCount}) — ниже 15% HP в одиночку не опустится.`
    : '';
  const text = `${prefixText}⚔️ ${boss.name}\n${boss.lore}\n\n❤️ ${hpBar(instance.hp, instance.hpMax)} (${instance.hp}/${instance.hpMax})\n\n👥 Участники:\n${participantLines.length ? participantLines.join('\n') : 'пока никого — будь первым'}${floorNote}`;
  return {
    reply: { text, buttons: ['⚔️ Атаковать', '⬅️ Назад'] },
    nextState: { scene: SCENES.BOSS_HUB, player }
  };
}

async function handleBoss(state, input, rng, deps, playerId) {
  if (state.scene === SCENES.BOSS_HUB) {
    if (input === '⬅️ Назад') {
      return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player) }, nextState: { scene: 'station', player: state.player } };
    }
    if (input === '⚔️ Атаковать') {
      const instance = await deps.bossStore.getActiveBoss(BOSS_SLOT);
      if (!instance || instance.defeated) return bossHub(deps, state.player, playerId, 'Босс уже недоступен.\n\n');
      const buttons = ['🗡️ Обычная атака', ...skillButtons(state.player, state.bossCooldowns || {})];
      return { reply: { text: 'Выбери действие:', buttons }, nextState: { scene: SCENES.BOSS_COMBAT, player: state.player, bossCooldowns: state.bossCooldowns || {} } };
    }
    return bossHub(deps, state.player, playerId);
  }

  if (state.scene === SCENES.BOSS_COMBAT) {
    const skillId = input === '🗡️ Обычная атака' ? null : skillIdByName(input);
    const skill = skillId ? SKILLS[skillId] : null;
    if (input !== '🗡️ Обычная атака' && !skill) {
      const buttons = ['🗡️ Обычная атака', ...skillButtons(state.player, state.bossCooldowns || {})];
      return { reply: { text: 'Выбери действие кнопкой ниже.', buttons }, nextState: state };
    }

    const instance = await deps.bossStore.getActiveBoss(BOSS_SLOT);
    if (!instance || instance.defeated) return bossHub(deps, state.player, playerId, 'Босс уже недоступен.\n\n');

    const result = resolvePlayerVsBoss(instance, state.player, playerId, skill, rng);
    if (result.error) return bossHub(deps, state.player, playerId);

    const cooldownsAfterUse = skillId ? startCooldown(state.bossCooldowns || {}, skillId, skill, state.player.cooldownReductionPct || 0) : (state.bossCooldowns || {});
    const tickedCooldowns = tickCooldowns(cooldownsAfterUse);
    let player = result.player;

    if (result.bossDefeated) {
      await deps.bossStore.saveBoss(instance, BOSS_SLOT);
      await deps.bossStore.setLastDefeatedAt(BOSS_SLOT, Date.now());
      const rewards = distributeRewards(instance);
      for (const [pid, reward] of Object.entries(rewards)) {
        if (pid === playerId) {
          player.credits = (player.credits || 0) + reward.credits;
          grantXp(player, reward.xp);
          continue;
        }
        const otherState = await deps.store.get(pid).catch(() => null);
        if (otherState?.player) {
          otherState.player.credits = (otherState.player.credits || 0) + reward.credits;
          grantXp(otherState.player, reward.xp);
          await deps.store.set(pid, otherState).catch(() => {});
        }
      }
      const myReward = rewards[playerId];
      const newAchievements = checkAchievements(player);
      const achNote = newAchievements.length ? `\n\n${newAchievements.map((a) => `🏆 Достижение: «${a.title}»`).join('\n')}` : '';
      return {
        reply: { text: `💥 ${result.log.join(' ')}\n\n🏆 БОСС ПОВЕРЖЕН!\nТвоя доля (по вкладу ${myReward.damageDealt} урона): 💳+${myReward.credits}, ✨+${myReward.xp} XP.\nНаграда разошлась всем ${Object.keys(rewards).length} участникам.${achNote}`, buttons: ['⬅️ Назад'] },
        nextState: { scene: 'station', player }
      };
    }

    await deps.bossStore.saveBoss(instance, BOSS_SLOT);

    if (result.playerDefeated) {
      const defeatedPlayer = { ...player, hp: Math.round(player.hpMax * 0.3) };
      return {
        reply: { text: `💥 ${result.log.join(' ')}\n\n💀 Ты не выдержал удара босса. Эвакуация — можешь вернуться и бить снова, общий пул урона никуда не делся.`, buttons: stationButtons(deps, defeatedPlayer) },
        nextState: { scene: 'station', player: defeatedPlayer }
      };
    }

    const buttons = ['🗡️ Обычная атака', ...skillButtons(player, tickedCooldowns)];
    const cdNote = skillCooldownNote(player, tickedCooldowns);
    const cdLine = cdNote ? `\n\n${cdNote}` : '';
    return {
      reply: { text: `💥 ${result.log.join(' ')} (нанёс ${result.dmgDealt})\n\n❤️ Общий пул: ${hpBar(instance.hp, instance.hpMax)} (${instance.hp}/${instance.hpMax})\n❤️ Ты: ${player.hp}/${player.hpMax}${cdLine}`, buttons },
      nextState: { scene: SCENES.BOSS_COMBAT, player, bossCooldowns: tickedCooldowns }
    };
  }

  return null;
}

module.exports = { bossHub, handleBoss };
