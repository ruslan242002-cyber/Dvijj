'use strict';

/**
 * Кнопки здесь короткие иконка+имя вместо длинных русских префиксов —
 * "Экипировать снаряжение: Заряженный панцирь-плита" (48 символов!)
 * гарантированно обрежется в 2-колоночной раскладке VK. Иконка сама
 * действие не объясняет — весь смысл в тексте карточки над кнопками,
 * где по порядку описано, что есть что.
 */

const {
  RECIPES, hasResourcesFor, describeRecipe, craft,
  moduleSlotsFor, canEquipModule, equipModule, unequipModule,
} = require('../../../crafting/crafting-engine.js');
const {
  GEAR_RECIPES, canAffordGear, describeGearRecipe, craftGear, equipGear, unequipGear, findGearRecipe, rarityName,
  upgradeLevelOf, canUpgradeGear, upgradeGear, MAX_UPGRADE_LEVEL, statsText, statsAtLevel,
} = require('../../../engine/gear-engine.js');
const { applyDerivedStats } = require('../../../engine/derived-stats.js');
const { ARTIFACT_POOL, findArtifact, equipArtifact, unequipArtifact } = require('../../../lib/artifacts.js');
const { COMPANIONS, equipCompanion, unequipCompanion } = require('../../../engine/companions.js');
const { SHIP_RECIPES, findShipRecipe, craftShipModule, equipShipModule, unequipShipModule, shipModuleSlotsFor } = require('../../../engine/ship-crafting.js');
const { hubMessage, stationButtons } = require('../common.js');
const { imageForLocation } = require('../../location-images.js');
const { SCENES } = require('../ids.js');

