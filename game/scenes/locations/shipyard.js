'use strict';

/**
 * ВЕРФЬ — экран крафта/экипировки КОРАБЕЛЬНОГО снаряжения
 * (engine/ship-equipment.js). ОТДЕЛЬНО от game/scenes/locations/
 * workshop.js — тот про ЛИЧНОЕ снаряжение игрока (player.stats), это
 * про КОРАБЛЬ (ship.firepower/ship.armor). Разные слои, разные экраны,
 * не смешиваем.
 *
 * ⚠️ QA-НАХОДКА: вся система корабельного оружия/брони/EMP уже была
 * полностью реализована и подключена к реальному бою (SHIP_COMBAT в
 * travel.js) — но экрана, откуда игрок мог бы её вообще получить, не
 * было НИ ОДНОГО. Собственная версия UNREACHABLE_FEATURE, построенная
 * в этой же сессии — теперь закрыта.
 */
const {
  SHIP_WEAPONS, SHIP_ARMOR, SHIP_AMMO, SHIP_EMP_DEVICE, SHIP_SENSOR,
  findAnyShipItem, findShipAmmo, canAffordShipItem, craftShipItem,
  equipShipItem, unequipShipItem, buyShipAmmo,
} = require('../../../engine/ship-equipment.js');
const { hubMessage, stationButtons } = require('../common.js');
const { SCENES } = require('../ids.js');

const ALL_CRAFTABLE = { ...SHIP_WEAPONS, ...SHIP_ARMOR, ...SHIP_EMP_DEVICE, ...SHIP_SENSOR };

function describeShipItem(item) {
  const statsText = Object.entries(item)
    .filter(([k]) => ['firepowerBonus', 'armorBonus', 'disableDurationTurns', 'ambushAvoidBonusPct'].includes(k))
    .map(([k, v]) => `${k}:${v}`).join(', ');
  const matText = (item.materials || []).map((m) => `${m.resource} T${m.tier} ×${m.qty}`).join(', ');
  return `${item.name} (${statsText}) — ${matText}, 💳${item.credits}`;
}

function shipyardScreen(player, prefixText = '') {
  const owned = player.shipEquipmentOwned || [];
  const equipped = player.shipEquipment || {};
  const ammoStock = player.shipAmmoStock || {};

  const sections = [];

  const ownedLines = owned.map((id) => {
    const item = findAnyShipItem(id);
    if (!item) return id;
    const slot = SHIP_WEAPONS[id] ? 'weapon' : SHIP_ARMOR[id] ? 'armor' : SHIP_EMP_DEVICE[id] ? 'emp' : 'sensor';
    const isEq = equipped[slot] === id;
    return `${isEq ? '🚀' : '⚪'} ${item.name}`;
  });
  if (ownedLines.length) {
    sections.push(`🛰️ У ТЕБЯ ЕСТЬ (🚀 экипировать, ⚓ снять):\n${ownedLines.join('\n')}`);
  }

  const craftableLines = Object.values(ALL_CRAFTABLE)
    .filter((item) => !owned.includes(item.id))
    .map((item) => `🔧 ${describeShipItem(item)}`);
  if (craftableLines.length) {
    sections.push(`⚙️ МОЖНО СКРАФТИТЬ:\n${craftableLines.join('\n')}`);
  }

  const ammoLines = Object.values(SHIP_AMMO).map((a) => `${a.name}: ${ammoStock[a.id] || 0} шт (💳${a.credits}/шт)`);
  sections.push(`📦 ЗАПАС ПАТРОНОВ:\n${ammoLines.join('\n')}`);

  const buttons = [];
  for (const id of owned) {
    const item = findAnyShipItem(id);
    if (!item) continue;
    const slot = SHIP_WEAPONS[id] ? 'weapon' : SHIP_ARMOR[id] ? 'armor' : SHIP_EMP_DEVICE[id] ? 'emp' : 'sensor';
    if (equipped[slot] === id) buttons.push(`⚓ Снять: ${item.name}`);
    else buttons.push(`🚀 Экипировать: ${item.name}`);
  }
  for (const item of Object.values(ALL_CRAFTABLE)) {
    if (!owned.includes(item.id)) buttons.push(`🔧 Скрафтить: ${item.name}`);
  }
  for (const ammo of Object.values(SHIP_AMMO)) {
    buttons.push(`📦 Купить 10× ${ammo.name}`);
  }
  buttons.push('⬅️ Назад');

  return {
    reply: { text: `${prefixText}🚀 ВЕРФЬ\n\n${sections.join('\n\n')}`, buttons },
    nextState: { scene: SCENES.SHIPYARD, player },
  };
}

