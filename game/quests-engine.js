/**
 * ДВИЖОК ВЕТВЯЩИХСЯ КВЕСТОВ — для диалоговых квестов с этапами и реальным
 * выбором (в отличие от game/quests-data.js, где квест — это просто
 * "принеси/убей/исследуй N" без диалоговых развилок). Обе системы не
 * конфликтуют: это движок именно для НАРРАТИВНЫХ квестов.
 *
 * Что поправил при адаптации:
 *
 *  1. Реальный баг в присланном варианте: createQuestState заводит поле
 *     `completed: false` (булево), а failQuest пишет в СОВСЕМ ДРУГОЕ поле —
 *     `status = 'failed'`. Получалось два несогласованных признака
 *     состояния квеста: чтобы понять, провален ли квест, нужно было бы
 *     смотреть на questState.status, а чтобы понять, завершён ли —
 *     на questState.completed, и они никогда не пересекались явно. Здесь
 *     единое поле status (ACTIVE/COMPLETED/FAILED) для всего.
 *
 *  2. Присланный файл импортировал TRAKT_FRAGMENTS/getFragmentStatus/
 *     checkUnlock из lore/trakt-mythos.js, но ни разу их не использовал —
 *     мёртвый импорт. Раз намерение явно было связать квесты с прогрессом
 *     по фрагментам — реализовал это по-настоящему: prerequisites.hasFragment
 *     в isQuestAvailable реально проверяет, собран ли конкретный фрагмент.
 *
 *  3. state → player, как и везде в этом роутере.
 *
 *  4. Имена полей в prerequisites исправлены под то, что реально существует:
 *       - completedQuests сверяется с player.completedQuests (общий список
 *         из game/quests-data.js, а не с отдельным state.quests.completed,
 *         которого нигде больше нет — так завершение обычного
 *         "принеси/убей" квеста может открывать доступ к диалоговому, и наоборот);
 *       - worldFlags → flags, сверяется с player.flags (то самое поле,
 *         которое реально пишет choices/consequence-engine.js — раньше
 *         сверялось с state.worldFlags, которого никто никогда не создавал).
 *
 *  5. Ниже — только сам движок (createQuestState/advanceQuest/renderQuestText
 *     и т.д.), без конкретных questDef с этапами и текстом: в присланном
 *     файле их и не было, это чистая инфраструктура. Реальные ветвящиеся
 *     квесты (наборы stages/choices) — следующий шаг, когда будет готов
 *     хотя бы один сценарий.
 */
'use strict';

const { getFragmentStatus } = require('../lore/trakt-mythos.js');

const QUEST_STATES = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

function createQuestState(questId, initialStage = 'start') {
  return {
    id: questId,
    stage: initialStage,
    choices: [],
    flags: {},
    status: QUEST_STATES.ACTIVE,
    startedAt: Date.now()
  };
}

/** Переводит квест на следующий этап, опционально логируя сделанный выбор
 * и добавляя новые флаги. Мутирует questState напрямую. */
function advanceQuest(questState, nextStage, choiceMade = null, flags = {}) {
  if (choiceMade) questState.choices.push(choiceMade);
  Object.assign(questState.flags, flags);
  questState.stage = nextStage;
  return questState;
}

function completeQuest(questState, reward = {}) {
  questState.status = QUEST_STATES.COMPLETED;
  questState.completedAt = Date.now();
  return { questState, reward };
}

function failQuest(questState, reason = '') {
  questState.status = QUEST_STATES.FAILED;
  questState.failReason = reason;
  questState.failedAt = Date.now();
  return questState;
}

/** Доступен ли квест игроку по его текущему прогрессу. questDef.prerequisites
 * — необязательный объект, отсутствие prerequisites = квест всегда доступен. */
function isQuestAvailable(player, questDef) {
  if (!questDef.prerequisites) return true;
  const prereq = questDef.prerequisites;

  if (prereq.completedQuests) {
    const completed = player.completedQuests || [];
    if (!prereq.completedQuests.every((q) => completed.includes(q))) return false;
  }

  if (prereq.reputation) {
    if ((player.reputation || 0) < prereq.reputation) return false;
  }

  if (prereq.fragments) {
    const fragments = (player.lore && player.lore.fragments) || [];
    if (fragments.length < prereq.fragments) return false;
  }

  if (prereq.hasFragment) {
    const status = getFragmentStatus(player).find((f) => f.id === prereq.hasFragment);
    if (!status || !status.collected) return false;
  }

  if (prereq.flags) {
    const flags = player.flags || {};
    if (!prereq.flags.every((f) => flags[f])) return false;
  }

  return true;
}

/**
 * Собирает текст текущего этапа квеста с подстановкой переменных и
 * условных блоков по флагам этого конкретного квеста (questState.flags,
 * НЕ player.flags — это разные вещи: одно локально для квеста, другое
 * общестанционное).
 *
 * Поддерживаемые переменные: ${playerName} ${faction} ${reputation}
 * Условные блоки: [if:флаг]текст[/if]  [if_not:флаг]текст[/if_not]
 */
function renderQuestText(questDef, questState, player) {
  const stage = questDef.stages[questState.stage];
  if (!stage) return { text: '[ОШИБКА: этап не найден]', choices: [], isTerminal: true };

  let text = stage.text;
  text = text.replace(/\$\{playerName\}/g, player.name || '');
  text = text.replace(/\$\{faction\}/g, player.faction || '');
  text = text.replace(/\$\{reputation\}/g, player.reputation || 0);

  text = text.replace(/\[if:([\w_]+)\](.*?)\[\/if\]/gs, (match, flag, content) => (questState.flags[flag] ? content : ''));
  text = text.replace(/\[if_not:([\w_]+)\](.*?)\[\/if_not\]/gs, (match, flag, content) => (!questState.flags[flag] ? content : ''));

  return { text, choices: stage.choices || [], isTerminal: !!stage.terminal };
}

module.exports = {
  QUEST_STATES, createQuestState, advanceQuest, completeQuest, failQuest,
  isQuestAvailable, renderQuestText
};
