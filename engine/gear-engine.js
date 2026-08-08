'use strict';
const { activeClassEffects } = require('./mentor-classes.js');
const { factionCombatBonus } = require('./faction-combat.js');

/**
 * СНАРЯЖЕНИЕ — оружие и броня шести ступеней редкости (E/D/C/B/A/S,
 * тот же класс опасности бестиария). Две категории на слот, каждая со
 * своим "профилем" распределения статов — не просто перекраска одной и
 * той же цифры, а разный тактический акцент:
 *
 *   Оружие: кинетическое (чистый урон) / точное (урон+Ловкость) /
 *            резонансное (урон+Интеллект)
 *   Броня:  тяжёлая (чистая защита) / лёгкая (защита+Ловкость) /
 *            адаптивная (защита+Интеллект/Выносливость)
 *
 * Материалы — исключительно уже существующие лорные предметы бестиария
 * (не выдумано ни одного нового имени), с классом опасности монстра
 * ровно равным редкости предмета. Осколок Бездны по-прежнему не
 * используется как материал (занят отдельной механикой заражения).
 *
 * УЛУЧШЕНИЕ (по запросу) — каждый предмет можно усиливать до 5 уровней:
 * +15% к его бонусу за уровень (итого ×1.75 на максимум), цена растёт
 * с каждым уровнем и с редкостью предмета — грубее говоря, дёшево
 * прокачать дешёвый предмет до потолка, дорого — топовый.
 */

const RARITY_TIERS = [
  { id: 'common', name: 'Обычное', dangerClass: 'E' },
  { id: 'uncommon', name: 'Необычное', dangerClass: 'D' },
  { id: 'rare', name: 'Редкое', dangerClass: 'C' },
  { id: 'epic', name: 'Эпическое', dangerClass: 'B' },
  { id: 'legendary', name: 'Легендарное', dangerClass: 'A' },
  { id: 'mythic', name: 'Мифическое', dangerClass: 'S' },
];

function res(resource, tier, qty) { return { resource, tier, qty }; }
function item(name, qty) { return { item: name, qty }; }

const MAX_UPGRADE_LEVEL = 5;
const UPGRADE_BONUS_PER_LEVEL = 0.15; // +15% от базового бонуса предмета за уровень