function slotForItemId(id) {
  if (SHIP_WEAPONS[id]) return 'weapon';
  if (SHIP_ARMOR[id]) return 'armor';
  if (SHIP_EMP_DEVICE[id]) return 'emp';
  if (SHIP_SENSOR[id]) return 'sensor';
  return null;
}

async function handleShipyard(state, input, rng, deps, playerId) {
  if (state.scene !== SCENES.SHIPYARD) return null;

  if (input === '⬅️ Назад') {
    return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player) }, nextState: { scene: 'station', player: state.player } };
  }

  const craftMatch = /^🔧 Скрафтить: (.+)$/.exec(input);
  if (craftMatch) {
    const item = Object.values(ALL_CRAFTABLE).find((i) => i.name === craftMatch[1]);
    if (!item) return shipyardScreen(state.player);
    const player = {
      ...state.player,
      shipEquipmentOwned: [...(state.player.shipEquipmentOwned || [])],
      inventory: (state.player.inventory || []).map((i) => ({ ...i })),
    };
    const result = craftShipItem(player, item.id);
    return shipyardScreen(player, result.success ? `Скрафчено: ${item.name}.\n\n` : `${result.reason}\n\n`);
  }

  const equipMatch = /^🚀 Экипировать: (.+)$/.exec(input);
  if (equipMatch) {
    const item = Object.values(ALL_CRAFTABLE).find((i) => i.name === equipMatch[1]);
    if (!item) return shipyardScreen(state.player);
    const player = { ...state.player, shipEquipment: { ...(state.player.shipEquipment || {}) } };
    const slot = slotForItemId(item.id);
    const result = equipShipItem(player, slot, item.id);
    return shipyardScreen(player, result.ok ? `Экипировано: ${item.name}.\n\n` : 'Не получилось экипировать.\n\n');
  }

  const unequipMatch = /^⚓ Снять: (.+)$/.exec(input);
  if (unequipMatch) {
    const item = Object.values(ALL_CRAFTABLE).find((i) => i.name === unequipMatch[1]);
    if (!item) return shipyardScreen(state.player);
    const player = { ...state.player, shipEquipment: { ...(state.player.shipEquipment || {}) } };
    const slot = slotForItemId(item.id);
    unequipShipItem(player, slot);
    return shipyardScreen(player, `Снято: ${item.name}.\n\n`);
  }

  const buyAmmoMatch = /^📦 Купить 10× (.+)$/.exec(input);
  if (buyAmmoMatch) {
    const ammo = Object.values(SHIP_AMMO).find((a) => a.name === buyAmmoMatch[1]);
    if (!ammo) return shipyardScreen(state.player);
    const player = {
      ...state.player,
      shipAmmoStock: { ...(state.player.shipAmmoStock || {}) },
      inventory: (state.player.inventory || []).map((i) => ({ ...i })),
    };
    const result = buyShipAmmo(player, ammo.id, 10);
    return shipyardScreen(player, result.success ? `Куплено: 10× ${ammo.name}.\n\n` : `${result.reason}\n\n`);
  }

  return shipyardScreen(state.player);
}

module.exports = { shipyardScreen, handleShipyard };
