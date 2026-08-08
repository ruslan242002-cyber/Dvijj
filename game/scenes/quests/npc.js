'use strict';

/**
 * Диалоговые квесты мини-арок второстепенных NPC (storylines/npc-arcs.js) —
 * тот же движок, что и game/scenes/quests/curator.js, просто арка ищется
 * по npcId, а не по фракции игрока.
 */

const { NPC_ARCS, getNextAvailableNpcQuest } = require('../../../storylines/npc-arcs.js');
const { npcsForStation, getNpcLine } = require('../../../city/npc-roster.js');
const { getAvailableScheduleQuest, NPC_SCHEDULE_QUESTS } = require('../../../city/npc-schedule-quests.js');
const { getCurrentTimePhase } = require('../../../city/city-engine.js');
const { objectiveMet, progressText, describeObjective, consumeObjective } = require('../../quests-data.js');
const { grantXp } = require('../../../engine/leveling.js');
const { hubMessage, stationButtons, currentStation } = require('../common.js');
const { addFactionReputation } = require('../../../engine/reputation.js');
const { checkAchievements } = require('../../../lib/achievements.js');
const { SCENES } = require('../ids.js');

function renderNpcStage(player, npcId, questId, stageId) {
  const arc = NPC_ARCS[npcId];
  const quest = arc?.quests.find((q) => q.id === questId);
  if (!quest || !quest.stages[stageId]) return null;
  return { arc, quest, stage: quest.stages[stageId] };
}

/** Список людей станции — не только куратор. Клик по имени увеличивает
 * счётчик встреч (тот же player.npcMeetings, что уже двигает
 * firstMeeting→repeatMeeting→trusted), и если у этого NPC есть
 * доступная арка — сразу предлагает её начать. */
function npcPeopleScreen(player, prefixText = '') {
  const station = currentStation(player);
  const npcs = npcsForStation(station).filter((n) => n.role !== 'куратор');
  if (!npcs.length) {
    return { reply: { text: `${prefixText}👥 ЛЮДИ СТАНЦИИ\n\nЗдесь пока не с кем поговорить, кроме куратора.`, buttons: ['⬅️ Назад'] }, nextState: { scene: SCENES.NPC_PEOPLE, player } };
  }
  const lines = npcs.map((n) => `${n.shortName} — ${n.role}`);
  const buttons = [...npcs.map((n) => `💬 ${n.shortName}`), '⬅️ Назад'];
  return { reply: { text: `${prefixText}👥 ЛЮДИ СТАНЦИИ «${station}»\n\n${lines.join('\n')}`, buttons }, nextState: { scene: SCENES.NPC_PEOPLE, player } };
}

function npcQuestScreen(deps, player, npcId, questId, stageId) {
  const found = renderNpcStage(player, npcId, questId, stageId);
  if (!found) {
    return { reply: { text: hubMessage(player), buttons: stationButtons(deps, player) }, nextState: { scene: 'station', player } };
  }
  const { stage } = found;
  const text = (stage.text || '').replace(/\$\{playerName\}/g, player.name || '');

  if (stage.terminal) {
    const nextPlayer = { ...player };
    const rewardLines = [];
    if (stage.reward) {
      if (stage.reward.xp) { rewardLines.push(`✨ +${stage.reward.xp} XP`); }
      if (stage.reward.credits) { nextPlayer.credits = (nextPlayer.credits || 0) + stage.reward.credits; rewardLines.push(`💳 +${stage.reward.credits} кредитов`); }
      if (stage.reward.factionReputation) {
        addFactionReputation(nextPlayer, stage.reward.factionReputation.faction, stage.reward.factionReputation.amount);
        rewardLines.push(`⭐ +${stage.reward.factionReputation.amount} репутации (${stage.reward.factionReputation.faction})`);
      }
      if (stage.reward.flag) { nextPlayer.flags = { ...(nextPlayer.flags || {}), [stage.reward.flag]: true }; }
    }
    nextPlayer.completedQuests = [...(nextPlayer.completedQuests || [])];
    if (!nextPlayer.completedQuests.includes(questId)) nextPlayer.completedQuests.push(questId);
    const newAchievements = checkAchievements(nextPlayer);
    if (newAchievements.length) rewardLines.push(...newAchievements.map((a) => `🏆 Достижение: «${a.title}»`));
    const fullText = rewardLines.length ? `${text}\n\n${rewardLines.join('\n')}` : text;
    return { reply: { text: fullText, buttons: ['⬅️ Назад'] }, nextState: { scene: SCENES.NPC_PEOPLE, player: nextPlayer } };
  }

  return {
    reply: { text, buttons: (stage.choices || []).map((c) => c.label) },
    nextState: { scene: SCENES.NPC_QUEST, player, npcId, questId, stageId }
  };
}

