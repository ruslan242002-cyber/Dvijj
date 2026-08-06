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
// ПЕРЕМЕННАЯ КОМИССИЯ ПО ОБЪЁМУ СДЕЛКИ — по разбору доп. улучшений:
// базовые 5% (MARKET_LIMITS.LISTING_FEE_PERCENT), +1% за каждые 10 000
// кредитов сверх первых 10 000 в сумме сделки, потолок 12%. Не наказывает
// мелкие сделки (большинство игроков), делает манипуляцию ценой на
// крупных партиях заметно дороже.
const FEE_TIER_THRESHOLD = 10000;
const FEE_TIER_STEP_PERCENT = 1;
const FEE_MAX_PERCENT = 12;
function feePercentForTotal(total) {
if (total <= FEE_TIER_THRESHOLD) return MARKET_LIMITS.LISTING_FEE_PERCENT;
const extraSteps = Math.floor((total - FEE_TIER_THRESHOLD) / FEE_TIER_THRESHOLD);
return Math.min(FEE_MAX_PERCENT, MARKET_LIMITS.LISTING_FEE_PERCENT + extraSteps * FEE_TIER_STEP_PERCENT);
}const MARKET_ERRORS = {
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
module.exports = { MARKET_LIMITS, MARKET_ERRORS, feePercentForTotal };
