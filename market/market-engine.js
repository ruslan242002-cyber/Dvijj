'use strict';
const { MARKET_LIMITS, MARKET_ERRORS, feePercentForTotal } = require('./market-data');
const { logEconomyEvent, EVENT_TYPES } = require('../lib/economy-audit.js');
/*
* Архитектурная заметĸа (важно при подĸлючении ĸ router.js):
*
* Вся остальная игра — per-player state: сцена собирает nextState из
* player и только его сохраняет. Биржа — первая сущность, ĸоторая не
* принадлежит одному игроĸу: лот виден всем, а поĸупĸа меняет состояние
* ДВУХ игроĸов сразу, причём продавец в этот момент, сĸорее всего,
* не в сети и не в теĸущей сцене.
*
* Поэтому:
* - Инвентарь и кредиты ПОКУПАТЕЛЯ меняются обычным способом — через
* player-объеĸт теĸущей сцены, ĸаĸ и везде в игре.
* - Кредиты ПРОДАВЦА меняются НЕ через его player-объеĸт (его нет в
* памяти), а атомарной операцией напрямую в сторе (store.purchaseListingAtomic).
* Это должно быть реализовано ĸаĸ Redis Lua-сĸрипт (EVAL) на стороне
* upstash-стора — см. market-store-upstash.js, там есть готовый сĸрипт.
* - Если у вас кредиты сейчас хранятся тольĸо внутри JSON-блоба игроĸа
* (player:{id} -> весь объеĸт целиĸом), их придётся ВЫНЕСТИ в отдельный
* ĸлюч (например credits:{playerId}), потому что атомарно поменять одно
* поле внутри чужого JSON-блоба без Lua/WATCH — источник гонĸи и потери
* ĸредитов при одновременных поĸупĸах одного лота. Это одна из немногих
* правоĸ, ĸоторая заденет существующий формат хранения игроĸа.
*
* АУДИТ ЭКОНОМИКИ (добавлено) — logEconomyEvent() вызывается здесь, а не
* только в game/scenes/market.js, потому что именно здесь — и только
* здесь — известна сторона ПРОДАВЦА (его id и реально зачисленная сумма
* после комиссии). game/scenes/market.js логирует покупателя (у него
* есть player-объект), этот файл логирует продавца (у него его нет).
* Deps должен содержать redis (тот же клиент, что store использует
* внутри себя) — если его нет, логирование просто тихо не происходит,
* сама покупка/продажа не блокируется (см. lib/economy-audit.js).
*/class MarketError extends Error {
constructor(code) {
super(code);
this.name = 'MarketError';
this.code = code;
}
}
function generateListingId() {
return `lst_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
function generateBuyOrderId() {
return `buy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
function findInventoryItem(player, itemId) {
return (player.inventory || []).find((it) => it.id === itemId);
}
function removeFromInventory(player, itemId, qty) {
const item = findInventoryItem(player, itemId);
if (!item || item.qty < qty) {
throw new MarketError(MARKET_ERRORS.INSUFFICIENT_QTY);
}
item.qty -= qty;
if (item.qty <= 0) {
player.inventory = player.inventory.filter((it) => it.id !== itemId);
}
}
function addToInventory(player, itemId, itemName, qty) {
player.inventory = player.inventory || [];
const existing = findInventoryItem(player, itemId);
if (existing) {
existing.qty += qty;
} else {
player.inventory.push({ id: itemId, name: itemName, qty });
}
}
function assertValidPrice(price) {
if (!Number.isInteger(price) || price < MARKET_LIMITS.MIN_PRICE || price > MARKET_LIMITS.MAX_PRICE) {
throw new MarketError(MARKET_ERRORS.INVALID_PRICE);
}
}
/*** Выставить лот на биржу. Предмет снимается из инвентаря СРАЗУ (эскроу),
* чтобы его нельзя было выставить в двух лотах одновременно.
*/
async function createListing(deps, player, { itemId, itemName, qty, price }) {
const { store } = deps;
assertValidPrice(price);
const item = findInventoryItem(player, itemId);
if (!item || item.qty < qty) {
throw new MarketError(MARKET_ERRORS.ITEM_NOT_FOUND);
}
const existingListingIds = await store.getPlayerListingIds(player.id);
if (existingListingIds.length >= MARKET_LIMITS.MAX_ACTIVE_LISTINGS_PER_PLAYER) {
throw new MarketError(MARKET_ERRORS.LISTING_LIMIT_REACHED);
}
removeFromInventory(player, itemId, qty);
const listing = {
id: generateListingId(),
sellerId: player.id,
itemId,
itemName,
qty,
price,
createdAt: Date.now(),
};
await store.saveListing(listing);
await store.indexAddListing(listing.id, listing.createdAt);
await store.addPlayerListing(player.id, listing.id);
return { player, listing };
}
/**
* Снять свой лот — предмет возвращается в инвентарь.
*/
async function cancelListing(deps, player, listingId) {
const { store } = deps;
const listing = await store.getListing(listingId);
if (!listing) {
throw new MarketError(MARKET_ERRORS.LISTING_NOT_FOUND);
}if (listing.sellerId !== player.id) {
throw new MarketError(MARKET_ERRORS.NOT_LISTING_OWNER);
}
addToInventory(player, listing.itemId, listing.itemName, listing.qty);
await store.deleteListing(listingId);
await store.indexRemoveListing(listingId);
await store.removePlayerListing(player.id, listingId);
return { player };
}
/**
* Купить (весь лот или часть). Кредиты покупателя списываются обычным
* способом (это его player-объект в текущей сцене). Уменьшение остатка
* лота и зачисление продавцу — одной атомарной операцией в сторе, чтобы
* два одновременных покупателя не могли купить один и тот же последний юнит.
*
* feeDiscount (в процентных пунктах, по умолчанию 0) — скидка от жилья
* Приюта (lib/housing.js: getMarketFeeDiscount), передаётся явно, а не
* читается отсюда, чтобы движок биржи не знал о жилье напрямую. Комиссия
* не уходит ниже 0.
*/
async function purchaseListing(deps, buyer, listingId, qty, feeDiscount = 0) {
const { store } = deps;
const listing = await store.getListing(listingId);
if (!listing) {
throw new MarketError(MARKET_ERRORS.LISTING_NOT_FOUND);
}
if (listing.sellerId === buyer.id) {
throw new MarketError(MARKET_ERRORS.CANNOT_BUY_OWN_LISTING);
}
if (qty > listing.qty) {
throw new MarketError(MARKET_ERRORS.INSUFFICIENT_QTY);
}
const totalCost = listing.price * qty;
if ((buyer.credits || 0) < totalCost) {
throw new MarketError(MARKET_ERRORS.INSUFFICIENT_CREDITS);
}
buyer.credits -= totalCost;
let result;
const feePercent = Math.max(feePercentForTotal(totalCost) - feeDiscount, 0);
try {result = await store.purchaseListingAtomic({
listingId,
buyerId: buyer.id,
qty,
expectedPrice: listing.price,
feePercent,
});
} catch (err) {
// Атомарная операция провалилась (лот изменился/раскупили/цена другая) —
// откатываем списание у покупателя, оно ещё не сохранено в стор.
buyer.credits += totalCost;
throw err;
}
addToInventory(buyer, listing.itemId, listing.itemName, qty);
if (result.remainingQty <= 0) {
await store.indexRemoveListing(listingId);
await store.removePlayerListing(listing.sellerId, listingId);
}
// Продавец получает totalCost за вычетом комиссии — именно эта сумма
// реально зачислена ему атомарной операцией в сторе (не totalCost
// целиком), логируем то, что фактически произошло, а не то, что
// заплатил покупатель.
const fee = Math.round((totalCost * feePercent) / 100);
logEconomyEvent(deps, { type: EVENT_TYPES.MARKET_SELL, playerId: listing.sellerId, credits: totalCost - fee, resource: listing.itemName, note: 'listing_sold' }).catch(() => {});
return { buyer, purchase: result };
}
/**
* Постраничный список активных лотов для витрины биржи.
*/
async function listActiveListings(deps, { limit = MARKET_LIMITS.DEFAULT_PAGE_SIZE, cursor } = {}) {
const { store } = deps;
const ids = await store.getListingIds({ limit, cursor });
const listings = await Promise.all(ids.map((id) => store.getListing(id)));
return listings.filter(Boolean);
}
/**
* ЗАЯВКИ НА ПОКУПКУ (bid-сторона книги заявок, как в EVE Online) —
* зеркало лотов на продажу, но эскроу — не предмет, а КРЕДИТЫ покупателя.
* Продавец, у которого есть товар прямо сейчас, может продать НАПРЯМУЮ в
* такую заявку (fillBuyOrder) — мгновенная ликвидность, без ожидания, пока
* кто-то купит его собственный лот. Ask-сторона (createListing/
* purchaseListing выше) и bid-сторона (ниже) — независимые книги заявок
* одного и того же рынка, ровно как "Продавцы"/"Покупатели" в EVE.
*/
/**
* Разместить заявку на покупку. Кредиты списываются СРАЗУ (эскроу) —
* иначе можно было бы обещать деньги, которых нет, и заявка "прожгла" бы* несуществующие кредиты в момент исполнения.
*/
async function createBuyOrder(deps, player, { itemId, itemName, qty, price }) {
const { store } = deps;
assertValidPrice(price);
if (!Number.isInteger(qty) || qty <= 0) {
throw new MarketError(MARKET_ERRORS.INSUFFICIENT_QTY);
}
const totalCost = qty * price;
if ((player.credits || 0) < totalCost) {
throw new MarketError(MARKET_ERRORS.INSUFFICIENT_CREDITS);
}
const existingOrderIds = await store.getPlayerBuyOrderIds(player.id);
if (existingOrderIds.length >= MARKET_LIMITS.MAX_ACTIVE_LISTINGS_PER_PLAYER) {
throw new MarketError(MARKET_ERRORS.LISTING_LIMIT_REACHED);
}
player.credits -= totalCost;
const order = {
id: generateBuyOrderId(),
buyerId: player.id,
itemId,
itemName,
qty,
price,
createdAt: Date.now(),
};
await store.saveBuyOrder(order);
await store.indexAddBuyOrder(order.id, order.createdAt);
await store.addPlayerBuyOrder(player.id, order.id);
return { player, order };
}
/**
* Снять свою заявку на покупку — замороженные кредиты возвращаются.
*/
async function cancelBuyOrder(deps, player, orderId) {
const { store } = deps;
const order = await store.getBuyOrder(orderId);
if (!order) {throw new MarketError(MARKET_ERRORS.LISTING_NOT_FOUND);
}
if (order.buyerId !== player.id) {
throw new MarketError(MARKET_ERRORS.NOT_LISTING_OWNER);
}
player.credits = (player.credits || 0) + order.qty * order.price;
await store.deleteBuyOrder(orderId);
await store.indexRemoveBuyOrder(orderId);
await store.removePlayerBuyOrder(player.id, orderId);
return { player };
}
/**
* Продать напрямую в существующую заявку на покупку (весь объём заявки
* или часть). Инвентарь продавца меняется обычным способом (это его
* player-объект в текущей сцене); списание оставшегося объёма заявки и
* зачисление продавцу — атомарной операцией в сторе, чтобы два продавца
* не могли одновременно продать в одну и ту же последнюю единицу заявки.
*
* feeDiscount — та же скидка от жилья Приюта, что и purchaseListing.
*/
async function fillBuyOrder(deps, seller, orderId, qty, feeDiscount = 0) {
const { store } = deps;
const order = await store.getBuyOrder(orderId);
if (!order) {
throw new MarketError(MARKET_ERRORS.LISTING_NOT_FOUND);
}
if (order.buyerId === seller.id) {
throw new MarketError(MARKET_ERRORS.CANNOT_BUY_OWN_LISTING);
}
if (qty > order.qty) {
throw new MarketError(MARKET_ERRORS.INSUFFICIENT_QTY);
}
removeFromInventory(seller, order.itemId, qty);
const totalRevenue = order.price * qty;
const feePercent = Math.max(feePercentForTotal(totalRevenue) - feeDiscount, 0);
const fee = Math.round((totalRevenue * feePercent) / 100);
let result;
try {
result = await store.fillBuyOrderAtomic({orderId,
sellerId: seller.id,
qty,
expectedPrice: order.price,
});
} catch (err) {
// Атомарная операция провалилась (заявку уже исполнили/сняли/цена не
// совпала) — откатываем изъятие из инвентаря продавца, оно ещё не
// сохранено в стор.
addToInventory(seller, order.itemId, order.itemName, qty);
throw err;
}
seller.credits = (seller.credits || 0) + totalRevenue - fee;
if (result.remainingQty <= 0) {
await store.indexRemoveBuyOrder(orderId);
await store.removePlayerBuyOrder(order.buyerId, orderId);
}
logEconomyEvent(deps, { type: EVENT_TYPES.MARKET_SELL, playerId: seller.id, credits: totalRevenue - fee, resource: order.itemName, note: 'sold_into_buy_order' }).catch(() => {});
return { seller, sale: result };
}
/**
* Постраничный список активных заявок на покупку — bid-сторона витрины.
*/
async function listActiveBuyOrders(deps, { limit = MARKET_LIMITS.DEFAULT_PAGE_SIZE, cursor } = {}) {
const { store } = deps;
const ids = await store.getBuyOrderIds({ limit, cursor });
const orders = await Promise.all(ids.map((id) => store.getBuyOrder(id)));
return orders.filter(Boolean);
}
module.exports = {
MarketError,
createListing,
cancelListing,
purchaseListing,
listActiveListings,
createBuyOrder,
cancelBuyOrder,
fillBuyOrder,
listActiveBuyOrders,
// экспортируется для переиспользования в тестах и в других движках
findInventoryItem,
removeFromInventory,
addToInventory,};
