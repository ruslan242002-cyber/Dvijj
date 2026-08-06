'use strict';
/**
* СКИНЫ КОРАБЛЯ — чистая косметика, НЕ трогает ни один боевой стат
* (armor/firepower/fuelMax/hpMax остаются как есть, см. отдельно
* engine/ship-crafting.js для реальных апгрейдов). Только визуальное имя
* и описание, которое подставляется в текст, когда игрок смотрит на свой
* корабль. Работает как сток кредитов из экономики — раз не даёт
* игрового преимущества, цена может быть чисто статусной.
*/
const SHIP_SKINS = [
{ id: 'skin_default', name: 'Стандартный корпус', description: 'Базовая окраска — то, с чем ты начал.', cost: 0 },
{ id: 'skin_priyut_medic', name: 'Окраска Приюта', description: 'Белые борта с красным крестом — сразу видно, откуда ты родом.', cost: 150, faction: 'Приют' },
{ id: 'skin_terminus_shadow', name: 'Теневой камуфляж Терминуса', description: 'Матовый чёрный корпус, почти не отражает свет сканеров.', cost: 150, faction: 'Терминус' },
{ id: 'skin_arsenal_war', name: 'Боевая раскраска Арсенала', description: 'Броневые плиты нарочито выставлены напоказ — устрашение как часть дизайна.', cost: 150, faction: 'Арсенал' },
{ id: 'skin_vual_tech', name: 'Инженерный узор Вуали', description: 'Схемы и провода нанесены прямо на обшивку — не декор, а рабочая карта систем.', cost: 150, faction: 'Вуаль' },
{ id: 'skin_trakt_resonance', name: 'Резонансный узор Тракта', description: 'Корпус едва заметно светится тем же оттенком, что и разломы искажения. Редкая находка, не купить у станции.', cost: null, dropOnly: true },
{ id: 'skin_ash_hull', name: 'Пепельный корпус', description: 'Обожжённая, будто побывавшая в самом сердце Кузни, обшивка.', cost: 300, faction: 'Кузница' },
{ id: 'skin_golden_relic', name: 'Позолоченная реликвия', description: 'Статусный скин для тех, кто прошёл через легендарный контракт хотя бы раз.', cost: 800 },
];
function findSkin(skinId) {
return SHIP_SKINS.find((s) => s.id === skinId) || null;
}
function skinsAvailableFor(player) {
return SHIP_SKINS.filter((s) => !s.dropOnly && (!s.faction || s.faction === player.faction));
}
function ownedSkins(player) {
return player.ship?.ownedSkins || ['skin_default'];
}
function purchaseSkin(player, skinId) {
const skin = findSkin(skinId);
if (!skin) return { success: false, reason: 'SKIN_NOT_FOUND' };
if (skin.dropOnly) return { success: false, reason: 'NOT_PURCHASABLE' };
if (skin.faction && player.faction !== skin.faction) return { success: false, reason: 'WRONG_FACTION' };
player.ship = player.ship || {};
player.ship.ownedSkins = player.ship.ownedSkins || ['skin_default'];
if (player.ship.ownedSkins.includes(skinId)) return { success: false, reason: 'ALREADY_OWNED' };
if ((player.credits || 0) < skin.cost) return { success: false, reason: 'INSUFFICIENT_CREDITS' };
player.credits -= skin.cost;
player.ship.ownedSkins.push(skinId);
return { success: true, skin };
}
/** Выдаёт дроп-скин напрямую (не покупка) — вызывать из бестиарного
* лута/легендарного контракта, как обычный предмет. */
function grantSkin(player, skinId) {
player.ship = player.ship || {};
player.ship.ownedSkins = player.ship.ownedSkins || ['skin_default'];
if (!player.ship.ownedSkins.includes(skinId)) player.ship.ownedSkins.push(skinId);
}
function equipSkin(player, skinId) {
if (!ownedSkins(player).includes(skinId)) return { success: false, reason: 'NOT_OWNED' };
player.ship = player.ship || {};
player.ship.equippedSkin = skinId;
return { success: true };
}
module.exports = { SHIP_SKINS, findSkin, skinsAvailableFor, ownedSkins, purchaseSkin, grantSkin, equipSkin };
