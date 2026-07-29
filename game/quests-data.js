/**
 * Второстепенные и глобальные квесты. У каждого — конкретная измеримая
 * цель (objective), а не абстрактное «побудь тут». Прогресс не требует
 * отдельного шага "принять квест" — игрок просто играет как обычно
 * (убивает, собирает ресурсы, летает по секторам), а при заходе в Кантину
 * видит текущий прогресс и может сдать квест, как только условие выполнено.
 *
 * Типы objective:
 *   { type: 'deliver', resource, tier, qty } — нужно иметь в трюме и сдать
 *   { type: 'kill', count }                  — суммарно убито врагов (не тренировочных)
 *   { type: 'explore', zone, count }         — суммарно вылазок именно в эту зону
 *
 * По 5 квестов на каждую станцию (уровни 1/5/10/15/20) + 4 глобальных
 * (8/15/22/30), завязанных на сквозную интригу "Пятый Голос". Кроме
 * куратора каждой станции, квесты дают ещё двое именных персонажей —
 * для ощущения, что станция реально населена, а не только один куратор
 * на всех.
 */
'use strict';

const ZONE_LABEL = { blue: 'патрулируемом секторе', yellow: 'спорном секторе', red: 'открытом космосе' };

function describeObjective(o) {
  if (o.type === 'deliver') return `Принеси: ${o.qty}× ${o.resource} T${o.tier}`;
  if (o.type === 'kill') return `Победи: ${o.count} врагов`;
  if (o.type === 'explore') return `Исследуй в ${ZONE_LABEL[o.zone] || o.zone}: ${o.count} раз`;
  return 'Неизвестная цель';
}

function progressText(player, o) {
  if (o.type === 'deliver') {
    const have = (player.inventory || []).find((i) => i.resource === o.resource && i.tier === o.tier);
    return `${have ? have.qty : 0}/${o.qty}`;
  }
  if (o.type === 'kill') return `${player.killCount || 0}/${o.count}`;
  if (o.type === 'explore') return `${(player.zoneVisits && player.zoneVisits[o.zone]) || 0}/${o.count}`;
  return '';
}

function objectiveMet(player, o) {
  if (o.type === 'deliver') {
    const have = (player.inventory || []).find((i) => i.resource === o.resource && i.tier === o.tier);
    return !!have && have.qty >= o.qty;
  }
  if (o.type === 'kill') return (player.killCount || 0) >= o.count;
  if (o.type === 'explore') return ((player.zoneVisits && player.zoneVisits[o.zone]) || 0) >= o.count;
  return false;
}

function consumeObjective(player, o) {
  if (o.type !== 'deliver') return;
  const item = (player.inventory || []).find((i) => i.resource === o.resource && i.tier === o.tier);
  if (item) {
    item.qty -= o.qty;
    if (item.qty <= 0) player.inventory = player.inventory.filter((i) => i !== item);
  }
}

/** Именные персонажи станций (помимо кураторов) — только для флейвора квестов,
 * отдельной механики под них пока нет. */
const NPCS = {
  'Приют': ['Ирис Вейл', 'Техник Дорн', 'Сестра Мира'],
  'Терминус': ['Шёпот', 'Осведомитель Кес', 'Аналитик Рю'],
  'Арсенал': ['Рен Окса', 'Оружейник Тарк', 'Разведчица Ния'],
  'Вуаль': ['Дрого Кейн', 'Сержант Илва', 'Механик Брок']
};

