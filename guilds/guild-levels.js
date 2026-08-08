'use strict';

/**
 * ГИЛЬД-АПГРЕЙДЫ ЗА РЕСУРСЫ — решение: без еженедельного содержания, только
 * разовые покупки уровней за ресурсы гильд-банка (тот же принцип, что и
 * crafting: потратил один раз — бонус навсегда). Как и activeClassEffects()
 * в mentor-classes.js, бонусы уровней СУММИРУЮТСЯ по всем пройденным
 * ступеням, не только текущей — activeGuildBonuses() отдаёт объединённый
 * эффект всех уровней ≤ guild.upgradeLevel.
 *
 * Уровень 3 намеренно требует эксклюзивный фракционный ресурс (см.
 * engine/faction-resources.js) — гильдия одной фракции физически не
 * закроет топ-апгрейд сама, нужен смешанный состав или торговля с другой
 * фракцией. Это тот же принцип жёсткой зависимости, только на уровне
 * гильдии, а не отдельного крафтера.
 */

const GUILD_LEVELS = [
    {
        level: 1,
        name: 'Опорный пункт',
        cost: [
            { resource: 'Сплавы', tier: 2, qty: 200 },
            { resource: 'Биомасса', tier: 2, qty: 200 },
        ],
        bonus: { marketDiscountPct: 5 },
        description: '−5% к ценам на рынке для всех членов гильдии',
    },
    {
        level: 2,
        name: 'Индустриальный узел',
        cost: [
            { resource: 'Сплавы', tier: 3, qty: 400 },
            { resource: 'Полимеры', tier: 3, qty: 300 },
            { resource: 'Изотопы', tier: 3, qty: 150 },
        ],
        bonus: { marketDiscountPct: 5, explorationYieldPct: 10 },
        description: '+10% к добыче ресурсов в вылазках и космосе для всех членов гильдии (суммируется с уровнем 1)',
    },
    {
        level: 3,
        name: 'Держава Тракта',
        // намеренно требует чужой эксклюзив — см. engine/faction-resources.js
        // (tier у эксклюзивных ресурсов не используется добычей/боем, ставим 0 условно)
        cost: [
            { resource: 'Сплавы', tier: 4, qty: 600 },
            { resource: 'Реголит', tier: 4, qty: 400 },
            { resource: 'Ядро жилы', tier: 0, qty: 20 },
        ],
        bonus: { marketDiscountPct: 5, explorationYieldPct: 10, worldBossDamagePct: 15 },
        description: '+15% урона по мировому боссу для всех членов гильдии (суммируется с уровнями 1-2)',
    },
];

function levelDef(level) {
    return GUILD_LEVELS.find((entry) => entry.level === level) || null;
}

/** Стоимость следующего уровня (null, если гильдия уже максимального уровня). */
function nextUpgradeCost(currentLevel) {
    const def = levelDef((currentLevel || 0) + 1);
    return def ? def.cost : null;
}

/** guildBankResources — массив стаков как из store.getGuildBankResources():
 *  [{ resource, tier, qty }, ...]. Проверяет, хватает ли ресурсов на
 *  следующий уровень. */
function canAffordNextUpgrade(currentLevel, guildBankResources = []) {
    const cost = nextUpgradeCost(currentLevel);
    if (!cost) return false; // уже макс. уровень
    return cost.every((need) => {
        const stack = guildBankResources.find((s) => s.resource === need.resource && s.tier === need.tier);
        return stack && stack.qty >= need.qty;
    });
}

/** Суммарный бонус всех пройденных уровней (0..guild.upgradeLevel включительно). */
function activeGuildBonuses(guildLevel = 0) {
    const merged = { marketDiscountPct: 0, explorationYieldPct: 0, worldBossDamagePct: 0 };
    for (let lvl = 1; lvl <= guildLevel; lvl += 1) {
        const def = levelDef(lvl);
        if (!def) continue;
        for (const [key, value] of Object.entries(def.bonus)) {
            merged[key] = value; // поля более позднего уровня уже включают накопленное (см. GUILD_LEVELS), просто берём последнее определённое значение поля
        }
    }
    return merged;
}

module.exports = {
    GUILD_LEVELS,
    levelDef,
    nextUpgradeCost,
    canAffordNextUpgrade,
    activeGuildBonuses,
};
