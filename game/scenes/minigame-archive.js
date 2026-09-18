'use strict';

/**
 * СЦЕНА МИНИ-ИГРЫ «РЕКОНСТРУКЦИЯ АРХИВА» — обёртка вокруг
 * engine/minigames/archive-reconstruction.js. Как и Sensor Layers —
 * многошаговая (не всегда, только когда игрок выбирает cross_check_signal
 * И у него уже есть подходящая память из discoveries).
 */
const { SCENES } = require('./ids.js');
const { startArchiveReconstruction, resolveArchiveStep1, resolveArchiveStep2 } = require('../../engine/minigames/archive-reconstruction.js');
const { grantXp } = require('../../engine/leveling.js');
const { recordDiscovery } = require('../../lib/discoveries.js');

function archiveReconstructionScreen(player, backScene = 'station', extraState = {}) {
  const { card, introText, actions, hasRelevantMemory } = startArchiveReconstruction(player);
  return {
    reply: { text: `${card}\n\n${introText}`, buttons: actions.map((a) => a.label) },
    nextState: { scene: SCENES.MINIGAME_ARCHIVE, player, backScene, hasRelevantMemory, step: 1, ...extraState },
  };
}

const LABEL_TO_ACTION_STEP1 = {
  'RECORD A — ошибка': 'accept_A_error',
  'RECORD B — ошибка': 'accept_B_error',
  'RECORD C — ошибка': 'accept_C_error',
  'Сохранить все как есть': 'preserve_all',
  'Сверить с сигналом': 'cross_check_signal',
};
const LABEL_TO_ACTION_STEP2 = {
  'Довериться своей памяти': 'trust_memory',
  'Всё равно сохранить как есть': 'preserve_all',
};

function handleMinigameArchive(state, input, rng, deps) {
  if (state.scene !== SCENES.MINIGAME_ARCHIVE) return null;

  const arcContext = { arcCharacterId: state.arcCharacterId, arcStageId: state.arcStageId };

  if (input === '⬅️ Назад') {
    const { hubMessage, stationButtons } = require('./common.js');
    return {
      reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player) },
      nextState: { scene: state.backScene || 'station', player: state.player },
    };
  }

  if (state.resolved) {
    return archiveReconstructionScreen(state.player, state.backScene, arcContext);
  }

  const player = state.player;

  if (state.step === 2) {
    const actionId = LABEL_TO_ACTION_STEP2[input];
    if (!actionId) return archiveReconstructionScreen(player, state.backScene, arcContext);
    return finish(resolveArchiveStep2(actionId), player, state, arcContext);
  }

  const actionId = LABEL_TO_ACTION_STEP1[input];
  if (!actionId) return archiveReconstructionScreen(player, state.backScene, arcContext);

  const step = resolveArchiveStep1(actionId, state.hasRelevantMemory);
  if (!step.done) {
    return {
      reply: { text: `${step.card}\n\n${step.text}`, buttons: step.actions.map((a) => a.label) },
      nextState: { scene: SCENES.MINIGAME_ARCHIVE, player, backScene: state.backScene, step: 2, ...arcContext },
    };
  }
  return finish(step, player, state, arcContext);
}

function finish(step, player, state, arcContext) {
  const xpByResult = { resolved: 25, unresolved: 15, archive_missing: 5 };
  grantXp(player, xpByResult[step.result] || 10);
  if (step.discovery) recordDiscovery(player, step.discovery);
  if (step.archiveMissing) player.flags = { ...(player.flags || {}), archive_missing: true };
  if (step.archiveAnomaly) player.archiveAnomaly = (player.archiveAnomaly || 0) + 1;

  let closingLineSuffix = '';
  if (state.arcCharacterId && state.arcStageId) {
    const { completeStage, findStage } = require('../../lib/npc-arcs.js');
    const stage = findStage(state.arcCharacterId, state.arcStageId);
    // ⚠️ Тот же паттерн, что и в minigame-sensor.js — опциональное
    // discoveryByResult на уровне стадии квеста. КРИТИЧЕСКИ ВАЖНО для
    // квестов, где результат мини-игры двигает ОСНОВНОЙ сюжет дальше
    // (напр. A7) — такое поле должно покрывать ВСЕ возможные исходы,
    // иначе неудачная попытка навсегда заблокирует прохождение (стадия
    // всё равно помечается завершённой ниже, откатить будет нельзя).
    if (stage && stage.discoveryByResult && stage.discoveryByResult[step.result]) {
      recordDiscovery(player, stage.discoveryByResult[step.result]);
    }
    if (stage && stage.closingLine) closingLineSuffix = `\n\n${stage.closingLine}`;
    completeStage(player, state.arcCharacterId, state.arcStageId);
  }

  return {
    reply: { text: `${step.closingText}${closingLineSuffix}`, buttons: ['⬅️ Назад'] },
    nextState: { scene: SCENES.MINIGAME_ARCHIVE, player, backScene: state.backScene, resolved: true },
  };
}

module.exports = { archiveReconstructionScreen, handleMinigameArchive };
