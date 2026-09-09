'use strict';

/**
 * ЭКРАН ИМЕННОГО ПЕРСОНАЖА — общий для всех city/named-characters.js
 * записей. Один переиспользуемый экран, данные берутся из карточки
 * персонажа.
 */
const { getCharacter } = require('../../city/named-characters.js');
const { hubMessage, stationButtons, addToInventory } = require('./common.js');
const { SCENES } = require('./ids.js');
const { getAvailableStage, completeStage } = require('../../lib/npc-arcs.js');
const { grantXp } = require('../../engine/leveling.js');
const { recordDiscovery } = require('../../lib/discoveries.js');
const { addFactionReputation } = require('../../engine/reputation.js');

// Реальные обработчики функций — отдельно от city/named-characters.js.
// Ключ: "characterId:functionId". Если для функции здесь нет записи —
// handleNamedCharacter сам показывает честную заглушку "в разработке".
const FUNCTION_HANDLERS = {};

function registerFunctionHandler(characterId, functionId, handler) {
  FUNCTION_HANDLERS[`${characterId}:${functionId}`] = handler;
}

// ⚠️ БАГ-ФИКС №2 (первый — вынос регистраций в register-character-
// functions.js — не решил проблему целиком в полном дереве проекта на
// проде, там всё ещё "registerFunctionHandler is not a function" при
// require('./named-character.js') ИЗВНЕ). Настоящая причина шире, чем
// одна конкретная цепочка — в достаточно большом графе require ЛЮБОЙ
// внешний require('./named-character.js') потенциально мог поймать
// module.exports в процессе заполнения. Радикальное решение: регистрация
// теперь происходит ЛЕНИВО и ИЗНУТРИ этого же модуля — не через внешний
// require() named-character.js откуда-то ещё, а сам named-character.js
// при первом реальном вызове (не при загрузке!) подтягивает функции
// персонажей и регистрирует их НАПРЯМУЮ в свой же FUNCTION_HANDLERS,
// без какого-либо require() САМОГО СЕБЯ откуда-либо. К моменту, когда
// реально обрабатывается ввод игрока, ВСЕ модули уже гарантированно
// загружены целиком — Node не выполняет прикладной код, пока весь
// граф require не разрешится.
let _functionsRegistered = false;
function ensureFunctionsRegistered() {
  if (_functionsRegistered) return;
  _functionsRegistered = true;
  require('./register-character-functions.js').registerAllCharacterFunctions(registerFunctionHandler);
}

// backScene -> как правильно перерисовать экран, откуда пришли. Ленивый
// require внутри функций (не на верху файла) — во избежание циклов при
// загрузке модуля.
const BACK_SCREEN_BUILDERS = {
  volny_port_olddock: () => require('./locations/volny-port.js').oldDockScreen,
  volny_port_uppercity: () => require('./locations/volny-port.js').upperCityScreen,
  volny_port_docks: () => require('./locations/volny-port.js').docksScreen,
  volny_port_pilots: () => require('./locations/volny-port.js').pilotQuarterScreen,
};

function rebuildBackScreen(backScene, player) {
  const getBuilder = BACK_SCREEN_BUILDERS[backScene];
  if (getBuilder) {
    return getBuilder()(player);
  }
  return { reply: { text: hubMessage(player), buttons: stationButtons({}, player) }, nextState: { scene: 'station', player } };
}

function characterScreen(characterId, player, backScene = 'station', prefixText = '') {
  ensureFunctionsRegistered();
  const character = getCharacter(characterId);
  if (!character) {
    return {
      reply: { text: hubMessage(player), buttons: stationButtons({}, player) },
      nextState: { scene: 'station', player },
    };
  }

  // Общий флаг "уже встречал этого персонажа" — не привязан к
  // прохождению квеста/функции, просто факт визита. Пригождается для
  // подсказок вроде "Поиск людей" у Мары (game/scenes/character-
  // functions/mara_keyn.js), не для геймплейных условий.
  player.flags = player.flags || {};
  player.flags[`${characterId}_met`] = true;

  if (character.hasArc) {
    const stage = getAvailableStage(characterId, player);
    if (stage) {
      return {
        reply: {
          text: `${prefixText}${character.name}\n\n${stage.intro}`,
          buttons: [stage.acceptButton, '⬅️ Назад'],
          imageKey: character.imageKey,
        },
        nextState: { scene: SCENES.NAMED_CHARACTER, player, characterId, backScene, stageId: stage.id },
      };
    }
  }

  const text =
    `${prefixText}${character.name} ${character.title || ''}\n` +
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
  ensureFunctionsRegistered();
  if (state.scene !== SCENES.NAMED_CHARACTER) return null;

  const character = getCharacter(state.characterId);
  if (!character) {
    return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player) }, nextState: { scene: 'station', player: state.player } };
  }

  if (input === '⬅️ Назад') {
    return rebuildBackScreen(state.backScene, state.player);
  }

  if (state.stageId) {
    const { findStage } = require('../../lib/npc-arcs.js');
    const stage = findStage(state.characterId, state.stageId);
    if (stage) {
      if (input === stage.acceptButton) {
        if (stage.launchesMinigame === 'ship_diagnostics') {
          const { shipDiagnosticsScreen } = require('./minigame.js');
          return shipDiagnosticsScreen(state.player, state.backScene, {
            arcCharacterId: state.characterId,
            arcStageId: state.stageId,
          });
        }

        return {
          reply: {
            text: `${character.name}\n\nВыбери, как подойти к делу:`,
            buttons: stage.choices.map((c) => c.text),
            imageKey: character.imageKey,
          },
          nextState: { scene: SCENES.NAMED_CHARACTER, player: state.player, characterId: state.characterId, backScene: state.backScene, stageId: state.stageId, choosing: true },
        };
      }

      if (state.choosing) {
        const choice = stage.choices.find((c) => c.text === input);
        if (choice) {
          const player = state.player;
          if (choice.loot) {
            addToInventory(player, choice.loot.resource, choice.loot.tier, choice.loot.qty);
          }
          if (choice.xp) {
            grantXp(player, choice.xp);
          }
          if (choice.credits) {
            player.credits = (player.credits || 0) + choice.credits;
          }
          if (choice.discovery) {
            recordDiscovery(player, choice.discovery);
          }
          if (choice.reputation) {
            addFactionReputation(player, player.faction, choice.reputation);
          }
          completeStage(player, state.characterId, state.stageId);

          return {
            reply: {
              text: `${choice.flavor}\n\n${stage.closingLine}`,
              buttons: ['⬅️ Назад'],
              imageKey: character.imageKey,
            },
            nextState: { scene: SCENES.NAMED_CHARACTER, player, characterId: state.characterId, backScene: state.backScene },
          };
        }
      }
    }
  }

  const func = character.functions.find((f) => f.name === input);
  if (func) {
    const realHandler = FUNCTION_HANDLERS[`${state.characterId}:${func.id}`];
    if (realHandler) {
      return realHandler(state.player, state.backScene, rng, deps);
    }
    return characterScreen(
      state.characterId,
      state.player,
      state.backScene,
      `🔧 «${func.name}» — ${func.description}\n\nЭта функция пока в разработке.\n\n`
    );
  }

  return characterScreen(state.characterId, state.player, state.backScene);
}

module.exports = { characterScreen, handleNamedCharacter, registerFunctionHandler };
