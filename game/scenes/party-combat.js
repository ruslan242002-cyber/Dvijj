'use strict';

const { startPartyCombat, submitAction, resolveRound, isTimedOut, allActed } = require('../../engine/party-combat-engine.js');
const { SKILLS, unlockedSkillsForPlayer } = require('../../engine/skills-data.js');
const { findBoss, allBossIds } = require('../../bosses/boss-data.js');
const { hubMessage, stationButtons } = require('./common.js');
const { notifyPlayer } = require('../../lib/notifications.js');

async function partyCombatMenuScreen(deps, player, playerId, prefixText = '') {
  if (!deps.partyStore) {
    return { reply: { text: `${prefixText}🤝 Система пати сейчас недоступна.`, buttons: ['⬅️ Назад'] }, nextState: { scene: 'station', player } };
  }
  const party = await deps.partyStore.getPartyForPlayer(playerId);
  if (!party) {
    return { reply: { text: `${prefixText}🤝 Ты не в пати. Пригласи кого-нибудь через «Люди в городе».`, buttons: ['⬅️ Назад'] }, nextState: { scene: 'station', player } };
  }

  if (deps.partyCombatStore) {
    const existing = await deps.partyCombatStore.getSession(party.id);
    if (existing && !existing.finished) {
      return partyCombatRoundScreen(deps, player, playerId, party.id, existing);
    }
  }

  if (party.leaderId !== playerId) {
    return { reply: { text: `${prefixText}🤝 Твоя пати: ${party.members.map((m) => m.name).join(', ')}.\n\nБой ещё не начат. Только лидер может начать групповой бой.`, buttons: ['⬅️ Назад'] }, nextState: { scene: 'station', player } };
  }
  const bossButtons = allBossIds().map((id) => `⚔️ ${findBoss(id).name}`);
  return {
    reply: { text: `${prefixText}🤝 Твоя пати: ${party.members.map((m) => m.name).join(', ')}.\n\nС кем драться вместе?`, buttons: [...bossButtons, '⬅️ Назад'] },
    nextState: { scene: 'party_combat_menu', player, partyId: party.id }
  };
}

async function startPartyCombatAgainst(deps, player, playerId, partyId, bossId) {
  const boss = findBoss(bossId);
  if (!boss) return partyCombatMenuScreen(deps, player, playerId, 'Не получилось начать бой.\n\n');

  const enemyFighter = {
    name: boss.name, hp: boss.hpPool, hpMax: boss.hpPool,
    stats: { ...boss.stats }, luck: boss.luck, accuracy: boss.accuracy, dodge: boss.dodge, focus: boss.focus,
    resistances: boss.resistances, periodic: [], bestiaryId: bossId,
  };
  return startPartyCombatWithEnemy(deps, player, playerId, partyId, enemyFighter, `⚔️ Бой начат: ${boss.name} (HP: ${boss.hpPool})\n\n`);
}

async function startPartyCombatWithEnemy(deps, player, playerId, partyId, enemyFighter, prefixText = '') {
  const party = await deps.partyStore.getParty(partyId);
  if (!party) return partyCombatMenuScreen(deps, player, playerId, 'Пати не найдена.\n\n');

  const members = party.members.map((m) => ({
    peerId: m.peerId, name: m.name, row: 'front',
    player: m.peerId === playerId ? player : { hp: 300, hpMax: 300, stats: { firepower: 30, power: 25, shielding: 5 }, luck: 5, accuracy: 0.8, dodge: 0.1, focus: 0.7, level: 1 },
  }));
  const session = startPartyCombat(members, enemyFighter);
  await deps.partyCombatStore.saveSession(partyId, session);

  const otherMembers = party.members.filter((m) => m.peerId !== playerId);
  for (const m of otherMembers) {
    notifyPlayer(deps, m.peerId, `⚔️ ${player.name} начал(а) групповой бой с «${enemyFighter.name}»! Загляни в «🤝 Пати» на станции, чтобы присоединиться.`).catch(() => {});
  }

  return partyCombatRoundScreen(deps, player, playerId, partyId, session, prefixText);
}

