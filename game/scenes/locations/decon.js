'use strict';

const { imageForLocation } = require('../../location-images.js');
const { hubMessage, stationButtons } = require('../common.js');
const { SCENES } = require('../ids.js');

function handleDecon(state, input, rng, deps) {
  if (state.scene !== SCENES.LOC_DECON) return null;
      if (input === 'Снять облучение') {
        const player = { ...state.player, radiation: 0 };
        return { reply: { text: 'Мягкое гудение очистителей — облучение снято подчистую.', buttons: stationButtons(deps, state.player) }, nextState: { scene: 'station', player } };
      }
      return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player), imageKey: imageForLocation('station', state.player.faction) }, nextState: { scene: 'station', player: state.player } };
}

module.exports = { handleDecon };
