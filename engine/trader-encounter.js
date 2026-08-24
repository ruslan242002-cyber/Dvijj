'use strict';

/**
 * СТРАНСТВУЮЩИЙ ТОРГОВЕЦ — редкое событие, общее для космоса и планет.
 * Показывает 1-2 товара по фиксированной цене — купить или отказаться,
 * без торга.
 */
const TRADER_FLAVOR = {
  space: [
    'Потрёпанный грузовик выходит на связь — "Эй, не пролетай мимо! Есть кое-что на продажу".',
    'Одинокий торговый бот подмигивает бортовыми огнями и открывает канал: "Груз почти распродан, но кое-что осталось".',
  ],
  planet: [
    'Странствующая торговка-колонистка встречает тебя у тропы: "Есть несколько товаров, которые могут пригодиться".',
    'Одинокий старатель раскладывает товар прямо на камне: "Не каждый день сюда кто-то забредает".',
  ],
};

const TRADER_OFFERS = [
  { resource: 'Изотопы', tier: 3, qty: 8, price: 90 },
  { resource: 'Сплавы', tier: 3, qty: 6, price: 75 },
  { resource: 'Реголит', tier: 4, qty: 5, price: 140 },
  { resource: 'Биомасса', tier: 4, qty: 5, price: 130 },
  { resource: 'Полимеры', tier: 3, qty: 8, price: 85 },
];

function pickOffers(rng, count = 2) {
  const pool = [...TRADER_OFFERS];
  const picked = [];
  for (let i = 0; i < count && pool.length; i++) {
    const idx = Math.floor(rng() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}

/**
 * context — 'space' или 'planet', только для флейвора приветствия.
 * Возвращает { text, offers, buttons }.
 */
function rollTraderEncounter(context, player, rng = Math.random) {
  const flavor = TRADER_FLAVOR[context] || TRADER_FLAVOR.planet;
  const greeting = flavor[Math.floor(rng() * flavor.length)];
  const offers = pickOffers(rng, 2);
  const lines = offers.map((o) => `${o.resource} T${o.tier} ×${o.qty} — ${o.price} кредитов`);
  const buttons = [...offers.map((o) => `Купить: ${o.resource} T${o.tier}`), 'Отказаться'];
  return {
    text: `${greeting}\n\n${lines.join('\n')}\n\nВыбирай, что берёшь.\nВ наличии ${player.credits || 0} кредитов.`,
    offers,
    buttons,
  };
}

/** Покупка одного из предложенных офферов. Не мутирует player сама. */
function buyFromTrader(player, offers, resource, tier) {
  const offer = (offers || []).find((o) => o.resource === resource && o.tier === tier);
  if (!offer) return { success: false, reason: 'OFFER_NOT_FOUND' };
  if ((player.credits || 0) < offer.price) return { success: false, reason: 'INSUFFICIENT_CREDITS' };
  player.credits -= offer.price;
  return { success: true, offer };
}

/** Более простой вариант, чем rollTraderEncounter — только список офферов
 * без готового текста/кнопок, для мест, которые сами решают, как это
 * показать (game/scenes/travel.js). */
function rollTraderOffers(rng = Math.random) {
  return pickOffers(rng, 2 + Math.floor(rng() * 2));
}

module.exports = { TRADER_OFFERS, rollTraderEncounter, rollTraderOffers, buyFromTrader };
