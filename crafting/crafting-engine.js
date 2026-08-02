'use strict';

/**
 * КРАФТ + ЭКИПИРОВКА МОДУЛЕЙ — раньше craft() применял бонус НАВСЕГДА и
 * без возможности снять (прямая мутация player.stats). Это не экипировка,
 * а разовая трата с эффектом "в один конец". Теперь: craft() создаёт
 * ПРЕДМЕТ (кладёт recipeId в player.modules), а бонус к статам применяется
 * только пока модуль ЭКИПИРОВАН (player.equippedModules, ограниченные
 * слоты) — можно снять и поставить другой, тактический выбор реален.
 */

function res(resource, tier, qty) { return { resource, tier, qty }; }

const RECIPES = [
  { id: 'firepower_1', name: 'Модуль огневой мощи I', stat: 'firepower', bonus: 2, cost: [res('Изотопы', 1, 5), res('Сплавы', 1, 3)] },
  { id: 'shielding_1', name: 'Модуль экранирования I', stat: 'shielding', bonus: 2, cost: [res('Сплавы', 1, 5), res('Полимеры', 1, 3)] },
  { id: 'reaction_1', name: 'Модуль реакции I', stat: 'reaction', bonus: 2, cost: [res('Реголит', 1, 5), res('Биомасса', 1, 3)] },
  { id: 'endurance_1', name: 'Модуль выносливости I', stat: 'endurance', bonus: 2, cost: [res('Биомасса', 1, 5), res('Реголит', 1, 3)] },
  { id: 'power_1', name: 'Модуль мощи I', stat: 'power', bonus: 2, cost: [res('Полимеры', 1, 5), res('Изотопы', 1, 3)] },
  { id: 'mind_1', name: 'Модуль интеллекта I', stat: 'mind', bonus: 2, cost: [res('Изотопы', 1, 4), res('Полимеры', 1, 4)] },

  { id: 'firepower_2', name: 'Модуль огневой мощи II', stat: 'firepower', bonus: 3, cost: [res('Изотопы', 2, 6), res('Сплавы', 2, 4)] },
  { id: 'shielding_2', name: 'Модуль экранирования II', stat: 'shielding', bonus: 3, cost: [res('Сплавы', 2, 6), res('Полимеры', 2, 4)] },
  { id: 'reaction_2', name: 'Модуль реакции II', stat: 'reaction', bonus: 3, cost: [res('Реголит', 2, 6), res('Биомасса', 2, 4)] },
  { id: 'endurance_2', name: 'Модуль выносливости II', stat: 'endurance', bonus: 3, cost: [res('Биомасса', 2, 6), res('Реголит', 2, 4)] },
  { id: 'power_2', name: 'Модуль мощи II', stat: 'power', bonus: 3, cost: [res('Полимеры', 2, 6), res('Изотопы', 2, 4)] },

  { id: 'firepower_3', name: 'Модуль огневой мощи III', stat: 'firepower', bonus: 4, cost: [res('Изотопы', 3, 6), res('Реголит', 3, 3)] },
  { id: 'shielding_3', name: 'Модуль экранирования III', stat: 'shielding', bonus: 4, cost: [res('Сплавы', 3, 6), res('Биомасса', 3, 3)] },
  { id: 'power_3', name: 'Модуль мощи III', stat: 'power', bonus: 4, cost: [res('Полимеры', 3, 6), res('Изотопы', 3, 3)] },

  { id: 'firepower_4', name: 'Модуль огневой мощи IV', stat: 'firepower', bonus: 6, cost: [res('Изотопы', 4, 8), res('Реголит', 4, 4)] },
  { id: 'endurance_4', name: 'Модуль выносливости IV', stat: 'endurance', bonus: 6, cost: [res('Биомасса', 4, 8), res('Сплавы', 4, 4)] },

  { id: 'reaction_5', name: 'Модуль реакции V', stat: 'reaction', bonus: 8, cost: [res('Реголит', 5, 8), res('Полимеры', 5, 5)] },
  { id: 'mind_5', name: 'Модуль интеллекта V', stat: 'mind', bonus: 8, cost: [res('Изотопы', 5, 8), res('Полимеры', 5, 5)] },

  { id: 'firepower_6', name: 'Модуль огневой мощи VI', stat: 'firepower', bonus: 12, cost: [res('Изотопы', 6, 10), res('Сплавы', 6, 6)] },
  { id: 'power_6', name: 'Модуль мощи VI', stat: 'power', bonus: 12, cost: [res('Полимеры', 6, 10), res('Реголит', 6, 6)] },
];

