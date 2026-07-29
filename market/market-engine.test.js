'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createListing, cancelListing, purchaseListing, listActiveListings, MarketError } = require('./market-engine');
const { MARKET_LIMITS, MARKET_ERRORS } = require('./market-data');

function createMockStore() {
  const listings = new Map();
  const playerListings = new Map();
  const credits = new Map();

  return {
    async getListing(id) {
      return listings.get(id) || null;
    },
    async saveListing(listing) {
      listings.set(listing.id, { ...listing });
    },
    async deleteListing(id) {
      listings.delete(id);
    },
    async indexAddListing() {},
    async indexRemoveListing() {},
    async getListingIds({ limit = 10 } = {}) {
      return [...listings.keys()]
        .sort((a, b) => listings.get(b).createdAt - listings.get(a).createdAt)
        .slice(0, limit);
    },
    async addPlayerListing(playerId, listingId) {
      const set = playerListings.get(playerId) || new Set();
      set.add(listingId);
      playerListings.set(playerId, set);
    },
    async removePlayerListing(playerId, listingId) {
      const set = playerListings.get(playerId);
      if (set) set.delete(listingId);
    },
    async getPlayerListingIds(playerId) {
      return [...(playerListings.get(playerId) || [])];
    },
    async purchaseListingAtomic({ listingId, buyerId, qty, expectedPrice, feePercent }) {
      const listing = listings.get(listingId);
      if (!listing) throw Object.assign(new Error(MARKET_ERRORS.LISTING_NOT_FOUND), { code: MARKET_ERRORS.LISTING_NOT_FOUND });
      if (listing.sellerId === buyerId) throw Object.assign(new Error(MARKET_ERRORS.CANNOT_BUY_OWN_LISTING), { code: MARKET_ERRORS.CANNOT_BUY_OWN_LISTING });
      if (qty > listing.qty) throw Object.assign(new Error(MARKET_ERRORS.INSUFFICIENT_QTY), { code: MARKET_ERRORS.INSUFFICIENT_QTY });
      if (listing.price !== expectedPrice) throw Object.assign(new Error(MARKET_ERRORS.PRICE_CHANGED), { code: MARKET_ERRORS.PRICE_CHANGED });

      const totalCost = listing.price * qty;
      const fee = Math.floor((totalCost * feePercent) / 100);
      const sellerGets = totalCost - fee;

      listing.qty -= qty;
      if (listing.qty <= 0) {
        listings.delete(listingId);
      } else {
        listings.set(listingId, listing);
      }

      credits.set(listing.sellerId, (credits.get(listing.sellerId) || 0) + sellerGets);

      return { itemId: listing.itemId, qtyBought: qty, totalCost, sellerGets, fee, remainingQty: Math.max(listing.qty, 0) };
    },
    _getCredits(playerId) {
      return credits.get(playerId) || 0;
    },
  };
}

function makePlayer(id, overrides = {}) {
  return {
    id,
    credits: 0,
    inventory: [],
    ...overrides,
  };
}

test('createListing removes item from seller inventory immediately (escrow)', async () => {
  const store = createMockStore();
  const seller = makePlayer('seller1', { inventory: [{ id: 'scrap', name: 'Металлолом', qty: 5 }] });

  const { listing } = await createListing({ store }, seller, { itemId: 'scrap', itemName: 'Металлолом', qty: 3, price: 10 });

  assert.equal(listing.qty, 3);
  assert.equal(seller.inventory.find((i) => i.id === 'scrap').qty, 2);
});

test('createListing rejects invalid price', async () => {
  const store = createMockStore();
  const seller = makePlayer('seller1', { inventory: [{ id: 'scrap', name: 'Металлолом', qty: 5 }] });

  await assert.rejects(
    () => createListing({ store }, seller, { itemId: 'scrap', itemName: 'Металлолом', qty: 1, price: 0 }),
    (err) => err instanceof MarketError && err.code === MARKET_ERRORS.INVALID_PRICE
  );
});

test('createListing rejects when player lacks enough qty', async () => {
  const store = createMockStore();
  const seller = makePlayer('seller1', { inventory: [{ id: 'scrap', name: 'Металлолом', qty: 2 }] });

  await assert.rejects(
    () => createListing({ store }, seller, { itemId: 'scrap', itemName: 'Металлолом', qty: 5, price: 10 }),
    (err) => err instanceof MarketError && err.code === MARKET_ERRORS.ITEM_NOT_FOUND
  );
});

test('createListing enforces max active listings per player', async () => {
  const store = createMockStore();
  const seller = makePlayer('seller1', {
    inventory: Array.from({ length: MARKET_LIMITS.MAX_ACTIVE_LISTINGS_PER_PLAYER + 1 }, (_, i) => ({
      id: `item${i}`,
      name: `Предмет ${i}`,
      qty: 1,
    })),
  });

  for (let i = 0; i < MARKET_LIMITS.MAX_ACTIVE_LISTINGS_PER_PLAYER; i += 1) {
    await createListing({ store }, seller, { itemId: `item${i}`, itemName: `Предмет ${i}`, qty: 1, price: 5 });
  }

  await assert.rejects(
    () =>
      createListing({ store }, seller, {
        itemId: `item${MARKET_LIMITS.MAX_ACTIVE_LISTINGS_PER_PLAYER}`,
        itemName: 'Лишний предмет',
        qty: 1,
        price: 5,
      }),
    (err) => err instanceof MarketError && err.code === MARKET_ERRORS.LISTING_LIMIT_REACHED
  );
});

