'use strict';

/**
 * АЙРИН ВЕЛЬМОР — реальные функции. Держим обе в одном файле.
 */
const { getFactionReputation, getReputationTitle } = require('../../../engine/reputation.js');
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

module.exports = { ayrinReputationCheck, ayrinArchivesAccess };
