'use strict';
const { addFactionReputation } = require('../engine/reputation.js');
const TRAKT_FRAGMENTS = [
{ id: 'fragment_alpha', shortName: 'Альфа', name: 'Фрагмент Альфа: Координаты Истока', sector: 'blue', guardian: 'Древний Зонд-Хранитель', unlockCondition: { type: 'faction_reputation', faction: 'Терминус', value: 50 }, lore: 'Терминус хранит память о том, КЕМ были первые путники. Но память искажена.' },
{ id: 'fragment_beta', shortName: 'Бета', name: 'Фрагмент Бета: Частота Порога', sector: 'yellow', guardian: 'Резонансный Коллектив', unlockCondition: { type: 'explore', zone: 'yellow', count: 15 }, lore: 'Вуаль слышит шёпот Тракта. Но шёпот может быть ловушкой.' },
{ id: 'fragment_gamma', shortName: 'Гамма', name: 'Фрагмент Гамма: Импульс Разрыва', sector: 'red', guardian: 'Порождение Разлома', unlockCondition: { type: 'high_tier_kills', count: 5 }, lore: 'Арсенал знает силу. Но сила без понимания — глухота.' },
{ id: 'fragment_delta', shortName: 'Дельта', name: 'Фрагмент Дельта: Матрица Возврата', sector: 'red', guardian: 'Искажённый Куратор', unlockCondition: { type: 'level', value: 25 }, lore: 'Приют лечит раны. Но некоторые раны — это двери.' },
{ id: 'fragment_epsilon', shortName: 'Эпсилон', name: 'Фрагмент Эпсилон: Подпись Предателя', sector: 'red', guardian: 'Тень Себя', unlockCondition: { type: 'total_kills', count: 100 }, lore: 'Ты дрался столько раз, что счёт потерял смысл. А что, если враг — это ты сам?' },
{ id: 'fragment_zeta', shortName: 'Зета', name: 'Фрагмент Зета: Код Перезагрузки', sector: 'red', guardian: 'Аварийный ИИ Тракта', unlockCondition: { type: 'quests_completed', count: 15 }, lore: 'Ты решал задачи станций одну за другой. Сможешь ли решить задачу самого Тракта?' },
{ id: 'fragment_omega', shortName: 'Омега', name: 'Фрагмент Омега: Точка Сшивки', sector: 'red', guardian: 'Сердце Тракта', unlockCondition: { type: 'fragments', count: 6 }, lore: 'Все пути ведут сюда. Но путь — это выбор, а не карта.' }
];

/**
* ВИДЕНИЯ ПРИ СБОРЕ ФРАГМЕНТА — по разбору Kimi. Короткая вставка,
* показывается ОДИН раз в момент успешного collectFragment(), намекает
* на истинную природу Тракта, не спойлеря прямо. Хранится отдельно от
* TRAKT_FRAGMENTS (не лор-описание для списка, а разовый текст-событие).
*/
const FRAGMENT_VISIONS = {
fragment_alpha: 'Ты видишь: корабль первых путников, идущий ровным курсом. Потом — рывок, будто пространство икнуло. Курс обрывается не в катастрофе, а в тишине.',
fragment_beta: 'Шёпот на миг складывается в слова — не угрозу, а вопрос, заданный на языке, которого ты не знаешь, но почему-то понимаешь: "Кто впустил вас?"',
fragment_gamma: 'Вспышка урона отдаётся не в теле, а где-то глубже. Ты видишь Разлом изнутри — не пробоину, а шов. Кто-то его расковырял.',
fragment_delta: 'Рана на скафандре на секунду выглядит как дверь. За ней — коридор станции, которой здесь никогда не было.',
fragment_epsilon: 'В последнем враге, прежде чем он падает, ты на миг видишь собственное отражение — не метафора, буквально своё лицо.',
fragment_zeta: 'Код перезагрузки читается не как текст, а как имя. Твоё собственное, если бы ты родился на четверть секунды раньше.',
fragment_omega: 'Всё сходится в одной точке: не место, а решение. Тракт не спрашивает "что это?" — он спрашивает "что ты выберешь?".',
};

