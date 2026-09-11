'use strict';

/**
 * СЦЕНА МИНИ-ИГРЫ «УПРАВЛЕНИЕ ПИТАНИЕМ» — обёртка вокруг
 * engine/minigames/power-control.js, тот же паттерн что и
 * game/scenes/minigame.js (Ship Diagnostics) — отдельный файл, не
 * смешиваем разные мини-игры в одну сцену.
 */
const { SCENES } = require('./ids.js');
const { startPowerControl, resolvePowerControlAction, DISTRIBUTIONS } = require('../../engine/minigames/power-control.js');
const { grantXp } = require('../../engine/leveling.js');

function powerControlScreen(player, backScene = 'station', extraState = {}) {
  const { card, introText, actions } = startPowerControl();
  return {
    reply: {
      text: `${card}\n\n${introText}`,
      buttons: actions.map((a) => a.label),
    },
    nextState: { scene: SCENES.MINIGAME_POWER_CONTROL, player, backScene, ...extraState },
  };
}

const LABEL_TO_ID = Object.fromEntries(Object.entries(DISTRIBUTIONS).map(([id, d]) => [d.label, id]));

function handleMinigamePower(state, input, rng, deps) {
  if (state.scene !== SCENES.MINIGAME_POWER_CONTROL) return null;

  const arcContext = { arcCharacterId: state.arcCharacterId, arcStageId: state.arcStageId };

  if (input === '⬅️ Назад') {
    const { hubMessage, stationButtons } = require('./common.js');
    return {
      reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player) },
      nextState: { scene: state.backScene || 'station', player: state.player },
    };
  }

  if (state.resolved) {
    return powerControlScreen(state.player, state.backScene, arcContext);
  }

  const distId = LABEL_TO_ID[input];
  if (!distId) {
    return powerControlScreen(state.player, state.backScene, arcContext);
  }

  const player = state.player;
  const result = resolvePowerControlAction(distId, rng);

  // Награда масштабируется по качеству решения (score), не фиксированная
  // — прямое следствие "нет единственно верного ответа" из документа.
  const xpByResult = { excellent: 25, good: 15, survived: 8, critical_loss: 3 };
  grantXp(player, xpByResult[result.result] || 5);

  if (state.arcCharacterId && state.arcStageId) {
    const { completeStage } = require('../../lib/npc-arcs.js');
    completeStage(player, state.arcCharacterId, state.arcStageId);
  }

  return {
    reply: {
      text: `${result.card}\n\n${result.closingText}`,
      buttons: ['⬅️ Назад'],
    },
    nextState: { scene: SCENES.MINIGAME_POWER_CONTROL, player, backScene: state.backScene, resolved: true },
  };
}

module.exports = { powerControlScreen, handleMinigamePower };
