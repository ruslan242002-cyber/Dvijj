'use strict';

/**
 * ЭКРАН ИМЕННОГО ПЕРСОНАЖА — общий для всех city/named-characters.js
 * записей. Один переиспользуемый экран, данные берутся из карточки
 * персонажа.
 */
const { getCharacter } = require('../../city/named-characters.js');
const { hubMessage, stationButtons, addToInventory } = require('./common.js');
const { SCENES } = require('./ids.js');

// ⚠️ ВИЗУАЛЬНЫЙ ПРОГРЕСС (по запросу пользователя, "как в популярных
// играх") — номер этапа извлекается из stage.id автоматически (напр.
// 'kran_07' → 7), не требует правки всех 52 объектов квестов вручную.
// STORY_ARC_TOTAL_STAGES — общий потолок саги "Пять Голосов Тракта"
// (сейчас у Айрин максимум, 13-й) — обновить при добавлении Q14+.
const STORY_ARC_TOTAL_STAGES = 13;
function questProgressLine(stageId) {
  const match = /_(\d+)$/.exec(stageId);
  if (!match) return '';
  const n = parseInt(match[1], 10);
  return `📖 «Пять Голосов Тракта» — Этап ${n}/${STORY_ARC_TOTAL_STAGES}\n\n`;
}
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
      if (stage.preBeats && stage.preBeats.length > 0) {
        return {
          reply: { text: `${prefixText}${stage.preBeats[0]}`, buttons: ['➡️ Дальше'], imageKey: stage.imageKey || character.imageKey },
          nextState: { scene: SCENES.NAMED_CHARACTER, player, characterId, backScene, stageId: stage.id, beatIndex: 0 },
        };
      }
      return {
        reply: {
          text: `${prefixText}${character.name}\n\n${questProgressLine(stage.id)}${typeof stage.intro === 'function' ? stage.intro(player) : stage.intro}`,
          buttons: [stage.acceptButton, '⬅️ Назад'],
          imageKey: stage.imageKey || character.imageKey,
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
      // ⚠️ МНОГОШАГОВЫЙ ПЕЙСИНГ (по прямому запросу пользователя) —
      // stage.preBeats: короткие шаги перед основным intro+выборами,
      // для крупных эмоциональных раскрытий, где одна кинематографичная
      // пауза важнее мгновенного перехода к тексту с кнопками. Не
      // меняет саму механику стадии — просто задержка перед ней.
      if (stage.preBeats && state.beatIndex !== undefined && input === '➡️ Дальше') {
        const nextIndex = state.beatIndex + 1;
        if (nextIndex < stage.preBeats.length) {
          return {
            reply: { text: stage.preBeats[nextIndex], buttons: ['➡️ Дальше'], imageKey: stage.imageKey || character.imageKey },
            nextState: { scene: SCENES.NAMED_CHARACTER, player: state.player, characterId: state.characterId, backScene: state.backScene, stageId: state.stageId, beatIndex: nextIndex },
          };
        }
        return {
          reply: {
            text: `${character.name}\n\n${questProgressLine(stage.id)}${typeof stage.intro === 'function' ? stage.intro(state.player) : stage.intro}`,
            buttons: [stage.acceptButton, '⬅️ Назад'],
            imageKey: stage.imageKey || character.imageKey,
          },
          nextState: { scene: SCENES.NAMED_CHARACTER, player: state.player, characterId: state.characterId, backScene: state.backScene, stageId: stage.id },
        };
      }
      if (input === stage.acceptButton) {
        if (stage.launchesMinigame === 'ship_diagnostics') {
          const { shipDiagnosticsScreen } = require('./minigames.js');
          return shipDiagnosticsScreen(state.player, state.backScene, {
            arcCharacterId: state.characterId,
            arcStageId: state.stageId,
          });
        }
        if (stage.launchesMinigame === 'sensor_layers') {
          const { sensorLayersScreen } = require('./minigames.js');
          return sensorLayersScreen(state.player, state.backScene, {
            arcCharacterId: state.characterId,
            arcStageId: state.stageId,
          });
        }
        if (stage.launchesMinigame === 'archive_reconstruction') {
          const { archiveReconstructionScreen } = require('./minigames.js');
          return archiveReconstructionScreen(state.player, state.backScene, {
            arcCharacterId: state.characterId,
            arcStageId: state.stageId,
          });
        }
        // ⚠️ Направляемое путешествие (lib/quest-journeys.js) — для
        // ключевых сюжетных моментов Q1-Q14, где текст квеста ГОВОРИТ
        // про полёт (напр. V8 "Отправление"). Возврат — обратно к
        // этому же диалогу (backScene = named-character), чтобы
        // discovery, выданный в конце путешествия, сразу же разблокировал
        // следующую стадию у того же NPC через обычное condition.
        if (stage.launchesJourney) {
          const { startQuestJourney } = require('./quest-journey.js');
          return startQuestJourney(state.player, stage.launchesJourney, state.backScene, {
            arcCharacterId: state.characterId,
            arcStageId: state.stageId,
          });
        }

        const resolvedChoices = typeof stage.choices === 'function' ? stage.choices(state.player) : stage.choices;
        // ⚠️ VK жёстко режет подпись кнопки до 40 символов молча
        // (см. lib/button-utils.js) — короткая подпись на кнопке,
        // полный текст пронумерован в теле сообщения, если хоть один
        // вариант длиннее лимита.
        const { buildChoiceDisplay } = require('../../lib/button-utils.js');
        const { buttons: choiceButtons, optionsList } = buildChoiceDisplay(resolvedChoices);
        return {
          reply: {
            text: `${character.name}\n\nВыбери, как подойти к делу:${optionsList}`,
            buttons: choiceButtons,
            imageKey: stage.imageKey || character.imageKey,
          },
          nextState: { scene: SCENES.NAMED_CHARACTER, player: state.player, characterId: state.characterId, backScene: state.backScene, stageId: state.stageId, choosing: true },
        };
      }

      if (state.choosing) {
        const resolvedChoicesForPick = typeof stage.choices === 'function' ? stage.choices(state.player) : stage.choices;
        // ⚠️ Кнопка могла показать укороченную подпись (VK 40-символьный
        // лимит, lib/button-utils.js) — сверяем и с полным текстом, и
        // с тем, что реально было на кнопке.
        const { shortButtonLabel } = require('../../lib/button-utils.js');
        const choice = resolvedChoicesForPick.find((c) => c.text === input || shortButtonLabel(c.text) === input);
        if (choice) {
          // ⚠️ НАСТОЯЩИЙ БОЙ ВНУТРИ КВЕСТА (по запросу пользователя —
          // "логичные битвы", не просто текст). triggerCombat — функция,
          // строящая врага; переход в pre_combat с npcArcCombat в
          // состоянии, чтобы combat.js знал, куда вернуться и что выдать
          // ПОСЛЕ победы — награда даётся только за реальную победу, не
          // за сам факт выбора.
          if (choice.triggerCombat) {
            return {
              reply: {
                text: choice.preCombatText || 'Ты готовишься к столкновению.',
                buttons: ['⚔️ В бой'],
                imageKey: stage.imageKey || character.imageKey,
              },
              nextState: {
                scene: 'pre_combat',
                player: state.player,
                enemy: choice.triggerCombat(),
                npcArcCombat: { characterId: state.characterId, stageId: state.stageId, choiceText: choice.text, backScene: state.backScene },
              },
            };
          }

          const player = state.player;
          if (choice.loot) {
            addToInventory(player, choice.loot.resource, choice.loot.tier, choice.loot.qty);
          }
          if (choice.consumeResource) {
            // ⚠️ Механика "принеси ресурсы" (по прямому запросу
            // пользователя) — выбор, доступный только при наличии
            // материала (проверка уже в самой choices-функции стадии),
            // здесь списывает его по-настоящему. Не падаем, если вдруг
            // не хватило (гонка между просмотром и кликом) — просто не
            // списываем лишнего.
            const { resource, tier, qty } = choice.consumeResource;
            const owned = (player.inventory || []).find((i) => i.resource === resource && i.tier === tier);
            if (owned) owned.qty = Math.max(0, owned.qty - qty);
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
          if (choice.trustDelta) {
            const { grantTrust } = require('../../lib/npc-trust.js');
            grantTrust(player, state.characterId, choice.trustDelta);
          }
          if (choice.questArtifact) {
            // ⚠️ ПО ПРЯМОМУ ЗАПРОСУ ПОЛЬЗОВАТЕЛЯ: предмет — не гарантия
            // за прохождение, а признание доверия. Если у выбора задан
            // questArtifactMinTrust — дарят, только если доверие к
            // этому персонажу уже достаточное (система lib/npc-trust.js).
            // Без questArtifactMinTrust — как раньше, безусловно (не
            // трогаем совместимость для choices, где это не задано).
            const shouldGrant = !choice.questArtifactMinTrust || (() => {
              const { getTrust } = require('../../lib/npc-trust.js');
              return getTrust(player, state.characterId) >= choice.questArtifactMinTrust;
            })();
            if (shouldGrant) {
              const { grantQuestArtifact } = require('../../lib/artifacts.js');
              grantQuestArtifact(player, choice.questArtifact);
            }
          }
          if (choice.reputation) {
            addFactionReputation(player, player.faction, choice.reputation);
          }
          completeStage(player, state.characterId, state.stageId);

          // ⚠️ БАГ-ФИКС: choice.flavor теперь тоже может быть функцией
          // от player (напр. planAware()), тем же паттерном, что уже
          // поддерживают stage.intro/stage.choices — раньше поддержки
          // не было, planAware-обёрнутый flavor утекал в текст как
          // исходный код функции вместо результата вызова.
          const resolvedFlavor = typeof choice.flavor === 'function' ? choice.flavor(player) : choice.flavor;

          return {
            reply: {
              text: `${resolvedFlavor}\n\n${stage.closingLine}`,
              buttons: ['⬅️ Назад'],
              imageKey: stage.imageKey || character.imageKey,
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
