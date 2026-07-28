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
 */
'use strict';

const ZONE_LABEL = { blue: 'патрулируемом секторе', yellow: 'спорном секторе', red: 'открытом космосе' };

function describeObjective(o) {
  if (o.type === 'deliver') return `Принеси: ${o.qty}× ${o.resource} T${o.tier}`;
  if (o.type === 'kill') return `Победи: ${o.count} врагов`;
  if (o.type === 'explore') return `Исследуй ${ZONE_LABEL[o.zone] || o.zone}: ${o.count} раз`;
  return 'Неизвестная цель';
}

/** Текущий прогресс в формате "3/5", не завершая квест */
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

/** Списывает доставленный ресурс из трюма (вызывать только когда objectiveMet уже true) */
function consumeObjective(player, o) {
  if (o.type !== 'deliver') return;
  const item = (player.inventory || []).find((i) => i.resource === o.resource && i.tier === o.tier);
  if (item) {
    item.qty -= o.qty;
    if (item.qty <= 0) player.inventory = player.inventory.filter((i) => i !== item);
  }
}

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

  // ── Терминус ──
  { id: 'terminus_1', city: 'Терминус', minLevel: 1,
    title: 'Ревизия рубежа',
    text: 'Куратор Дрого Кейн: «Пройдись по патрулируемому периметру станции — минимум три вылазки. Посмотри, как держится броня на деле, а не на бумаге».',
    objective: { type: 'explore', zone: 'blue', count: 3 },
    reward: { xp: 30, credits: 40 } },
  { id: 'terminus_2', city: 'Терминус', minLevel: 5,
    title: 'Память павших',
    text: 'Дрого Кейн у мемориальной переборки: «Отголоски множатся у границы рубежа. Останови десяток — и о тебе тоже начнут помнить».',
    objective: { type: 'kill', count: 10 },
    reward: { xp: 90, credits: 120, statPoints: 1 } },

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

  // ── Вуаль ──
  { id: 'vual_1', city: 'Вуаль', minLevel: 1,
    title: 'Тишина между сигналами',
    text: 'Куратор Шёпот: «Прежде чем я научу тебя слушать Тракт, научись слушать пустоту вокруг станции. Три вылазки в патрулируемый сектор — и молча».',
    objective: { type: 'explore', zone: 'blue', count: 3 },
    reward: { xp: 30, credits: 40 } },
  { id: 'vual_2', city: 'Вуаль', minLevel: 5,
    title: 'Эхо не по протоколу',
    text: 'Шёпот, не открывая глаз: «Одно из эхо в последней сводке не совпадает с шаблоном. Разберись с шестью Отголосками, пока сигнал не размножился».',
    objective: { type: 'kill', count: 6 },
    reward: { xp: 90, credits: 120, statPoints: 1 } },

  // ── Глобальные (не привязаны к городу, доступны с любой станции) ──
  { id: 'global_1', city: null, minLevel: 8,
    title: 'Голос в помехах',
    text: 'Среди станционного шума — обрывок фразы, которой там не должно быть. Пять вылазок в спорный сектор — и, может быть, сигнал повторится достаточно ясно, чтобы его записать.',
    objective: { type: 'explore', zone: 'yellow', count: 5 },
    reward: { xp: 150, credits: 200, statPoints: 2 } },
  { id: 'global_2', city: null, minLevel: 15,
    title: 'Пятый голос',
    text: 'Слух расходится по всем станциям одновременно: решения одного из кураторов подозрительно совпадают с интересами кого-то извне. Пока — двадцать зачищенных Отголосков и куда больше вопросов.',
    objective: { type: 'kill', count: 20 },
    reward: { xp: 250, credits: 350, statPoints: 3 } }
];

function availableQuests(player) {
  const completed = new Set(player.completedQuests || []);
  return QUESTS.filter((q) =>
    (q.city === null || q.city === player.faction) &&
    (player.level || 1) >= q.minLevel &&
    !completed.has(q.id)
  );
}

function getQuest(id) {
  return QUESTS.find((q) => q.id === id) || null;
}

module.exports = { QUESTS, availableQuests, getQuest, describeObjective, progressText, objectiveMet, consumeObjective };
