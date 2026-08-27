'use strict';

/**
 * STATUS TYPES
 * Периферия
 *
 * Унифицированные состояния игрока.
 *
 * ВАЖНО:
 * Этот файл только описывает типы состояний.
 * Он не управляет боем, инвентарём или миром.
 *
 * (Конвертировано из ES-модулей в CommonJS — весь остальной проект на
 * module.exports/require, не import/export.)
 */
const STATUS_TYPES = Object.freeze({
  INJURY: 'injury',
  BLEEDING: 'bleeding',
  RADIATION: 'radiation',
  OVERHEAT: 'overheat',
  EXHAUSTION: 'exhaustion',
  POISONING: 'poisoning',
  STUNNED: 'stunned',
  UNCONSCIOUS: 'unconscious',
  DETECTED: 'detected',
});

const STATUS_SOURCES = Object.freeze({
  COMBAT: 'combat',
  ENVIRONMENT: 'environment',
  EQUIPMENT: 'equipment',
  NPC: 'npc',
  EVENT: 'event',
  PLAYER: 'player',
  UNKNOWN: 'unknown',
});

const STATUS_SEVERITY = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
});

const STATUS_DEFINITIONS = Object.freeze({
  [STATUS_TYPES.INJURY]: {
    type: STATUS_TYPES.INJURY, category: 'body', stackable: true, removable: true, defaultSeverity: STATUS_SEVERITY.LOW,
  },
  [STATUS_TYPES.BLEEDING]: {
    type: STATUS_TYPES.BLEEDING, category: 'body', stackable: false, removable: true, defaultSeverity: STATUS_SEVERITY.LOW,
  },
  [STATUS_TYPES.RADIATION]: {
    type: STATUS_TYPES.RADIATION, category: 'environment', stackable: false, stackIntensity: true, removable: true, defaultSeverity: STATUS_SEVERITY.LOW,
  },
  [STATUS_TYPES.OVERHEAT]: {
    type: STATUS_TYPES.OVERHEAT, category: 'equipment', stackable: false, stackIntensity: true, removable: true, defaultSeverity: STATUS_SEVERITY.LOW,
  },
  [STATUS_TYPES.EXHAUSTION]: {
    type: STATUS_TYPES.EXHAUSTION, category: 'body', stackable: false, stackIntensity: true, removable: true, defaultSeverity: STATUS_SEVERITY.LOW,
  },
  [STATUS_TYPES.POISONING]: {
    type: STATUS_TYPES.POISONING, category: 'body', stackable: false, stackIntensity: true, removable: true, defaultSeverity: STATUS_SEVERITY.LOW,
  },
  [STATUS_TYPES.STUNNED]: {
    type: STATUS_TYPES.STUNNED, category: 'body', stackable: false, removable: true, defaultSeverity: STATUS_SEVERITY.MEDIUM,
  },
  [STATUS_TYPES.UNCONSCIOUS]: {
    type: STATUS_TYPES.UNCONSCIOUS, category: 'body', stackable: false, removable: true, defaultSeverity: STATUS_SEVERITY.CRITICAL,
  },
  [STATUS_TYPES.DETECTED]: {
    type: STATUS_TYPES.DETECTED, category: 'detection', stackable: false, removable: true, defaultSeverity: STATUS_SEVERITY.LOW,
  },
});

function getStatusDefinition(type) {
  return STATUS_DEFINITIONS[type] ?? null;
}
function isValidStatusType(type) {
  return Boolean(STATUS_DEFINITIONS[type]);
}

module.exports = {
  STATUS_TYPES, STATUS_SOURCES, STATUS_SEVERITY, STATUS_DEFINITIONS,
  getStatusDefinition, isValidStatusType,
};
