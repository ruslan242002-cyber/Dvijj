'use strict';

/**
 * Мостик станции: вход в Мифологию Тракта (фрагменты, гипотезы) и
 * диалоговый квест "Гипотезы Шёпота" (renderQuestText/quest-engine.js).
 */

const {
  TRAKT_FRAGMENTS, HYPOTHESIS_INFO, getFragmentStatus, collectFragment,
  describeCondition, conditionProgress, getActiveHypothesis, setHypothesis,
  discoverHypothesis, getEnding,
} = require('../../../lore/trakt-mythos.js');
const { getCurrentAct } = require('../../../lore/trakt-acts.js');
const { createQuestState, advanceQuest, completeQuest, renderQuestText } = require('../../../quests/quest-engine.js');
const { SHYOPOT_HYPOTHESES_QUEST } = require('../../../quests/narrative/shyopot-hypotheses.js');
const { imageForLocation } = require('../../location-images.js');
const { imageForCurator } = require('../../curator-images.js');
const { hubMessage, stationButtons } = require('../common.js');
const { SCENES } = require('../ids.js');

function stepShyopotQuest(playerIn, input) {
  const player = { ...playerIn };
  player.questStates = { ...(player.questStates || {}) };
  let qs = player.questStates.shyopot_hypotheses;
  const needsFreshStart = !qs || qs.completed;

  if (needsFreshStart) {
    qs = createQuestState('shyopot_hypotheses');
    player.questStates.shyopot_hypotheses = qs;
  } else if (input) {
    const rendered = renderQuestText(SHYOPOT_HYPOTHESES_QUEST, qs, { player });
    const choice = rendered.choices.find((c) => c.label === input);
    if (choice) {
      advanceQuest(qs, choice.next, choice.choiceId || null, choice.flags || {});
      if (choice.next === 'end' && choice.choiceId) {
        setHypothesis(player, choice.choiceId);
        if (qs.flags.heard_catastrophe) discoverHypothesis(player, 'CATASTROPHE');
        if (qs.flags.heard_infection) discoverHypothesis(player, 'INFECTION');
        if (qs.flags.heard_evolution) discoverHypothesis(player, 'EVOLUTION');
        if (qs.flags.heard_betrayal) discoverHypothesis(player, 'BETRAYAL');
      }
    }
  }

  const rendered = renderQuestText(SHYOPOT_HYPOTHESES_QUEST, qs, { player });
  if (rendered.isTerminal && !qs.completed) {
    completeQuest(qs, {});
    player.completedQuests = player.completedQuests || [];
    if (!player.completedQuests.includes('shyopot_hypotheses')) player.completedQuests.push('shyopot_hypotheses');
  }
  const buttons = rendered.isTerminal ? ['Назад'] : rendered.choices.map((c) => c.label);
  return { reply: { text: rendered.text, buttons, imageKey: imageForCurator('Терминус') }, nextState: { scene: 'quest_shyopot', player } };
}

function mythosScreen(player, prefixText = '') {
  const act = getCurrentAct(player);
  const statuses = getFragmentStatus(player);
  const hyp = getActiveHypothesis(player);
  // Защита: если в реальном lore/trakt-mythos.js нет describeCondition/
  // conditionProgress (или они называются иначе) — не роняем экран
  // мифологии, а показываем нейтральный текст вместо конкретного условия.
  const describe = typeof describeCondition === 'function' ? describeCondition : () => 'условие ещё не описано';
  const progress = typeof conditionProgress === 'function' ? conditionProgress : () => '';
  const lines = statuses.map((f) => {
    const icon = f.collected ? '✅' : f.unlocked ? '🔓' : '🔒';
    let extra = '';
    if (!f.collected) extra = f.unlocked ? ' — готов к сбору!' : ` — ${describe(f.unlockCondition)} (${progress(player, f.unlockCondition)})`;
    const label = f.shortName || f.name || f.id || 'фрагмент';
    return `${icon} ${label}${extra}`;
  });
  const collectible = statuses.filter((f) => f.unlocked && !f.collected);
  const buttons = [...collectible.map((f) => `Собрать: ${f.shortName || f.name || f.id}`), 'Гипотезы', 'Назад'];
  // Защита: если HYPOTHESIS_INFO не содержит ключ hyp (другое название поля
  // или другой набор гипотез в реальном trakt-mythos.js) — раньше это было
  // необработанное исключение (undefined.name), которое молча ронялo весь
  // экран мифологии сразу после выбора гипотезы, и следующее нажатие любой
  // кнопки выглядело как "зависание". Теперь — нейтральный текст вместо краша.
  const hypInfo = hyp && HYPOTHESIS_INFO ? HYPOTHESIS_INFO[hyp] : null;
  const hypLine = hyp ? `Твоя гипотеза: ${hypInfo?.name || hyp}` : 'Гипотеза ещё не выбрана.';
  return {
    reply: { text: `${prefixText}📜 МИФОЛОГИЯ ТРАКТА\n\n${act.name}\n\n${hypLine}\n\n${lines.join('\n')}`, buttons },
    nextState: { scene: 'lore_mythos', player }
  };
}

function handleBridge(state, input, rng, deps) {
  switch (state.scene) {
    case SCENES.LOC_BRIDGE: {
      if (input === 'Мифология Тракта') {
        return mythosScreen(state.player);
      }
      return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player), imageKey: imageForLocation('station', state.player.faction) }, nextState: { scene: 'station', player: state.player } };
    }

    case SCENES.LORE_MYTHOS: {
      if (input === 'Назад') {
        return { reply: { text: '🎛️ МОСТИК\n\nЗдесь решают судьбу станции. Смена позывного и станции приписки — скоро.', buttons: ['Мифология Тракта', 'Назад'], imageKey: imageForLocation('bridge', state.player.faction) }, nextState: { scene: 'loc_bridge', player: state.player } };
      }
      if (input === 'Гипотезы') {
        return stepShyopotQuest(state.player, null);
      }
      const fragMatch = /^Собрать: (.+)$/.exec(input);
      const fragment = fragMatch ? TRAKT_FRAGMENTS.find((f) => f.shortName === fragMatch[1]) : null;
      if (fragment) {
        const player = { ...state.player };
        const res = collectFragment(player, fragment.id);
        if (res.success) {
          let text = `✨ Фрагмент собран: ${fragment.name}\n\n${fragment.lore}\n\n`;
          const ending = getEnding(player);
          const totalCollected = (player.lore?.fragments || []).length;
          if (ending) {
            text += `🌌 ВСЕ ФРАГМЕНТЫ СОБРАНЫ\n\n${ending.name}\n${ending.text}\n\n`;
          } else if (totalCollected === TRAKT_FRAGMENTS.length) {
            text += `🌌 Все 7 фрагментов собраны, но твоя гипотеза ещё не ясна — загляни в «Гипотезы».\n\n`;
          }
          return mythosScreen(player, text);
        }
      }
      return mythosScreen(state.player);
    }

    case SCENES.QUEST_SHYOPOT: {
      if (input === 'Назад') {
        return mythosScreen(state.player);
      }
      return stepShyopotQuest(state.player, input);
    }

    default:
      return null;
  }
}

module.exports = { handleBridge, mythosScreen, stepShyopotQuest };
