'use strict';
/**
* КРАФТ + ЭКИПИРОВКА МОДУЛЕЙ — база (см. историю ниже) не тронута,
* добавлено по разбору Kimi:
*
* 1) FACTION-ГЕЙТИНГ — у каждого рецепта теперь есть `faction`. Крафтить
* можно только на своей станции (player.faction === recipe.faction) —
* распределение по типу статов, который решил пользователь:
* Приют=endurance (выносливость/реген), Терминус=reaction (уклонение/
* скрытность), Арсенал=firepower+power (урон/крит), Вуаль=shielding+mind
* (броня/интеллект). Старые рецепты без явной специализации (firepower_1
* и т.п.) сохранены как были, просто получили faction по этой таблице —
* это НЕ новый контент, а разметка существующего.
*
* 2) ЧЕРТЕЖИ С БОССОВ — новые рецепты (BOSS_RECIPES) требуют
* player.blueprints.includes(recipe.blueprintFrom) — чертёж падает с
* конкретного именного монстра (engine/bestiary.js), обычным крафтом
* без чертежа этот рецепт недоступен даже при наличии ресурсов.
*
* 3) ПРОКЛЯТЫЕ МОДУЛИ — при крафте 10% шанс, что вместо обычного бонуса
* модуль получает +1 к своему стату, но -1 к случайному другому (риск/
* награда, отдельным экземпляром через recipeId + '_cursed', не портит
* исходный рецепт для остальных крафтов).
*
* ИСТОРИЯ: раньше craft() применял бонус НАВСЕГДА и без возможности
* снять (прямая мутация player.stats). Это не экипировка, а разовая
* трата с эффектом "в один конец". craft() создаёт ПРЕДМЕТ (кладёт
* recipeId в player.modules), а бонус к статам применяется только пока
* модуль ЭКИПИРОВАН (player.equippedModules, ограниченные слоты).
*/
function res(resource, tier, qty) { return { resource, tier, qty }; }
const RECIPES = [
{ id: 'firepower_1', name: 'Модуль огневой мощи I', stat: 'firepower', bonus: 2, faction: 'Арсенал', cost: [res('Изотопы', 1, 5), res('Сплавы', 1, 3)] },
{ id: 'shielding_1', name: 'Модуль экранирования I', stat: 'shielding', bonus: 2, faction: 'Вуаль', cost: [res('Сплавы', 1, 5), res('Полимеры', 1, 3)] },
{ id: 'reaction_1', name: 'Модуль реакции I', stat: 'reaction', bonus: 2, faction: 'Терминус', cost: [res('Реголит', 1, 5), res('Биомасса', 1, 3)] },
{ id: 'endurance_1', name: 'Модуль выносливости I', stat: 'endurance', bonus: 2, faction: 'Приют', cost: [res('Биомасса', 1, 5), res('Реголит', 1, 3)] },
{ id: 'power_1', name: 'Модуль мощи I', stat: 'power', bonus: 2, faction: 'Арсенал', cost: [res('Полимеры', 1, 5), res('Изотопы', 1, 3)] },
{ id: 'mind_1', name: 'Модуль интеллекта I', stat: 'mind', bonus: 2, faction: 'Вуаль', cost: [res('Изотопы', 1, 4), res('Полимеры', 1, 4)] },
{ id: 'firepower_2', name: 'Модуль огневой мощи II', stat: 'firepower', bonus: 3, faction: 'Арсенал', cost: [res('Изотопы', 2, 6), res('Сплавы', 2, 4)] },
{ id: 'shielding_2', name: 'Модуль экранирования II', stat: 'shielding', bonus: 3, faction: 'Вуаль', cost: [res('Сплавы', 2, 6), res('Полимеры', 2, 4)] },
{ id: 'reaction_2', name: 'Модуль реакции II', stat: 'reaction', bonus: 3, faction: 'Терминус', cost: [res('Реголит', 2, 6), res('Биомасса', 2, 4)] },
{ id: 'endurance_2', name: 'Модуль выносливости II', stat: 'endurance', bonus: 3, faction: 'Приют', cost: [res('Биомасса', 2, 6), res('Реголит', 2, 4)] },
{ id: 'power_2', name: 'Модуль мощи II', stat: 'power', bonus: 3, faction: 'Арсенал', cost: [res('Полимеры', 2, 6), res('Изотопы', 2, 4)] },
{ id: 'firepower_3', name: 'Модуль огневой мощи III', stat: 'firepower', bonus: 4, faction: 'Арсенал', cost: [res('Изотопы', 3, 6), res('Реголит', 3, 3)] },
{ id: 'shielding_3', name: 'Модуль экранирования III', stat: 'shielding', bonus: 4, faction: 'Вуаль', cost: [res('Сплавы', 3, 6), res('Биомасса', 3, 3)] },
{ id: 'power_3', name: 'Модуль мощи III', stat: 'power', bonus: 4, faction: 'Арсенал', cost: [res('Полимеры', 3, 6), res('Изотопы', 3, 3)] },
{ id: 'firepower_4', name: 'Модуль огневой мощи IV', stat: 'firepower', bonus: 6, faction: 'Арсенал', cost: [res('Изотопы', 4, 8), res('Реголит', 4, 4)] },
{ id: 'endurance_4', name: 'Модуль выносливости IV', stat: 'endurance', bonus: 6, faction: 'Приют', cost: [res('Биомасса', 4, 8), res('Сплавы', 4, 4)] },
{ id: 'reaction_5', name: 'Модуль реакции V', stat: 'reaction', bonus: 8, faction: 'Терминус', cost: [res('Реголит', 5, 8), res('Полимеры', 5, 5)] },
{ id: 'mind_5', name: 'Модуль интеллекта V', stat: 'mind', bonus: 8, faction: 'Вуаль', cost: [res('Изотопы', 5, 8), res('Полимеры', 5, 5)] },
{ id: 'firepower_6', name: 'Модуль огневой мощи VI', stat: 'firepower', bonus: 12, faction: 'Арсенал', cost: [res('Изотопы', 6, 10), res('Сплавы', 6, 6)] },
{ id: 'power_6', name: 'Модуль мощи VI', stat: 'power', bonus: 12, faction: 'Арсенал', cost: [res('Полимеры', 6, 10), res('Реголит', 6, 6)] },
];

