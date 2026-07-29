'use strict';

/*
 * Референсная реализация store-интерфейса для market-engine.js поверх
 * Upstash Redis. Названия ключей/методов — предложение, подгоните под
 * конвенции вашего существующего upstash-store.js.
 *
 * ключи:
 *   market:listing:{id}        -> JSON лота (строка)
 *   market:listings:index      -> sorted set, score = createdAt, для листинга/пагинации
 *   market:player:{id}:listings -> set id-шников лотов этого продавца
 *   credits:{playerId}         -> ОТДЕЛЬНЫЙ атомарный ключ-счётчик (см. заметку
 *                                  в market-engine.js про то, зачем он нужен отдельно
 *                                  от JSON-блоба игрока)
 *
 * Требует @upstash/redis (тот же клиент, что, скорее всего, уже
 * используется в upstash-store.js).
 */

const PURCHASE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then
  return redis.error_reply('LISTING_NOT_FOUND')
end

local listing = cjson.decode(raw)

if listing.sellerId == ARGV[1] then
  return redis.error_reply('CANNOT_BUY_OWN_LISTING')
end

local qty = tonumber(ARGV[2])
if qty > listing.qty then
  return redis.error_reply('INSUFFICIENT_QTY')
end

if tonumber(listing.price) ~= tonumber(ARGV[3]) then
  return redis.error_reply('PRICE_CHANGED')
end

local totalCost = listing.price * qty
local feePercent = tonumber(ARGV[4])
local fee = math.floor(totalCost * feePercent / 100)
local sellerGets = totalCost - fee

listing.qty = listing.qty - qty

if listing.qty <= 0 then
  redis.call('DEL', KEYS[1])
else
  redis.call('SET', KEYS[1], cjson.encode(listing))
end

redis.call('INCRBY', 'credits:' .. listing.sellerId, sellerGets)

return cjson.encode({
  itemId = listing.itemId,
  qtyBought = qty,
  totalCost = totalCost,
  sellerGets = sellerGets,
  fee = fee,
  remainingQty = listing.qty
})
`;

function createUpstashMarketStore(redis) {
  return {
    async getListing(id) {
      const raw = await redis.get(`market:listing:${id}`);
      return raw ? JSON.parse(raw) : null;
    },

    async saveListing(listing) {
      await redis.set(`market:listing:${listing.id}`, JSON.stringify(listing));
    },

    async deleteListing(id) {
      await redis.del(`market:listing:${id}`);
    },

    async indexAddListing(id, createdAt) {
      await redis.zadd('market:listings:index', { score: createdAt, member: id });
    },

    async indexRemoveListing(id) {
      await redis.zrem('market:listings:index', id);
    },

    async getListingIds({ limit, cursor }) {
      const start = cursor ? Number(cursor) : 0;
      const stop = start + limit - 1;
      return redis.zrange('market:listings:index', start, stop, { rev: true });
    },

    async addPlayerListing(playerId, listingId) {
      await redis.sadd(`market:player:${playerId}:listings`, listingId);
    },

    async removePlayerListing(playerId, listingId) {
      await redis.srem(`market:player:${playerId}:listings`, listingId);
    },

    async getPlayerListingIds(playerId) {
      return redis.smembers(`market:player:${playerId}:listings`);
    },

    async purchaseListingAtomic({ listingId, buyerId, qty, expectedPrice, feePercent }) {
      let raw;
      try {
        raw = await redis.eval(
          PURCHASE_SCRIPT,
          [`market:listing:${listingId}`],
          [buyerId, qty, expectedPrice, feePercent]
        );
      } catch (err) {
        const code = String(err.message || err).trim();
        const error = new Error(code);
        error.code = code;
        throw error;
      }
      return JSON.parse(raw);
    },

    async getCredits(playerId) {
      const value = await redis.get(`credits:${playerId}`);
      return value ? Number(value) : 0;
    },

    async adjustCreditsAtomic(playerId, delta) {
      return redis.incrby(`credits:${playerId}`, delta);
    },
  };
}

module.exports = { createUpstashMarketStore, PURCHASE_SCRIPT };
