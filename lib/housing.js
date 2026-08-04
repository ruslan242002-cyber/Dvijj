'use strict';

/**
 * ЛИЧНОЕ ЖИЛЬЁ — теперь не только флейвор: у каждой станции свой пассивный
 * бонус, который включается сразу при покупке дома, плюс 2 предмета
 * интерьера на станцию, каждый добавляет ещё немного того же эффекта.
 * Всё с потолком (см. *_CAP ниже) — дом не должен становиться обязательным
 * силовым множителем, только заметным, но ограниченным преимуществом.
 *
 * Тема бонуса станции — прямое продолжение её идентичности:
 *   Приют (торговля)     → скидка на комиссию биржи
 *   Терминус (тень/интел) → меньше облучения от аномалий
 *   Арсенал (военные)     → выше шанс чистой эвакуации из вылазки
 *   Вуаль (технологии)    → скидка на крафт в Мастерской
 *
 * ВАЖНО: скидка на крафт (Вуаль) объявлена здесь как чистая функция
 * getCraftDiscount(player), но я не подключал её ни к какому реальному
 * crafting-engine.js — у меня нет исходников recipes-data.js/
 * crafting-engine.js, только их упоминание в архиве. Формулу нужно
 * вызвать из реального расчёта стоимости крафта, когда скинете тот файл.
 * Скидка на биржу и бонус к эвакуации — уже подключены и протестированы
 * (см. правки в market-engine.js и evacuation.js).
 */

const HOUSING = {
  'Приют': {
    price: 400,
    name: 'Каюта в Торговом ряду',
    flavor: 'Тесная, но своя — над головой вечный гул грузовых лифтов Приюта, зато соседи всегда знают последние слухи с биржи.',
    perk: { type: 'market_fee_discount', base: 2 }, // −2 п.п. к комиссии биржи
  },
  'Терминус': {
    price: 600,
    name: 'Комната в Слепом канале',
    flavor: 'Без окон и почти без света — как и полагается в городе-тени. Дверь запирается на три контура, и это не паранойя.',
    perk: { type: 'radiation_discount', base: 0.2 }, // −20% облучения от аномалий
  },
  'Арсенал': {
    price: 550,
    name: 'Отсек в Оружейном блоке',
    flavor: 'Стены вибрируют от работы станков через переборку. Спать тяжело первую неделю — потом не замечаешь.',
    perk: { type: 'evac_chance_bonus', base: 0.05 }, // +5 п.п. к шансу чистой эвакуации
  },
  'Вуаль': {
    price: 750,
    name: 'Модуль в Технологическом ярусе',
    flavor: 'Компактный, но со своей системой климат-контроля — редкая роскошь. Мастерская Вуали в двух палубах отсюда.',
    perk: { type: 'craft_discount', base: 0.1 }, // −10% стоимости крафта (не подключено, см. заметку выше)
  },
};

// Предметы интерьера — по 2 на станцию, каждый усиливает perk своего дома.
// Купить можно только владея домом соответствующей станции.
const HOUSE_ITEMS = {
  'Приют': [
    { id: 'trade_terminal', name: 'Торговый терминал', price: 300, effect: { type: 'market_fee_discount', amount: 1 } },
    { id: 'personal_safe', name: 'Личный сейф', price: 250, effect: { type: 'market_fee_discount', amount: 1 } },
  ],
  'Терминус': [
    { id: 'signal_scrambler', name: 'Шифрователь связи', price: 320, effect: { type: 'radiation_discount', amount: 0.1 } },
    { id: 'hidden_cache', name: 'Тайник', price: 280, effect: { type: 'radiation_discount', amount: 0.05 } },
  ],
  'Арсенал': [
    { id: 'weapon_rack', name: 'Оружейный стенд', price: 300, effect: { type: 'evac_chance_bonus', amount: 0.03 } },
    { id: 'repair_kit_station', name: 'Ремонтный набор', price: 300, effect: { type: 'evac_chance_bonus', amount: 0.02 } },
  ],
  'Вуаль': [
    { id: 'workbench', name: 'Верстак', price: 350, effect: { type: 'craft_discount', amount: 0.1 } },
    { id: 'diagnostic_module', name: 'Диагност-модуль', price: 350, effect: { type: 'craft_discount', amount: 0.05 } },
  ],
};

