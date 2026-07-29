'use strict';

const { MARKET_LIMITS, MARKET_ERRORS } = require('./market-data');

/*
 * Архитектурная заметка (важно при подключении к router.js):
 *
 * Вся остальная игра — per-player state: сцена собирает nextState из
 * player и только его сохраняет. Биржа — первая сущность, которая не
 * принадлежит одному игроку: лот виден всем, а покупка меняет состояние
 * ДВУХ игроков сразу, причём продавец в этот момент, скорее всего,
 * не в сети и не в текущей сцене.
 *
 * Поэтому:
 *  - Инвентарь и кредиты ПОКУПАТЕЛЯ меняются обычным способом — через
 *    player-объект текущей сцены, как и везде в игре.
 *  - Кредиты ПРОДАВЦА меняются НЕ через его player-объект (его нет в
 *    памяти), а атомарной операцией напрямую в сторе (store.purchaseListingAtomic).
 *    Это должно быть реализовано как Redis Lua-скрипт (EVAL) на стороне
 *    upstash-стора — см. market-store-upstash.js, там есть готовый скрипт.
 *  - Если у вас кредиты сейчас хранятся только внутри JSON-блоба игрока
 *    (player:{id} -> весь объект целиком), их придётся ВЫНЕСТИ в отдельный
 *    ключ (например credits:{playerId}), потому что атомарно поменять одно
 *    поле внутри чужого JSON-блоба без Lua/WATCH — источник гонки и потери
 *    кредитов при одновременных покупках одного лота. Это одна из немногих
 *    правок, которая заденет существующий формат хранения игрока.
 */

class MarketError extends Error {
  constructor(code) {
    super(code);
    this.name = 'MarketError';
    this.code = code;
  }
}

function generateListingId() {
  return `lst_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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

/**
 * Выставить лот на биржу. Предмет снимается из инвентаря СРАЗУ (эскроу),
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
  }
  if (listing.sellerId !== player.id) {
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
 */
async function purchaseListing(deps, buyer, listingId, qty) {
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
  try {
    result = await store.purchaseListingAtomic({
      listingId,
      buyerId: buyer.id,
      qty,
      expectedPrice: listing.price,
      feePercent: MARKET_LIMITS.LISTING_FEE_PERCENT,
    });
  } catch (err) {
    buyer.credits += totalCost;
    throw err;
  }

  addToInventory(buyer, listing.itemId, listing.itemName, qty);

  if (result.remainingQty <= 0) {
    await store.indexRemoveListing(listingId);
    await store.removePlayerListing(listing.sellerId, listingId);
  }

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

module.exports = {
  MarketError,
  createListing,
  cancelListing,
  purchaseListing,
  listActiveListings,
  findInventoryItem,
  removeFromInventory,
  addToInventory,
};
async function purchaseListing(deps, buyer, listingId, qty, feeDiscount = 0) {
  // ...
  result = await store.purchaseListingAtomic({
    listingId,
    buyerId: buyer.id,
    qty,
    expectedPrice: listing.price,
    feePercent: Math.max(MARKET_LIMITS.LISTING_FEE_PERCENT - feeDiscount, 0),
  });
  // ...
}

