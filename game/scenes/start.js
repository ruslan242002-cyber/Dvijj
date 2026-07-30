'use strict';

/**
 * Онбординг: приветствие -> позывной -> станция -> тренировочный бой ->
 * доклад куратору -> первая продажа хлама -> открытие Врат Тракта.
 */

const { FACTIONS, CURATORS, freshPlayer, trainerDrone, sellInventory, addToInventory, stationButtons } = require('./common.js');
const { imageForCurator } = require('../curator-images.js');
const { SCENES } = require('./ids.js');

function handleStart(state, input, rng, deps) {
  switch (state.scene) {
    case SCENES.START: {
      return {
        reply: { text: '🛰️ ПЕРИФЕРИЯ\n\nТы не должен был очнуться. Спасательная капсула шла на автопилоте три века — с того дня, как Тракт разорвался и выбросил тысячи ковчегов на край известного космоса.\n\nНо что-то разбудило тебя именно сейчас. Не авария. Не таймер. Слабый сигнал — идущий не из капсулы и не со станции, к которой ты пристыковался.\n\nРазберёшься позже. Как тебя записать в журнал станции?', buttons: [] },
        nextState: { scene: 'ask_name' }
      };
    }

    case SCENES.ASK_NAME: {
      if (!input) return { reply: { text: 'Нужен хоть какой-то позывной.', buttons: [] }, nextState: state };
      return {
        reply: { text: `Позывной принят, ${input}.\n\nК какому доку пристыковаться?`, buttons: FACTIONS },
        nextState: { scene: 'ask_faction', name: input }
      };
    }

    case SCENES.ASK_FACTION: {
      if (!FACTIONS.includes(input)) {
        return { reply: { text: 'Выбери одну из четырёх станций кнопкой ниже.', buttons: FACTIONS }, nextState: state };
      }
      const player = freshPlayer(state.name, input);
      const curator = CURATORS[input] || 'куратор станции';
      return {
        reply: {
          text: `Добро пожаловать на борт, ${state.name}. Станция «${input}» тебя ждёт.\n\nКуратор ${curator} лично встречает новичков в тренировочном отсеке — активировался дежурный дрон-манекен, никакого риска, просто проверка со скафандром.`,
          buttons: ['Атаковать']
        },
        nextState: { scene: 'pre_combat', player, enemy: trainerDrone(), trainingFight: true }
      };
    }

    case SCENES.QUEST_REPORT: {
      const player = { ...state.player, statPoints: (state.player.statPoints || 0) + 1 };
      const curator = CURATORS[player.faction] || '';
      return {
        reply: {
          text: `Куратор ${curator}: «Неплохо для начала. Держи премию за инициативу — одно очко параметров сверху». Прежде чем отпустить тебя в космос, пройдёмся по станции — тут всё, что понадобится.`,
          buttons: ['Идём'],
          imageKey: imageForCurator(player.faction)
        },
        nextState: { scene: 'quest_shop', player }
      };
    }

    case SCENES.QUEST_SHOP: {
      if (!state.player.inventory || state.player.inventory.length === 0) {
        const player = { ...state.player };
        addToInventory(player, 'Сплавы', 1, 3);
        return {
          reply: {
            text: `🔧 РЕМОНТНЫЙ ОТСЕК\n\nКуратор кивает Завхозу: «Покажи, как тут всё устроено». Завхоз суёт тебе в руки 3 куска обшивки: «Барахло с прошлой вылазки — продай, привыкай к обороту трюма».`,
            buttons: ['Продать хлам']
          },
          nextState: { scene: 'quest_shop', player }
        };
      }
      const player = { ...state.player };
      const gained = sellInventory(player);
      return {
        reply: { text: `💳 Завхоз отсчитывает ${gained} кредитов: «Вот и весь фокус — находишь, продаёшь, снаряжаешься». Последняя остановка — Врата Тракта.`, buttons: ['Идём к вратам'] },
        nextState: { scene: 'quest_gates', player }
      };
    }

    case SCENES.QUEST_GATES: {
      const player = { ...state.player, zone: 'blue' };
      return {
        reply: {
          text: `🌀 ВРАТА ТРАКТА\n\nКуратор указывает на мерцающий контур: «Патрулируемые секторы — спокойно, спорные — держи ухо востро, открытый космос — только с седьмого уровня, и то по готовности». Станция полностью открыта.`,
          buttons: stationButtons(deps, state.player)
        },
        nextState: { scene: 'station', player }
      };
    }

    default:
      return null;
  }
}

module.exports = { handleStart };
