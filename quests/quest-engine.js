'use strict';

const { TRAKT_FRAGMENTS, getFragmentStatus, checkUnlock } = require('../lore/trakt-mythos.js');

/**
 * КВЕСТОВЫЙ ДВИЖОК
 * 
 * Каждый квест — это НЕ список задач, а СОСТОЯНИЕ с ветвлениями.
 * 
 * Структура квеста в state:
 * {
 *   id: 'quest_id',
 *   stage: 'stage_name',        // текущий этап
 *   choices: ['a', 'b'],        // сделанные выборы
 *   flags: { met_npc: true },   // установленные флаги
 *   completed: false
 * }
 */

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

/**
 * Проверяет, доступен ли квест игроку
 */
function isQuestAvailable(state, questDef) {
  if (!questDef.prerequisites) return true;
  
  const prereq = questDef.prerequisites;
  
  // Проверка завершённых квестов
  if (prereq.completedQuests) {
    const completed = state.quests?.completed || [];
    if (!prereq.completedQuests.every(q => completed.includes(q))) return false;
  }
  
  // Проверка репутации
  if (prereq.reputation) {
    const rep = state.player.reputation || 0;
    if (rep < prereq.reputation) return false;
  }
  
  // Проверка фрагментов
  if (prereq.fragments) {
    const fragments = state.lore?.fragments || [];
    if (fragments.length < prereq.fragments) return false;
  }
  
  // Проверка флагов мира
  if (prereq.worldFlags) {
    const worldFlags = state.worldFlags || {};
    if (!prereq.worldFlags.every(f => worldFlags[f])) return false;
  }
  
  return true;
}

/**
 * Генерирует текст квеста с учётом сделанных выборов
 */
function renderQuestText(questDef, questState, state) {
  const stage = questDef.stages[questState.stage];
  if (!stage) return { text: '[ОШИБКА: этап не найден]', choices: [] };
  
  let text = stage.text;
  
  // Подстановка переменных
  text = text.replace(/\${playerName}/g, state.player.name);
  text = text.replace(/\${faction}/g, state.player.faction);
  text = text.replace(/\${reputation}/g, state.player.reputation || 0);
  
  // Условные блоки [if:flag]текст[/if]
  text = text.replace(/\[if:([\w_]+)\](.*?)\[\/if\]/gs, (match, flag, content) => {
    return questState.flags[flag] ? content : '';
  });
  
  // Условные блоки [if_not:flag]текст[/if_not]
  text = text.replace(/\[if_not:([\w_]+)\](.*?)\[\/if_not\]/gs, (match, flag, content) => {
    return !questState.flags[flag] ? content : '';
  });
  
  return {
    text,
    choices: stage.choices || [],
    isTerminal: stage.terminal || false
  };
}

module.exports = {
  QUEST_STATES,
  createQuestState,
  advanceQuest,
  completeQuest,
  failQuest,
  isQuestAvailable,
  renderQuestText
};
