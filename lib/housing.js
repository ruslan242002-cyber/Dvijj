'use strict';

const HOUSING = {
  'Приют': {
    price: 400,
    name: 'Каюта в Торговом ряду',
    flavor: 'Тесная, но своя — над головой вечный гул грузовых лифтов Приюта, зато соседи всегда знают последние слухи с биржи.',
  },
  'Терминус': {
    price: 600,
    name: 'Комната в Слепом канале',
    flavor: 'Без окон и почти без света — как и полагается в городе-тени. Дверь запирается на три контура, и это не паранойя.',
  },
  'Арсенал': {
    price: 550,
    name: 'Отсек в Оружейном блоке',
    flavor: 'Стены вибрируют от работы станков через переборку. Спать тяжело первую неделю — потом не замечаешь.',
  },
  'Вуаль': {
    price: 750,
    name: 'Модуль в Технологическом ярусе',
    flavor: 'Компактный, но со своей системой климат-контроля — редкая роскошь. Мастерская Вуали в двух палубах отсюда.',
  },
};

const HOUSING_ERRORS = {
  UNKNOWN_STATION: 'UNKNOWN_STATION',
  ALREADY_OWNED: 'ALREADY_OWNED',
  INSUFFICIENT_CREDITS: 'INSUFFICIENT_CREDITS',
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
  player.housing[station] = { purchasedAt: Date.now() };

  return player;
}

module.exports = { HOUSING, HousingError, HOUSING_ERRORS, getOwnedStations, ownsHousing, purchaseHousing };
