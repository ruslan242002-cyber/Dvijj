/**
 * МИФОЛОГИЯ ТРАКТА — ядро мира и глобальный эндгейм-квест «Сшить Тракт».
 *
 * Что поправил при адаптации:
 *
 *  1. state → player, по той же причине, что и везде в этом роутере:
 *     только то, что лежит в player, переживает переход между сценами.
 *
 *  2. У трёх из семи фрагментов условие разблокировки ссылалось на
 *     системы, которых у нас физически нет:
 *       - fragment_gamma: 'boss_kills' — заменил на highTierKills
 *         (счётчик убийств врагов тира 5+, который теперь реально
 *         ведётся в game/router.js после каждой победы в бою);
 *       - fragment_delta: 'tower' (этаж башни) — башни-мини-игры нет,
 *         заменил на уровень персонажа (level 25) — по духу похоже:
 *         тоже "долгий путь", а не разовое действие;
 *       - fragment_epsilon: 'pvp' (победы над игроками) — PvP между
 *         игроками не реализовано, заменил на суммарное число побед
 *         в бою (killCount) — сама лорная фраза "что если враг — это
 *         ты сам" не потеряла смысл: чем больше боёв, тем актуальнее вопрос;
 *       - fragment_zeta: 'craft' (уникальные предметы) — крафта нет,
 *         заменил на число выполненных квестов станций (completedQuests) —
 *         "ты создавал орудия" стало "ты решал задачи станций", лорный
 *         текст чуть подправлен под это.
 *     fragment_alpha (репутация конкретной фракции) и fragment_beta
 *     (число вылазок в жёлтую зону) переносятся без изменений — это
 *     как раз то, что у нас уже реально считается (player.factionStanding
 *     из choices/consequence-engine.js и player.zoneVisits).
 *
 *  3. "guardian" (уникальный босс на фрагмент) оставлен как лорное поле —
 *     сама механика "прийти и подраться с named-боссом за фрагмент" ещё
 *     не реализована (нет сцены "экспедиция за фрагментом"), это
 *     следующий логичный шаг, если понадобится.
 *
 *  4. ENDINGS (концовки) реализованы как данные + чистая функция
 *     getEnding(player) — без самой сцены "финальное испытание", это
 *     тоже задел на будущее: как только появится соответствующая сцена,
 *     она сможет прямо спросить getEnding(player) и показать нужный текст.
 */
'use strict';