function handleNpc(state, input, rng, deps) {
  switch (state.scene) {
    case SCENES.NPC_PEOPLE: {
      if (input === '⬅️ Назад') {
        return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player) }, nextState: { scene: 'station', player: state.player } };
      }
      const submitMatch = /^✅ Сдать: (.+)$/.exec(input);
      if (submitMatch && state.pendingScheduleQuest) {
        const quest = NPC_SCHEDULE_QUESTS.find((q) => q.id === state.pendingScheduleQuest);
        if (!quest || !objectiveMet(state.player, quest.objective)) return npcPeopleScreen(state.player);
        const player = { ...state.player, inventory: (state.player.inventory || []).map((i) => ({ ...i })) };
        consumeObjective(player, quest.objective);
        player.completedQuests = [...(player.completedQuests || []), quest.id];
        if (quest.reward.xp) grantXp(player, quest.reward.xp);
        if (quest.reward.credits) player.credits = (player.credits || 0) + quest.reward.credits;
        const newAchievements = checkAchievements(player);
        const achNote = newAchievements.length ? `\n\n${newAchievements.map((a) => `🏆 Достижение: «${a.title}»`).join('\n')}` : '';
        return npcPeopleScreen(player, `📋 «${quest.title}» сдан. ✨+${quest.reward.xp} XP, 💳+${quest.reward.credits}.${achNote}\n\n`);
      }
      const match = /^💬 (.+)$/.exec(input);
      if (!match) return npcPeopleScreen(state.player);
      const station = currentStation(state.player);
      const npc = npcsForStation(station).find((n) => n.shortName === match[1]);
      if (!npc) return npcPeopleScreen(state.player);

      const player = { ...state.player };
      player.npcMeetings = { ...(player.npcMeetings || {}) };
      const meetCount = player.npcMeetings[npc.id] || 0;
      const line = getNpcLine(npc.id, meetCount);
      player.npcMeetings[npc.id] = meetCount + 1;

      const availableQuest = getNextAvailableNpcQuest(player, npc.id);
      if (availableQuest) {
        return npcQuestScreen(deps, player, npc.id, availableQuest.id, 'start');
      }

      // Квест по расписанию (city/npc-schedule-quests.js) — привязан к
      // текущему слову времени станции, не к арке. Показывается как
      // обычное задание доски (тот же формат deliver/kill/explore, что и
      // game/quests-data.js), сдать можно прямо здесь.
      const phase = getCurrentTimePhase().phase.toLowerCase();
      const scheduleQuest = getAvailableScheduleQuest(player, npc.id, phase, station);
      if (scheduleQuest) {
        const met = objectiveMet(player, scheduleQuest.objective);
        const progress = progressText(player, scheduleQuest.objective);
        const questText = `${line ? `${npc.shortName}: «${line}»\n\n` : ''}📋 ${scheduleQuest.title}\n${scheduleQuest.text}\n\nЦель: ${describeObjective(scheduleQuest.objective)} (${progress})`;
        const buttons = met ? [`✅ Сдать: ${scheduleQuest.title}`, '⬅️ Назад'] : ['⬅️ Назад'];
        return { reply: { text: questText, buttons }, nextState: { scene: SCENES.NPC_PEOPLE, player, pendingScheduleQuest: scheduleQuest.id } };
      }
      return npcPeopleScreen(player, line ? `${npc.shortName}: «${line}»\n\n` : '');
    }

    case SCENES.NPC_QUEST: {
      const found = renderNpcStage(state.player, state.npcId, state.questId, state.stageId);
      if (!found) {
        return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player) }, nextState: { scene: 'station', player: state.player } };
      }
      const choice = (found.stage.choices || []).find((c) => c.label === input);
      if (!choice) {
        const text = (found.stage.text || '').replace(/\$\{playerName\}/g, state.player.name || '');
        return { reply: { text, buttons: found.stage.choices.map((c) => c.label) }, nextState: state };
      }
      const nextPlayer = { ...state.player };
      if (choice.flags) nextPlayer.flags = { ...(nextPlayer.flags || {}), ...choice.flags };
      return npcQuestScreen(deps, nextPlayer, state.npcId, state.questId, choice.next);
    }

    default:
      return null;
  }
}

module.exports = { npcPeopleScreen, handleNpc };
