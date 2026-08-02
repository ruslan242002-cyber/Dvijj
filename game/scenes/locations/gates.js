'use strict';

const { hubMessage, stationButtons, startJourney, FACTIONS } = require('../common.js');
const { imageForLocation } = require('../../location-images.js');
const { SCENES } = require('../ids.js');

/**
 * ИЗМЕНЕНО: раньше здесь ещё и выбиралась зона (патрулируемая/спорная/
 * открытый космос) отдельной кнопкой — путано и дублировало новую
 * систему полёта (engine/travel.js: zoneForDistance), где зона зависит
 * от того, как далеко и на каком корабле долетел, а не от отдельного
 * выбора здесь. Врата Тракта теперь только про перелёт МЕЖДУ станциями.
 */
function handleGates(state, input, rng, deps) {
  switch (state.scene) {
    case SCENES.LOC_GATES: {
      const others = FACTIONS.filter((f) => f !== state.player.faction);
      if (input === '⬅️ Назад') {
        return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player), imageKey: imageForLocation('station', state.player.faction) }, nextState: { scene: 'station', player: state.player } };
      }
      if (others.includes(input)) {
        return startJourney(state.player, 'travel', { targetFaction: input }, rng);
      }
      return { reply: { text: 'Куда проложить курс?', buttons: [...others, '⬅️ Назад'] }, nextState: state };
    }

    default:
      return null;
  }
}

module.exports = { handleGates };