const WEAPON_RECIPES = [
  { id: 'weapon_common_kinetic', slot: 'weapon', rarity: 'common', name: 'Обломочный резак', archetype: 'Кинетическое', stats: { firepower: 6 }, credits: 300,
    materials: [item('Обломки сплава', 8)], cost: [res('Сплавы', 1, 10)] },
  { id: 'weapon_common_precise', slot: 'weapon', rarity: 'common', name: 'Сенсорный клинок', archetype: 'Точное', stats: { firepower: 4, reaction: 3 }, credits: 320,
    materials: [item('Сенсорный глаз', 6)], cost: [res('Сплавы', 1, 8)] },

  { id: 'weapon_uncommon_kinetic', slot: 'weapon', rarity: 'uncommon', name: 'Клык Разломника', archetype: 'Кинетическое', stats: { firepower: 12 }, credits: 700,
    materials: [item('Разломный клык', 5)], cost: [res('Изотопы', 2, 8)] },
  { id: 'weapon_uncommon_resonant', slot: 'weapon', rarity: 'uncommon', name: 'Клешня-ретранслятор', archetype: 'Резонансное', stats: { firepower: 8, mind: 5 }, credits: 750,
    materials: [item('Ретранслятор-клешня', 5)], cost: [res('Изотопы', 2, 7)] },

  { id: 'weapon_rare_precise', slot: 'weapon', rarity: 'rare', name: 'Игольный эмиттер', archetype: 'Точное', stats: { firepower: 16, reaction: 8 }, credits: 1500,
    materials: [item('Кристаллическая игла', 4)], cost: [res('Реголит', 3, 6)] },
  { id: 'weapon_rare_resonant', slot: 'weapon', rarity: 'rare', name: 'Нейротоксичный клинок', archetype: 'Резонансное', stats: { firepower: 14, mind: 10 }, credits: 1550,
    materials: [item('Нейротоксин', 4)], cost: [res('Реголит', 3, 6)] },

  { id: 'weapon_epic_kinetic', slot: 'weapon', rarity: 'epic', name: 'Клинок Гравиарха', archetype: 'Кинетическое', stats: { firepower: 38 }, credits: 3200,
    materials: [item('Гравитационный яд', 3)], cost: [res('Изотопы', 4, 8)] },
  { id: 'weapon_epic_resonant', slot: 'weapon', rarity: 'epic', name: 'Пульс-эмиттер', archetype: 'Резонансное', stats: { firepower: 26, mind: 16 }, credits: 3300,
    materials: [item('Железы пульсарида', 3)], cost: [res('Изотопы', 4, 8)] },

  { id: 'weapon_legendary_kinetic', slot: 'weapon', rarity: 'legendary', name: 'Клинок Пустоты', archetype: 'Кинетическое', stats: { firepower: 62 }, credits: 7000,
    materials: [item('Тёмная энергия', 2)], cost: [res('Полимеры', 5, 6)] },
  { id: 'weapon_legendary_resonant', slot: 'weapon', rarity: 'legendary', name: 'Протокол-разрушитель', archetype: 'Резонансное', stats: { firepower: 42, mind: 28 }, credits: 7200,
    materials: [item('Фрагмент протокола', 2)], cost: [res('Полимеры', 5, 6)] },

  { id: 'weapon_mythic', slot: 'weapon', rarity: 'mythic', name: 'Нихрон-резонатор', archetype: 'Кинетическое', stats: { firepower: 100 }, credits: 18000,
    materials: [item('Сплав «Нихрон»', 1)], cost: [res('Изотопы', 6, 10)] },

  // ── Новые монстры (Ярмарка Теней/Разлом Кайлара/Кузня Забытых/Бездна
  // Оррин/Периметр Танвир/Кладбище флота) — заполняют архетип "Точное" и
  // "Кинетическое" на ступенях, где раньше их не было вообще. ──
  { id: 'weapon_uncommon_precise', slot: 'weapon', rarity: 'uncommon', name: 'Нервный клинок', archetype: 'Точное', stats: { firepower: 10, reaction: 6 }, credits: 720,
    materials: [item('Нервный шип', 5)], cost: [res('Изотопы', 2, 7)] },
  { id: 'weapon_rare_kinetic', slot: 'weapon', rarity: 'rare', name: 'Импульсный молот', archetype: 'Кинетическое', stats: { firepower: 18 }, credits: 1520,
    materials: [item('Импульсный сгусток', 4)], cost: [res('Реголит', 3, 6)] },
  { id: 'weapon_epic_precise', slot: 'weapon', rarity: 'epic', name: 'Плазменная игла', archetype: 'Точное', stats: { firepower: 30, reaction: 12 }, credits: 3250,
    materials: [item('Плазменная нить', 3)], cost: [res('Изотопы', 4, 8)] },
  { id: 'weapon_legendary_precise', slot: 'weapon', rarity: 'legendary', name: 'Тракт-игла', archetype: 'Точное', stats: { firepower: 50, reaction: 20 }, credits: 7100,
    materials: [item('Чистый осколок Тракта', 2)], cost: [res('Полимеры', 5, 6)] },
];

