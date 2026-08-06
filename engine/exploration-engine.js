'use strict';
const { maxTierForLevel } = require('./tier-bands.js');
const { pickResourceForTheme, pickEnemyNameForTheme } = require('../lib/named-locations.js');
const { generatePack } = require('./pack-combat.js');
const RESOURCES = ['Сплавы', 'Изотопы', 'Полимеры', 'Биомасса', 'Реголит'];
const ENEMY_NAMES = {
blue: ['Дрейф-обломок', 'Слабый резонанс', 'Отбившийся зонд', 'Ржавый автомат', 'Эхо-помеха'],
yellow: ['Отголосок-падальщик', 'Резонансный хищник', 'Сбойный дрон', 'Тракт-паразит', 'Радиационный рой'],
red: ['Глубинный Отголосок', 'Тракт-порождение', 'Искажённый страж', 'Голос из разлома', 'Пожиратель сигналов']
};
const ZONE_WEIGHTS = {
blue: { find: 18, ambush: 42, anomaly: 10, distress: 10, node: 20 },
yellow: { find: 12, ambush: 52, anomaly: 13, distress: 8, node: 15 },
red: { find: 8, ambush: 62, anomaly: 15, distress: 5, node: 10 }
};
function weightedPick(weights, rng) {
const entries = Object.entries(weights);
const total = entries.reduce((s, [, w]) => s + w, 0);
let roll = rng() * total;
for (const [key, w] of entries) { if (roll < w) return key; roll -= w; }
return entries[entries.length - 1][0];
}
function tierForZone(zone, rng, playerLevel = 1) {
const ranges = { blue: [1, 2], yellow: [2, 4], red: [4, 7] };
const [zoneMin, zoneMax] = ranges[zone] || [1, 3];
const levelCap = maxTierForLevel(playerLevel);
const min = Math.min(zoneMin, levelCap);
const max = Math.min(zoneMax, levelCap);
return min + Math.floor(rng() * (max - min + 1));
}
function rollLoot(zone, rng = Math.random, playerLevel = 1, theme = null) {
const resource = theme ? pickResourceForTheme(RESOURCES, theme, rng) : RESOURCES[Math.floor(rng() * RESOURCES.length)];
const tier = tierForZone(zone, rng, playerLevel);
const qty = 1 + Math.floor(rng() * 4);
const credits = Math.round((10 + rng() * 40) * tier);
return { resource, tier, qty, credits };
}
function generateEnemy(zone, rng = Math.random, playerLevel = null, theme = null) {
const names = ENEMY_NAMES[zone] || ENEMY_NAMES.blue;
const name = pickEnemyNameForTheme(names, theme, rng);
const dangerMult = { blue: 0.6, yellow: 1, red: 1.8 }[zone] || 1;
let tier = tierForZone(zone, rng);
if (playerLevel) tier = Math.max(1, Math.min(tier, maxTierForLevel(playerLevel)));
// СИНЬК-СКЕЙЛИНГ ВНИЗ (по разбору доп. улучшений) — тир противника уже
// ограничен уровнем игрока сверху (maxTierForLevel), но не был ограничен
// снизу: 80-й уровень в синей зоне видел ровно тех же тривиальных врагов,
// что и 5-й — просто без риска и фарма трупов. hpMax/базовый урон здесь
// НЕ трогают тир (баланс сложности), а только награду/усилие — слабый
// противник высокоуровневому даёт меньше опыта относительно затраченного
// времени, но остаётся быстрым фарм-фильтром, а не источником прогресса.
const lowZonePenalty = zone === 'blue' && playerLevel && playerLevel > 30
? Math.max(0.35, 1 - (playerLevel - 30) * 0.01)
: 1;
const hp = Math.round((80 + rng() * 120) * dangerMult * (1 + tier * 0.1));
const base = 12 + tier * 4;
return {
name, tier, hp, hpMax: hp,
xpMult: lowZonePenalty, // читается в engine/leveling.js: grantXp() при начислении опыта за победу
stats: {
power: Math.round(base * (0.8 + rng() * 0.4)),
mind: Math.round(base * (0.8 + rng() * 0.4)),
reaction: Math.round(base * (0.8 + rng() * 0.4)),
endurance: Math.round(base * (0.8 + rng() * 0.4)),
firepower: Math.round(base * 1.2 * (0.8 + rng() * 0.4)),
shielding: Math.min(60, Math.round(base * 0.6))
},
luck: Math.round(5 + tier * 1.5),
accuracy: 0.68 + Math.min(tier, 5) * 0.02,
dodge: 0.06 + Math.min(tier, 5) * 0.015,
focus: 0.6 + Math.min(tier, 5) * 0.02,
periodic: []
};
}

