'use strict';

const { imageForLocation } = require('../../location-images.js');
const { hubMessage, stationButtons, sellInventory } = require('../common.js');
const { SCENES } = require('../ids.js');

function handleRepair(state, input, rng, deps) {
  if (state.scene !== SCENES.LOC_REPAIR) return null;
      if (input === 'Продать всё') {
        const player = { ...state.player };
        const gained = sellInventory(player);
        return { reply: { text: gained ? `Завхоз отсчитывает ${gained} кредитов за находки.` : 'Продавать нечего.', buttons: stationButtons(deps, state.player) }, nextState: { scene: 'station', player } };
      }
      return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player), imageKey: imageForLocation('station', state.player.faction) }, nextState: { scene: 'station', player: state.player } };
}

module.exports = { handleRepair };