const ARMOR_RECIPES = [
  { id: 'armor_common_heavy', slot: 'armor', rarity: 'common', name: 'Хитиновый нагрудник', archetype: 'Тяжёлая', stats: { shielding: 5 }, credits: 300,
    materials: [item('Хитиновые пластины', 8)], cost: [res('Реголит', 1, 10)] },
  { id: 'armor_common_adaptive', slot: 'armor', rarity: 'common', name: 'Технолом-каркас', archetype: 'Адаптивная', stats: { shielding: 3, mind: 3 }, credits: 320,
    materials: [item('Технолом', 6)], cost: [res('Реголит', 1, 8)] },

  { id: 'armor_uncommon_heavy', slot: 'armor', rarity: 'uncommon', name: 'Заряженный панцирь-плита', archetype: 'Тяжёлая', stats: { shielding: 10 }, credits: 700,
    materials: [item('Заряженный панцирь', 5)], cost: [res('Сплавы', 2, 8)] },
  { id: 'armor_uncommon_light', slot: 'armor', rarity: 'uncommon', name: 'Мембрана-плащ', archetype: 'Лёгкая', stats: { shielding: 6, reaction: 6 }, credits: 750,
    materials: [item('Голосовая мембрана', 5)], cost: [res('Сплавы', 2, 7)] },

  { id: 'armor_rare_light', slot: 'armor', rarity: 'rare', name: 'Плетёная броня ткача', archetype: 'Лёгкая', stats: { shielding: 12, reaction: 8 }, credits: 1500,
    materials: [item('Плетёный панцирь', 4)], cost: [res('Биомасса', 3, 6)] },
  { id: 'armor_rare_heavy', slot: 'armor', rarity: 'rare', name: 'Панцирь щелкуна', archetype: 'Тяжёлая', stats: { shielding: 13, endurance: 8 }, credits: 1550,
    materials: [item('Железы щелкуна', 4)], cost: [res('Биомасса', 3, 6)] },

  { id: 'armor_epic_heavy', slot: 'armor', rarity: 'epic', name: 'Экзопанцирь Гравиарха', archetype: 'Тяжёлая', stats: { shielding: 30 }, credits: 3200,
    materials: [item('Пластины экзопанциря', 3)], cost: [res('Реголит', 4, 8)] },
  { id: 'armor_epic_adaptive', slot: 'armor', rarity: 'epic', name: 'Нейронная сеть-плащ', archetype: 'Адаптивная', stats: { shielding: 20, mind: 14 }, credits: 3300,
    materials: [item('Нейронный узел', 3)], cost: [res('Реголит', 4, 8)] },

  { id: 'armor_legendary_heavy', slot: 'armor', rarity: 'legendary', name: 'Реликтовая броня Стража', archetype: 'Тяжёлая', stats: { shielding: 48 }, credits: 7000,
    materials: [item('Реликтовый сплав', 2)], cost: [res('Сплавы', 5, 6)] },
  { id: 'armor_legendary_adaptive', slot: 'armor', rarity: 'legendary', name: 'Икра-панцирь эхо-матки', archetype: 'Адаптивная', stats: { shielding: 32, endurance: 22 }, credits: 7200,
    materials: [item('Эхо-икра', 2)], cost: [res('Сплавы', 5, 6)] },

  { id: 'armor_mythic', slot: 'armor', rarity: 'mythic', name: 'Ядро-панцирь Жнеца', archetype: 'Тяжёлая', stats: { shielding: 78 }, credits: 18000,
    materials: [item('Энергоядро', 1)], cost: [res('Реголит', 6, 10)] },

  { id: 'armor_uncommon_adaptive', slot: 'armor', rarity: 'uncommon', name: 'Плащ теневого рынка', archetype: 'Адаптивная', stats: { shielding: 6, mind: 4 }, credits: 720,
    materials: [item('Обломки лёгкой брони', 5)], cost: [res('Полимеры', 2, 7)] },
  { id: 'armor_rare_adaptive', slot: 'armor', rarity: 'rare', name: 'Архивный экзоскелет', archetype: 'Адаптивная', stats: { shielding: 11, mind: 9 }, credits: 1520,
    materials: [item('Архивный диск', 4)], cost: [res('Полимеры', 3, 6)] },
  { id: 'armor_epic_light', slot: 'armor', rarity: 'epic', name: 'Резонансная мембрана', archetype: 'Лёгкая', stats: { shielding: 22, reaction: 16 }, credits: 3250,
    materials: [item('Застывший резонанс', 3)], cost: [res('Биомасса', 4, 8)] },
  { id: 'armor_legendary_light', slot: 'armor', rarity: 'legendary', name: 'Пустотный плащ', archetype: 'Лёгкая', stats: { shielding: 36, reaction: 26 }, credits: 7100,
    materials: [item('Фрагмент пустоты', 2)], cost: [res('Биомасса', 5, 6)] },
];