/** Рецепты с боссов — требуют чертёж (player.blueprints), доступны
* независимо от фракции игрока (это трофей, не станционная специализация). */
const BOSS_RECIPES = [
{ id: 'module_graviarh_core', name: 'Модуль «Ядро Гравиарха»', stat: 'power', bonus: 10, faction: null,
blueprintFrom: 'graviarh', cost: [res('Изотопы', 5, 10), res('Сплавы', 5, 6)] },
{ id: 'module_pulsarid_coil', name: 'Модуль «Катушка Пульсарида»', stat: 'reaction', bonus: 10, faction: null,
blueprintFrom: 'pulsarid', cost: [res('Реголит', 5, 10), res('Полимеры', 5, 6)] },
{ id: 'module_eho_matka_shell', name: 'Модуль «Панцирь Эхо-Матки»', stat: 'shielding', bonus: 12, faction: null,
blueprintFrom: 'trakt_eho_matka', cost: [res('Сплавы', 6, 12), res('Биомасса', 6, 8)] },
];
const ALL_RECIPES = [...RECIPES, ...BOSS_RECIPES];

const DEFAULT_MODULE_SLOTS = 4; // меньше, чем рецептов — реальный тактический выбор, не "надень всё"
const CURSED_MODULE_CHANCE = 0.1;
const OTHER_STATS = ['power', 'mind', 'reaction', 'endurance', 'firepower', 'shielding'];

