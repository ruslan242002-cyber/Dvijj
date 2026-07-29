'use strict';

const { getFragmentStatus } = require('./trakt-mythos.js');

const TRAKT_ACTS = [
  {
    id: 'act_1_static',
    name: 'Акт I · Помехи',
    minFragments: 0,
    maxFragments: 1,
    text: 'На всех станциях независимо друг от друга кураторы замечают странный отголосок в фоновом шуме Тракта. Никто прямо не даёт тебе это как задание — только путевые фразы, обрывки разговоров и случайные находки в дальних секторах.'
  },
  {
    id: 'act_2_divided',
    name: 'Акт II · Разделённые',
    minFragments: 2,
    maxFragments: 3,
    text: 'Сигнал усиливается в конкретных, повторяющихся точках карты. Станции подозревают друг друга в сокрытии источника — правду не собрать в одиночку под одним куратором, придётся сверять находки между фракциями.'
  },
  {
    id: 'act_3_echo',
    name: 'Акт III · Отголосок',
    minFragments: 4,
    maxFragments: 5,
    text: 'Источник почти найден. То, что вы ищете, — не просто помеха и не случайное искажение, а нечто, помнящее себя прежним. Развилка близко: упокоить найденное или попытаться вытащить его из-под влияния Тракта.'
  },
  {
    id: 'act_4_depth',
    name: 'Акт IV · Глубина',
    minFragments: 6,
    maxFragments: 7,
    text: 'Финал раскрывает, как находка связана с самим происхождением станций. Дальше — только Точка Сшивки, и выбор, что с ней делать, стоит целой Периферии.'
  }
];

function getCurrentAct(player) {
  const collected = getFragmentStatus(player).filter((f) => f.collected).length;
  return TRAKT_ACTS.find((act) => collected >= act.minFragments && collected <= act.maxFragments) || TRAKT_ACTS[TRAKT_ACTS.length - 1];
}

function actProgressLine(player) {
  const act = getCurrentAct(player);
  const collected = getFragmentStatus(player).filter((f) => f.collected).length;
  return `${act.name} (фрагментов собрано: ${collected}/7)`;
}

module.exports = { TRAKT_ACTS, getCurrentAct, actProgressLine };
