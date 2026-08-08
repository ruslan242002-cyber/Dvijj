'use strict';

const { TRAKT_FRAGMENTS, getFragmentStatus, checkUnlock } = require('../lore/trakt-mythos.js');
const { getFactionReputation } = require('../engine/reputation.js');

const QUEST_STATES = {
  INACTIVE: 'inactive',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  FAILED: 'failed',
  LOCKED: 'locked'
};

function createQuestState(questId, initialStage = 'start') {
  return {
    id: questId,
    stage: initialStage,
    choices: [],
    flags: {},
    completed: false,
    startedAt: Date.now()
  };
}

function advanceQuest(questState, nextStage, choiceMade = null, flags = {}) {
  if (choiceMade) questState.choices.push(choiceMade);
  Object.assign(questState.flags, flags);
  questState.stage = nextStage;
  return questState;
}

function completeQuest(questState, reward = {}) {
  questState.completed = true;
  questState.completedAt = Date.now();
  return { questState, reward };
}

function failQuest(questState, reason = '') {
  questState.status = QUEST_STATES.FAILED;
  questState.failReason = reason;
  return questState;
}

function isQuestAvailable(player, questDef) {
  if (!questDef.prerequisites) return true;
  const prereq = questDef.prerequisites;
  if (prereq.completedQuests) {
    const completed = player.completedQuests || [];
    if (!prereq.completedQuests.every(q => completed.includes(q))) return false;
  }
  if (prereq.reputation) {
    const rep = getFactionReputation(player, player.faction);
    if (rep < prereq.reputation) return false;
  }
  if (prereq.npcTrust) {
    // Доверие к конкретному NPC — переиспользует уже существующий
    // счётчик встреч (player.npcMeetings), тот же, что двигает
    // firstMeeting→repeatMeeting→trusted реплики в city/npc-roster.js.
    // Никакой новой системы доверия не заводится.
    const meetings = (player.npcMeetings || {})[prereq.npcTrust.npc] || 0;
    if (meetings < prereq.npcTrust.count) return false;
  }
  if (prereq.fragments) {
    const fragments = player.lore?.fragments || [];
    if (fragments.length < prereq.fragments) return false;
  }
  if (prereq.worldFlags) {
    const worldFlags = player.worldFlags || {};
    if (!prereq.worldFlags.every(f => worldFlags[f])) return false;
  }
  return true;
}

function renderQuestText(questDef, questState, state) {
  const stage = questDef.stages[questState.stage];
  if (!stage) return { text: '[ОШИБКА: этап не найден]', choices: [] };
  let text = stage.text;
  text = text.replace(/\$\{playerName\}/g, state.player.name);
  text = text.replace(/\$\{faction\}/g, state.player.faction);
  text = text.replace(/\$\{reputation\}/g, getFactionReputation(state.player, state.player.faction));
  text = text.replace(/\[if:([\w_]+)\](.*?)\[\/if\]/gs, (match, flag, content) => {
    return questState.flags[flag] ? content : '';
  });
  text = text.replace(/\[if_not:([\w_]+)\](.*?)\[\/if_not\]/gs, (match, flag, content) => {
    return !questState.flags[flag] ? content : '';
  });
  return { text, choices: stage.choices || [], isTerminal: stage.terminal || false };
}

/**
 * ЭСКАЛАЦИЯ КВЕСТОВ ПО РЕАЛЬНОМУ ВРЕМЕНИ — квест остаётся тем же
 * questState (не создаётся заново), но если игрок "летал" дольше
 * questDef.escalation.afterDays реальных суток с questState.startedAt,
 * следующий рендер текста уходит НЕ на обычный stage, а на
 * questDef.escalation.stage (куратор комментирует задержку, условия
 * могли ухудшиться). Только для нарративных квестов с диалоговым
 * движком (storylines/curator-arcs.js) — квесты доски
 * (game/quests-data.js: deliver/kill/explore) эскалацию не получают,
 * они не нарративные и это выглядело бы неестественно.
 *
 * Опционален: если у questDef нет поля escalation — функция не делает
 * ничего и questState.stage остаётся как есть.
 */
function checkEscalation(questState, questDef, now = Date.now()) {
  if (!questDef.escalation || questState.completed || questState.escalated) return questState;
  const daysElapsed = (now - questState.startedAt) / 86400000;
  if (daysElapsed >= questDef.escalation.afterDays) {
    questState.stage = questDef.escalation.stage;
    questState.escalated = true;
  }
  return questState;
}

module.exports = { QUEST_STATES, createQuestState, advanceQuest, completeQuest, failQuest, isQuestAvailable, renderQuestText, checkEscalation };
