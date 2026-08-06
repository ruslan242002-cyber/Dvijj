'use strict';
/**
* КРАФТ МОДУЛЕЙ КОРАБЛЯ — у персонажа крафт уже был (crafting/crafting-engine.js),
* у корабля — нет, хотя бой корабля полноценно работает (engine/ship.js,
* ship-systems.js, честные КД через ship-skills.js). Асимметрия, которую
* стоило закрыть. Те же принципы: модуль — предмет (player.ship.modules),
* бонус применяется только пока экипирован (player.ship.equippedModules,
* отдельные слоты от персонажа), faction-гейтинг по той же станции игрока.
*
* Бонусы применяются к статам КОРАБЛЯ (armor/firepower/fuelMax/hpMax),
* не персонажа — читаются в той точке, где сейчас считается боевая форма
* корабля (там, где engine/ship.js уже собирает Fighter-объект для боя).
*/
function res(resource, tier, qty) { return { resource, tier, qty }; }
const SHIP_MODULE_SLOTS = 3;
const SHIP_RECIPES = [
{ id: 'ship_armor_1', name: 'Модуль брони I', stat: 'armor', bonus: 5, faction: 'Вуаль', cost: [res('Сплавы', 1, 6), res('Реголит', 1, 4)] },
{ id: 'ship_firepower_1', name: 'Модуль вооружения I', stat: 'firepower', bonus: 5, faction: 'Арсенал', cost: [res('Изотопы', 1, 6), res('Сплавы', 1, 4)] },
{ id: 'ship_fuel_1', name: 'Модуль топливных баков I', stat: 'fuelMax', bonus: 15, faction: 'Терминус', cost: [res('Полимеры', 1, 6), res('Реголит', 1, 4)] },
{ id: 'ship_hull_1', name: 'Модуль корпуса I', stat: 'hpMax', bonus: 40, faction: 'Приют', cost: [res('Биомасса', 1, 6), res('Сплавы', 1, 4)] },
{ id: 'ship_armor_2', name: 'Модуль брони II', stat: 'armor', bonus: 8, faction: 'Вуаль', cost: [res('Сплавы', 3, 6), res('Реголит', 3, 4)] },
{ id: 'ship_firepower_2', name: 'Модуль вооружения II', stat: 'firepower', bonus: 8, faction: 'Арсенал', cost: [res('Изотопы', 3, 6), res('Сплавы', 3, 4)] },
{ id: 'ship_fuel_2', name: 'Модуль топливных баков II', stat: 'fuelMax', bonus: 25, faction: 'Терминус', cost: [res('Полимеры', 3, 6), res('Реголит', 3, 4)] },
{ id: 'ship_hull_2', name: 'Модуль корпуса II', stat: 'hpMax', bonus: 70, faction: 'Приют', cost: [res('Биомасса', 3, 6), res('Сплавы', 3, 4)] },
];
function findShipRecipe(recipeId) {
return SHIP_RECIPES.find((r) => r.id === recipeId) || null;
}
function hasResourcesForShip(player, recipeId) {
const recipe = findShipRecipe(recipeId);
if (!recipe) return false;
const inventory = player.inventory || [];
return recipe.cost.every((need) => {
const stack = inventory.find((i) => i.resource === need.resource && i.tier === need.tier);
return stack && stack.qty >= need.qty;
});
}
function craftShipModule(player, recipeId) {
const recipe = findShipRecipe(recipeId);
if (!recipe) return { success: false, reason: 'Рецепт не найден.' };
if (player.faction !== recipe.faction) return { success: false, reason: `Этот модуль крафтят только на станции «${recipe.faction}».` };
player.ship = player.ship || {};
player.ship.modules = player.ship.modules || [];
if (player.ship.modules.includes(recipe.id)) return { success: false, reason: 'Этот модуль уже есть.' };
if (!hasResourcesForShip(player, recipeId)) return { success: false, reason: 'Не хватает ресурсов.' };
player.inventory = player.inventory.map((i) => ({ ...i }));
for (const need of recipe.cost) {
const stack = player.inventory.find((i) => i.resource === need.resource && i.tier === need.tier);
stack.qty -= need.qty;
}
player.inventory = player.inventory.filter((i) => i.qty > 0);
player.ship.modules.push(recipe.id);
return { success: true, recipe };
}
function shipModuleSlotsFor(player) {
return player.ship?.moduleSlots || SHIP_MODULE_SLOTS;
}
function canEquipShipModule(player, recipeId) {
const recipe = findShipRecipe(recipeId);
if (!recipe) return { ok: false, reason: 'UNKNOWN_MODULE' };
if (!(player.ship?.modules || []).includes(recipeId)) return { ok: false, reason: 'NOT_OWNED' };
const equipped = player.ship?.equippedModules || [];
if (equipped.includes(recipeId)) return { ok: false, reason: 'ALREADY_EQUIPPED' };
if (equipped.length >= shipModuleSlotsFor(player)) return { ok: false, reason: 'NO_FREE_SLOT' };
return { ok: true };
}
function equipShipModule(player, recipeId) {
const check = canEquipShipModule(player, recipeId);
if (!check.ok) return check;
player.ship.equippedModules = [...(player.ship.equippedModules || []), recipeId];
return { ok: true };
}
function unequipShipModule(player, recipeId) {
if (player.ship?.equippedModules) player.ship.equippedModules = player.ship.equippedModules.filter((id) => id !== recipeId);
return { ok: true };
}
/** Суммарный бонус ко всем статам корабля от экипированных модулей —
* использовать там же, где ship.js собирает боевую форму (armor/
* firepower/fuelMax/hpMax += соответствующий bonus). */
function aggregateShipModuleEffects(player) {
const bonuses = {};
for (const id of player.ship?.equippedModules || []) {
const recipe = findShipRecipe(id);
if (!recipe) continue;
bonuses[recipe.stat] = (bonuses[recipe.stat] || 0) + recipe.bonus;
}
return bonuses;
}
module.exports = {
SHIP_RECIPES, findShipRecipe, hasResourcesForShip, craftShipModule,
shipModuleSlotsFor, canEquipShipModule, equipShipModule, unequipShipModule, aggregateShipModuleEffects,
};
