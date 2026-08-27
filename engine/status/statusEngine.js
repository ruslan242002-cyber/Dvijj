'use strict';

/**
 * STATUS ENGINE
 * Периферия
 *
 * Унифицированная работа с состояниями игрока. НЕ управляет боем,
 * инвентарём, экипировкой — только хранит и обрабатывает уже полученные
 * состояния. Combat/Environment/Equipment сообщают сюда факт, этот файл
 * ничего не знает об их внутренней механике.
 *
 * Специально нет постоянного real-time tick — updateStatuses() вызывается
 * только тогда, когда конкретная игровая система реально его дёргает, не
 * превращает игру в секундный движок (тот же принцип, что уже применяется
 * везде в проекте — ленивые проверки вместо фоновых процессов, Vercel
 * serverless всё равно не умеет держать таймеры).
 */
const {
  STATUS_SOURCES, STATUS_SEVERITY, getStatusDefinition, isValidStatusType,
} = require('./statusTypes.js');

const DEFAULT_MAX_INTENSITY = 100;

function createStatusId() {
  return `status_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeSeverity(severity) {
  if (Object.values(STATUS_SEVERITY).includes(severity)) return severity;
  return STATUS_SEVERITY.LOW;
}

/** Создать новое состояние. */
function createStatus({
  type, source = STATUS_SOURCES.UNKNOWN, severity, intensity = 1, duration = null, effects = {}, metadata = {},
}) {
  if (!isValidStatusType(type)) throw new Error(`Unknown status type: ${type}`);
  const definition = getStatusDefinition(type);
  return {
    id: createStatusId(),
    type,
    category: definition.category,
    source,
    severity: normalizeSeverity(severity ?? definition.defaultSeverity),
    intensity: Math.max(0, intensity),
    maxIntensity: DEFAULT_MAX_INTENSITY,
    duration,
    createdAt: Date.now(),
    effects: { ...effects },
    metadata: { ...metadata },
  };
}

/** Создать пустое состояние игрока. */
function createStatusState() {
  return { statuses: [], updatedAt: Date.now() };
}

/** Добавить состояние игроку. */
function addStatus(state, statusData) {
  const status = createStatus(statusData);
  const definition = getStatusDefinition(status.type);
  const existingIndex = state.statuses.findIndex((item) => item.type === status.type && item.source === status.source);

  // Если состояние не stackable — обновляем существующее вместо создания второго.
  if (!definition.stackable && existingIndex !== -1) {
    const existing = state.statuses[existingIndex];
    const updatedStatus = {
      ...existing,
      severity: status.severity,
      intensity: definition.stackIntensity
        ? Math.min(existing.intensity + status.intensity, existing.maxIntensity)
        : Math.max(existing.intensity, status.intensity),
      duration: status.duration !== null ? status.duration : existing.duration,
      effects: { ...existing.effects, ...status.effects },
      metadata: { ...existing.metadata, ...status.metadata },
    };
    const statuses = [...state.statuses];
    statuses[existingIndex] = updatedStatus;
    return { ...state, statuses, updatedAt: Date.now() };
  }

  return { ...state, statuses: [...state.statuses, status], updatedAt: Date.now() };
}

function getStatus(state, type) {
  return state.statuses.find((status) => status.type === type) ?? null;
}

function getStatusesByCategory(state, category) {
  return state.statuses.filter((status) => status.category === category);
}

function hasStatus(state, type) {
  return state.statuses.some((status) => status.type === type);
}

function removeStatus(state, type) {
  return { ...state, statuses: state.statuses.filter((status) => status.type !== type), updatedAt: Date.now() };
}

/** Уменьшить интенсивность состояния. Если интенсивность становится 0 — состояние удаляется. */
function reduceStatus(state, type, amount) {
  const statuses = state.statuses
    .map((status) => (status.type !== type ? status : { ...status, intensity: Math.max(0, status.intensity - amount) }))
    .filter((status) => status.intensity > 0);
  return { ...state, statuses, updatedAt: Date.now() };
}

/** Изменить интенсивность состояния (может расти или падать). */
function modifyStatus(state, type, amount) {
  const statuses = state.statuses.map((status) =>
    status.type !== type ? status : { ...status, intensity: Math.min(status.maxIntensity, Math.max(0, status.intensity + amount)) }
  );
  return { ...state, statuses, updatedAt: Date.now() };
}

/** Обновление длительности состояний. delta — условные единицы времени
 *  игрового мира, НЕ глобальная система секунд и НЕ связана с ходами боя. */
function updateStatuses(state, delta) {
  const statuses = state.statuses
    .map((status) => (status.duration === null ? status : { ...status, duration: Math.max(0, status.duration - delta) }))
    .filter((status) => status.duration === null || status.duration > 0);
  return { ...state, statuses, updatedAt: Date.now() };
}

/** Суммарные эффекты всех состояний — { healthModifier: -10, detectionModifier: 15 } и т.п. */
function calculateStatusEffects(state) {
  const result = {};
  for (const status of state.statuses) {
    for (const [effect, value] of Object.entries(status.effects)) {
      if (typeof value !== 'number') continue;
      result[effect] = (result[effect] ?? 0) + value;
    }
  }
  return result;
}

function clearStatuses(state) {
  return { ...state, statuses: [], updatedAt: Date.now() };
}

function serializeStatusState(state) {
  return JSON.parse(JSON.stringify(state));
}

function deserializeStatusState(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.statuses)) return createStatusState();
  return {
    statuses: data.statuses.filter((status) => status && typeof status === 'object' && isValidStatusType(status.type)),
    updatedAt: data.updatedAt ?? Date.now(),
  };
}

// ── Удобные конструкторы для часто используемых состояний ──

function applyInjury(state, { severity = STATUS_SEVERITY.LOW, effects = {}, metadata = {} } = {}) {
  return addStatus(state, { type: 'injury', source: STATUS_SOURCES.COMBAT, severity, intensity: 1, effects, metadata });
}

function applyBleeding(state, { severity = STATUS_SEVERITY.LOW, intensity = 1, effects = { healthModifier: -1 }, duration = null } = {}) {
  return addStatus(state, { type: 'bleeding', source: STATUS_SOURCES.COMBAT, severity, intensity, duration, effects });
}

function applyRadiation(state, { intensity = 1, severity = STATUS_SEVERITY.LOW, duration = null, effects = { healthModifier: -1 }, metadata = {} } = {}) {
  return addStatus(state, { type: 'radiation', source: STATUS_SOURCES.ENVIRONMENT, severity, intensity, duration, effects, metadata });
}

function applyOverheat(state, { intensity = 1, severity = STATUS_SEVERITY.LOW, duration = null, effects = { equipmentEfficiency: -5 }, metadata = {} } = {}) {
  return addStatus(state, { type: 'overheat', source: STATUS_SOURCES.EQUIPMENT, severity, intensity, duration, effects, metadata });
}

module.exports = {
  createStatus, createStatusState, addStatus, getStatus, getStatusesByCategory, hasStatus,
  removeStatus, reduceStatus, modifyStatus, updateStatuses, calculateStatusEffects, clearStatuses,
  serializeStatusState, deserializeStatusState,
  applyInjury, applyBleeding, applyRadiation, applyOverheat,
};
