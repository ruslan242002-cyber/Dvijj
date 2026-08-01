'use strict';

const { createListing, cancelListing, purchaseListing, listActiveListings, MarketError } = require('../../market/market-engine.js');
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

async function buyFromMarket(deps, player, playerId, listing, qty = listing.qty) {
  const feeDiscount = getMarketFeeDiscount(player);
  const proxyBuyer = { id: playerId, credits: player.credits || 0, inventory: [] };
  const { purchase } = await purchaseListing({ store: deps.marketStore }, proxyBuyer, listing.id, qty, feeDiscount);
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

async function cancelFromMarket(deps, player, playerId, listing) {
  const proxySeller = { id: playerId, inventory: [] };
  await cancelListing({ store: deps.marketStore }, proxySeller, listing.id);
  const nextPlayer = { ...player };
  const parsed = parseMarketItemId(listing.itemId);
  if (parsed) addToInventory(nextPlayer, parsed.resource, parsed.tier, listing.qty);
  return nextPlayer;
}

async function myListingsScreen(deps, player, playerId) {
  const ids = await deps.marketStore.getPlayerListingIds(playerId);
  const listings = (await Promise.all(ids.map((id) => deps.marketStore.getListing(id)))).filter(Boolean);
  const lines = listings.length
    ? listings.map((l) => `${l.itemName} ×${l.qty} — 💳${l.price}/шт (итого 💳${l.price * l.qty})`)
    : ['У тебя нет активных лотов.'];
  const buttons = [...listings.map((l) => `Снять: ${l.itemName}`), 'Назад'];
  return {
    reply: { text: `📋 МОИ ЛОТЫ\n\n${lines.join('\n')}`, buttons },
    nextState: { scene: 'market_my_listings', player, listings }
  };
}

async function marketHub(deps, player, playerId) {
  if (!deps.marketStore || !playerId) {
    return { reply: { text: '📈 Биржа сейчас недоступна.', buttons: stationButtons(deps, player) }, nextState: { scene: 'station', player } };
  }
  const listings = await listActiveListings({ store: deps.marketStore }, { limit: 30 });
  const buyable = listings.filter((l) => l.sellerId !== playerId);

  // Группировка по товару — в стиле EVE: одна строка на предмет, с лучшей
  // (минимальной) ценой среди всех продавцов и суммарной доступностью, а
  // не вперемешку все лоты сразу. Полная "книга заявок" по конкретному
  // товару — на следующем экране (market_item_book).
  const byItem = new Map();
  for (const l of buyable) {
    const entry = byItem.get(l.itemName) || { itemName: l.itemName, bestPrice: Infinity, totalQty: 0 };
    entry.bestPrice = Math.min(entry.bestPrice, l.price);
    entry.totalQty += l.qty;
    byItem.set(l.itemName, entry);
  }
  const items = [...byItem.values()].sort((a, b) => a.bestPrice - b.bestPrice);

  const lines = items.length
    ? items.map((it) => `${it.itemName} — от 💳${it.bestPrice}/шт, доступно ×${it.totalQty}`)
    : ['Пока пусто.'];
  const buttons = [...items.map((it) => `Купить: ${it.itemName}`), 'Выставить из трюма', 'Мои лоты', 'Назад'];
  return {
    reply: { text: `📈 БИРЖА\n\n${lines.join('\n')}`, buttons },
    nextState: { scene: 'market_hub', player, allListings: listings }
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
          return { reply: { text: 'Трюм пуст — нечего выставлять.', buttons: ['Назад'] }, nextState: { scene: 'market_hub', player: state.player, allListings: state.allListings || [] } };
        }
        const buttons = inv.map((i) => `Лот: ${i.resource} T${i.tier} ×${i.qty}`).concat('Назад');
        return { reply: { text: 'Что выставить целиком?', buttons }, nextState: { scene: 'market_sell_pick', player: state.player } };
      }
      if (input === 'Мои лоты') {
        return myListingsScreen(deps, state.player, playerId);
      }
      const buyMatch = /^Купить: (.+)$/.exec(input);
      if (buyMatch) {
        const itemName = buyMatch[1];
        const bookListings = (state.allListings || [])
          .filter((l) => l.itemName === itemName && l.sellerId !== playerId)
          .sort((a, b) => a.price - b.price);
        if (!bookListings.length) return marketHub(deps, state.player, playerId);
        const lines = bookListings.map((l, i) => `${i + 1}. 💳${l.price}/шт × ${l.qty} доступно`);
        const buttons = bookListings.map((_, i) => `${i + 1}`).concat('Назад');
        return {
          reply: { text: `📖 ${itemName} — книга заявок (от дешёвых к дорогим)\n\n${lines.join('\n')}\n\nВыбери позицию цифрой.`, buttons },
          nextState: { scene: 'market_item_book', player: state.player, bookListings, itemName }
        };
      }
      return marketHub(deps, state.player, playerId);
    }

    case SCENES.MARKET_ITEM_BOOK: {
      if (input === 'Назад') return marketHub(deps, state.player, playerId);
      const idx = parseInt(input, 10) - 1;
      const listing = (state.bookListings || [])[idx];
      if (!listing) {
        const buttons = (state.bookListings || []).map((_, i) => `${i + 1}`).concat('Назад');
        return { reply: { text: 'Выбери позицию цифрой из списка.', buttons }, nextState: state };
      }
      return {
        reply: { text: `${listing.itemName} по 💳${listing.price}/шт, доступно ×${listing.qty}.\n\nСколько купить? Напиши число от 1 до ${listing.qty}.`, buttons: ['Назад'] },
        nextState: { scene: 'market_buy_qty', player: state.player, listing }
      };
    }

    case SCENES.MARKET_BUY_QTY: {
      if (input === 'Назад') return marketHub(deps, state.player, playerId);
      const qty = parseInt(input, 10);
      if (!Number.isInteger(qty) || qty <= 0 || qty > state.listing.qty || String(qty) !== input.trim()) {
        return { reply: { text: `Введи целое число от 1 до ${state.listing.qty}.`, buttons: ['Назад'] }, nextState: state };
      }
      try {
        const player = await buyFromMarket(deps, state.player, playerId, state.listing, qty);
        const total = state.listing.price * qty;
        return { reply: { text: `Куплено: ${state.listing.itemName} ×${qty} за 💳${total}.`, buttons: stationButtons(deps, player) }, nextState: { scene: 'station', player } };
      } catch (e) {
        if (e instanceof MarketError) {
          return { reply: { text: `Не удалось купить: ${e.code}`, buttons: stationButtons(deps, state.player) }, nextState: { scene: 'station', player: state.player } };
        }
        throw e;
      }
    }

    case SCENES.MARKET_MY_LISTINGS: {
      if (input === 'Назад') return marketHub(deps, state.player, playerId);
      const cancelMatch = /^Снять: (.+)$/.exec(input);
      if (cancelMatch) {
        const listing = (state.listings || []).find((l) => l.itemName === cancelMatch[1]);
        if (!listing) return myListingsScreen(deps, state.player, playerId);
        try {
          const player = await cancelFromMarket(deps, state.player, playerId, listing);
          return { reply: { text: `Лот снят: ${listing.itemName} ×${listing.qty} вернулись в трюм.`, buttons: stationButtons(deps, player) }, nextState: { scene: 'station', player } };
        } catch (e) {
          if (e instanceof MarketError) {
            return { reply: { text: `Не удалось снять лот: ${e.code}`, buttons: ['Назад'] }, nextState: { scene: 'market_my_listings', player: state.player, listings: state.listings || [] } };
          }
          throw e;
        }
      }
      return myListingsScreen(deps, state.player, playerId);
    }

    case SCENES.MARKET_SELL_PICK: {
      if (input === 'Назад') return marketHub(deps, state.player, playerId);
      const match = /^Лот: (.+) T(\d+) ×(\d+)$/.exec(input);
      if (!match) return marketHub(deps, state.player, playerId);
      const [, resource, tierStr, qtyStr] = match;
      const tier = Number(tierStr), qty = Number(qtyStr);
      const suggested = suggestedListingPrice(tier);
      return {
        reply: { text: `${resource} T${tier} ×${qty}\n\nПо какой цене за штуку выставить? Рекомендуем 💳${suggested} (или впиши своё число — так и работает конкуренция цен на бирже).`, buttons: [String(suggested), 'Назад'] },
        nextState: { scene: 'market_sell_price', player: state.player, resource, tier, qty }
      };
    }

    case SCENES.MARKET_SELL_PRICE: {
      if (input === 'Назад') return marketHub(deps, state.player, playerId);
      const price = parseInt(input, 10);
      if (!Number.isInteger(price) || price <= 0 || String(price) !== input.trim()) {
        return { reply: { text: 'Введи целое положительное число — цену за штуку.', buttons: ['Назад'] }, nextState: state };
      }
      const player = { ...state.player, inventory: (state.player.inventory || []).map((i) => ({ ...i })) };
      try {
        await sellToMarket(deps, player, playerId, state.resource, state.tier, state.qty, price);
        return { reply: { text: `Выставлено: ${state.resource} T${state.tier} ×${state.qty} по 💳${price}/шт (итого 💳${price * state.qty} за весь стек).`, buttons: stationButtons(deps, player) }, nextState: { scene: 'station', player } };
      } catch (e) {
        if (e instanceof MarketError) {
          return { reply: { text: `Не удалось выставить: ${e.code}`, buttons: stationButtons(deps, state.player) }, nextState: { scene: 'station', player: state.player } };
        }
        throw e;
      }
    }

    default:
      return null;
  }
}

module.exports = { handleMarket, marketHub, MarketError };
