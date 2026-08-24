'use strict';

/**
 * ⚠️ ПРОВЕРЬ: unlockCondition у каждого фрагмента и condition у концовок
 * (кроме SYNTHESIS, который цел) обрублены разрывом страницы в PDF —
 * восстановлены реконструкцией, распределены по разным типам условий
 * (те же 7 типов, что реально проверяет checkUnlock ниже — это часть не
 * тронута архивом). id/name/sector/структура — настоящие.
 */
const TRAKT_FRAGMENTS = [
  { id: 'fragment_alpha', guardian: 'Хранитель Истока', shortName: 'Альфа', name: 'Фрагмент Альфа: Координаты Истока', sector: 'blue', unlockCondition: { type: 'level', value: 5 }, lore: 'Набор координат, ведущих в точку, которой официально не существует ни на одной карте станций.' },
  { id: 'fragment_beta', guardian: 'Часовой Порога', shortName: 'Бета', name: 'Фрагмент Бета: Частота Порога', sector: 'yellow', unlockCondition: { type: 'explore', zone: 'yellow', count: 10 }, lore: 'Повторяющаяся частота, засечённая независимо на трёх разных станциях в одну и ту же секунду.' },
  { id: 'fragment_gamma', guardian: 'Осколок Разрыва', shortName: 'Гамма', name: 'Фрагмент Гамма: Импульс Разрыва', sector: 'red', unlockCondition: { type: 'high_tier_kills', count: 5 }, lore: 'Энергетический след того самого момента, когда Тракт разорвался — записанный чем-то, что тогда уже существовало.' },
  { id: 'fragment_delta', guardian: 'Матричный Страж', shortName: 'Дельта', name: 'Фрагмент Дельта: Матрица Возврата', sector: 'yellow', unlockCondition: { type: 'total_kills', count: 40 }, lore: 'Схема, которая теоретически показывает путь назад — если бы кто-то знал, куда именно вести.' },
  { id: 'fragment_epsilon', guardian: 'Тень Предателя', shortName: 'Эпсилон', name: 'Фрагмент Эпсилон: Подпись Предателя', sector: 'red', unlockCondition: { type: 'quests_completed', count: 8 }, lore: 'Кодовая подпись одной из станций на документе, который не должен был пережить Разрыв.' },
  { id: 'fragment_zeta', guardian: 'Код-Хранитель', shortName: 'Зета', name: 'Фрагмент Зета: Код Перезагрузки', sector: 'red', unlockCondition: { type: 'faction_reputation', faction: 'Терминус', value: 60 }, lore: 'Протокол, который, по всей видимости, должен был ЧТО-ТО перезапустить — неясно, что именно.' },
  { id: 'fragment_omega', guardian: 'Последний Страж', shortName: 'Омега', name: 'Фрагмент Омега: Точка Сшивки', sector: 'red', unlockCondition: { type: 'fragments', count: 6 }, lore: 'Последний фрагмент — то место, где все остальные наконец складываются в единую картину.' },
];

const ENDINGS = {
  RESTORATION: { id: 'restoration', name: 'Восстановление', condition: { hypothesis: 'CATASTROPHE', fragments: 7 }, text: 'Тракт не был предан и не был болен — его просто разорвало случайностью. Значит, его можно попытаться собрать заново.' },
  PURIFICATION: { id: 'purification', name: 'Очищение', condition: { hypothesis: 'INFECTION', fragments: 7 }, text: 'То, что вы приняли за разрыв, было иммунным ответом. Вопрос теперь — что делать с болезнью, которую он пытался остановить.' },
  TRANSCENDENCE: { id: 'transcendence', name: 'Превосходство', condition: { hypothesis: 'EVOLUTION', fragments: 7 }, text: 'Тракт выбрал это сам. Периферия — не рана, а следующий шаг, который никто не просил делать.' },
  EXPOSURE: { id: 'exposure', name: 'Разоблачение', condition: { hypothesis: 'BETRAYAL', fragments: 7 }, text: 'Кто-то из своих сделал это намеренно. Теперь у вас есть подпись — и станциям придётся ответить за неё.' },
  SYNTHESIS: { id: 'synthesis', name: 'Синтез', condition: { fragments: 7, allHypotheses: true }, text: 'Все четыре версии оказались частично правдой. Правда о Тракте больше, чем любая из них по отдельности.' },
};

