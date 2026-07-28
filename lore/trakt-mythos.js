'use strict';

/**
 * ЛОР-ПРОСЛОЙКА «Периферия»
 * 
 * ГИПЕРПРОСТРАНСТВЕННЫЙ ТРАКТ — не дорога, а живой организм. 
 * Триста лет назад он «оборвался». Что это значит — никто не знает точно.
 * 
 * ЧЕТЫРЕ ГИПОТЕЗЫ (игрок постепенно открывает все, но верит в одну):
 * 1. КАТАСТРОФА: Тракт разрушил метеоритный поток. Можно восстановить.
 * 2. ИНФЕКЦИЯ: Тракт заразился «Отголосками» — это его иммунный ответ. 
 *    Нужно найти «ядро» и уничтожить.
 * 3. ЭВОЛЮЦИЯ: Тракт сознательно отделил Периферию. Нужно доказать, 
 *    что мы достойны вернуться.
 * 4. ПРЕДАТЕЛЬСТВО: Одна из станций (или все четыре) сделала это намеренно.
 * 
 * ГЛОБАЛЬНЫЙ КВЕСТ: «СШИТЬ ТРАКТ»
 * Собрать 7 ФРАГМЕНТОВ НАВИГАЦИОННОГО КЛЮЧА — древних артефактов, 
 * разбросанных по секторам. Каждый охраняет УНИКАЛЬНЫЙ босс-аномалия.
 * После сбора — финальное испытание: выбор, определяющий концовку.
 */

const TRAKT_FRAGMENTS = [
  {
    id: 'fragment_alpha',
    name: 'Фрагмент Альфа: Координаты Истока',
    sector: 'blue',
    guardian: 'Древний Зонд-Хранитель',
    unlockCondition: { type: 'reputation', faction: 'Терминус', value: 50 },
    lore: 'Терминус хранит память о том, КЕМ были первые путники. Но память искажена.'
  },
  {
    id: 'fragment_beta',
    name: 'Фрагмент Бета: Частота Порога',
    sector: 'yellow',
    guardian: 'Резонансный Коллектив',
    unlockCondition: { type: 'explore', zone: 'yellow', count: 15 },
    lore: 'Вуаль слышит шёпот Тракта. Но шёпот может быть ловушкой.'
  },
  {
    id: 'fragment_gamma',
    name: 'Фрагмент Гамма: Импульс Разрыва',
    sector: 'red',
    guardian: 'Порождение Разлома',
    unlockCondition: { type: 'boss_kills', count: 5, tier: 5 },
    lore: 'Арсенал знает силу. Но сила без понимания — глухота.'
  },
  {
    id: 'fragment_delta',
    name: 'Фрагмент Дельта: Матрица Возврата',
    sector: 'red',
    guardian: 'Искажённый Куратор',
    unlockCondition: { type: 'tower', floor: 7 },
    lore: 'Приют лечит раны. Но некоторые раны — это двери.'
  },
  {
    id: 'fragment_epsilon',
    name: 'Фрагмент Эпсилон: Подпись Предателя',
    sector: 'red',
    guardian: 'Тень Себя',
    unlockCondition: { type: 'pvp', wins: 10 },
    lore: 'Ты дрался с другими. А что, если враг — это ты сам?'
  },
  {
    id: 'fragment_zeta',
    name: 'Фрагмент Зета: Код Перезагрузки',
    sector: 'red',
    guardian: 'Аварийный ИИ Тракта',
    unlockCondition: { type: 'craft', uniqueItems: 3 },
    lore: 'Ты создавал орудия. Сможешь ли создать мост?'
  },
  {
    id: 'fragment_omega',
    name: 'Фрагмент Омега: Точка Сшивки',
    sector: 'red',
    guardian: 'Сердце Тракта',
    unlockCondition: { type: 'fragments', count: 6 },
    lore: 'Все пути ведут сюда. Но путь — это выбор, а не карта.'
  }
];

const ENDINGS = {
  RESTORATION: {
    id: 'restoration',
    name: 'Восстановление',
    condition: { hypothesis: 'CATASTROPHE', fragments: 7 },
    text: 'Тракт сшит. Но он сшит ТОБОЙ — и теперь ты его часть. Навсегда.'
  },
  PURIFICATION: {
    id: 'purification', 
    name: 'Очищение',
    condition: { hypothesis: 'INFECTION', fragments: 7 },
    text: 'Отголоски уничтожены. Тракт чист. Но пуст. Что ты сделал?'
  },
  TRANSCENDENCE: {
    id: 'transcendence',
    name: 'Превосходство',
    condition: { hypothesis: 'EVOLUTION', fragments: 7 },
    text: 'Тракт признал тебя. Ты вышел за пределы Периферии. Но куда?'
  },
  EXPOSURE: {
    id: 'exposure',
    name: 'Разоблачение', 
    condition: { hypothesis: 'BETRAYAL', fragments: 7 },
    text: 'Правда о станциях открыта. Хаос. Война. Но хотя бы честно.'
  },
  SYNTHESIS: {
    id: 'synthesis',
    name: 'Синтез',
    condition: { fragments: 7, allHypotheses: true },
    text: 'Ты понял все четыре истины — и отверг их все. Тракт — это вопрос, а не ответ.'
  }
};

function getFragmentStatus(state) {
  const collected = state.lore?.fragments || [];
  return TRAKT_FRAGMENTS.map(f => ({
    ...f,
    collected: collected.includes(f.id),
    unlocked: checkUnlock(state, f.unlockCondition)
  }));
}

function checkUnlock(state, condition) {
  switch (condition.type) {
    case 'reputation':
      return (state.player.reputation || 0) >= condition.value;
    case 'explore':
      return (state.stats?.exploredYellow || 0) >= condition.count;
    case 'boss_kills':
      return (state.stats?.highTierKills || 0) >= condition.count;
    case 'tower':
      return (state.tower?.bestFloor || 0) >= condition.floor;
    case 'pvp':
      return (state.pvp?.wins || 0) >= condition.wins;
    case 'craft':
      return (state.player.blueprints?.length || 0) >= condition.uniqueItems;
    case 'fragments':
      return (state.lore?.fragments?.length || 0) >= condition.count;
    default: return false;
  }
}

function getActiveHypothesis(state) {
  return state.lore?.hypothesis || null;
}

function setHypothesis(state, hypothesisId) {
  state.lore = state.lore || {};
  state.lore.hypothesis = hypothesisId;
  return state;
}

module.exports = {
  TRAKT_FRAGMENTS,
  ENDINGS,
  getFragmentStatus,
  checkUnlock,
  getActiveHypothesis,
  setHypothesis
};