function workshopScreen(player, prefixText = '') {
  const owned = player.modules || [];
  const equipped = player.equippedModules || [];
  const slots = moduleSlotsFor(player);

  const craftable = RECIPES.filter((r) => !owned.includes(r.id));
  const craftLines = craftable.map((r) => `${describeRecipe(r)}${hasResourcesFor(player, r.id) ? ' ✅' : ''}`);

  const notEquipped = owned.filter((id) => !equipped.includes(id));
  const equippedLines = equipped.map((id) => {
    const r = RECIPES.find((x) => x.id === id);
    return r ? `✅ ${r.name} (+${r.bonus} ${r.stat})` : id;
  });
  const notEquippedLines = notEquipped.map((id) => {
    const r = RECIPES.find((x) => x.id === id);
    return r ? `◻️ ${r.name} (+${r.bonus} ${r.stat})` : id;
  });

  const ownedGear = player.gear || [];
  const equippedGear = player.equippedGear || {};
  const equippedGearIds = Object.values(equippedGear);
  const craftableGear = GEAR_RECIPES.filter((r) => !ownedGear.includes(r.id));
  const gearCraftLines = craftableGear.map((r) => `${describeGearRecipe(r.id)}${canAffordGear(player, r.id) ? ' ✅' : ''}`);
  const gearOwnedLines = ownedGear.map((id) => {
    const r = findGearRecipe(id);
    if (!r) return id;
    const isEq = equippedGearIds.includes(id);
    const lvl = upgradeLevelOf(player, id);
    const lvlText = lvl > 0 ? ` [+${lvl}]` : '';
    return `${isEq ? '✅' : '◻️'} [${r.slot === 'weapon' ? 'Оружие' : 'Броня'}] ${r.name}${lvlText} (${statsText(statsAtLevel(r, lvl))})`;
  });

  const ownedArtifacts = player.artifacts || [];
  const equippedArtifactId = player.equippedArtifact || null;
  const artifactLines = ownedArtifacts.map((id) => {
    const a = findArtifact(id);
    if (!a) return id;
    const isEq = id === equippedArtifactId;
    return `${isEq ? '✅' : '◻️'} ${a.name} (+${a.bonus} ${a.stat})`;
  });

  const ownedCompanions = player.companions || [];
  const equippedCompanionId = player.equippedCompanion || null;
  const companionLines = ownedCompanions.map((id) => {
    const c = COMPANIONS.find((x) => x.id === id);
    if (!c) return id;
    const isEq = id === equippedCompanionId;
    return `${isEq ? '✅' : '◻️'} ${c.name}`;
  });

  const ownedShipModules = player.ship?.modules || [];
  const equippedShipModules = player.ship?.equippedModules || [];
  const shipModuleLines = ownedShipModules.map((id) => {
    const r = findShipRecipe(id);
    if (!r) return id;
    const isEq = equippedShipModules.includes(id);
    return `${isEq ? '✅' : '◻️'} ${r.name} (+${r.bonus} ${r.stat})`;
  });
  const craftableShipModules = SHIP_RECIPES.filter((r) => r.faction === player.faction && !ownedShipModules.includes(r.id));
  const craftableShipLines = craftableShipModules.map((r) => `🔧 ${r.name}: ${r.cost.map((c) => `${c.resource} T${c.tier} ×${c.qty}`).join(' + ')}`);

  const sections = [];
  if (equippedLines.length || notEquippedLines.length) {
    sections.push(`⚙️ Модули (слотов занято ${equipped.length}/${slots}) — 🟢 экипировать, 🔴 снять:\n${[...equippedLines, ...notEquippedLines].join('\n')}`);
  }
  if (gearOwnedLines.length) {
    sections.push(`🗡️ Снаряжение (у тебя) — 🛡️ экипировать, 🚫 снять, ⬆️ улучшить:\n${gearOwnedLines.join('\n')}`);
  }
  if (artifactLines.length) {
    sections.push(`💠 Артефакты (у тебя, слот один) — 💠 экипировать, ⭕ снять:\n${artifactLines.join('\n')}`);
  }
  if (companionLines.length) {
    sections.push(`🐾 Компаньоны (у тебя, слот один) — 🐾 экипировать, 🔕 снять:\n${companionLines.join('\n')}`);
  }
  if (shipModuleLines.length) {
    sections.push(`🚀 Модули корабля (слотов занято ${equippedShipModules.length}/${shipModuleSlotsFor(player)}) — 🔵 экипировать, ⚫ снять:\n${shipModuleLines.join('\n')}`);
  }
  if (craftableShipLines.length) {
    sections.push(`🚀 Модули корабля — доступно скрафтить (только на своей станции):\n${craftableShipLines.join('\n')}`);
  }
  if (craftLines.length) {
    sections.push(`🔩 Модули — доступно скрафтить:\n${craftLines.join('\n')}`);
  }
  if (gearCraftLines.length) {
    sections.push(`⚔️ Снаряжение — доступно скрафтить:\n${gearCraftLines.join('\n')}`);
  }

  const buttons = [];
  for (const id of notEquipped) {
    const r = RECIPES.find((x) => x.id === id);
    if (r) buttons.push(`🟢 ${r.name}`);
  }
  for (const id of equipped) {
    const r = RECIPES.find((x) => x.id === id);
    if (r) buttons.push(`🔴 ${r.name}`);
  }
  for (const id of ownedGear) {
    const r = findGearRecipe(id);
    if (!r) continue;
    if (equippedGearIds.includes(id)) buttons.push(`🚫 ${r.name}`);
    else buttons.push(`🛡️ ${r.name}`);
    if (upgradeLevelOf(player, id) < MAX_UPGRADE_LEVEL) buttons.push(`⬆️ ${r.name}`);
  }
  for (const id of ownedArtifacts) {
    const a = findArtifact(id);
    if (!a) continue;
    if (id === equippedArtifactId) buttons.push(`⭕ ${a.name}`);
    else buttons.push(`💠 ${a.name}`);
  }
  for (const id of ownedCompanions) {
    const c = COMPANIONS.find((x) => x.id === id);
    if (!c) continue;
    if (id === equippedCompanionId) buttons.push(`🔕 ${c.name}`);
    else buttons.push(`🐾 ${c.name}`);
  }
  for (const id of ownedShipModules) {
    const r = findShipRecipe(id);
    if (!r) continue;
    if (equippedShipModules.includes(id)) buttons.push(`⚫ ${r.name}`);
    else buttons.push(`🔵 ${r.name}`);
  }
  for (const r of craftableShipModules) buttons.push(`🔧 ${r.name}`);
  for (const r of craftable) buttons.push(`🔩 ${r.name}`);
  for (const r of craftableGear) buttons.push(`⚔️ ${r.name}`);
  buttons.push('⬅️ Назад');

  return {
    reply: { text: `${prefixText}🔧 МАСТЕРСКАЯ\n\n${sections.join('\n\n') || 'Пока пусто — скрафти первый предмет.'}`, buttons, imageKey: imageForLocation('repair', player.faction) },
    nextState: { scene: SCENES.WORKSHOP, player }
  };
}

