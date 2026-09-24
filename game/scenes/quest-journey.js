'use strict';

/**
 * ЭКРАН НАПРАВЛЯЕМОГО ПУТЕШЕСТВИЯ (lib/quest-journeys.js) — простой
 * линейный проход по заранее написанным отрезкам полёта. По завершении
 * (isFinal) выдаёт discovery И (если запущено из stage.launchesJourney
 * через arcCharacterId/arcStageId) само завершает эту стадию квеста —
 * тот же паттерн, что у minigame-sensor.js/minigame-archive.js.
 */
const { SCENES } = require('./ids.js');
const { recordDiscovery } = require('../../lib/discoveries.js');

function questJourneyScreen(player, journeyId, legIndex, returnScene, prefixText = '', arcCharacterId, arcStageId) {
  const { QUEST_JOURNEYS } = require('../../lib/quest-journeys.js');
  const journey = QUEST_JOURNEYS[journeyId];
  const leg = journey.legs[legIndex];

  return {
    reply: { text: `${prefixText}${leg.text}`, buttons: [leg.continueButton] },
    nextState: { scene: SCENES.QUEST_JOURNEY, player, journeyId, legIndex, returnScene, arcCharacterId, arcStageId },
  };
}

function startQuestJourney(player, journeyId, returnScene, arcContext) {
  return questJourneyScreen(player, journeyId, 0, returnScene, '', arcContext?.arcCharacterId, arcContext?.arcStageId);
}

async function handleQuestJourney(state, input, rng, deps) {
  const { QUEST_JOURNEYS } = require('../../lib/quest-journeys.js');
  const journey = QUEST_JOURNEYS[state.journeyId];
  const leg = journey.legs[state.legIndex];

  if (input !== leg.continueButton) {
    return questJourneyScreen(state.player, state.journeyId, state.legIndex, state.returnScene, 'Продолжай полёт.\n\n', state.arcCharacterId, state.arcStageId);
  }

  if (leg.isFinal) {
    const player = state.player;
    if (journey.onCompleteDiscovery) recordDiscovery(player, journey.onCompleteDiscovery);
    // ⚠️ Тот же паттерн, что и minigame-sensor.js/minigame-archive.js —
    // если путешествие было запущено ИЗ конкретной стадии квеста
    // (arcCharacterId/arcStageId), само завершает эту стадию и
    // добавляет её closingLine, а не только выдаёт discovery.
    let closingLineSuffix = '';
    if (state.arcCharacterId && state.arcStageId) {
      const { completeStage, findStage } = require('../../lib/npc-arcs.js');
      const stage = findStage(state.arcCharacterId, state.arcStageId);
      if (stage && stage.closingLine) closingLineSuffix = `\n\n${stage.closingLine}`;
      completeStage(player, state.arcCharacterId, state.arcStageId);
    }
    return { reply: { text: `🛬 Посадка совершена.${closingLineSuffix}`, buttons: ['⬅️ Назад'] }, nextState: { scene: state.returnScene || 'station', player } };
  }

  return questJourneyScreen(state.player, state.journeyId, state.legIndex + 1, state.returnScene, '', state.arcCharacterId, state.arcStageId);
}

module.exports = { questJourneyScreen, startQuestJourney, handleQuestJourney };