const GEAR_RECIPES = [...WEAPON_RECIPES, ...ARMOR_RECIPES];

function findGearRecipe(idOrRecipe) {
  if (idOrRecipe && typeof idOrRecipe === 'object') return idOrRecipe.id ? findGearRecipe(idOrRecipe.id) : null;
  return GEAR_RECIPES.find((r) => r.id === idOrRecipe) || null;
}

function rarityName(rarityId) {
  return RARITY_TIERS.find((r) => r.id === rarityId)?.name || rarityId;
}

function hasMaterialsFor(player, recipeId) {
  const recipe = findGearRecipe(recipeId);
  if (!recipe) return false;
  const bag = player.bestiaryItems || [];
  const counts = {};
  for (const name of bag) counts[name] = (counts[name] || 0) + 1;
  return recipe.materials.every((need) => (counts[need.item] || 0) >= need.qty);
}

function hasResourcesFor(player, recipeId) {
  const recipe = findGearRecipe(recipeId);
  if (!recipe) return false;
  const inventory = player.inventory || [];
  return recipe.cost.every((need) => {
    const stack = inventory.find((i) => i.resource === need.resource && i.tier === need.tier);
    return stack && stack.qty >= need.qty;
  });
}

/** Скидка Кузнеца (класс-наставник) на кредитную стоимость крафта —
 * читается прямо из эффектов текущей ступени, применяется ЗДЕСЬ, а не
 * в derived-stats.js (это не боевой стат, а модификатор цены,
 * применимый только в момент самого крафта). */
function effectiveCraftCost(player, baseCredits) {
  const discount = (activeClassEffects(player).craftDiscount || 0) + (factionCombatBonus(player.faction).craftDiscount || 0);
  return Math.round(baseCredits * (1 - discount));
}

function canAffordGear(player, recipeId) {
  const recipe = findGearRecipe(recipeId);
  if (!recipe) return false;
  return hasMaterialsFor(player, recipeId) && hasResourcesFor(player, recipeId) && (player.credits || 0) >= effectiveCraftCost(player, recipe.credits);
}

function statsText(stats) {
  return Object.entries(stats).map(([k, v]) => `+${v} ${k}`).join(', ');
}

function describeGearRecipe(recipeId) {
  const recipe = findGearRecipe(recipeId);
  if (!recipe) return '';
  const matText = recipe.materials.map((m) => `${m.item} ×${m.qty}`).join(' + ');
  const costText = recipe.cost.map((c) => `${c.resource} T${c.tier} ×${c.qty}`).join(' + ');
  const slotLabel = recipe.slot === 'weapon' ? 'Оружие' : 'Броня';
  return `[${rarityName(recipe.rarity)}] ${recipe.name} (${slotLabel}, ${recipe.archetype}) — ${statsText(recipe.stats)}. Нужно: ${matText}, ${costText}, 💳${recipe.credits}.`;
}

function craftGear(player, recipeId) {
  const recipe = findGearRecipe(recipeId);
  if (!recipe) return { success: false, reason: 'Рецепт не найден.' };
  player.gear = player.gear || [];
  if (player.gear.includes(recipe.id)) return { success: false, reason: 'Этот предмет уже есть.' };
  if (!canAffordGear(player, recipeId)) return { success: false, reason: 'Не хватает материалов, ресурсов или кредитов.' };

  const bag = [...player.bestiaryItems];
  for (const need of recipe.materials) {
    let toRemove = need.qty;
    for (let i = bag.length - 1; i >= 0 && toRemove > 0; i--) {
      if (bag[i] === need.item) { bag.splice(i, 1); toRemove--; }
    }
  }
  player.bestiaryItems = bag;

  player.inventory = player.inventory.map((i) => ({ ...i }));
  for (const need of recipe.cost) {
    const stack = player.inventory.find((i) => i.resource === need.resource && i.tier === need.tier);
    stack.qty -= need.qty;
  }
  player.inventory = player.inventory.filter((i) => i.qty > 0);

  player.credits -= effectiveCraftCost(player, recipe.credits);
  player.gear.push(recipe.id);

  return { success: true, recipe };
}