/**
* СОБЫТИЯ В ПУТИ — по разбору Kimi: раньше путешествие было просто
* задержкой (клики "Продолжить путь" без выбора). Теперь на каждом шаге
* пути (не в самом секторе, а между событиями) есть 20% шанс мини-события
* "обломки на курсе" с реальным выбором: облететь (дольше, безопасно),
* протиснуться (быстрее, риск повреждения), просканировать (награда).
* Вызывать из travel.js на каждом шаге ПЕРЕД обычным rollEvent, если
* rollPathEvent() вернул не null — показать выбор вместо обычного шага.
*/
const PATH_EVENT_CHANCE = 0.2;
function rollPathEvent(rng = Math.random) {
if (rng() >= PATH_EVENT_CHANCE) return null;
return {
type: 'path_obstacle',
text: 'Обломки на курсе. Что делать?',
choices: ['fly_around', 'squeeze_through', 'scan'],
};
}
/** Резолвит выбор игрока на path_obstacle. squeeze_through — риск урона
* кораблю/скафандру (не боевой урон, отдельная мелкая трата HP), scan —
* награда ресурсом без риска, fly_around — просто теряет доп. время
* (кол-во шагов до сектора +1, обрабатывается вызывающим кодом). */
function resolvePathEvent(choice, rng = Math.random, playerLevel = 1) {
if (choice === 'fly_around') return { outcome: 'delay', text: 'Обходишь стороной — путь чуть дольше, зато чисто.' };
if (choice === 'squeeze_through') {
const damaged = rng() < 0.35;
return damaged
? { outcome: 'damaged', dmg: 5 + Math.floor(rng() * 10), text: 'Протискиваешься между обломками — задел борт.' }
: { outcome: 'clean', text: 'Протискиваешься между обломками без единой царапины.' };
}
if (choice === 'scan') {
const loot = rollLoot('blue', rng, playerLevel);
return { outcome: 'scanned', loot, text: `Скан находит кое-что полезное: ${loot.qty}x ${loot.resource} T${loot.tier}.` };
}
return { outcome: 'delay', text: 'Обходишь стороной.' };
}

/**
* СОСТОЯНИЯ УЗЛА (node) — надстройка НАД существующей системой тиров/
* весов лута, а не отдельная параллельная механика. Роль состояния —
* модифицировать уже посчитанный node-эвент (заряды/лут), не задавать
* тир заново. Стабильный (60%) — без изменений. Нестабильный (30%) —
* +50% к зарядам, но при первом снятии заряда 25% шанс "взрыва" (урон
* игроку, резолвится в сцене эксплуатации, не здесь). Охраняемая (10%) —
* перед лутом бой с generateEnemy() того же тира/зоны.
*/
const NODE_STATE_WEIGHTS = { stable: 60, unstable: 30, guarded: 10 };
function rollNodeState(rng = Math.random) {
return weightedPick(NODE_STATE_WEIGHTS, rng);
}
function rollEvent(zone, rng = Math.random, playerLevel = null, weightsOverride = null, theme = null) {
const weights = weightsOverride || ZONE_WEIGHTS[zone] || ZONE_WEIGHTS.blue;
const type = weightedPick(weights, rng);
switch (type) {
case 'find': {
const loot = rollLoot(zone, rng, playerLevel, theme);
return { type, loot, text: `Внутри: ${loot.qty}x ${loot.resource} T${loot.tier}, ${loot.credits} кредитов.` };
}
case 'ambush': {
if (zone === 'blue' && rng() < 0.25) {
const packSize = 2 + Math.floor(rng() * 2);
const pack = generatePack(zone, rng, generateEnemy, playerLevel, packSize);
return { type: 'pack_ambush', pack, text: `Стая (${packSize}): ${pack.map((p) => p.name).join(', ')}` };
}
const enemy = generateEnemy(zone, rng, playerLevel, theme);
return { type, enemy, text: `${enemy.name} · HP: ${enemy.hp}` };
}
case 'anomaly': {
// Было: автоматический урон облучением без выбора. Теперь — три
// варианта, резолвятся в сцене через resolveAnomalyChoice() ниже.
return {
type, text: 'АНОМАЛИЯ\n\nПространство искажено. Что делать?',
choices: ['touch', 'scan_safe', 'mark_for_curator'],
};
}
case 'distress': {
// 30% шанс, что сигнал бедствия — ловушка (засада). "Просканировать"
// требует mind > 25 у игрока — эта проверка в сцене, здесь только
// генерируем факт ловушки и потенциального врага на этот случай.
const isTrap = rng() < 0.3;
const reward = { credits: Math.round(50 + rng() * 100), reputation: 1 };
const ambushEnemy = isTrap ? generateEnemy(zone, rng, playerLevel, theme) : null;
return {
type, isTrap, reward, ambushEnemy,
text: 'Сигнал бедствия. Ответить, проигнорировать или просканировать издали?',
};
}
case 'node': {
const loot = rollLoot(zone, rng, playerLevel, theme);
let charges = 1 + Math.floor(rng() * 7);
const nodeState = rollNodeState(rng);
if (nodeState === 'unstable') charges = Math.round(charges * 1.5);
const guardEnemy = nodeState === 'guarded' ? generateEnemy(zone, rng, playerLevel, theme) : null;
return {
type, resource: loot.resource, tier: loot.tier, charges, nodeState, guardEnemy,
text: nodeState === 'guarded'
? `Залежь охраняется: ${guardEnemy.name}. Придётся драться за доступ.`
: nodeState === 'unstable'
? `Нестабильная залежь — заряды: ${charges}/${Math.round(7 * 1.5)}. Есть риск при добыче.`
: `Заряды жилы: ${charges}/7`,
};
}
default:
return { type: 'find', loot: rollLoot(zone, rng, playerLevel, theme), text: 'Пустая находка.' };
}
}

