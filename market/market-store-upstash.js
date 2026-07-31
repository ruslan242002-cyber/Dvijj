'use strict';

/*
 * Референсная реализация store-интерфейса для market-engine.js поверх
 * Upstash Redis. Названия ключей/методов — предложение, подгоните под
 * конвенции вашего существующего upstash-store.js.
 *
 * ключи (ask-сторона, лоты на продажу):
 *   market:listing:{id}         -> JSON лота (строка)
 *   market:listings:index       -> sorted set, score = createdAt
 *   market:player:{id}:listings -> set id-шников лотов этого продавца
 *   credits:{playerId}          -> ОТДЕЛЬНЫЙ атомарный ключ-счётчик (нужен
 *                                  только здесь: продавец при покупке его
 *                                  лота обычно НЕ в памяти вызывающего кода)
 *
 * ключи (bid-сторона, заявки на покупку — новое):
 *   market:buyorder:{id}          -> JSON заявки (строка)
 *   market:buyorders:index        -> sorted set, score = createdAt
 *   market:player:{id}:buyorders  -> set id-шников заявок этого покупателя
 *
 * Заявкам на покупку отдельный "credits:{playerId}" НЕ нужен: продавец,
 * исполняющий чужую заявку (fillBuyOrder), сам является текущим игроком
 * в памяти вызывающего кода — его кредиты правит market-engine.js обычным
 * способом (seller.credits += ...), как и его инвентарь. Атомарности в
 * Redis требует только остаток КОЛИЧЕСТВА в заявке (qty) — чтобы два
 * продавца не смогли одновременно продать в одну и ту же последнюю
 * единицу уже почти исполненной заявки. Ровно то же самое верно и для
 * покупателя при создании/отмене заявки (эскроу кредитов) — это тоже он
 * сам, в памяти, обычной мутацией player.credits.
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

/*
 * FILL_SCRIPT — bid-сторона. Заметно проще PURCHASE_SCRIPT: не трогает
 * никакой "credits:{playerId}" ключ и не считает комиссию внутри Lua —
 * оба участника решения по деньгам (эскроу покупателя при создании/
 * отмене заявки, зачисление продавцу при исполнении) происходят в JS на
 * стороне market-engine.js, потому что и покупатель, и продавец в
 * соответствующий момент — активный игрок в памяти, а не отсутствующая
 * третья сторона. Единственное, что реально нужно атомарно защитить от
 * гонки — это уменьшение qty самой заявки.
 */
const FILL_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then
  return redis.error_reply('LISTING_NOT_FOUND')
end

local order = cjson.decode(raw)

if order.buyerId == ARGV[1] then
  return redis.error_reply('CANNOT_BUY_OWN_LISTING')
end

local qty = tonumber(ARGV[2])
if qty > order.qty then
  return redis.error_reply('INSUFFICIENT_QTY')
end

if tonumber(order.price) ~= tonumber(ARGV[3]) then
  return redis.error_reply('PRICE_CHANGED')
end

order.qty = order.qty - qty

if order.qty <= 0 then
  redis.call('DEL', KEYS[1])
else
  redis.call('SET', KEYS[1], cjson.encode(order))
end

return cjson.encode({
  itemId = order.itemId,
  qtySold = qty,
  remainingQty = order.qty
})
`;

function createUpstashMarketStore(redis) {
  return {
    // ── ask-сторона (лоты на продажу) — без изменений ──
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

    // ── bid-сторона (заявки на покупку) — новое ──
    async getBuyOrder(id) {
      const raw = await redis.get(`market:buyorder:${id}`);
      return raw ? JSON.parse(raw) : null;
    },

    async saveBuyOrder(order) {
      await redis.set(`market:buyorder:${order.id}`, JSON.stringify(order));
    },

    async deleteBuyOrder(id) {
      await redis.del(`market:buyorder:${id}`);
    },

    async indexAddBuyOrder(id, createdAt) {
      await redis.zadd('market:buyorders:index', { score: createdAt, member: id });
    },

    async indexRemoveBuyOrder(id) {
      await redis.zrem('market:buyorders:index', id);
    },

    async getBuyOrderIds({ limit, cursor }) {
      const start = cursor ? Number(cursor) : 0;
      const stop = start + limit - 1;
      return redis.zrange('market:buyorders:index', start, stop, { rev: true });
    },

    async addPlayerBuyOrder(playerId, orderId) {
      await redis.sadd(`market:player:${playerId}:buyorders`, orderId);
    },

    async removePlayerBuyOrder(playerId, orderId) {
      await redis.srem(`market:player:${playerId}:buyorders`, orderId);
    },

    async getPlayerBuyOrderIds(playerId) {
      return redis.smembers(`market:player:${playerId}:buyorders`);
    },

    async fillBuyOrderAtomic({ orderId, sellerId, qty, expectedPrice }) {
      let raw;
      try {
        raw = await redis.eval(
          FILL_SCRIPT,
          [`market:buyorder:${orderId}`],
          [sellerId, qty, expectedPrice]
        );
      } catch (err) {
        const code = String(err.message || err).trim();
        const error = new Error(code);
        error.code = code;
        throw error;
      }
      return JSON.parse(raw);
    },
  };
}

module.exports = { createUpstashMarketStore, PURCHASE_SCRIPT, FILL_SCRIPT };
