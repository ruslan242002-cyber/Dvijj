'use strict';

/**
 * АЙРИН ВЕЛЬМОР — реальные функции. Держим обе в одном файле.
 */
const { getFactionReputation, getReputationTitle, addFactionReputation } = require('../../../engine/reputation.js');
const { FACTIONS } = require('../common.js');

/** «Проверка репутации» — показывает игроку настоящий статус со всеми
 * пятью фракциями. Переиспользует существующие
 * getFactionReputation/getReputationTitle, не строит вторую систему
 * репутации. */
async function ayrinReputationCheck(player, backScene, rng, deps) {
  const { characterScreen } = require('../named-character.js');

  const lines = FACTIONS.map((faction) => {
    const value = getFactionReputation(player, faction);
    const title = getReputationTitle(value);
    const marker = faction === player.faction ? ' (родная)' : '';
    return `${faction}${marker}: ${value} — ${title}`;
  });

  return characterScreen(
    'ayrin_velmor',
    player,
    backScene,
    `Айрин пролистывает закрытую сводку.\n\n📊 ТВОЙ СТАТУС ПО ФРАКЦИЯМ:\n${lines.join('\n')}\n\n`
  );
}

const ARCHIVE_COST = 200;
const ARCHIVE_ENTRIES = [
  'Разрыв Тракта, после которого появился Приют, официально датирован — но три независимых источника называют разные годы. Никто не поправил расхождение за десятилетия.',
  'Пять Швартовых Вольного Порта никогда не подписывали ни одного официального договора ни с одной фракцией. Формально порт до сих пор "ничей".',
  'Кузница объявляет себя нейтральной, но 80% топливных поставок для патрулей Терминуса идёт именно оттуда — по документам это называется "коммерческий контракт", не союз.',
  'Первая версия устава Совета Терминуса содержала пункт про "право вето архивариуса". Пункт исчез из более поздних редакций без объяснений.',
  'В реестре населения Вуали числится на 12% больше жителей, чем реально фиксируют станционные системы. Расхождение существует минимум восемь лет.',
];

/** «Доступ к архивам» — одна запись из скрытых архивов за визит,
 * платно (её услуги "стоят дорого" по собственным словам Айрин). */
async function ayrinArchivesAccess(player, backScene, rng, deps) {
  const { characterScreen } = require('../named-character.js');

  if ((player.credits || 0) < ARCHIVE_COST) {
    return characterScreen('ayrin_velmor', player, backScene, `Айрин не поднимает глаз: «Доступ к архивам — 💳${ARCHIVE_COST}. Информация не бывает бесплатной».\n\n`);
  }

  player.credits -= ARCHIVE_COST;
  const entry = ARCHIVE_ENTRIES[Math.floor(rng() * ARCHIVE_ENTRIES.length)];
  return characterScreen('ayrin_velmor', player, backScene, `Айрин открывает один файл из закрытого доступа.\n\n📁 «${entry}»\n\nСписано 💳${ARCHIVE_COST}.\n\n`);
}

/** «Легализация» — "помогает узаконить некоторые действия и скрыть
 * следы в официальных системах" (её же карточка). Реально: сглаживает
 * САМУЮ плохую репутацию игрока с одной фракцией, ближе к нейтральной
 * — не строит отдельную систему "незаконных действий", просто честно
 * работает с уже существующей репутацией. Цена растёт с тем, насколько
 * плохо всё было. */
async function ayrinLegalization(player, backScene, rng, deps) {
  const { characterScreen } = require('../named-character.js');

  let worstFaction = null;
  let worstValue = 0;
  for (const faction of FACTIONS) {
    const value = getFactionReputation(player, faction);
    if (value < worstValue) {
      worstValue = value;
      worstFaction = faction;
    }
  }

  if (!worstFaction) {
    return characterScreen('ayrin_velmor', player, backScene, 'Айрин проверяет твоё досье и качает головой: «У тебя пока нет ничего, что стоило бы легализовать. Приятная редкость».\n\n');
  }

  const cost = Math.min(2000, Math.abs(worstValue) * 15);
  if ((player.credits || 0) < cost) {
    return characterScreen('ayrin_velmor', player, backScene, `Айрин сверяется с расчётом: «Легализация твоих дел с ${worstFaction} — 💳${cost}. Дёшево не бывает».\n\n`);
  }

  player.credits -= cost;
  const restored = Math.round(Math.abs(worstValue) * 0.6);
  addFactionReputation(player, worstFaction, restored);
  return characterScreen(
    'ayrin_velmor',
    player,
    backScene,
    `Айрин что-то долго правит в системе, не поднимая головы. «Готово. Формально — ты чист перед ${worstFaction}, по крайней мере на бумаге». Списано 💳${cost}.\n\n`
  );
}

/** «Особые поручения» — вариативный разовый результат (как у Кайра/
 * Ворна), не многошаговый квест. */
async function ayrinSpecialMission(player, backScene, rng, deps) {
  const { characterScreen } = require('../named-character.js');
  const { addToInventory } = require('../common.js');

  const roll = rng();
  let resultText;
  if (roll < 0.35) {
    player.credits = (player.credits || 0) + 250;
    resultText = 'Найденный документ оказался достаточно ценным, чтобы продать его нужным людям. Айрин делится долей — 💳250.';
  } else if (roll < 0.7) {
    addToInventory(player, 'Полимеры', 2, 5);
    resultText = 'Артефакт, который ты принёс, разобрали на образцы для дальнейшего изучения — тебе досталась своя доля материалов.';
  } else {
    const { grantXp } = require('../../../engine/leveling.js');
    grantXp(player, 35);
    resultText = 'Документ оказался важнее по смыслу, чем по цене — Айрин учит тебя читать между строк официальных формулировок. +35 опыта.';
  }

  return characterScreen('ayrin_velmor', player, backScene, `${resultText}\n\n`);
}

module.exports = { ayrinReputationCheck, ayrinArchivesAccess, ayrinLegalization, ayrinSpecialMission };