function moduleSlotsForGear() { return 1; } // не используется здесь, задел на будущее если появятся общие слоты

function equipGear(player, recipeId) {
  const recipe = findGearRecipe(recipeId);
  if (!recipe) return { ok: false, reason: 'UNKNOWN_GEAR' };
  if (!(player.gear || []).includes(recipe.id)) return { ok: false, reason: 'NOT_OWNED' };
  player.equippedGear = player.equippedGear || {};
  player.equippedGear[recipe.slot] = recipe.id;
  return { ok: true };
}

function unequipGear(player, slot) {
  player.equippedGear = player.equippedGear || {};
  delete player.equippedGear[slot];
  return { ok: true };
}

// ── Улучшение предмета ──

function upgradeLevelOf(player, recipeId) {
  return (player.gearUpgrades && player.gearUpgrades[recipeId]) || 0;
}

/** Цена следующего уровня улучшения — растёт и с уровнем, и с редкостью
 * предмета (через recipe.credits/cost как базу). Материалы бестиария НЕ
 * тратятся на улучшение (это расходовало бы редкие трофеи бесконечно) —
 * только обычные ресурсы + кредиты, но по нарастающей. */
function upgradeCost(recipeId, targetLevel) {
  const recipe = findGearRecipe(recipeId);
  if (!recipe) return null;
  const mult = 0.35 * targetLevel;
  return {
    credits: Math.round(recipe.credits * mult),
    resources: recipe.cost.map((c) => ({ ...c, qty: Math.max(1, Math.round(c.qty * mult)) })),
  };
}

function canUpgradeGear(player, recipeId) {
  const recipe = findGearRecipe(recipeId);
  if (!recipe) return { ok: false, reason: 'UNKNOWN_GEAR' };
  if (!(player.gear || []).includes(recipe.id)) return { ok: false, reason: 'NOT_OWNED' };
  const level = upgradeLevelOf(player, recipeId);
  if (level >= MAX_UPGRADE_LEVEL) return { ok: false, reason: 'MAX_LEVEL' };
  const cost = upgradeCost(recipeId, level + 1);
  if ((player.credits || 0) < cost.credits) return { ok: false, reason: 'NO_CREDITS' };
  const inventory = player.inventory || [];
  const enoughRes = cost.resources.every((need) => {
    const stack = inventory.find((i) => i.resource === need.resource && i.tier === need.tier);
    return stack && stack.qty >= need.qty;
  });
  if (!enoughRes) return { ok: false, reason: 'NO_RESOURCES' };
  return { ok: true, cost, nextLevel: level + 1 };
}

function upgradeGear(player, recipeId) {
  const check = canUpgradeGear(player, recipeId);
  if (!check.ok) return check;

  player.inventory = player.inventory.map((i) => ({ ...i }));
  for (const need of check.cost.resources) {
    const stack = player.inventory.find((i) => i.resource === need.resource && i.tier === need.tier);
    stack.qty -= need.qty;
  }
  player.inventory = player.inventory.filter((i) => i.qty > 0);
  player.credits -= check.cost.credits;

  player.gearUpgrades = player.gearUpgrades || {};
  player.gearUpgrades[recipeId] = check.nextLevel;

  return { ok: true, newLevel: check.nextLevel };
}

/** Статы предмета С УЧЁТОМ уровня улучшения — +15%/уровень от базы,
 * округляется отдельно по каждому стату. */
