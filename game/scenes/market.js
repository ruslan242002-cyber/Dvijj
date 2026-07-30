'use strict';

const { createListing, purchaseListing, listActiveListings, MarketError } = require('../../market/market-engine.js');
const { getMarketFeeDiscount } = require('../../lib/housing.js');
const { imageForLocation } = require('../location-images.js');
const { hubMessage, stationButtons, addToInventory } = require('./common.js');
const { SCENES } = require('./ids.js');

function marketItemId(resource, tier) { return `${resource}__T${tier}`; }
function marketItemName(resource, tier) { return `${resource} T${tier}`; }
function parseMarketItemId(itemId) {
  const m = /^(.+)__T(\d+)$/.exec(itemId || '');
  return m ? { resource: m[1], tier: Number(m[2]) } : null;
}
function suggestedListingPrice(tier) {
  // За ЕДИНИЦУ — market-engine.js сам умножает на qty при покупке
  // (purchaseListing: totalCost = listing.price * qty). Передавать сюда
  // уже умноженную на qty сумму — баг, из-за которого покупатель платит
  // в qty раз больше, чем должен.
  return Math.max(1, Math.round(tier * 8 * 1.5));
}

async function buyFromMarket(deps, player, playerId, listing) {
  const feeDiscount = getMarketFeeDiscount(player);
  const proxyBuyer = { id: playerId, credits: player.credits || 0, inventory: [] };
  const { purchase } = await purchaseListing({ store: deps.marketStore }, proxyBuyer, listing.id, listing.qty, feeDiscount);
  const nextPlayer = { ...player, credits: proxyBuyer.credits };
  const parsed = parseMarketItemId(listing.itemId);
  if (parsed) addToInventory(nextPlayer, parsed.resource, parsed.tier, purchase.qtyBought);
  return nextPlayer;
}

async function sellToMarket(deps, player, playerId, resource, tier, qty, price) {
  const proxySeller = { id: playerId, inventory: [{ id: marketItemId(resource, tier), name: marketItemName(resource, tier), qty }] };
  const { listing } = await createListing({ store: deps.marketStore }, proxySeller, {
    itemId: marketItemId(resource, tier), itemName: marketItemName(resource, tier), qty, price,
  });
  const inv = player.inventory || [];
  const item = inv.find((i) => i.resource === resource && i.tier === tier);
  if (item) {
    item.qty -= qty;
    player.inventory = item.qty > 0 ? inv : inv.filter((i) => i !== item);
  }
  return listing;
}

async function marketHub(deps, player, playerId) {
  if (!deps.marketStore || !playerId) {
    return { reply: { text: '📈 Биржа сейчас недоступна.', buttons: stationButtons(deps, player) }, nextState: { scene: 'station', player } };
  }
  const listings = await listActiveListings({ store: deps.marketStore }, { limit: 6 });
  const lines = listings.length
    ? listings.map((l) => `${l.itemName} ×${l.qty} — 💳${l.price}/шт (итого 💳${l.price * l.qty})${l.sellerId === playerId ? ' (ваш лот)' : ''}`)
    : ['Пока пусто.'];
  const buyable = listings.filter((l) => l.sellerId !== playerId);
  const buttons = [...buyable.map((l) => `Купить: ${l.itemName}`), 'Выставить из трюма', 'Назад'];
  return {
    reply: { text: `📈 БИРЖА\n\n${lines.join('\n')}`, buttons },
    nextState: { scene: 'market_hub', player, listings }
  };
}

async function handleMarket(state, input, rng, deps, playerId) {
  switch (state.scene) {
    case SCENES.MARKET_HUB: {
      if (input === 'Назад') {
        return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player), imageKey: imageForLocation('station', state.player.faction) }, nextState: { scene: 'station', player: state.player } };
      }
      if (input === 'Выставить из трюма') {
        const inv = state.player.inventory || [];
        if (!inv.length) {
          return { reply: { text: 'Трюм пуст — нечего выставлять.', buttons: ['Назад'] }, nextState: { scene: 'market_hub', player: state.player, listings: state.listings || [] } };
        }
        const buttons = inv.map((i) => `Лот: ${i.resource} T${i.tier} ×${i.qty}`).concat('Назад');
        return { reply: { text: 'Что выставить целиком?', buttons }, nextState: { scene: 'market_sell_pick', player: state.player } };
      }
      const buyMatch = /^Купить: (.+)$/.exec(input);
      if (buyMatch) {
        const listing = (state.listings || []).find((l) => l.itemName === buyMatch[1] && l.sellerId !== playerId);
        if (!listing) return marketHub(deps, state.player, playerId);
        try {
          const player = await buyFromMarket(deps, state.player, playerId, listing);
          return { reply: { text: `Куплено: ${listing.itemName}.`, buttons: stationButtons(deps, player) }, nextState: { scene: 'station', player } };
        } catch (e) {
          if (e instanceof MarketError) {
            return { reply: { text: `Не удалось купить: ${e.code}`, buttons: ['Назад'] }, nextState: { scene: 'market_hub', player: state.player, listings: state.listings || [] } };
          }
          throw e;
        }
      }
      return marketHub(deps, state.player, playerId);
    }

    case SCENES.MARKET_SELL_PICK: {
      if (input === 'Назад') return marketHub(deps, state.player, playerId);
      const match = /^Лот: (.+) T(\d+) ×(\d+)$/.exec(input);
      if (!match) return marketHub(deps, state.player, playerId);
      const [, resource, tierStr, qtyStr] = match;
      const tier = Number(tierStr), qty = Number(qtyStr);
      const price = suggestedListingPrice(tier);
      const player = { ...state.player, inventory: (state.player.inventory || []).map((i) => ({ ...i })) };
      try {
        await sellToMarket(deps, player, playerId, resource, tier, qty, price);
        return { reply: { text: `Выставлено: ${resource} T${tier} ×${qty} по 💳${price}/шт (итого 💳${price * qty} за весь стек).`, buttons: stationButtons(deps, player) }, nextState: { scene: 'station', player } };
      } catch (e) {
        if (e instanceof MarketError) {
          return { reply: { text: `Не удалось выставить: ${e.code}`, buttons: ['Назад'] }, nextState: { scene: 'market_hub', player: state.player, listings: [] } };
        }
        throw e;
      }
    }

    default:
      return null;
  }
}

module.exports = { handleMarket, marketHub, MarketError };