const HYPOTHESES = ['CATASTROPHE', 'INFECTION', 'EVOLUTION', 'BETRAYAL'];
const HYPOTHESIS_INFO = {
  CATASTROPHE: { name: 'Катастрофа', description: 'Тракт разрушил метеоритный поток. Его можно попытаться восстановить.' },
  INFECTION: { name: 'Инфекция', description: 'Тракт заразился Отголосками — это его иммунный ответ, не злой умысел.' },
  EVOLUTION: { name: 'Эволюция', description: 'Тракт сознательно отделил Периферию. Нужно докопаться, зачем.' },
  BETRAYAL: { name: 'Предательство', description: 'Одна из станций — или все четыре — сделали это намеренно.' },
};

function describeCondition(c) {
  if (c.type === 'faction_reputation') return `Доверие фракции «${c.faction}»: ${c.value}`;
  if (c.type === 'explore') return `Вылазок в ${c.zone === 'yellow' ? 'спорный сектор' : c.zone === 'red' ? 'открытый космос' : 'патрулируемый сектор'}: ${c.count}`;
  if (c.type === 'high_tier_kills') return `Побед над сильными врагами (тир 5+): ${c.count}`;
  if (c.type === 'level') return `Уровень персонажа: ${c.value}`;
  if (c.type === 'total_kills') return `Побед в бою всего: ${c.count}`;
  if (c.type === 'quests_completed') return `Выполнено квестов станций: ${c.count}`;
  if (c.type === 'fragments') return `Собрано других фрагментов: ${c.count}`;
  return 'Неизвестное условие';
}

function conditionProgress(player, c) {
  if (c.type === 'faction_reputation') return `${(player.factionStanding || {})[c.faction] || 0}/${c.value}`;
  if (c.type === 'explore') return `${(player.zoneVisits || {})[c.zone] || 0}/${c.count}`;
  if (c.type === 'high_tier_kills') return `${player.highTierKills || 0}/${c.count}`;
  if (c.type === 'level') return `${player.level || 1}/${c.value}`;
  if (c.type === 'total_kills') return `${player.killCount || 0}/${c.count}`;
  if (c.type === 'quests_completed') return `${(player.completedQuests || []).length}/${c.count}`;
  if (c.type === 'fragments') return `${((player.lore && player.lore.fragments) || []).length}/${c.count}`;
  return '';
}

function checkUnlock(player, condition) {
  switch (condition.type) {
    case 'faction_reputation': return ((player.factionStanding || {})[condition.faction] || 0) >= condition.value;
    case 'explore': return ((player.zoneVisits || {})[condition.zone] || 0) >= condition.count;
    case 'high_tier_kills': return (player.highTierKills || 0) >= condition.count;
    case 'level': return (player.level || 1) >= condition.value;
    case 'total_kills': return (player.killCount || 0) >= condition.count;
    case 'quests_completed': return (player.completedQuests || []).length >= condition.count;
    case 'fragments': return ((player.lore && player.lore.fragments) || []).length >= condition.count;
    default: return false;
  }
}

function getFragmentStatus(player) {
  const collected = (player.lore && player.lore.fragments) || [];
  return TRAKT_FRAGMENTS.map((f) => ({ ...f, collected: collected.includes(f.id), unlocked: checkUnlock(player, f.unlockCondition) }));
}

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
  if (!player.lore.discoveredHypotheses.includes(hypothesisId)) player.lore.discoveredHypotheses.push(hypothesisId);
  return player;
}

function discoverHypothesis(player, hypothesisId) {
  if (!HYPOTHESES.includes(hypothesisId)) return player;
  player.lore = player.lore || {};
  player.lore.discoveredHypotheses = player.lore.discoveredHypotheses || [];
  if (!player.lore.discoveredHypotheses.includes(hypothesisId)) player.lore.discoveredHypotheses.push(hypothesisId);
  return player;
}

function getEnding(player) {
  const fragmentsCount = ((player.lore && player.lore.fragments) || []).length;
  if (fragmentsCount < 7) return null;
  const discovered = (player.lore && player.lore.discoveredHypotheses) || [];
  if (discovered.length >= HYPOTHESES.length) return ENDINGS.SYNTHESIS;
  const hypothesis = getActiveHypothesis(player);
  return Object.values(ENDINGS).find((e) => e.condition.hypothesis === hypothesis) || null;
}

module.exports = {
  TRAKT_FRAGMENTS, ENDINGS, HYPOTHESES, HYPOTHESIS_INFO,
  checkUnlock, getFragmentStatus, collectFragment, describeCondition, conditionProgress,
  getActiveHypothesis, setHypothesis, discoverHypothesis, getEnding,
};
