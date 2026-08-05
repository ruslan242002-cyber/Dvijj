'use strict';

/**
 * Онбординг: приветствие -> позывной -> станция -> тренировочный бой ->
 * доклад куратору -> первая продажа хлама -> открытие Врат Тракта.
 */

const { CURATORS, freshPlayer, trainerDrone, sellInventory, addToInventory, stationButtons } = require('./common.js');
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
      const player = freshPlayer(input, 'Приют');
      const curator = CURATORS['Приют'] || 'куратор станции';
      const wakeText = `Позывной принят, ${input}.\n\n` +
        `Медтехник кивает и уводит тебя дальше по коридору — «стандартная адаптация», как она это называет. Заканчивается коридор смотровой палубой с окнами на внешний Тракт.\n\n` +
        `Здесь просыпаются все — Приют первым принимает потерявших память, задолго до того, как кто-то решает, куда двигаться дальше. Остальные станции подождут: доберёшься, когда будешь готов(а).\n\n` +
        `Куратор ${curator} встречает новичков лично: «Тракт стёр тебе память, но не стёр рефлексы. Проверим?»`;
      return {
        reply: { text: wakeText, buttons: ['⚔️ Атаковать'] },
        nextState: { scene: 'pre_combat', player, enemy: trainerDrone(), trainingFight: true }
      };
    }

    case SCENES.ASK_FACTION: {
      // Больше не используется в обычном потоке онбординга (выбора
      // фракции больше нет — все стартуют в Приюте, см. ASK_NAME выше).
      // Оставлено на случай, если где-то в состоянии игрока всё ещё
      // всплывёт этот сценарий — не должно происходить, но лучше мягкий
      // фолбэк, чем краш.
      const player = freshPlayer(state.name || 'Пилот', 'Приют');
      return {
        reply: { text: `Добро пожаловать в Приют, ${player.name}.`, buttons: ['⚔️ Атаковать'] },
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
