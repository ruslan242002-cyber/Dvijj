'use strict';

/**
 * СЛУЧАЙНЫЙ ТОРГОВЕЦ В ПУТИ — 3-4 предложения ресурса за кредиты,
 * генерируются заново на каждую встречу (не персистентный инвентарь).
 */
function rollTraderOffers(rng = Math.random) {
  const POOL = [
    { resource: 'Биомасса', tier: 2, pricePerUnit: 15 },
    { resource: 'Реголит', tier: 2, pricePerUnit: 12 },
    { resource: 'Изотопы', tier: 2, pricePerUnit: 25 },
    { resource: 'Полимеры', tier: 3, pricePerUnit: 30 },
    { resource: 'Сплавы', tier: 3, pricePerUnit: 28 },
  ];
  const count = 3 + Math.floor(rng() * 2); // 3-4 предложения
  const pool = [...POOL];
  const offers = [];
  for (let i = 0; i < count && pool.length; i++) {
    const idx = Math.floor(rng() * pool.length);
    const item = pool.splice(idx, 1)[0];
    const qty = 3 + Math.floor(rng() * 8);
    offers.push({ resource: item.resource, tier: item.tier, qty, price: Math.round(item.pricePerUnit * qty) });
  }
  return offers;
}

function buyFromTrader(player, offers, resource, tier) {
  const offer = (offers || []).find((o) => o.resource === resource && o.tier === tier);
  if (!offer) return { success: false, reason: 'OFFER_NOT_FOUND' };
  if ((player.credits || 0) < offer.price) return { success: false, reason: 'INSUFFICIENT_CREDITS' };
  player.credits -= offer.price;
  return { success: true, offer };
}

module.exports = { rollTraderOffers, buyFromTrader };
