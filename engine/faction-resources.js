'use strict';

/**
 * ФРАКЦИОННАЯ ЗАВИСИМОСТЬ — жёсткая версия (решение: топовый крафт физически
 * невозможен без чужого ресурса станции). У каждой из 5 фракций теперь есть
 * ОДНО эксклюзивное сырьё, которое можно добыть ТОЛЬКО в зоне/у боссов её
 * родной станции (в отличие от THEME_FAVORED_RESOURCE в space-events.js,
 * который просто повышает вес обычного ресурса — здесь эксклюзив жёсткий,
 * его не бывает больше нигде).
 *
 * Легендарные (топовый tier) рецепты в gear-engine.js / ship.js должны
 * требовать минимум 1 эксклюзивный ресурс ЧУЖОЙ фракции — см.
 * requiresForeignResource() ниже, вызывать при валидации крафта.
 */

const FACTION_EXCLUSIVE_RESOURCE = {
    'Приют': 'Био-катализатор',
    'Терминус': 'Отголосок Тракта',
    'Арсенал': 'Боевой сплав',
    'Вуаль': 'Резонансный контур',
    'Кузница': 'Ядро жилы',
};

const RESOURCE_TO_FACTION = Object.fromEntries(
    Object.entries(FACTION_EXCLUSIVE_RESOURCE).map(([faction, resource]) => [resource, faction])
);

const ALL_EXCLUSIVE_RESOURCES = Object.values(FACTION_EXCLUSIVE_RESOURCE);

/** Эксклюзивное сырьё этой фракции (или null, если faction не распознана). */
function exclusiveResourceFor(faction) {
    return FACTION_EXCLUSIVE_RESOURCE[faction] || null;
}

/** Какой фракции принадлежит ресурс — null, если ресурс не эксклюзивный (обычный, доступен всем). */
function factionOwningResource(resource) {
    return RESOURCE_TO_FACTION[resource] || null;
}

/**
 * Можно ли добыть resource в зоне фракции stationFaction. Обычные ресурсы —
 * всегда true. Эксклюзивные — только в зоне владеющей ими фракции.
 */
function canObtainResourceAt(resource, stationFaction) {
    const owner = factionOwningResource(resource);
    if (!owner) return true; // не эксклюзивный ресурс — добывается везде как обычно
    return owner === stationFaction;
}

/**
 * Шанс выпадения эксклюзивного сырья своей станции при добыче/бою в её зоне.
 * Не гарантированно на каждом ролле — редкое, но добываемое дома; чужое
 * недоступно вообще (см. canObtainResourceAt).
 *
 * bonusPct (по умолчанию 0) — гильдейский бонус "Разведывательная сеть"
 * (guilds/guild-project-data.js: recon_network, rareDiscoveryBonusPct) —
 * передаётся явно вызывающим кодом, этот модуль не знает о гильдиях
 * напрямую (тот же принцип, что и everywhere в проекте).
 */
const EXCLUSIVE_DROP_CHANCE = 0.08;

function rollFactionExclusiveResource(stationFaction, rng = Math.random, bonusPct = 0) {
    const resource = exclusiveResourceFor(stationFaction);
    if (!resource) return null;
    const chance = EXCLUSIVE_DROP_CHANCE * (1 + bonusPct / 100);
    return rng() < chance ? resource : null;
}

/**
 * Список эксклюзивных ресурсов, которые входят в рецепт, но НЕ являются
 * "родными" для crafterFaction — то есть которые крафтер физически не может
 * добыть сам и должен получить через торговлю/гильдию/поездку.
 *
 * recipe.cost — реальный формат из gear-engine.js/ship.js:
 * [{ resource: 'Сплавы', tier: 1, qty: 10 }, ...]. res(resource, tier, qty)
 * добавляет туда обычные записи; эксклюзивные ресурсы добавляются тем же
 * способом, тег tier для них можно игнорировать (не участвует в добыче
 * жилы/боя, только в крафте).
 */
function foreignExclusiveRequirements(recipe, crafterFaction) {
    const ownResource = exclusiveResourceFor(crafterFaction);
    const cost = recipe.cost || recipe.resources || [];
    return cost
        .map((entry) => entry.resource)
        .filter((resource) => {
            const owner = factionOwningResource(resource);
            return owner && owner !== crafterFaction && resource !== ownResource;
        });
}

/** true, если рецепт реально требует поездки/торговли (содержит чужой эксклюзив). */
function requiresForeignResource(recipe, crafterFaction) {
    return foreignExclusiveRequirements(recipe, crafterFaction).length > 0;
}

module.exports = {
    FACTION_EXCLUSIVE_RESOURCE,
    ALL_EXCLUSIVE_RESOURCES,
    exclusiveResourceFor,
    factionOwningResource,
    canObtainResourceAt,
    rollFactionExclusiveResource,
    EXCLUSIVE_DROP_CHANCE,
    foreignExclusiveRequirements,
    requiresForeignResource,
};