function findRecipe(recipeIdOrRecipe) {
if (recipeIdOrRecipe && typeof recipeIdOrRecipe === 'object') return recipeIdOrRecipe.id ? findRecipe(recipeIdOrRecipe.id) : null;
const baseId = String(recipeIdOrRecipe).replace(/_cursed$/, '');
return ALL_RECIPES.find((r) => r.id === baseId) || null;
}
/** Рецепты, доступные игроку прямо сейчас: своя фракция + все
* faction:null (чертёжные трофеи, доступны всем). */
function recipesForFaction(faction) {
return RECIPES.filter((r) => r.faction === faction);
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
function hasBlueprintFor(player, recipeId) {
const recipe = findRecipe(recipeId);
if (!recipe || !recipe.blueprintFrom) return true; // не чертёжный рецепт — ограничения нет
return (player.blueprints || []).includes(recipe.blueprintFrom);
}
function describeRecipe(recipeId) {
const recipe = findRecipe(recipeId);
if (!recipe) return '';
const costText = recipe.cost.map((c) => `${c.resource} T${c.tier} ×${c.qty}`).join(' + ');
const factionNote = recipe.blueprintFrom ? ` Требует чертёж: ${recipe.blueprintFrom}.` : recipe.faction ? ` Станция: ${recipe.faction}.` : '';
return `${recipe.name} — модуль: +${recipe.bonus} к «${recipe.stat}», пока экипирован. Нужно: ${costText}.${factionNote}`;
}
/** Крафтит МОДУЛЬ (предмет), не применяет бонус сразу. Повторный крафт
* уже имеющегося модуля отклоняется. Гейты: своя фракция (если у
* рецепта задана faction), наличие чертежа (если рецепт чертёжный),
* ресурсы. С шансом CURSED_MODULE_CHANCE создаёт "проклятую" версию —
* тот же id + '_cursed', с +1 к своему стату сверху, но -1 к случайному
* другому статy (не влияет на исходный рецепт для будущих крафтов). */
function craft(player, recipeId, rng = Math.random) {
const recipe = findRecipe(recipeId);
if (!recipe) return { success: false, reason: 'Рецепт не найден.' };
if (recipe.faction && player.faction !== recipe.faction) {
return { success: false, reason: `Этот модуль крафтят только на станции «${recipe.faction}».` };
}
if (!hasBlueprintFor(player, recipeId)) {
return { success: false, reason: `Нужен чертёж (падает с ${recipe.blueprintFrom}).` };
}
player.modules = player.modules || [];
if (player.modules.includes(recipe.id) || player.modules.includes(`${recipe.id}_cursed`)) {
return { success: false, reason: 'Этот модуль уже есть.' };
}
if (!hasResourcesFor(player, recipeId)) return { success: false, reason: 'Не хватает ресурсов.' };
player.inventory = player.inventory.map((i) => ({ ...i }));
for (const need of recipe.cost) {
const stack = player.inventory.find((i) => i.resource === need.resource && i.tier === need.tier);
stack.qty -= need.qty;
}
player.inventory = player.inventory.filter((i) => i.qty > 0);
const isCursed = rng() < CURSED_MODULE_CHANCE;
if (isCursed) {
const otherOptions = OTHER_STATS.filter((s) => s !== recipe.stat);
const penaltyStat = otherOptions[Math.floor(rng() * otherOptions.length)];
player.moduleOverrides = player.moduleOverrides || {};
player.moduleOverrides[`${recipe.id}_cursed`] = { bonus: recipe.bonus + 1, penaltyStat, penaltyAmount: 1 };
player.modules.push(`${recipe.id}_cursed`);
return { success: true, recipe, cursed: true, penaltyStat };
}
player.modules.push(recipe.id);
return { success: true, recipe, cursed: false };
}
function moduleSlotsFor(player) {
return player.moduleSlots || DEFAULT_MODULE_SLOTS;
}
function canEquipModule(player, recipeId) {
const recipe = findRecipe(recipeId);
if (!recipe) return { ok: false, reason: 'UNKNOWN_MODULE' };
if (!(player.modules || []).includes(recipeId)) return { ok: false, reason: 'NOT_OWNED' };
const equipped = player.equippedModules || [];
if (equipped.includes(recipeId)) return { ok: false, reason: 'ALREADY_EQUIPPED' };
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
/** РАЗБОР МОДУЛЯ — по разбору доп. улучшений: раньше скрафтить можно
* было, а вернуть ресурсы, передумав, нельзя — модуль просто оставался
* мёртвым грузом в player.modules. Разбор возвращает ПОЛОВИНУ стоимости
* ресурсов (округление вниз, минимум 1 за позицию, где cost > 0) —
* не полный возврат, иначе крафт+разбор превращались бы в бесплатный
* способ пересобрать инвентарь. Экипированный модуль сначала нужно
* снять (unequipModule) — разобрать надетое нельзя. */
function disassembleModule(player, recipeId) {
const recipe = findRecipe(recipeId);
if (!recipe) return { success: false, reason: 'Рецепт не найден.' };
if ((player.equippedModules || []).includes(recipeId)) return { success: false, reason: 'Сначала сними модуль.' };
if (!(player.modules || []).includes(recipeId)) return { success: false, reason: 'У тебя нет этого модуля.' };
player.modules = player.modules.filter((id) => id !== recipeId);
player.inventory = player.inventory || [];
for (const need of recipe.cost) {
const refundQty = Math.max(1, Math.floor(need.qty / 2));
const stack = player.inventory.find((i) => i.resource === need.resource && i.tier === need.tier);
if (stack) stack.qty += refundQty;
else player.inventory.push({ resource: need.resource, tier: need.tier, qty: refundQty });
}
if (player.moduleOverrides) delete player.moduleOverrides[recipeId];
return { success: true, recipe };
}
/** Суммарный бонус ко всем статам от ЭКИПИРОВАННЫХ модулей — учитывает
* и обычные, и проклятые (через player.moduleOverrides). */
function aggregateModuleEffects(player) {
const bonuses = {};
for (const id of player.equippedModules || []) {
const recipe = findRecipe(id);
if (!recipe) continue;
const override = (player.moduleOverrides || {})[id];
if (override) {
bonuses[recipe.stat] = (bonuses[recipe.stat] || 0) + override.bonus;
bonuses[override.penaltyStat] = (bonuses[override.penaltyStat] || 0) - override.penaltyAmount;
} else {
bonuses[recipe.stat] = (bonuses[recipe.stat] || 0) + recipe.bonus;
}
}
return bonuses;
}
module.exports = {
RECIPES, BOSS_RECIPES, ALL_RECIPES, DEFAULT_MODULE_SLOTS, findRecipe, recipesForFaction,
hasResourcesFor, hasBlueprintFor, describeRecipe, craft, disassembleModule,
moduleSlotsFor, canEquipModule, equipModule, unequipModule, aggregateModuleEffects,
};
