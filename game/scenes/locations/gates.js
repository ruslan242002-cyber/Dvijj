'use strict';

const { hubMessage, stationButtons, startJourney, FACTIONS, ZONE_BUTTONS, ZONE_BY_LABEL, ZONE_LABEL, MIN_LEVEL_FOR_ZONE } = require('../common.js');
const { imageForLocation } = require('../../location-images.js');
const { SCENES } = require('../ids.js');

function handleGates(state, input, rng, deps) {
  switch (state.scene) {
    case SCENES.LOC_GATES: {
      if (input === 'Назад') {
        return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player), imageKey: imageForLocation('station', state.player.faction) }, nextState: { scene: 'station', player: state.player } };
      }
      if (input === 'К другим станциям') {
        const others = FACTIONS.filter((f) => f !== state.player.faction);
        return { reply: { text: 'Куда проложить курс?', buttons: [...others, 'Назад'] }, nextState: { scene: 'loc_gates_travel', player: state.player } };
      }
      const zone = ZONE_BY_LABEL[input];
      if (!zone) {
        return { reply: { text: 'Выбери сектор кнопкой ниже.', buttons: ZONE_BUTTONS }, nextState: state };
      }
      const requiredLevel = MIN_LEVEL_FOR_ZONE[zone];
      if ((state.player.level || 1) < requiredLevel) {
        return {
          reply: { text: `⛔ Слишком опасно. «${ZONE_LABEL[zone]}» открывается с ${requiredLevel} уровня — сейчас у тебя ${state.player.level || 1}.`, buttons: ZONE_BUTTONS },
          nextState: state
        };
      }
      const player = { ...state.player, zone };
      return startJourney(player, 'explore', { zone, depth: 0 }, rng);
    }

    case SCENES.LOC_GATES_TRAVEL: {
      if (input === 'Назад') {
        return { reply: { text: 'Выбери, куда прыгнуть:', buttons: ZONE_BUTTONS }, nextState: { scene: 'loc_gates', player: state.player } };
      }
      if (!FACTIONS.includes(input) || input === state.player.faction) {
        const others = FACTIONS.filter((f) => f !== state.player.faction);
        return { reply: { text: 'Выбери станцию кнопкой ниже.', buttons: [...others, 'Назад'] }, nextState: state };
      }
      return startJourney(state.player, 'travel', { targetFaction: input }, rng);
    }

    default:
      return null;
  }
}

module.exports = { handleGates };