/** Резолвит выбор игрока на событии 'anomaly'. touch — риск/награда,
* scan_safe — без риска и без лута, mark_for_curator — репутация. */
function resolveAnomalyChoice(choice, rng = Math.random, playerLevel = 1) {
if (choice === 'touch') {
const loot = rollLoot('red', rng, playerLevel);
return { radiationGain: 5 + Math.floor(rng() * 10), loot, text: `Дотрагиваешься до фрагмента. Есть находка: ${loot.qty}x ${loot.resource} T${loot.tier}, но датчик облучения дрогнул.` };
}
if (choice === 'scan_safe') {
return { radiationGain: 0, xp: 10, text: 'Сканируешь издали — безопасно, но пусто. Немного опыта за наблюдение.' };
}
if (choice === 'mark_for_curator') {
return { reputationGain: 5, text: 'Помечаешь координаты для куратора станции. Небольшая благодарность.' };
}
return { radiationGain: 0, text: 'Решаешь не рисковать.' };
}

/** Резолвит выбор игрока на событии 'distress'. respond — либо награда,
* либо (если isTrap) бой; ignore — ничего; scan требует mind > 25 у
* игрока (проверка снаружи, здесь просто отдаёт правду при успехе). */
function resolveDistressChoice(choice, event, player) {
if (choice === 'ignore') return { outcome: 'ignored', text: 'Оставляешь сигнал без ответа — безопаснее.' };
if (choice === 'scan') {
if ((player?.stats?.mind || 0) <= 25) {
return { outcome: 'scan_failed', text: 'Не хватает данных, чтобы просканировать сигнал издали — придётся решать вслепую.' };
}
return event.isTrap
? { outcome: 'scan_trap_revealed', text: 'Скан вскрывает подделку — это ловушка. Можно спокойно проигнорировать.' }
: { outcome: 'scan_genuine_revealed', text: 'Скан подтверждает: сигнал настоящий, там кто-то реально нуждается в помощи.' };
}
if (choice === 'respond') {
return event.isTrap
? { outcome: 'ambush', enemy: event.ambushEnemy, text: 'Сигнал был приманкой — из-за обломков выходит противник.' }
: { outcome: 'rewarded', reward: event.reward, text: 'Спасённый благодарит и делится тем, что у него есть.' };
}
return { outcome: 'ignored', text: 'Оставляешь сигнал без ответа.' };
}

module.exports = {
rollEvent, rollLoot, generateEnemy, RESOURCES, ZONE_WEIGHTS, ENEMY_NAMES,
rollPathEvent, resolvePathEvent,
resolveAnomalyChoice, resolveDistressChoice,
rollNodeState, NODE_STATE_WEIGHTS,
};
