'use strict';

const {
  HOUSING, HOUSE_ITEMS, HousingError, HOUSING_ERRORS,
  ownsHousing, purchaseHousing, purchaseHouseItem,
} = require('../../lib/housing.js');
const { imageForLocation } = require('../location-images.js');
const { hubMessage, stationButtons } = require('./common.js');
const { SCENES } = require('./ids.js');

function housingHub(deps, player) {
  const lines = Object.entries(HOUSING).map(([station, listing]) => {
    const owned = ownsHousing(player, station);
    return `${owned ? '🏠' : '🔒'} ${station}: ${listing.name} — ${owned ? 'куплено' : `💳${listing.price}`}`;
  });
  const buyButtons = Object.keys(HOUSING).filter((s) => !ownsHousing(player, s)).map((s) => `Купить дом: ${s}`);
  const itemButtons = Object.keys(HOUSING).filter((s) => ownsHousing(player, s)).map((s) => `Интерьер: ${s}`);
  return {
    reply: { text: `🏠 ЖИЛЬЁ\n\n${lines.join('\n')}`, buttons: [...buyButtons, ...itemButtons, '⬅️ Назад'], imageKey: imageForLocation('housing', player.faction) },
    nextState: { scene: 'housing_hub', player }
  };
}

function handleHousing(state, input, rng, deps) {
  switch (state.scene) {
    case SCENES.HOUSING_HUB: {
      if (input === '⬅️ Назад') {
        return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player), imageKey: imageForLocation('station', state.player.faction) }, nextState: { scene: 'station', player: state.player } };
      }
      const buyMatch = /^Купить дом: (.+)$/.exec(input);
      if (buyMatch) {
        try {
          const player = { ...state.player };
          purchaseHousing(player, buyMatch[1]);
          return housingHub(deps, player);
        } catch (e) {
          if (e instanceof HousingError) {
            const msg = e.code === HOUSING_ERRORS.INSUFFICIENT_CREDITS ? 'не хватает кредитов' : e.code;
            return { reply: { text: `Не получилось: ${msg}`, buttons: ['⬅️ Назад'] }, nextState: { scene: 'housing_hub', player: state.player } };
          }
          throw e;
        }
      }
      const itemMatch = /^Интерьер: (.+)$/.exec(input);
      if (itemMatch) {
        const station = itemMatch[1];
        const catalog = HOUSE_ITEMS[station] || [];
        const owned = (state.player.housing?.[station]?.items) || [];
        const available = catalog.filter((i) => !owned.includes(i.id));
        if (!available.length) {
          return { reply: { text: 'Всё уже куплено для этого дома.', buttons: ['⬅️ Назад'] }, nextState: { scene: 'housing_hub', player: state.player } };
        }
        const buttons = available.map((i) => `💰 ${i.name} (💳${i.price})`).concat('⬅️ Назад');
        return { reply: { text: HOUSING[station].flavor, buttons }, nextState: { scene: 'housing_item_pick', player: state.player, station } };
      }
      return housingHub(deps, state.player);
    }

    case SCENES.HOUSING_ITEM_PICK: {
      if (input === '⬅️ Назад') return housingHub(deps, state.player);
      const match = /^💰 (.+?) \(/.exec(input);
      const catalog = HOUSE_ITEMS[state.station] || [];
      const item = match ? catalog.find((i) => i.name === match[1]) : null;
      if (!item) return housingHub(deps, state.player);
      try {
        const player = { ...state.player };
        purchaseHouseItem(player, state.station, item.id);
        return housingHub(deps, player);
      } catch (e) {
        if (e instanceof HousingError) {
          return { reply: { text: `Не получилось: ${e.code}`, buttons: ['⬅️ Назад'] }, nextState: { scene: 'housing_hub', player: state.player } };
        }
        throw e;
      }
    }

    default:
      return null;
  }
}

module.exports = { handleHousing, housingHub };
