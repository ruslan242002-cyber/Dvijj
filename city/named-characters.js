'use strict';

/**
 * ЭКРАН ИМЕННОГО ПЕРСОНАЖА — общий для всех city/named-characters.js
 * записей. Не по одному файлу на персонажа (чтобы не плодить монолиты
 * и не дублировать один и тот же каркас 4+ раза) — один переиспользуемый
 * экран, данные берутся из карточки персонажа.
 *
 * Пока status==='stub' у персонажа, клик по любой его функции отвечает
 * честной заглушкой "в разработке" — ничего не ломает, просто пока
 * нечего показать по-настоящему.
 */
const { getCharacter } = require('../../city/named-characters.js');
const { hubMessage, stationButtons } = require('./common.js');
const { SCENES } = require('./ids.js');

// backScene -> как правильно перерисовать экран, откуда пришли (не общее
// "🛰️ станция", а именно тот же экран с его текстом/картинкой). Ленивый
// require внутри функций (не на верху файла) — volny-port.js сам
// require'ит characterScreen отсюда, обратный require на верху файла
// создал бы цикл при загрузке модуля; внутри функции он безопасен, т.к.
// к моменту вызова оба модуля уже полностью загружены.
const BACK_SCREEN_BUILDERS = {
  volny_port_olddock: () => require('./locations/volny-port.js').oldDockScreen,
  volny_port_uppercity: () => require('./locations/volny-port.js').upperCityScreen,
};

function rebuildBackScreen(backScene, player) {
  const getBuilder = BACK_SCREEN_BUILDERS[backScene];
  if (getBuilder) {
    return getBuilder()(player);
  }
  return { reply: { text: hubMessage(player), buttons: stationButtons({}, player) }, nextState: { scene: 'station', player } };
}

function characterScreen(characterId, player, backScene = 'station', prefixText = '') {
  const character = getCharacter(characterId);
  if (!character) {
    return {
      reply: { text: hubMessage(player), buttons: stationButtons({}, player) },
      nextState: { scene: 'station', player },
    };
  }

  const text =
    `${prefixText}${character.name} ${character.title}\n` +
    `${character.role} · ${character.location}\n\n` +
    `${character.description}\n\n` +
    `${character.quote}`;

  const buttons = character.functions.map((f) => f.name);
  buttons.push('⬅️ Назад');

  return {
    reply: { text, buttons, imageKey: character.imageKey },
    nextState: { scene: SCENES.NAMED_CHARACTER, player, characterId, backScene },
  };
}

function handleNamedCharacter(state, input, rng, deps) {
  if (state.scene !== SCENES.NAMED_CHARACTER) return null;

  const character = getCharacter(state.characterId);
  if (!character) {
    return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player) }, nextState: { scene: 'station', player: state.player } };
  }

  if (input === '⬅️ Назад') {
    return rebuildBackScreen(state.backScene, state.player);
  }

  const func = character.functions.find((f) => f.name === input);
  if (func) {
    // ⚠️ status==='stub' — честная заглушка, не притворяется рабочей
    // функцией. Когда для персонажа появится реальная логика — эта
    // ветка заменяется на настоящий обработчик конкретной функции.
    return characterScreen(
      state.characterId,
      state.player,
      state.backScene,
      `🔧 «${func.name}» — ${func.description}\n\nЭта функция пока в разработке.\n\n`
    );
  }

  return characterScreen(state.characterId, state.player, state.backScene);
}

module.exports = { characterScreen, handleNamedCharacter };
