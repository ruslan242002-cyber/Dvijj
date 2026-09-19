'use strict';

/**
 * МАРА КЕЙН — реальные функции. Держим все её функции в одном файле
 * (не дробим на файл-на-функцию — так проще ориентироваться, чем
 * россыпью мелких файлов на одного и того же персонажа).
 */
const { REPAIR_CREDITS_PER_HP } = require('../locations/repair.js');
const { listDiscoveries } = require('../../../lib/discoveries.js');
const { createStatusState, clearStatuses } = require('../../../engine/status/statusEngine.js');

const MARA_DISCOUNT = 0.35; // заметно дешевле обычной станции — цена доверия к Приюту

/** «Ремонт» — недорогой ремонт корабля (карточка Мары прямо обещает
 * "недорогой ремонт"). Переиспользует REPAIR_CREDITS_PER_HP из уже
 * готового game/scenes/locations/repair.js — не строит вторую систему
 * цен. */
async function maraRepair(player, backScene, rng, deps) {
  const { characterScreen } = require('../named-character.js');
  const missingHp = Math.max(0, player.ship.hpMax - player.ship.hp);

  if (missingHp === 0) {
    return characterScreen('mara_keyn', player, backScene, 'Мара окидывает твой корабль взглядом: «Цел. Заходи, если что-то отвалится».\n\n');
  }

  const cost = Math.round(missingHp * REPAIR_CREDITS_PER_HP * (1 - MARA_DISCOUNT));
  if ((player.credits || 0) < cost) {
    return characterScreen('mara_keyn', player, backScene, `Мара качает головой: «Ремонт — 💳${cost}. Не хватает — приходи, когда будут».\n\n`);
  }

  const updatedPlayer = { ...player, credits: player.credits - cost, ship: { ...player.ship, hp: player.ship.hpMax } };
  return characterScreen('mara_keyn', updatedPlayer, backScene, `Мара молча берётся за инструменты. Через несколько минут корпус как новый. Списано 💳${cost} — «Свои цены, не станционные».\n\n`);
}

const GENERIC_RUMORS = [
  'Говорят, в Арсенале снова задерживают жалование — рабочие недовольны.',
  'На Ярмарке Теней видели корабль без опознавательных знаков — постоял пару часов и ушёл.',
  'Кто-то слышал, что Совет Терминуса набирает новых архивариусов — редкая вакансия.',
  'В Вуали снова светятся окна лаборатории по ночам — местные стараются туда не соваться.',
  'Патрульные с Кузницы жалуются на нехватку топлива для регулярных облётов.',
];

/** «Слухи» — смешивает уже сделанные игроком discoveries (пересказанные
 * в стиле слуха, не сухим фактом) с общими фоновыми слухами станции. Не
 * строит отдельную базу слухов с нуля, переиспользует discovery. */
async function maraRumors(player, backScene, rng, deps) {
  const { characterScreen } = require('../named-character.js');

  const owned = listDiscoveries(player);
  const pool = [...GENERIC_RUMORS];
  if (owned.length > 0) {
    const pick = owned[Math.floor(rng() * owned.length)];
    pool.push(`Слышала краем уха: ${pick.description}`);
  }

  const rumor = pool[Math.floor(rng() * pool.length)];
  return characterScreen('mara_keyn', player, backScene, `Мара понижает голос, хотя рядом никого нет.\n\n«${rumor}»\n\n`);
}

/** «Убежище» — временная защита (карточка Мары прямо это обещает).
 * Снимает накопленные статусы (ранение/кровотечение/облучение/
 * перегрев/обнаружение) — переиспользует уже готовый
 * engine/status/statusEngine.js, не строит вторую систему статусов.
 * Бесплатно — это гостеприимство Приюта, не платная услуга. */
async function maraShelter(player, backScene, rng, deps) {
  const { characterScreen } = require('../named-character.js');

  const current = player.statusState || createStatusState();
  if (!current.statuses || current.statuses.length === 0) {
    return characterScreen('mara_keyn', player, backScene, 'Мара окидывает тебя взглядом: «Ты и так в порядке. Заходи, если станет хуже».\n\n');
  }

  const count = current.statuses.length;
  player.statusState = clearStatuses(current);
  return characterScreen(
    'mara_keyn',
    player,
    backScene,
    `Мара молча указывает на свободную койку. Несколько часов отдыха под защитой Приюта — и накопленное (${count}) снято без вопросов.\n\n«Пока ты под моей крышей — ты в безопасности», — говорит она, как и всегда.\n\n`
  );
}

