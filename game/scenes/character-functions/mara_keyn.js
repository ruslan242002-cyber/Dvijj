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

module.exports = { maraRepair, maraRumors, maraShelter };
