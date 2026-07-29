/**
 * Логика Мастерской: список доступных рецептов, проверка, хватает ли
 * ресурсов, и сам крафт (списывает ресурсы, прибавляет стат навсегда).
 * Рецепты можно крафтить многократно — это осознанный сток ресурсов,
 * а не разовая покупка.
 */
'use strict';

const { RECIPES } = require('./recipes-data.js');

function findRecipe(recipeId) {
  return RECIPES.find((r) => r.id === recipeId) || null;
}

function hasResourcesFor(player, recipe) {
  return recipe.inputs.every((inp) => {
    const item = (player.inventory || []).find((i) => i.resource === inp.resource && i.tier === inp.tier);
    return !!item && item.qty >= inp.qty;
  });
}

function describeRecipe(recipe) {
  const costs = recipe.inputs.map((i) => `${i.qty}× ${i.resource} T${i.tier}`).join(' + ');
  return `${recipe.name} — ${costs} → +${recipe.statBonus.amount} к ${recipe.statBonus.stat}`;
}

/** Крафтит рецепт: списывает ресурсы, прибавляет стат. Мутирует player.
 * Возвращает { success, reason? }. */
function craft(player, recipeId) {
  const recipe = findRecipe(recipeId);
  if (!recipe) return { success: false, reason: 'Рецепт не найден.' };
  if (!hasResourcesFor(player, recipe)) return { success: false, reason: 'Не хватает ресурсов.' };

  for (const inp of recipe.inputs) {
    const item = player.inventory.find((i) => i.resource === inp.resource && i.tier === inp.tier);
    item.qty -= inp.qty;
  }
  player.inventory = player.inventory.filter((i) => i.qty > 0);

  player.stats = player.stats || {};
  player.stats[recipe.statBonus.stat] = (player.stats[recipe.statBonus.stat] || 0) + recipe.statBonus.amount;

  player.craftedModules = player.craftedModules || [];
  player.craftedModules.push(recipeId);

  return { success: true, recipe };
}

module.exports = { RECIPES, findRecipe, hasResourcesFor, describeRecipe, craft };