const QUESTS = [
  // ── Приют ──
  { id: 'priyut_1', city: 'Приют', minLevel: 1,
    title: 'Первая помощь',
    text: 'Куратор Ирис Вейл: «Медотсеку нужна обшивка на латание корпуса. Принеси, что найдёшь на ближних вылазках».',
    objective: { type: 'deliver', resource: 'Сплавы', tier: 1, qty: 5 },
    reward: { xp: 30, credits: 40 } },
  { id: 'priyut_2', city: 'Приют', minLevel: 5,
    title: 'Список ожидания',
    text: 'Ирис Вейл протягивает список позывных: «Эти люди застряли в спорных секторах дольше положенного. Расчисти им путь — разберись с угрозами по дороге».',
    objective: { type: 'kill', count: 8 },
    reward: { xp: 90, credits: 120, statPoints: 1 } },
  { id: 'priyut_3', city: 'Приют', minLevel: 10,
    title: 'Чистые руки',
    text: 'Техник Дорн, не отрываясь от капельницы: «Стерильные материалы кончились быстрее, чем ожидалось. Полимеры годятся любые — лишь бы из спорных секторов, не с помойки».',
    objective: { type: 'deliver', resource: 'Полимеры', tier: 2, qty: 6 },
    reward: { xp: 160, credits: 180, statPoints: 1 } },
  { id: 'priyut_4', city: 'Приют', minLevel: 15,
    title: 'Долгая смена',
    text: 'Сестра Мира устало улыбается: «Эвакуационный маршрут через спорный сектор нужно проверить лично — шесть вылазок, не меньше. Раненым нужна уверенность, что путь чист».',
    objective: { type: 'explore', zone: 'yellow', count: 6 },
    reward: { xp: 240, credits: 260, statPoints: 2 } },
  { id: 'priyut_5', city: 'Приют', minLevel: 20,
    title: 'Тихая палата',
    text: 'Ирис Вейл: «Раненых слишком много, а Отголосков вокруг — ещё больше. Разберись с пятнадцатью, и я наконец вздохну спокойно».',
    objective: { type: 'kill', count: 15 },
    reward: { xp: 340, credits: 380, statPoints: 2 } },

  // ── Терминус ──
  { id: 'terminus_1', city: 'Терминус', minLevel: 1,
    title: 'Тишина вокруг станции',
    text: 'Куратор Шёпот: «Прежде чем я научу тебя слушать Тракт, научись слушать пустоту вокруг станции. Три вылазки в патрулируемый сектор — и молча».',
    objective: { type: 'explore', zone: 'blue', count: 3 },
    reward: { xp: 30, credits: 40 } },
  { id: 'terminus_2', city: 'Терминус', minLevel: 5,
    title: 'Эхо не по протоколу',
    text: 'Шёпот, не открывая глаз: «Одно из эхо в последней сводке не совпадает с шаблоном. Разберись с десятью Отголосками, пока сигнал не размножился».',
    objective: { type: 'kill', count: 10 },
    reward: { xp: 90, credits: 120, statPoints: 1 } },
  { id: 'terminus_3', city: 'Терминус', minLevel: 10,
    title: 'Материал для маскировки',
    text: 'Аналитик Рю, не поднимая головы от осциллографа: «Нужны сплавы почище для маскировочных контуров — восемь кусков, не больше и не меньше. Точность важна».',
    objective: { type: 'deliver', resource: 'Сплавы', tier: 2, qty: 8 },
    reward: { xp: 160, credits: 180, statPoints: 1 } },
  { id: 'terminus_4', city: 'Терминус', minLevel: 15,
    title: 'Слепое пятно',
    text: 'Осведомитель Кес шёпотом: «В открытом космосе есть участок, который Тракт будто не хочет показывать. Четыре вылазки — и мы наконец увидим, что там».',
    objective: { type: 'explore', zone: 'red', count: 4 },
    reward: { xp: 240, credits: 260, statPoints: 2 } },
  { id: 'terminus_5', city: 'Терминус', minLevel: 20,
    title: 'Чужой узор',
    text: 'Шёпот: «Восемнадцать Отголосков подряд несут один и тот же нехарактерный узор. Слишком похоже на совпадение, чтобы быть совпадением».',
    objective: { type: 'kill', count: 18 },
    reward: { xp: 340, credits: 380, statPoints: 2 } },

  // ── Арсенал ──
  { id: 'arsenal_1', city: 'Арсенал', minLevel: 1,
    title: 'Пристрелка',
    text: 'Куратор Рен Окса: «Оружие без энергокристаллов — просто железо. Принеси парочку с ближних вылазок — опробуем цикл».',
    objective: { type: 'deliver', resource: 'Изотопы', tier: 1, qty: 4 },
    reward: { xp: 30, credits: 40 } },
  { id: 'arsenal_2', city: 'Арсенал', minLevel: 5,
    title: 'Список целей',
    text: 'Рен Окса кидает на стол потрёпанный планшет: «Разведка засекла скопление Отголосков ближе, чем нам бы хотелось. Сократи их число — на двенадцать штук».',
    objective: { type: 'kill', count: 12 },
    reward: { xp: 90, credits: 120, statPoints: 1 } },
  { id: 'arsenal_3', city: 'Арсенал', minLevel: 10,
    title: 'Апгрейд ствола',
    text: 'Оружейник Тарк морщится: «Стандартный цикл больше не тянет твой уровень угроз. Найди кристаллы почище — из спорных секторов, шесть штук».',
    objective: { type: 'deliver', resource: 'Изотопы', tier: 2, qty: 6 },
    reward: { xp: 160, credits: 180, statPoints: 1 } },
  { id: 'arsenal_4', city: 'Арсенал', minLevel: 15,
    title: 'Разведка боем',
    text: 'Разведчица Ния: «Карта спорного сектора устарела на треть. Восемь вылазок — и у нас наконец будет свежая, а не та, что три месяца пылится».',
    objective: { type: 'explore', zone: 'yellow', count: 8 },
    reward: { xp: 240, credits: 260, statPoints: 2 } },
  { id: 'arsenal_5', city: 'Арсенал', minLevel: 20,
    title: 'Зачистка квадранта',
    text: 'Рен Окса: «Целый квадрант красной зоны кишит Отголосками. Двадцать штук — и квадрант считается нашим».',
    objective: { type: 'kill', count: 20 },
    reward: { xp: 340, credits: 380, statPoints: 2 } },

  // ── Вуаль ──
  { id: 'vual_1', city: 'Вуаль', minLevel: 1,
    title: 'Ревизия периметра',
    text: 'Куратор Дрого Кейн: «Пройдись по патрулируемому периметру станции — минимум три вылазки. Посмотри, как держится броня на деле, а не на бумаге».',
    objective: { type: 'explore', zone: 'blue', count: 3 },
    reward: { xp: 30, credits: 40 } },
  { id: 'vual_2', city: 'Вуаль', minLevel: 5,
    title: 'Сбои на линии',
    text: 'Дрого Кейн хмуро глядит на сборочную линию: «Отголоски мешают доставке деталей. Разберись с шестью — и график снова наш».',
    objective: { type: 'kill', count: 6 },
    reward: { xp: 90, credits: 120, statPoints: 1 } },
  { id: 'vual_3', city: 'Вуаль', minLevel: 10,
    title: 'Смазка для станков',
    text: 'Механик Брок стучит по обшивке станка: «Обычная смазка кончилась — нужна биомасса подходящей плотности. Пять образцов, не больше и не меньше».',
    objective: { type: 'deliver', resource: 'Биомасса', tier: 2, qty: 5 },
    reward: { xp: 160, credits: 180, statPoints: 1 } },
  { id: 'vual_4', city: 'Вуаль', minLevel: 15,
    title: 'Разведка ресурсов',
    text: 'Сержант Илва: «Разведка в открытый космос — не для слабонервных, но линиям нужно сырьё редких пород. Пять вылазок, доклад лично мне».',
    objective: { type: 'explore', zone: 'red', count: 5 },
    reward: { xp: 240, credits: 260, statPoints: 2 } },
  { id: 'vual_5', city: 'Вуаль', minLevel: 20,
    title: 'Ни шагу назад',
    text: 'Дрого Кейн: «Отголоски прощупывают периметр сборочных линий каждую ночь. Останови шестнадцать — и они наконец перестанут пробовать».',
    objective: { type: 'kill', count: 16 },
    reward: { xp: 340, credits: 380, statPoints: 2 } },

  // ── Глобальные (не привязаны к городу, доступны с любой станции; сквозная интрига "Пятый Голос") ──
  { id: 'global_1', city: null, minLevel: 8,
    title: 'Голос в помехах',
    text: 'Среди станционного шума — обрывок фразы, которой там не должно быть. Пять вылазок в спорный сектор — и, может быть, сигнал повторится достаточно ясно, чтобы его записать.',
    objective: { type: 'explore', zone: 'yellow', count: 5 },
    reward: { xp: 150, credits: 200, statPoints: 2 } },
  { id: 'global_2', city: null, minLevel: 15,
    title: 'Совпадения',
    text: 'Все четыре станции независимо друг от друга находят один и тот же тип реголита на дне одних и тех же вылазок. Слишком ровное совпадение для случайности — принеси образцы, сверим.',
    objective: { type: 'deliver', resource: 'Реголит', tier: 3, qty: 8 },
    reward: { xp: 220, credits: 260, statPoints: 2 } },
  { id: 'global_3', city: null, minLevel: 22,
    title: 'Пятый голос',
    text: 'Слух расходится по всем станциям одновременно: решения одного из кураторов подозрительно совпадают с интересами кого-то извне. Пока — двадцать зачищенных Отголосков и куда больше вопросов.',
    objective: { type: 'kill', count: 20 },
    reward: { xp: 300, credits: 350, statPoints: 3 } },
  { id: 'global_4', city: null, minLevel: 30,
    title: 'Тот, кто слушает в ответ',
    text: 'Если Шёпот прав, кто-то слушает Тракт в ответ — и, возможно, уже давно. Тридцать зачищенных Отголосков — и, может быть, ответ придёт быстрее, чем хотелось бы.',
    objective: { type: 'kill', count: 30 },
    reward: { xp: 500, credits: 600, statPoints: 4 } }
];

const { isQuestLocked } = require('../choices/consequence-engine.js');

function availableQuests(player) {
  const completed = new Set(player.completedQuests || []);
  return QUESTS.filter((q) =>
    (q.city === null || q.city === player.faction) &&
    (player.level || 1) >= q.minLevel &&
    !completed.has(q.id) &&
    !isQuestLocked(player, q.id)
  );
}

function getQuest(id) {
  return QUESTS.find((q) => q.id === id) || null;
}

module.exports = { QUESTS, NPCS, availableQuests, getQuest, describeObjective, progressText, objectiveMet, consumeObjective };
