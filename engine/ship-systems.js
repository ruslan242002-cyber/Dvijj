'use strict';
/**
* УЗЛЫ КОРАБЛЯ — раньше был один общий HP на весь корабль. Теперь 5
* независимых систем (Корпус/Щиты/Двигатели/Оружие/Реактор), каждая со
* своим % состояния — не прицельный урон по конкретному узлу (это
* оставалось бы отдельной большой темой), а попутный износ: при каждом
* полученном уроне в бою одна случайная система немного проседает.
* Повреждённые системы реально ослабляют корабль (см. systemEffects), а
* не просто красивые циферки для статуса.
*/
const SHIP_SYSTEMS = ['hull', 'shields', 'engines', 'weapons', 'reactor'];
const SYSTEM_NAMES = {
hull: 'Корпус', shields: 'Щиты', engines: 'Двигатели', weapons: 'Оружие', reactor: 'Реактор'
};
// Каждый узел чинится своим корабельным материалом (engine/space-events.js:
// SHIP_PART_RESOURCES) — падают только с обломков в космосе, не с обычной
// наземной добычи.
const SYSTEM_REPAIR_MATERIAL = {
hull: { resource: 'Фрагмент брони', tier: 1 },
shields: { resource: 'Сплав титана', tier: 1 },
engines: { resource: 'Навигационный чип', tier: 1 },
weapons: { resource: 'Сплав титана', tier: 1 },
reactor: { resource: 'Энергоячейка', tier: 1 },
};
function freshShipSystems() {
return { hull: 100, shields: 100, engines: 100, weapons: 100, reactor: 100 };
}
/** Вызывать при получении урона в бою — одна случайная система
* проседает на небольшую величину. Не завязано на то, КТО бил и КУДА —
* просто общий износ от боя. */
function applySystemDamage(ship, rng = Math.random) {
ship.systems = ship.systems || freshShipSystems();
const system = SHIP_SYSTEMS[Math.floor(rng() * SHIP_SYSTEMS.length)];
const damage = 3 + Math.floor(rng() * 8);
ship.systems[system] = Math.max(0, ship.systems[system] - damage);
return { system, damage, remaining: ship.systems[system] };
}
/** Реальные игровые последствия повреждений — не просто цифры на
* экране. Полностью исправная система (100%) даёт множитель 1.0,
* полностью уничтоженная (0%) — множитель 0.5 (корабль всё ещё
* функционирует, просто заметно хуже, не полностью выведен из строя). */
function systemEffects(ship) {
const systems = ship.systems || freshShipSystems();
return {
firepowerMult: 0.5 + (systems.weapons / 100) * 0.5,
shieldingMult: 0.5 + (systems.shields / 100) * 0.5,
fuelCostMult: 1 + (1 - systems.engines / 100) * 0.5,
cooldownPenalty: Math.round((1 - systems.reactor / 100) * 2),
};
}
function repairCostForSystem(system, missingPercent) {
const material = SYSTEM_REPAIR_MATERIAL[system];
const qty = Math.max(1, Math.round(missingPercent / 10));
const credits = missingPercent * 3;
return { resource: material.resource, tier: material.tier, qty, credits };
}
/** Чинит ОДИН узел до 100% разом (не постепенно) — списывает материал
* и кредиты, если хватает. */
function repairSystem(player, system) {
const ship = player.ship;
ship.systems = ship.systems || freshShipSystems();
const missing = 100 - ship.systems[system];
if (missing <= 0) return { success: false, reason: 'ALREADY_FULL' };
const cost = repairCostForSystem(system, missing);
const stack = (player.inventory || []).find((i) => i.resource === cost.resource && i.tier === cost.tier);
if (!stack || stack.qty < cost.qty || (player.credits || 0) < cost.credits) {
return { success: false, reason: 'NOT_ENOUGH', cost };
}
stack.qty -= cost.qty;
player.inventory = player.inventory.filter((i) => i.qty > 0);
player.credits -= cost.credits;
ship.systems[system] = 100;
return { success: true, cost };
}
function statusBar(pct, slots = 10) {
const filled = Math.round((pct / 100) * slots);
return '█'.repeat(Math.max(0, filled)) + '░'.repeat(Math.max(0, slots - filled));
}
function shipSystemsText(ship) {
const systems = ship.systems || freshShipSystems();
return SHIP_SYSTEMS.map((s) => `${SYSTEM_NAMES[s]}: ${statusBar(systems[s])} ${systems[s]}%`).join('\n');
}
module.exports = {
SHIP_SYSTEMS, SYSTEM_NAMES, SYSTEM_REPAIR_MATERIAL,
freshShipSystems, applySystemDamage, systemEffects, repairCostForSystem, repairSystem, shipSystemsText,
};
