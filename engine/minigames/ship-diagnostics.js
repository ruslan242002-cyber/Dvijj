'use strict';

/**
 * SHIP DIAGNOSTICS — по periferia_status_minigames_TZ.txt раздел 1.
 * MVP: один сценарий. Назначение: аварии/ремонт/Кран/повреждение корабля.
 *
 * КЛЮЧЕВАЯ ЛОГИКА: низкий coolant — не обязательно причина, часто
 * СИМПТОМ (power overload → coolant drain). Сценарий специально
 * построен так, чтобы "починить симптом" (repair_coolant) и "исправить
 * причину" (reroute_power) давали РАЗНЫЙ результат.
 */
const { renderStatusCard, compactBar } = require('../../lib/status-card.js');

function initialShipState() {
  return { hull: 74, armor: 51, engine: 82, power: 34, oxygen: 91, coolant: 21 };
}

function buildCard(ship, extraWarnings = []) {
  return renderStatusCard({
    title: 'SHIP STATUS',
    rows: [
      { label: 'HULL', display: compactBar(ship.hull, 100) },
      { label: 'ARMOR', display: compactBar(ship.armor, 100) },
      { label: 'ENGINE', display: compactBar(ship.engine, 100) },
      { label: 'POWER', display: compactBar(ship.power, 100) },
      { label: 'OXYGEN', display: compactBar(ship.oxygen, 100) },
      { label: 'COOLANT', display: compactBar(ship.coolant, 100) },
    ],
    warnings: extraWarnings,
  });
}

function startShipDiagnostics() {
  const ship = initialShipState();
  return {
    card: buildCard(ship, ['POWER FLOW: UNSTABLE', 'COOLANT: WARNING']),
    ship,
    actions: [
      { id: 'disable_power', label: '⚡ Отключить контур' },
      { id: 'reroute_power', label: '🔀 Перераспределить питание' },
      { id: 'repair_coolant', label: '🧯 Починить охлаждение' },
      { id: 'continue_flight', label: '➡️ Продолжить полёт' },
    ],
  };
}

function resolveShipDiagnosticsAction(actionId, engineeringStat = 0) {
  const ship = initialShipState();
  const hint = engineeringStat >= 70 ? ' (инженерное чутьё подсказывает: дело не в самом охлаждении)' : '';

  if (actionId === 'reroute_power') {
    ship.power = 49;
    ship.coolant = 46;
    return {
      result: 'success',
      score: 92,
      actions: ['reroute_power'],
      discoveries: ['unstable_power_signature'],
      flags: ['kran_diagnostic_01', 'ship_diagnostic_success'],
      consequences: [],
      rewards: [{ xp: 20 }],
      worldStateChanges: {},
      log: ['POWER FLOW: STABLE', 'COOLANT: NOMINAL'],
      card: buildCard(ship, ['POWER FLOW: STABLE', 'COOLANT: NOMINAL']),
      closingText: '✔ Питание перераспределено. Проблема была не в охлаждении — реактор перегружал контур.' + hint,
    };
  }

  if (actionId === 'repair_coolant') {
    ship.coolant = 70;
    return {
      result: 'partial_success',
      score: 55,
      actions: ['repair_coolant'],
      discoveries: [],
      flags: ['kran_diagnostic_01'],
      consequences: ['repair_parts_-1'],
      rewards: [],
      worldStateChanges: {},
      log: ['COOLANT stabilized', 'POWER FLOW: still unstable'],
      card: buildCard(ship, ['POWER FLOW: UNSTABLE', 'COOLANT: NOMINAL (temporary)']),
      closingText: '△ Охлаждение стабилизировано, но нестабильность питания никуда не делась — рано или поздно вернётся.' + hint,
    };
  }

  if (actionId === 'disable_power') {
    ship.power = 5;
    ship.engine = 60;
    return {
      result: 'failure',
      score: 30,
      actions: ['disable_power'],
      discoveries: [],
      flags: [],
      consequences: ['engine_damage'],
      rewards: [],
      worldStateChanges: {},
      log: ['POWER: EMERGENCY SHUTDOWN', 'ENGINE: DEGRADED'],
      card: buildCard(ship, ['⚠ POWER: EMERGENCY SHUTDOWN', 'ENGINE: DEGRADED']),
      closingText: '✖ Контур отключён полностью — проблема ушла вместе с питанием двигателя. Пришлось чинить ещё и это.',
    };
  }

  ship.coolant = 4;
  ship.hull = 60;
  return {
    result: 'critical_failure',
    score: 10,
    actions: ['continue_flight'],
    discoveries: [],
    flags: [],
    consequences: ['hull_damage'],
    rewards: [],
    worldStateChanges: {},
    log: ['COOLANT: CRITICAL FAILURE', 'HULL BREACH: MINOR'],
    card: buildCard(ship, ['⚠ COOLANT: CRITICAL FAILURE', '⚠ HULL BREACH: MINOR']),
    closingText: '✖✖ Охлаждение отказало полностью на полпути. Пробоина в корпусе — мелкая, но настоящая.',
  };
}

module.exports = { startShipDiagnostics, resolveShipDiagnosticsAction, initialShipState };
