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

  const sections = [];
  if (equippedLines.length || notEquippedLines.length) {
    sections.push(`⚙️ Модули (слотов занято ${equipped.length}/${slots}) — 🟢 экипировать, 🔴 снять:\n${[...equippedLines, ...notEquippedLines].join('\n')}`);
  }
  if (gearOwnedLines.length) {
    sections.push(`🗡️ Снаряжение (у тебя) — 🛡️ экипировать, 🚫 снять, ⬆️ улучшить:\n${gearOwnedLines.join('\n')}`);
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