const TRAKT_FRAGMENTS = [
  {
    id: 'fragment_alpha',
    name: 'Фрагмент Альфа: Координаты Истока',
    sector: 'blue',
    guardian: 'Древний Зонд-Хранитель',
    unlockCondition: { type: 'faction_reputation', faction: 'Терминус', value: 50 },
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
    unlockCondition: { type: 'high_tier_kills', count: 5 },
    lore: 'Арсенал знает силу. Но сила без понимания — глухота.'
  },
  {
    id: 'fragment_delta',
    name: 'Фрагмент Дельта: Матрица Возврата',
    sector: 'red',
    guardian: 'Искажённый Куратор',
    unlockCondition: { type: 'level', value: 25 },
    lore: 'Приют лечит раны. Но некоторые раны — это двери.'
  },
  {
    id: 'fragment_epsilon',
    name: 'Фрагмент Эпсилон: Подпись Предателя',
    sector: 'red',
    guardian: 'Тень Себя',
    unlockCondition: { type: 'total_kills', count: 100 },
    lore: 'Ты дрался столько раз, что счёт потерял смысл. А что, если враг — это ты сам?'
  },
  {
    id: 'fragment_zeta',
    name: 'Фрагмент Зета: Код Перезагрузки',
    sector: 'red',
    guardian: 'Аварийный ИИ Тракта',
    unlockCondition: { type: 'quests_completed', count: 15 },
    lore: 'Ты решал задачи станций одну за другой. Сможешь ли решить задачу самого Тракта?'
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

const HYPOTHESES = ['CATASTROPHE', 'INFECTION', 'EVOLUTION', 'BETRAYAL'];

function checkUnlock(player, condition) {
  switch (condition.type) {
    case 'faction_reputation':
      return ((player.factionStanding || {})[condition.faction] || 0) >= condition.value;
    case 'explore':
      return ((player.zoneVisits || {})[condition.zone] || 0) >= condition.count;
    case 'high_tier_kills':
      return (player.highTierKills || 0) >= condition.count;
    case 'level':
      return (player.level || 1) >= condition.value;
    case 'total_kills':
      return (player.killCount || 0) >= condition.count;
    case 'quests_completed':
      return (player.completedQuests || []).length >= condition.count;
    case 'fragments':
      return ((player.lore && player.lore.fragments) || []).length >= condition.count;
    default:
      return false;
  }
}

function getFragmentStatus(player) {
  const collected = (player.lore && player.lore.fragments) || [];
  return TRAKT_FRAGMENTS.map((f) => ({
    ...f,
    collected: collected.includes(f.id),
    unlocked: checkUnlock(player, f.unlockCondition)
  }));
}

/** Отмечает фрагмент собранным — только если он реально разблокирован
 * и ещё не собран. Возвращает { success, player }. */
function collectFragment(player, fragmentId) {
  const fragment = TRAKT_FRAGMENTS.find((f) => f.id === fragmentId);
  if (!fragment) return { success: false, player };

  player.lore = player.lore || {};
  player.lore.fragments = player.lore.fragments || [];
  if (player.lore.fragments.includes(fragmentId)) return { success: false, player };
  if (!checkUnlock(player, fragment.unlockCondition)) return { success: false, player };

  player.lore.fragments.push(fragmentId);
  return { success: true, player };
}

function getActiveHypothesis(player) {
  return (player.lore && player.lore.hypothesis) || null;
}

function setHypothesis(player, hypothesisId) {
  if (!HYPOTHESES.includes(hypothesisId)) return player;
  player.lore = player.lore || {};
  player.lore.hypothesis = hypothesisId;
  player.lore.discoveredHypotheses = player.lore.discoveredHypotheses || [];
  if (!player.lore.discoveredHypotheses.includes(hypothesisId)) {
    player.lore.discoveredHypotheses.push(hypothesisId);
  }
  return player;
}

/** Просто "узнать" гипотезу (услышать её от NPC/в квесте), не обязательно поверить в неё —
 * нужно для концовки SYNTHESIS ("узнал все четыре и отверг все"). */
function discoverHypothesis(player, hypothesisId) {
  if (!HYPOTHESES.includes(hypothesisId)) return player;
  player.lore = player.lore || {};
  player.lore.discoveredHypotheses = player.lore.discoveredHypotheses || [];
  if (!player.lore.discoveredHypotheses.includes(hypothesisId)) {
    player.lore.discoveredHypotheses.push(hypothesisId);
  }
  return player;
}

/** Возвращает подходящую концовку по текущему состоянию игрока, либо null,
 * если условия ещё не выполнены (обычно — не собраны все 7 фрагментов). */
function getEnding(player) {
  const fragmentsCount = ((player.lore && player.lore.fragments) || []).length;
  if (fragmentsCount < 7) return null;

  const discovered = (player.lore && player.lore.discoveredHypotheses) || [];
  if (discovered.length >= HYPOTHESES.length) return ENDINGS.SYNTHESIS;

  const hypothesis = getActiveHypothesis(player);
  return Object.values(ENDINGS).find((e) => e.condition.hypothesis === hypothesis) || null;
}

module.exports = {
  TRAKT_FRAGMENTS, ENDINGS, HYPOTHESES,
  checkUnlock, getFragmentStatus, collectFragment,
  getActiveHypothesis, setHypothesis, discoverHypothesis, getEnding
};
