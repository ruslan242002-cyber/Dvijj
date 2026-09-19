'use strict';

/**
 * ЛЮДИ СТАНЦИИ — минимальная версия. По договорённости эта система
 * отложена ("накопилось много персонажей, реализуем позже") — здесь
 * только список NPC станции с репликой по числу встреч (city/npc-
 * roster.js уже полностью готов), БЕЗ полноценных диалоговых веток —
 * та часть намеренно не строится сейчас.
 *
 * ⚠️ БАГ-ФИКС: тот же класс, что и stationArrivalCard/cantinaBoard —
 * список людей должен отражать станцию, где игрок РЕАЛЬНО находится
 * (currentStation), не его домашнюю фракцию. Раньше гость на чужой
 * станции видел список НЕ ТЕХ людей — своих домашних NPC вместо
 * реально присутствующих в этом городе.
 */
const { npcsForStation, getNpcLine } = require('../../../city/npc-roster.js');
const { hubMessage, stationButtons, currentStation } = require('../common.js');
const { imageForCurator } = require('../../curator-images.js');
const { SCENES } = require('../ids.js');

function npcPeopleScreen(player) {
  const npcs = npcsForStation(currentStation(player));
  player.npcMeetings = player.npcMeetings || {};
  const buttons = npcs.map((n) => `${n.name}`);
  buttons.push('⬅️ Назад');
  return {
    reply: { text: `👥 ЛЮДИ СТАНЦИИ\n\nС кем поговорить?`, buttons },
    nextState: { scene: SCENES.NPC_PEOPLE, player },
  };
}

function npcTalkScreen(player, npcId) {
  const meetCount = player.npcMeetings[npcId] || 0;
  const line = getNpcLine(npcId, meetCount);
  player.npcMeetings[npcId] = meetCount + 1;
  return {
    reply: { text: line || '...', buttons: ['⬅️ Назад'], imageKey: imageForCurator(currentStation(player)) },
    nextState: { scene: SCENES.NPC_QUEST, player },
  };
}

function handleNpc(state, input, rng, deps) {
  switch (state.scene) {
    case SCENES.NPC_PEOPLE: {
      if (input === '⬅️ Назад') {
        return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player) }, nextState: { scene: 'station', player: state.player } };
      }
      const npcs = npcsForStation(currentStation(state.player));
      const npc = npcs.find((n) => n.name === input);
      if (!npc) return npcPeopleScreen(state.player);
      return npcTalkScreen(state.player, npc.id);
    }
    case SCENES.NPC_QUEST: {
      return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player) }, nextState: { scene: 'station', player: state.player } };
    }
    default:
      return null;
  }
}

module.exports = { handleNpc, npcPeopleScreen, npcTalkScreen };