// "Уже встречал" теперь единый флаг {id}_met (проставляется автоматически
// в characterScreen() при любом визите, см. named-character.js) — не
// зависит от того, прошёл ли квест, просто факт знакомства.
const OTHER_PEOPLE = [
  { id: 'doktor_vorn', name: 'Доктор Элиан Ворн', location: 'Вуаль' },
  { id: 'ayrin_velmor', name: 'Айрин Вельмор', location: 'Верхний город Вольного Порта' },
  { id: 'kran', name: 'Кран', location: 'Нижние доки Вольного Порта' },
  { id: 'dispatcher', name: 'Диспетчер', location: 'Пилотский квартал Вольного Порта' },
  { id: 'kayr', name: 'Кайр', location: 'Старый док Вольного Порта' },
];

/** «Поиск людей» — подсказывает, где найти одного из остальных именных
 * персонажей, которого игрок ещё не встречал. Если все уже найдены —
 * честно об этом говорит, не повторяет одну и ту же подсказку. */
async function maraFindPeople(player, backScene, rng, deps) {
  const { characterScreen } = require('../named-character.js');

  const unmet = OTHER_PEOPLE.filter((p) => !player.flags?.[`${p.id}_met`]);
  if (unmet.length === 0) {
    return characterScreen('mara_keyn', player, backScene, 'Мара качает головой: «Всех, кого я знаю и кто стоит внимания, ты уже нашёл сам. Дальше — сам справишься».\n\n');
  }

  const pick = unmet[Math.floor(rng() * unmet.length)];
  return characterScreen(
    'mara_keyn',
    player,
    backScene,
    `Мара задумывается. «Ищешь кого-то конкретного? Есть один человек, ${pick.name} — найдёшь в районе: ${pick.location}. Скажи, что от меня, если что».\n\n`
  );
}

const CREW_COST = 400;
const CREW_STATS = ['power', 'mind', 'reaction', 'endurance'];
const CREW_NAMES = { power: 'силу', mind: 'разум', reaction: 'реакцию', endurance: 'выносливость' };

/** «Экипаж» — в отличие от "Модификаций" Ворна, здесь БЕЗ риска: Мара
 * не экспериментирует на людях, она реально находит толкового человека
 * в команду. Постоянный маленький плюс, гарантированно положительный —
 * матчит её защитную, а не рискованную природу. */
async function maraCrew(player, backScene, rng, deps) {
  const { characterScreen } = require('../named-character.js');

  if ((player.credits || 0) < CREW_COST) {
    return characterScreen('mara_keyn', player, backScene, `Мара разводит руками: «Толковый человек в команду — 💳${CREW_COST}. Хороших людей на улице не найти».\n\n`);
  }

  player.credits -= CREW_COST;
  player.stats = player.stats || {};
  const stat = CREW_STATS[Math.floor(rng() * CREW_STATS.length)];
  player.stats[stat] = (player.stats[stat] || 0) + 2;

  return characterScreen(
    'mara_keyn',
    player,
    backScene,
    `Мара сводит тебя с одним из своих людей — толковый, проверенный, без сюрпризов. ${CREW_NAMES[stat]} +2, постоянно. Списано 💳${CREW_COST}.\n\n`
  );
}

/** «Особые задания» — вариативный разовый результат (как у остальных
 * персонажей), не многошаговый квест. */
async function maraSpecialQuest(player, backScene, rng, deps) {
  const { characterScreen } = require('../named-character.js');
  const { addToInventory } = require('../common.js');

  const roll = rng();
  let resultText;
  if (roll < 0.4) {
    player.credits = (player.credits || 0) + 180;
    resultText = 'Мара просит помочь с должником — обошлось без драки, деньги вернули. Доля — 💳180.';
  } else if (roll < 0.75) {
    addToInventory(player, 'Сплавы', 1, 10);
    resultText = 'Нужно было тихо забрать груз со склада, пока не нашли другие. Часть груза — твоя, за скорость.';
  } else {
    const { grantXp } = require('../../../engine/leveling.js');
    grantXp(player, 25);
    resultText = 'Задание оказалось сложнее, чем казалось — но опыт того стоил. +25 опыта.';
  }

  return characterScreen('mara_keyn', player, backScene, `${resultText}\n\n`);
}

module.exports = { maraRepair, maraRumors, maraShelter, maraFindPeople, maraCrew, maraSpecialQuest };
