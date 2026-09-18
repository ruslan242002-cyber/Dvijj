'use strict';

/**
 * ВСЕ 5 СЦЕН-ОБЁРТОК МИНИ-ИГР В ОДНОМ ФАЙЛЕ (по прямому запросу
 * пользователя — баланс между монолитом и избыточным дроблением;
 * каждая обёртка была короткой, 60-100 строк, не заслуживала
 * отдельного файла). Сами ДВИЖКИ мини-игр (engine/minigames/*.js,
 * 400-500 строк каждый) остаются раздельными файлами — тот размер
 * уже оправдан.
 */

const { SCENES } = require('./ids.js');
const { startShipDiagnostics, resolveShipDiagnosticsAction } = require('../../engine/minigames/ship-diagnostics.js');
const { grantXp } = require('../../engine/leveling.js');
const { startPowerControl, resolvePowerControlAction, DISTRIBUTIONS } = require('../../engine/minigames/power-control.js');
const { startSensorLayers, resolveSensorLayersStep } = require('../../engine/minigames/sensor-layers.js');
const { startArchiveReconstruction, resolveArchiveStep1, resolveArchiveStep2 } = require('../../engine/minigames/archive-reconstruction.js');
const { recordDiscovery } = require('../../lib/discoveries.js');
const { startSecondaryStatus, resolveSecondaryStatusAction, buildSecondaryCard, SEND_TARGETS } = require('../../engine/minigames/secondary-status.js');

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

function sensorLayersScreen(player, backScene = 'station', extraState = {}) {
  const { card, actions } = startSensorLayers();
  return {
    reply: {
      text: card,
      buttons: actions.map((a) => a.label),
    },
    nextState: { scene: SCENES.MINIGAME_SENSOR_LAYERS, player, backScene, currentLayer: 1, ...extraState },
  };
}

const LABEL_TO_ACTION = { '🛑 STOP': 'stop' }; // SCAN-кнопки текст меняется по слою, разбираем по префиксу

function handleMinigameSensor(state, input, rng, deps) {
  if (state.scene !== SCENES.MINIGAME_SENSOR_LAYERS) return null;

  const arcContext = { arcCharacterId: state.arcCharacterId, arcStageId: state.arcStageId };

  if (input === '⬅️ Назад') {
    const { hubMessage, stationButtons } = require('./common.js');
    return {
      reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player) },
      nextState: { scene: state.backScene || 'station', player: state.player },
    };
  }

  if (state.resolved) {
    return sensorLayersScreen(state.player, state.backScene, arcContext);
  }

  const action = input.startsWith('🔍 SCAN') ? 'scan' : LABEL_TO_ACTION[input];
  if (!action) {
    return sensorLayersScreen(state.player, state.backScene, arcContext);
  }

  const step = resolveSensorLayersStep(state.currentLayer, action, rng);

  if (!step.done) {
    // Промежуточный шаг — ещё не итог, просто следующий слой и новые
    // кнопки, состояние (currentLayer) обновляется, игра продолжается.
    return {
      reply: { text: step.card, buttons: step.actions.map((a) => a.label) },
      nextState: { scene: SCENES.MINIGAME_SENSOR_LAYERS, player: state.player, backScene: state.backScene, currentLayer: step.layer, ...arcContext },
    };
  }

  const player = state.player;
  const xpByResult = { excellent: 25, good: 15, survived: 8, critical_loss: 3 };
  grantXp(player, xpByResult[step.result] || 5);

  let closingLineSuffix = '';
  if (state.arcCharacterId && state.arcStageId) {
    const { completeStage, findStage } = require('../../lib/npc-arcs.js');
    const stage = findStage(state.arcCharacterId, state.arcStageId);
    if (stage && stage.discoveryByResult && stage.discoveryByResult[step.result]) {
      const { recordDiscovery } = require('../../lib/discoveries.js');
      recordDiscovery(player, stage.discoveryByResult[step.result]);
    }
    if (stage && stage.closingLine) closingLineSuffix = `\n\n${stage.closingLine}`;
    completeStage(player, state.arcCharacterId, state.arcStageId);
  }

  return {
    reply: { text: `${step.card}\n\n${step.closingText}${closingLineSuffix}`, buttons: ['⬅️ Назад'] },
    nextState: { scene: SCENES.MINIGAME_SENSOR_LAYERS, player, backScene: state.backScene, resolved: true },
  };
}

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

module.exports = {
  shipDiagnosticsScreen, handleMinigame,
  powerControlScreen, handleMinigamePower,
  sensorLayersScreen, handleMinigameSensor,
  archiveReconstructionScreen, handleMinigameArchive,
  secondaryStatusScreen, handleMinigameSecondary,
};
