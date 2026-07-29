'use strict';

// Общая биржа — константы и лимиты.
// Продавать можно всё, что лежит в player.inventory (никаких категорийных
// ограничений на уровне данных нет — если что-то нельзя продавать,
// это должно проверяться на уровне вызывающего кода/UI, не здесь).

const MARKET_LIMITS = {
  // Сколько активных лотов может держать один игрок одновременно.
  MAX_ACTIVE_LISTINGS_PER_PLAYER: 10,

  // Минимальная и максимальная цена лота (в кредитах, за весь стак).
  MIN_PRICE: 1,
  MAX_PRICE: 1_000_000,

  // Комиссия биржи в процентах, забирается у продавца при продаже.
  // Работает как сток кредитов из экономики (иначе крафт+биржа = infinite money).
  LISTING_FEE_PERCENT: 5,

  // Сколько лотов возвращать за одну страницу браузинга по умолчанию.
  DEFAULT_PAGE_SIZE: 10,
};

const MARKET_ERRORS = {
  ITEM_NOT_FOUND: 'ITEM_NOT_FOUND',
  INSUFFICIENT_QTY: 'INSUFFICIENT_QTY',
  INVALID_PRICE: 'INVALID_PRICE',
  LISTING_LIMIT_REACHED: 'LISTING_LIMIT_REACHED',
  LISTING_NOT_FOUND: 'LISTING_NOT_FOUND',
  NOT_LISTING_OWNER: 'NOT_LISTING_OWNER',
  CANNOT_BUY_OWN_LISTING: 'CANNOT_BUY_OWN_LISTING',
  INSUFFICIENT_CREDITS: 'INSUFFICIENT_CREDITS',
  PRICE_CHANGED: 'PRICE_CHANGED',
};

module.exports = { MARKET_LIMITS, MARKET_ERRORS };