function partyCombatRoundScreen(deps, player, playerId, partyId, session, prefixText = '') {
  const member = session.members[playerId];
  if (!member) {
    return { reply: { text: `${prefixText}Ты не участвуешь в этом бою.`, buttons: ['⬅️ Назад'] }, nextState: { scene: 'station', player } };
  }
  if (member.hp <= 0) {
    return { reply: { text: `${prefixText}Ты выбыл(а) из этого боя. Исход решают оставшиеся.`, buttons: ['⬅️ Назад'] }, nextState: { scene: 'station', player } };
  }
  if (session.finished) {
    const outcome = session.victory ? `🎉 Победа! ${session.log.join(' ')}` : `💀 Отряд повержен. ${session.log.join(' ')}`;
    return { reply: { text: `${prefixText}${outcome}`, buttons: stationButtons(deps, player) }, nextState: { scene: 'station', player } };
  }
  const unlocked = unlockedSkillsForPlayer(player.faction, player.level || 1);
  const buttons = ['⚔️ Обычная атака', ...unlocked.map((s) => s.name), '⬅️ Назад'];
  const membersStatus = Object.values(session.members).map((m) => `${m.name}: ${Math.max(0, m.hp)}/${m.hpMax} HP${m.actionThisRound !== null ? ' ✅' : ''}`).join('\n');
  return {
    reply: {
      text: `${prefixText}⚔️ ${session.enemy.name}: ${Math.max(0, session.enemyHp)}/${session.enemyHpMax} HP\nРаунд ${session.round}\n\n${membersStatus}\n\n${session.log.length ? session.log.join(' ') + '\n\n' : ''}Твоё действие:`,
      buttons,
    },
    nextState: { scene: 'party_combat_round', player, partyId }
  };
}

async function handlePartyCombat(state, input, rng, deps, playerId) {
  if (state.scene === 'party_combat_menu') {
    if (input === '⬅️ Назад') {
      return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player) }, nextState: { scene: 'station', player: state.player } };
    }
    const match = /^⚔️ (.+)$/.exec(input);
    if (match) {
      const boss = allBossIds().map((id) => findBoss(id)).find((b) => b.name === match[1]);
      if (boss) return startPartyCombatAgainst(deps, state.player, playerId, state.partyId, boss.id);
    }
    return partyCombatMenuScreen(deps, state.player, playerId);
  }

  if (state.scene === 'party_combat_round') {
    if (!deps.partyCombatStore) return { reply: { text: 'Бой пати сейчас недоступен.', buttons: ['⬅️ Назад'] }, nextState: { scene: 'station', player: state.player } };
    if (input === '⬅️ Назад') {
      return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player) }, nextState: { scene: 'station', player: state.player } };
    }
    let session = await deps.partyCombatStore.getSession(state.partyId);
    if (!session) return { reply: { text: 'Бой уже закончился или не найден.', buttons: ['⬅️ Назад'] }, nextState: { scene: 'station', player: state.player } };

    const skillId = input === '⚔️ Обычная атака' ? 'basic' : Object.values(SKILLS).find((s) => s.name === input)?.id;
    if (!skillId) return partyCombatRoundScreen(deps, state.player, playerId, state.partyId, session, 'Выбери действие кнопкой ниже.\n\n');

    submitAction(session, playerId, skillId === 'basic' ? null : skillId);
    if (allActed(session) || isTimedOut(session)) {
      session = resolveRound(session, (id) => SKILLS[id], rng, {});
    }
    await deps.partyCombatStore.saveSession(state.partyId, session);
    return partyCombatRoundScreen(deps, state.player, playerId, state.partyId, session);
  }

  return null;
}

module.exports = { handlePartyCombat, partyCombatMenuScreen, startPartyCombatWithEnemy };
