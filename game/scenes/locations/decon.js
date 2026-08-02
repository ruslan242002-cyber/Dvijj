'use strict';

const { imageForLocation } = require('../../location-images.js');
const { hubMessage, stationButtons, deconFee } = require('../common.js');
const { SCENES } = require('../ids.js');

function handleDecon(state, input, rng, deps) {
  if (state.scene !== SCENES.LOC_DECON) return null;
  if (input.startsWith('☢️ Снять облучение')) {
    const fee = deconFee(state.player.faction);
    if (fee > (state.player.credits || 0)) {
      return {
        reply: { text: `Не хватает кредитов на очистку (нужно 💳${fee}).`, buttons: stationButtons(deps, state.player) },
        nextState: { scene: 'station', player: state.player }
      };
    }
    const player = { ...state.player, radiation: 0, credits: (state.player.credits || 0) - fee };
    const feeNote = fee > 0 ? ` Списано 💳${fee}.` : ' Бесплатно — тут доверяют своим.';
    return { reply: { text: `Мягкое гудение очистителей — облучение снято подчистую.${feeNote}`, buttons: stationButtons(deps, player) }, nextState: { scene: 'station', player } };
  }
  return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player), imageKey: imageForLocation('station', state.player.faction) }, nextState: { scene: 'station', player: state.player } };
}

module.exports = { handleDecon };