const ENDINGS = {
RESTORATION: { id: 'restoration', name: 'Восстановление', condition: { hypothesis: 'CATASTROPHE', fragments: 7 }, text: 'Тракт сшит. Но он сшит ТОБОЙ — и теперь ты его часть. Навсегда.' },
PURIFICATION: { id: 'purification', name: 'Очищение', condition: { hypothesis: 'INFECTION', fragments: 7 }, text: 'Отголоски уничтожены. Тракт чист. Но пуст. Что ты сделал?' },
TRANSCENDENCE: { id: 'transcendence', name: 'Превосходство', condition: { hypothesis: 'EVOLUTION', fragments: 7 }, text: 'Тракт признал тебя. Ты вышел за пределы Периферии. Но куда?' },
EXPOSURE: { id: 'exposure', name: 'Разоблачение', condition: { hypothesis: 'BETRAYAL', fragments: 7 }, text: 'Правда о станциях открыта. Хаос. Война. Но хотя бы честно.' },
SYNTHESIS: { id: 'synthesis', name: 'Синтез', condition: { fragments: 7, allHypotheses: true }, text: 'Ты понял все четыре истины — и отверг их все. Тракт — это вопрос, а не ответ.' }
};
const HYPOTHESES = ['CATASTROPHE', 'INFECTION', 'EVOLUTION', 'BETRAYAL'];
const HYPOTHESIS_INFO = {
CATASTROPHE: { name: 'Катастрофа', description: 'Тракт разрушил метеоритный поток. Его можно восстановить.' },
INFECTION: { name: 'Инфекция', description: 'Тракт заразился Отголосками — это его иммунный ответ. Нужно найти ядро и уничтожить.' },
EVOLUTION: { name: 'Эволюция', description: 'Тракт сознательно отделил Периферию. Нужно доказать, что мы достойны вернуться.' },
BETRAYAL: { name: 'Предательство', description: 'Одна из станций — или все четыре — сделали это намеренно.' }
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
}}
function getFragmentStatus(player) {
const collected = (player.lore && player.lore.fragments) || [];
return TRAKT_FRAGMENTS.map((f) => ({ ...f, collected: collected.includes(f.id), unlocked: checkUnlock(player, f.unlockCondition) }));
}
/** Возвращает { success, player, vision } — vision это текст из
* FRAGMENT_VISIONS, показать его сцене ОДИН раз сразу после сбора. */
function collectFragment(player, fragmentId) {
const fragment = TRAKT_FRAGMENTS.find((f) => f.id === fragmentId);
if (!fragment) return { success: false, player };
player.lore = player.lore || {};
player.lore.fragments = player.lore.fragments || [];
if (player.lore.fragments.includes(fragmentId)) return { success: false, player };
if (!checkUnlock(player, fragment.unlockCondition)) return { success: false, player };
player.lore.fragments.push(fragmentId);
return { success: true, player, vision: FRAGMENT_VISIONS[fragmentId] || null };
}
function getActiveHypothesis(player) {
return (player.lore && player.lore.hypothesis) || null;
}

/**
* СМЕНА ГИПОТЕЗЫ — по разбору Kimi. После 4-го фрагмента у игрока уже
* есть основания усомниться; смена активной гипотезы на этом этапе
* стоит репутации (решение пользователя: цена как в исходном разборе).
* До 4 фрагментов первый выбор гипотезы всегда бесплатный (это не
* "смена", а первичный выбор). Цена списывается с репутации домашней
* фракции игрока (factionStanding[player.faction]) через engine/reputation.js.
*/
const HYPOTHESIS_SWITCH_REP_COST = 15;
const HYPOTHESIS_SWITCH_MIN_FRAGMENTS = 4;
function setHypothesis(player, hypothesisId) {
if (!HYPOTHESES.includes(hypothesisId)) return player;
player.lore = player.lore || {};
const collected = (player.lore.fragments || []).length;
const hadHypothesis = !!player.lore.hypothesis;
const isRealSwitch = hadHypothesis && player.lore.hypothesis !== hypothesisId && collected >= HYPOTHESIS_SWITCH_MIN_FRAGMENTS;
if (isRealSwitch) {
addFactionReputation(player, player.faction, -HYPOTHESIS_SWITCH_REP_COST);
player.lore.lastHypothesisSwitchCost = HYPOTHESIS_SWITCH_REP_COST;
} else {
player.lore.lastHypothesisSwitchCost = 0;
}
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
TRAKT_FRAGMENTS, FRAGMENT_VISIONS, ENDINGS, HYPOTHESES, HYPOTHESIS_INFO,
HYPOTHESIS_SWITCH_REP_COST, HYPOTHESIS_SWITCH_MIN_FRAGMENTS,
checkUnlock, getFragmentStatus, collectFragment, describeCondition, conditionProgress,
getActiveHypothesis, setHypothesis, discoverHypothesis, getEnding
};
