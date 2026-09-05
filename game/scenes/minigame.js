'use strict';

/**
 * СЦЕНА МИНИ-ИГРЫ «ДИАГНОСТИКА КОРАБЛЯ» — обёртка вокруг
 * engine/minigames/ship-diagnostics.js под реальный игровой цикл.
 */
const { SCENES } = require('./ids.js');
const { startShipDiagnostics, resolveShipDiagnosticsAction } = require('../../engine/minigames/ship-diagnostics.js');
const { grantXp } = require('../../engine/leveling.js');

function shipDiagnosticsScreen(player, backScene = 'station', extraState = {}) {
  const { card, actions } = startShipDiagnostics();
  return {
    reply: {
      text: card,
      buttons: actions.map((a) => a.label),
    },
    nextState: { scene: SCENES.MINIGAME_SHIP_DIAGNOSTICS, player, backScene, ...extraState },
  };
}

const ACTION_BY_LABEL = {
  '⚡ Отключить контур': 'disable_power',
  '🔀 Перераспределить питание': 'reroute_power',
  '🧯 Починить охлаждение': 'repair_coolant',
  '➡️ Продолжить полёт': 'continue_flight',
};

function handleMinigame(state, input, rng, deps) {
  if (state.scene !== SCENES.MINIGAME_SHIP_DIAGNOSTICS) return null;

  const arcContext = { arcCharacterId: state.arcCharacterId, arcStageId: state.arcStageId };

  if (input === '⬅️ Назад') {
    const { hubMessage, stationButtons } = require('./common.js');
    return {
      reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player) },
      nextState: { scene: state.backScene || 'station', player: state.player },
    };
  }

  if (state.resolved) {
    return shipDiagnosticsScreen(state.player, state.backScene, arcContext);
  }

  const actionId = ACTION_BY_LABEL[input];
  if (!actionId) {
    return shipDiagnosticsScreen(state.player, state.backScene, arcContext);
  }

  const player = state.player;
  const engineering = player.stats?.mind || 0;
  const result = resolveShipDiagnosticsAction(actionId, engineering);

  for (const flag of result.flags) {
    player.flags = player.flags || {};
    player.flags[flag] = true;
  }
  for (const reward of result.rewards) {
    if (reward.xp) grantXp(player, reward.xp);
  }

  if (state.arcCharacterId && state.arcStageId) {
    const { completeStage } = require('../../lib/npc-arcs.js');
    completeStage(player, state.arcCharacterId, state.arcStageId);
  }

  return {
    reply: {
      text: `${result.card}\n\n${result.closingText}`,
      buttons: ['⬅️ Назад'],
    },
    nextState: { scene: SCENES.MINIGAME_SHIP_DIAGNOSTICS, player, backScene: state.backScene, resolved: true },
  };
}

module.exports = { shipDiagnosticsScreen, handleMinigame };