const DEFAULT_MODULE_SLOTS = 4; // меньше, чем рецептов — реальный тактический выбор, не "надень всё"

function findRecipe(recipeIdOrRecipe) {
  if (recipeIdOrRecipe && typeof recipeIdOrRecipe === 'object') return recipeIdOrRecipe.id ? findRecipe(recipeIdOrRecipe.id) : null;
  return RECIPES.find((r) => r.id === recipeIdOrRecipe) || null;
}

function hasResourcesFor(player, recipeId) {
  const recipe = findRecipe(recipeId);
  if (!recipe) return false;
  const inventory = player.inventory || [];
  return recipe.cost.every((need) => {
    const stack = inventory.find((i) => i.resource === need.resource && i.tier === need.tier);
    return stack && stack.qty >= need.qty;
  });
}

function describeRecipe(recipeId) {
  const recipe = findRecipe(recipeId);
  if (!recipe) return '';
  const costText = recipe.cost.map((c) => `${c.resource} T${c.tier} ×${c.qty}`).join(' + ');
  return `${recipe.name} — модуль: +${recipe.bonus} к «${recipe.stat}», пока экипирован. Нужно: ${costText}.`;
}

/** Крафтит МОДУЛЬ (предмет), не применяет бонус сразу. Повторный крафт
 * уже имеющегося модуля отклоняется — незачем множить одинаковые предметы,
 * которые всё равно нельзя экипировать дважды разом. */
function craft(player, recipeId) {
  const recipe = findRecipe(recipeId);
  if (!recipe) return { success: false, reason: 'Рецепт не найден.' };
  player.modules = player.modules || [];
  if (player.modules.includes(recipe.id)) return { success: false, reason: 'Этот модуль уже есть.' };
  if (!hasResourcesFor(player, recipeId)) return { success: false, reason: 'Не хватает ресурсов.' };

  player.inventory = player.inventory.map((i) => ({ ...i }));
  for (const need of recipe.cost) {
    const stack = player.inventory.find((i) => i.resource === need.resource && i.tier === need.tier);
    stack.qty -= need.qty;
  }
  player.inventory = player.inventory.filter((i) => i.qty > 0);
  player.modules.push(recipe.id);

  return { success: true, recipe };
}

function moduleSlotsFor(player) {
  return player.moduleSlots || DEFAULT_MODULE_SLOTS;
}

function canEquipModule(player, recipeId) {
  const recipe = findRecipe(recipeId);
  if (!recipe) return { ok: false, reason: 'UNKNOWN_MODULE' };
  if (!(player.modules || []).includes(recipe.id)) return { ok: false, reason: 'NOT_OWNED' };
  const equipped = player.equippedModules || [];
  if (equipped.includes(recipe.id)) return { ok: false, reason: 'ALREADY_EQUIPPED' };
  if (equipped.length >= moduleSlotsFor(player)) return { ok: false, reason: 'NO_FREE_SLOT' };
  return { ok: true };
}

function equipModule(player, recipeId) {
  const check = canEquipModule(player, recipeId);
  if (!check.ok) return check;
  player.equippedModules = [...(player.equippedModules || []), recipeId];
  return { ok: true };
}

function unequipModule(player, recipeId) {
  player.equippedModules = (player.equippedModules || []).filter((id) => id !== recipeId);
  return { ok: true };
}

/** Суммарный бонус ко всем статам от ЭКИПИРОВАННЫХ (не всех имеющихся)
 * модулей — используется в engine/derived-stats.js. */
function aggregateModuleEffects(player) {
  const bonuses = {};
  for (const id of player.equippedModules || []) {
    const recipe = findRecipe(id);
    if (!recipe) continue;
    bonuses[recipe.stat] = (bonuses[recipe.stat] || 0) + recipe.bonus;
  }
  return bonuses;
}

module.exports = {
  RECIPES, DEFAULT_MODULE_SLOTS, findRecipe, hasResourcesFor, describeRecipe, craft,
  moduleSlotsFor, canEquipModule, equipModule, unequipModule, aggregateModuleEffects,
};