function statsAtLevel(recipe, level) {
  const mult = 1 + level * UPGRADE_BONUS_PER_LEVEL;
  const out = {};
  for (const [stat, base] of Object.entries(recipe.stats)) {
    out[stat] = Math.round(base * mult);
  }
  return out;
}

/** Суммарный бонус от экипированного оружия+брони, с учётом улучшений —
 * используется в engine/derived-stats.js рядом с aggregateModuleEffects. */
function aggregateGearEffects(player) {
  const bonuses = {};
  const equipped = player.equippedGear || {};
  // Мастерство Кузнеца (ступень 3+) — не "запечённый" в момент крафта
  // бонус (снаряжение в этой системе — просто id рецепта, без отдельного
  // состояния экземпляра, как и уровень апгрейда — тоже читается per-
  // player динамически, не хранится в самом предмете), а живой множитель,
  // применяется здесь же, где уже читается upgrade level.
  const smithBonusPct = activeClassEffects(player).gearStatBonusPct || 0;
  for (const slot of Object.keys(equipped)) {
    const recipeId = equipped[slot];
    const recipe = findGearRecipe(recipeId);
    if (!recipe) continue;
    const level = upgradeLevelOf(player, recipeId);
    const stats = statsAtLevel(recipe, level);
    for (const [stat, value] of Object.entries(stats)) {
      bonuses[stat] = (bonuses[stat] || 0) + Math.round(value * (1 + smithBonusPct));
    }
  }
  return bonuses;
}

/** Легенда кузни (Кузнец, 5 ступень) — раз в день бесплатно перековать
 * владеемый предмет на другой архетип ТОЙ ЖЕ редкости и слота. День
 * считается тем же способом, что и остальные daily-механики в проекте
 * (contracts-engine.js/daily-streak.js) — тот же DAY_MS подход. */
function canReforgeToday(player) {
  if (!activeClassEffects(player).freeReforge) return false;
  const today = Math.floor(Date.now() / 86400000);
  return player.lastReforgeDay !== today;
}

function reforgeableAlternatives(recipeId) {
  const recipe = findGearRecipe(recipeId);
  if (!recipe) return [];
  return GEAR_RECIPES.filter((r) => r.slot === recipe.slot && r.rarity === recipe.rarity && r.id !== recipe.id);
}

function reforgeGear(player, oldRecipeId, newRecipeId) {
  if (!canReforgeToday(player)) return { success: false, reason: 'NOT_AVAILABLE' };
  const oldRecipe = findGearRecipe(oldRecipeId);
  const newRecipe = findGearRecipe(newRecipeId);
  if (!oldRecipe || !newRecipe) return { success: false, reason: 'UNKNOWN_RECIPE' };
  if (!(player.gear || []).includes(oldRecipeId)) return { success: false, reason: 'NOT_OWNED' };
  if (oldRecipe.slot !== newRecipe.slot || oldRecipe.rarity !== newRecipe.rarity) return { success: false, reason: 'MISMATCHED_TIER' };
  player.gear = player.gear.map((id) => (id === oldRecipeId ? newRecipeId : id));
  player.equippedGear = player.equippedGear || {};
  for (const slot of Object.keys(player.equippedGear)) {
    if (player.equippedGear[slot] === oldRecipeId) player.equippedGear[slot] = newRecipeId;
  }
  player.lastReforgeDay = Math.floor(Date.now() / 86400000);
  return { success: true, newRecipe };
}

module.exports = {
  RARITY_TIERS, WEAPON_RECIPES, ARMOR_RECIPES, GEAR_RECIPES, MAX_UPGRADE_LEVEL, UPGRADE_BONUS_PER_LEVEL,
  findGearRecipe, rarityName, hasMaterialsFor, hasResourcesFor, canAffordGear, describeGearRecipe, statsText,
  craftGear, equipGear, unequipGear, aggregateGearEffects,
  canReforgeToday, reforgeableAlternatives, reforgeGear,
  upgradeLevelOf, upgradeCost, canUpgradeGear, upgradeGear, statsAtLevel,
};