function handleWorkshop(state, input, rng, deps) {
  if (state.scene !== SCENES.WORKSHOP) return null;

  if (input === '⬅️ Назад') {
    return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player), imageKey: imageForLocation('station', state.player.faction) }, nextState: { scene: 'station', player: state.player } };
  }

  const findModuleByName = (name) => RECIPES.find((r) => r.name === name);
  const findGearByName = (name) => GEAR_RECIPES.find((r) => r.name === name);

  // Порядок проверки важен: сначала снаряжение (свои иконки), потом
  // модули — иконки не пересекаются между категориями, но порядок
  // всё равно держим предсказуемым.

  const craftGearMatch = /^⚔️ (.+)$/.exec(input);
  if (craftGearMatch) {
    const recipe = findGearByName(craftGearMatch[1]);
    if (!recipe) return workshopScreen(state.player);
    const player = {
      ...state.player,
      inventory: (state.player.inventory || []).map((i) => ({ ...i })),
      bestiaryItems: [...(state.player.bestiaryItems || [])],
      gear: [...(state.player.gear || [])],
    };
    const result = craftGear(player, recipe.id);
    return workshopScreen(player, result.success ? `Собрано: [${rarityName(result.recipe.rarity)}] ${result.recipe.name}. Лежит в трюме, пока не экипирован — эффекта нет.\n\n` : `${result.reason}\n\n`);
  }

  const equipGearMatch = /^🛡️ (.+)$/.exec(input);
  if (equipGearMatch) {
    const recipe = findGearByName(equipGearMatch[1]);
    if (!recipe) return workshopScreen(state.player);
    const player = { ...state.player };
    const result = equipGear(player, recipe.id);
    if (!result.ok) return workshopScreen(state.player, 'Не удалось экипировать.\n\n');
    applyDerivedStats(player);
    return workshopScreen(player, `Экипировано: ${recipe.name}.\n\n`);
  }

  const unequipGearMatch = /^🚫 (.+)$/.exec(input);
  if (unequipGearMatch) {
    const recipe = findGearByName(unequipGearMatch[1]);
    if (!recipe) return workshopScreen(state.player);
    const player = { ...state.player };
    unequipGear(player, recipe.slot);
    applyDerivedStats(player);
    return workshopScreen(player, `Снято: ${recipe.name}.\n\n`);
  }

  const upgradeMatch = /^⬆️ (.+)$/.exec(input);
  if (upgradeMatch) {
    const recipe = findGearByName(upgradeMatch[1]);
    if (!recipe) return workshopScreen(state.player);
    const player = { ...state.player, inventory: (state.player.inventory || []).map((i) => ({ ...i })) };
    const check = canUpgradeGear(player, recipe.id);
    if (!check.ok) {
      const reasonText = { MAX_LEVEL: 'уже максимальный уровень.', NO_CREDITS: 'не хватает кредитов.', NO_RESOURCES: 'не хватает ресурсов.' }[check.reason] || 'не получилось.';
      return workshopScreen(state.player, `Не удалось улучшить: ${reasonText}\n\n`);
    }
    const result = upgradeGear(player, recipe.id);
    applyDerivedStats(player);
    return workshopScreen(player, `Улучшено: ${recipe.name} до уровня +${result.newLevel}.\n\n`);
  }

  const equipArtifactMatch = /^💠 (.+)$/.exec(input);
  if (equipArtifactMatch) {
    const artifact = ARTIFACT_POOL.find((a) => a.name === equipArtifactMatch[1]);
    if (!artifact) return workshopScreen(state.player);
    const player = { ...state.player };
    const result = equipArtifact(player, artifact.id);
    if (!result.ok) return workshopScreen(state.player, 'Не удалось экипировать.\n\n');
    applyDerivedStats(player);
    return workshopScreen(player, `Экипировано: ${artifact.name}.\n\n`);
  }

  const unequipArtifactMatch = /^⭕ (.+)$/.exec(input);
  if (unequipArtifactMatch) {
    const artifact = ARTIFACT_POOL.find((a) => a.name === unequipArtifactMatch[1]);
    if (!artifact) return workshopScreen(state.player);
    const player = { ...state.player };
    unequipArtifact(player);
    applyDerivedStats(player);
    return workshopScreen(player, `Снято: ${artifact.name}.\n\n`);
  }

  const equipCompanionMatch = /^🐾 (.+)$/.exec(input);
  if (equipCompanionMatch) {
    const companion = COMPANIONS.find((c) => c.name === equipCompanionMatch[1]);
    if (!companion) return workshopScreen(state.player);
    const player = { ...state.player };
    equipCompanion(player, companion.id);
    return workshopScreen(player, `Компаньон экипирован: ${companion.name}.\n\n`);
  }

  const unequipCompanionMatch = /^🔕 (.+)$/.exec(input);
  if (unequipCompanionMatch) {
    const companion = COMPANIONS.find((c) => c.name === unequipCompanionMatch[1]);
    if (!companion) return workshopScreen(state.player);
    const player = { ...state.player };
    unequipCompanion(player);
    return workshopScreen(player, `Компаньон снят: ${companion.name}.\n\n`);
  }

  const craftShipMatch = /^🔧 (.+)$/.exec(input);
  if (craftShipMatch) {
    const recipe = SHIP_RECIPES.find((r) => r.name === craftShipMatch[1]);
    if (!recipe) return workshopScreen(state.player);
    const player = { ...state.player, ship: { ...state.player.ship } };
    const result = craftShipModule(player, recipe.id);
    if (!result.success) return workshopScreen(state.player, `${result.reason}\n\n`);
    return workshopScreen(player, `Скрафчен модуль корабля: ${recipe.name}.\n\n`);
  }

  const equipShipMatch = /^🔵 (.+)$/.exec(input);
  if (equipShipMatch) {
    const recipe = SHIP_RECIPES.find((r) => r.name === equipShipMatch[1]);
    if (!recipe) return workshopScreen(state.player);
    const player = { ...state.player, ship: { ...state.player.ship } };
    const result = equipShipModule(player, recipe.id);
    if (!result.ok) return workshopScreen(state.player, 'Не удалось экипировать (нет свободного слота?).\n\n');
    return workshopScreen(player, `Экипирован модуль корабля: ${recipe.name} (+${recipe.bonus} ${recipe.stat}).\n\n`);
  }

  const unequipShipMatch = /^⚫ (.+)$/.exec(input);
  if (unequipShipMatch) {
    const recipe = SHIP_RECIPES.find((r) => r.name === unequipShipMatch[1]);
    if (!recipe) return workshopScreen(state.player);
    const player = { ...state.player, ship: { ...state.player.ship } };
    unequipShipModule(player, recipe.id);
    return workshopScreen(player, `Снят модуль корабля: ${recipe.name}.\n\n`);
  }

  const craftMatch = /^🔩 (.+)$/.exec(input);
  if (craftMatch) {
    const recipe = findModuleByName(craftMatch[1]);
    if (!recipe) return workshopScreen(state.player);
    const player = { ...state.player, inventory: (state.player.inventory || []).map((i) => ({ ...i })), modules: [...(state.player.modules || [])] };
    const result = craft(player, recipe.id);
    return workshopScreen(player, result.success ? `Собрано: ${result.recipe.name}. Лежит в трюме, пока не экипирован — эффекта нет.\n\n` : `${result.reason}\n\n`);
  }

  const equipMatch = /^🟢 (.+)$/.exec(input);
  if (equipMatch) {
    const recipe = findModuleByName(equipMatch[1]);
    if (!recipe) return workshopScreen(state.player);
    const player = { ...state.player };
    const result = equipModule(player, recipe.id);
    if (!result.ok) {
      const reasonText = result.reason === 'NO_FREE_SLOT' ? 'нет свободных слотов — сначала сними что-то другое.' : 'не получилось.';
      return workshopScreen(state.player, `Не удалось экипировать: ${reasonText}\n\n`);
    }
    applyDerivedStats(player);
    return workshopScreen(player, `Экипировано: ${recipe.name}.\n\n`);
  }

  const unequipMatch = /^🔴 (.+)$/.exec(input);
  if (unequipMatch) {
    const recipe = findModuleByName(unequipMatch[1]);
    if (!recipe) return workshopScreen(state.player);
    const player = { ...state.player };
    unequipModule(player, recipe.id);
    applyDerivedStats(player);
    return workshopScreen(player, `Снято: ${recipe.name}.\n\n`);
  }

  return workshopScreen(state.player);
}

module.exports = { handleWorkshop, workshopScreen };
