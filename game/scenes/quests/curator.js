'use strict';

/**
 * Диалоговые квесты арок кураторов (storylines/curator-arcs.js) —
 * интерпретирует stage-объекты (text/choices/isCombat/winNext/loseNext/
 * reward/terminal) напрямую, не через quests/quest-engine.js (тот рассчитан
 * на более простой формат без боя/наград, см. shyopot-hypotheses.js).
 */

const { getArcForFaction } = require('../../../storylines/curator-arcs.js');
const { imageForEnemy } = require('../../enemy-images.js');
const { imageForCurator } = require('../../curator-images.js');
const { hubMessage, stationButtons } = require('../common.js');
const { addFactionReputation } = require('../../../engine/reputation.js');
const { SCENES } = require('../ids.js');

function renderCuratorStage(player, questId, stageId) {
  const arc = getArcForFaction(player.faction);
  const quest = arc?.quests.find((q) => q.id === questId);
  if (!quest || !quest.stages[stageId]) return null;
  return { arc, quest, stage: quest.stages[stageId] };
}

function curatorQuestScreen(deps, player, questId, stageId) {
  const found = renderCuratorStage(player, questId, stageId);
  if (!found) {
    return { reply: { text: hubMessage(player), buttons: stationButtons(deps, player) }, nextState: { scene: 'station', player } };
  }
  const { stage } = found;
  const text = (stage.text || '').replace(/\$\{playerName\}/g, player.name || '');

  if (stage.isCombat) {
    return {
      reply: { text, buttons: ['⚔️ Атаковать', 'Отступить'], imageKey: imageForEnemy(stage.enemy.name) },
      nextState: { scene: 'pre_combat', player, enemy: { ...stage.enemy, periodic: [] }, curatorQuest: { questId, winNext: stage.winNext, loseNext: stage.loseNext } }
    };
  }

  if (stage.terminal) {
    const nextPlayer = { ...player };
    const rewardLines = [];
    if (stage.reward) {
      if (stage.reward.reputation) { addFactionReputation(nextPlayer, nextPlayer.faction, stage.reward.reputation); rewardLines.push(`⭐ ${stage.reward.reputation > 0 ? '+' : ''}${stage.reward.reputation} репутации`); }
      if (stage.reward.credits) { nextPlayer.credits = (nextPlayer.credits || 0) + stage.reward.credits; rewardLines.push(`💳 +${stage.reward.credits} кредитов`); }
      if (stage.reward.statPoints) { nextPlayer.statPoints = (nextPlayer.statPoints || 0) + stage.reward.statPoints; rewardLines.push(`🔧 +${stage.reward.statPoints} очков параметров`); }
    }
    nextPlayer.completedQuests = [...(nextPlayer.completedQuests || [])];
    if (!nextPlayer.completedQuests.includes(questId)) nextPlayer.completedQuests.push(questId);
    const fullText = rewardLines.length ? `${text}\n\n${rewardLines.join('\n')}` : text;
    return { reply: { text: fullText, buttons: ['⬅️ Назад'], imageKey: imageForCurator(player.faction) }, nextState: { scene: 'station', player: nextPlayer } };
  }

  return {
    reply: { text, buttons: (stage.choices || []).map((c) => c.label), imageKey: imageForCurator(player.faction) },
    nextState: { scene: 'curator_quest', player, questId, stageId }
  };
}

function handleCuratorQuest(state, input, rng, deps) {
  const found = renderCuratorStage(state.player, state.questId, state.stageId);
  if (!found) {
    return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player) }, nextState: { scene: SCENES.STATION, player: state.player } };
  }
  const choice = (found.stage.choices || []).find((c) => c.label === input);
  if (!choice) {
    const text = (found.stage.text || '').replace(/\$\{playerName\}/g, state.player.name || '');
    return { reply: { text, buttons: found.stage.choices.map((c) => c.label), imageKey: imageForCurator(state.player.faction) }, nextState: state };
  }
  const nextPlayer = { ...state.player };
  if (choice.flags) {
    nextPlayer.flags = { ...(nextPlayer.flags || {}), ...choice.flags };
  }
  return curatorQuestScreen(deps, nextPlayer, state.questId, choice.next);
}

module.exports = { renderCuratorStage, curatorQuestScreen, handleCuratorQuest };
