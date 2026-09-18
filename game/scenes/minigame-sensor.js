'use strict';

/**
 * СЦЕНА МИНИ-ИГРЫ «ВТОРИЧНЫЙ СТАТУС» — обёртка вокруг
 * engine/minigames/secondary-status.js. Многошаговая: сначала
 * открыть/закрыть, потом (если открыл) — выбор получателя.
 */
const { SCENES } = require('./ids.js');
const { startSecondaryStatus, resolveSecondaryStatusAction, buildSecondaryCard, SEND_TARGETS } = require('../../engine/minigames/secondary-status.js');
const { grantXp } = require('../../engine/leveling.js');
const { recordDiscovery } = require('../../lib/discoveries.js');

function secondaryStatusScreen(player, backScene = 'station', extraState = {}) {
  const { card, introText, actions } = startSecondaryStatus(player);
  return {
    reply: {
      text: `${card}\n\n${introText}`,
      buttons: actions.map((a) => a.label),
    },
    nextState: { scene: SCENES.MINIGAME_SECONDARY_STATUS, player, backScene, opened: false, ...extraState },
  };
}

const OPEN_ACTIONS = {
  '🔍 Открыть вторичный статус': 'open_secondary',
  '❌ Закрыть, не трогать': 'close',
};

const RESOLVE_ACTIONS = {
  '❌ Закрыть, не трогать': 'close',
  '💾 Сохранить запись': 'save_record',
  ...Object.fromEntries(Object.entries(SEND_TARGETS).map(([id, t]) => [t.label, id])),
};

function handleMinigameSecondary(state, input, rng, deps) {
  if (state.scene !== SCENES.MINIGAME_SECONDARY_STATUS) return null;

  const arcContext = { arcCharacterId: state.arcCharacterId, arcStageId: state.arcStageId };

  if (input === '⬅️ Назад') {
    const { hubMessage, stationButtons } = require('./common.js');
    return {
      reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player) },
      nextState: { scene: state.backScene || 'station', player: state.player },
    };
  }

  if (state.resolved) {
    return secondaryStatusScreen(state.player, state.backScene, arcContext);
  }

  if (!state.opened) {
    const actionId = OPEN_ACTIONS[input];
    if (actionId === 'close') {
      const result = resolveSecondaryStatusAction('close');
      const player = state.player;
      grantXp(player, 8);
      return {
        reply: { text: result.closingText, buttons: ['⬅️ Назад'] },
        nextState: { scene: SCENES.MINIGAME_SECONDARY_STATUS, player, backScene: state.backScene, resolved: true },
      };
    }
    if (actionId === 'open_secondary') {
      const buttons = [...Object.values(SEND_TARGETS).map((t) => t.label), '💾 Сохранить запись', '❌ Закрыть, не трогать'];
      return {
        reply: { text: `${buildSecondaryCard()}\n\nКому отправить эти данные? Или просто сохранить, или закрыть, не трогая дальше.`, buttons },
        nextState: { scene: SCENES.MINIGAME_SECONDARY_STATUS, player: state.player, backScene: state.backScene, opened: true, ...arcContext },
      };
    }
    return secondaryStatusScreen(state.player, state.backScene, arcContext);
  }

  const actionId = RESOLVE_ACTIONS[input];
  if (!actionId) {
    return secondaryStatusScreen(state.player, state.backScene, arcContext);
  }

  const result = resolveSecondaryStatusAction(actionId);
  const player = state.player;
  grantXp(player, { closed: 8, saved: 15, sent: 25 }[result.result] || 10);
  if (result.discovery) recordDiscovery(player, result.discovery);

  if (state.arcCharacterId && state.arcStageId) {
    const { completeStage } = require('../../lib/npc-arcs.js');
    completeStage(player, state.arcCharacterId, state.arcStageId);
  }

  return {
    reply: { text: result.closingText, buttons: ['⬅️ Назад'] },
    nextState: { scene: SCENES.MINIGAME_SECONDARY_STATUS, player, backScene: state.backScene, resolved: true },
  };
}

module.exports = { secondaryStatusScreen, handleMinigameSecondary };