test('cancelListing returns item to seller inventory and removes listing', async () => {
  const store = createMockStore();
  const seller = makePlayer('seller1', { inventory: [{ id: 'scrap', name: 'Металлолом', qty: 5 }] });

  const { listing } = await createListing({ store }, seller, { itemId: 'scrap', itemName: 'Металлолом', qty: 3, price: 10 });
  await cancelListing({ store }, seller, listing.id);

  assert.equal(seller.inventory.find((i) => i.id === 'scrap').qty, 5);
  assert.equal(await store.getListing(listing.id), null);
});

test('cancelListing rejects when caller is not the owner', async () => {
  const store = createMockStore();
  const seller = makePlayer('seller1', { inventory: [{ id: 'scrap', name: 'Металлолом', qty: 5 }] });
  const other = makePlayer('other1');

  const { listing } = await createListing({ store }, seller, { itemId: 'scrap', itemName: 'Металлолом', qty: 3, price: 10 });

  await assert.rejects(
    () => cancelListing({ store }, other, listing.id),
    (err) => err instanceof MarketError && err.code === MARKET_ERRORS.NOT_LISTING_OWNER
  );
});

test('purchaseListing transfers item to buyer and credits (minus fee) to seller', async () => {
  const store = createMockStore();
  const seller = makePlayer('seller1', { inventory: [{ id: 'scrap', name: 'Металлолом', qty: 5 }] });
  const buyer = makePlayer('buyer1', { credits: 100 });

  const { listing } = await createListing({ store }, seller, { itemId: 'scrap', itemName: 'Металлолом', qty: 5, price: 10 });
  const { purchase } = await purchaseListing({ store }, buyer, listing.id, 2);

  assert.equal(buyer.credits, 80);
  assert.equal(buyer.inventory.find((i) => i.id === 'scrap').qty, 2);
  assert.equal(purchase.remainingQty, 3);

  const expectedFee = Math.floor(20 * MARKET_LIMITS.LISTING_FEE_PERCENT / 100);
  assert.equal(store._getCredits('seller1'), 20 - expectedFee);
});

test('purchaseListing rejects buying your own listing', async () => {
  const store = createMockStore();
  const seller = makePlayer('seller1', { credits: 100, inventory: [{ id: 'scrap', name: 'Металлолом', qty: 5 }] });

  const { listing } = await createListing({ store }, seller, { itemId: 'scrap', itemName: 'Металлолом', qty: 5, price: 10 });

  await assert.rejects(
    () => purchaseListing({ store }, seller, listing.id, 1),
    (err) => err instanceof MarketError && err.code === MARKET_ERRORS.CANNOT_BUY_OWN_LISTING
  );
});

test('purchaseListing rejects insufficient credits and does not touch inventory', async () => {
  const store = createMockStore();
  const seller = makePlayer('seller1', { inventory: [{ id: 'scrap', name: 'Металлолом', qty: 5 }] });
  const buyer = makePlayer('buyer1', { credits: 5 });

  const { listing } = await createListing({ store }, seller, { itemId: 'scrap', itemName: 'Металлолом', qty: 5, price: 10 });

  await assert.rejects(
    () => purchaseListing({ store }, buyer, listing.id, 1),
    (err) => err instanceof MarketError && err.code === MARKET_ERRORS.INSUFFICIENT_CREDITS
  );
  assert.equal(buyer.credits, 5);
  assert.equal(buyer.inventory.length, 0);
});

test('purchaseListing refunds buyer credits if the atomic step fails', async () => {
  const store = createMockStore();
  const seller = makePlayer('seller1', { inventory: [{ id: 'scrap', name: 'Металлолом', qty: 5 }] });
  const buyer = makePlayer('buyer1', { credits: 100 });

  const { listing } = await createListing({ store }, seller, { itemId: 'scrap', itemName: 'Металлолом', qty: 5, price: 10 });

  const stored = await store.getListing(listing.id);
  stored.price = 999;
  await store.saveListing(stored);

  await assert.rejects(() => purchaseListing({ store }, buyer, listing.id, 1));
  assert.equal(buyer.credits, 100);
});

test('purchaseListing removes listing entirely when last units are bought', async () => {
  const store = createMockStore();
  const seller = makePlayer('seller1', { inventory: [{ id: 'scrap', name: 'Металлолом', qty: 2 }] });
  const buyer = makePlayer('buyer1', { credits: 100 });

  const { listing } = await createListing({ store }, seller, { itemId: 'scrap', itemName: 'Металлолом', qty: 2, price: 10 });
  await purchaseListing({ store }, buyer, listing.id, 2);

  assert.equal(await store.getListing(listing.id), null);
  assert.deepEqual(await store.getPlayerListingIds('seller1'), []);
});

test('listActiveListings returns listings newest first, respecting limit', async () => {
  const store = createMockStore();
  const seller = makePlayer('seller1', {
    inventory: [
      { id: 'a', name: 'A', qty: 1 },
      { id: 'b', name: 'B', qty: 1 },
      { id: 'c', name: 'C', qty: 1 },
    ],
  });

  const { listing: l1 } = await createListing({ store }, seller, { itemId: 'a', itemName: 'A', qty: 1, price: 5 });
  await new Promise((r) => setTimeout(r, 2));
  const { listing: l2 } = await createListing({ store }, seller, { itemId: 'b', itemName: 'B', qty: 1, price: 5 });
  await new Promise((r) => setTimeout(r, 2));
  const { listing: l3 } = await createListing({ store }, seller, { itemId: 'c', itemName: 'C', qty: 1, price: 5 });

  const page = await listActiveListings({ store }, { limit: 2 });

  assert.equal(page.length, 2);
  assert.deepEqual(page.map((l) => l.id), [l3.id, l2.id]);
  void l1;
});