// Потолки суммарного бонуса (дом + все предметы этой станции) — не дают
// эффекту разогнаться бесконтрольно даже если добавите больше предметов позже.
const PERK_CAPS = {
  market_fee_discount: 4, // максимум −4 п.п. к комиссии (при базовой 5% — минимум 1%)
  radiation_discount: 0.35,
  evac_chance_bonus: 0.1,
  craft_discount: 0.25,
};

const HOUSING_ERRORS = {
  UNKNOWN_STATION: 'UNKNOWN_STATION',
  ALREADY_OWNED: 'ALREADY_OWNED',
  INSUFFICIENT_CREDITS: 'INSUFFICIENT_CREDITS',
  NOT_OWNED: 'NOT_OWNED',
  UNKNOWN_ITEM: 'UNKNOWN_ITEM',
  ITEM_ALREADY_PLACED: 'ITEM_ALREADY_PLACED',
};

class HousingError extends Error {
  constructor(code) {
    super(code);
    this.name = 'HousingError';
    this.code = code;
  }
}

function getOwnedStations(player) {
  return Object.keys(player.housing || {});
}

function ownsHousing(player, station) {
  return !!(player.housing && player.housing[station]);
}

function purchaseHousing(player, station) {
  const listing = HOUSING[station];
  if (!listing) throw new HousingError(HOUSING_ERRORS.UNKNOWN_STATION);
  if (ownsHousing(player, station)) throw new HousingError(HOUSING_ERRORS.ALREADY_OWNED);
  if ((player.credits || 0) < listing.price) throw new HousingError(HOUSING_ERRORS.INSUFFICIENT_CREDITS);

  player.credits -= listing.price;
  player.housing = player.housing || {};
  player.housing[station] = { purchasedAt: Date.now(), items: [] };

  return player;
}

/** Купить предмет интерьера — требует владения домом этой станции. */
function purchaseHouseItem(player, station, itemId) {
  if (!ownsHousing(player, station)) throw new HousingError(HOUSING_ERRORS.NOT_OWNED);

  const catalog = HOUSE_ITEMS[station] || [];
  const item = catalog.find((i) => i.id === itemId);
  if (!item) throw new HousingError(HOUSING_ERRORS.UNKNOWN_ITEM);

  const owned = player.housing[station].items || [];
  if (owned.includes(itemId)) throw new HousingError(HOUSING_ERRORS.ITEM_ALREADY_PLACED);

  if ((player.credits || 0) < item.price) throw new HousingError(HOUSING_ERRORS.INSUFFICIENT_CREDITS);

  player.credits -= item.price;
  player.housing[station].items = [...owned, itemId];

  return player;
}

/** Суммарный бонус игрока по типу перка (например 'market_fee_discount') —
 * дом (если владеет) + все купленные предметы этого типа, с потолком. */
function totalPerkBonus(player, perkType) {
  let total = 0;

  for (const [station, listing] of Object.entries(HOUSING)) {
    if (!ownsHousing(player, station)) continue;
    if (listing.perk.type === perkType) total += listing.perk.base;

    const ownedItems = (player.housing[station] && player.housing[station].items) || [];
    for (const itemId of ownedItems) {
      const item = (HOUSE_ITEMS[station] || []).find((i) => i.id === itemId);
      if (item && item.effect.type === perkType) total += item.effect.amount;
    }
  }

  const cap = PERK_CAPS[perkType];
  return cap !== undefined ? Math.min(total, cap) : total;
}

function getMarketFeeDiscount(player) {
  return totalPerkBonus(player, 'market_fee_discount');
}

function getRadiationDiscount(player) {
  return totalPerkBonus(player, 'radiation_discount');
}

function getEvacChanceBonus(player) {
  return totalPerkBonus(player, 'evac_chance_bonus');
}

/** Не подключено к реальному крафту — см. заметку в шапке файла. */
function getCraftDiscount(player) {
  return totalPerkBonus(player, 'craft_discount');
}

module.exports = {
  HOUSING, HOUSE_ITEMS, PERK_CAPS,
  HousingError, HOUSING_ERRORS,
  getOwnedStations, ownsHousing, purchaseHousing, purchaseHouseItem,
  getMarketFeeDiscount, getRadiationDiscount, getEvacChanceBonus, getCraftDiscount,
};
