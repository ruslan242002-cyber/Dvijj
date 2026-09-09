'use strict';

/**
 * КАЙР — реальные функции. Держим все в одном файле.
 * player.oldDockReputation — простой счётчик доверия Старому доку,
 * растёт при использовании ЛЮБОЙ функции Кайра (не отдельная сложная
 * система, просто число, отслеживаемое здесь же).
 */
const RED_LOCATIONS = ['nekropol_ksarn', 'bezdna_orrin', 'kuznya_zabytyh', 'kladbische_flota'];
const COST = 500;
const DURATION_MS = 8 * 60 * 60 * 1000; // 8 часов
const STABILITY = 0.8;

function bumpReputation(player) {
  player.oldDockReputation = (player.oldDockReputation || 0) + 1;
}

/** «Восстановление координат» — открывает временный Тракт из Вольного
 * Порта в случайную красную локацию. Использует уже готовый
 * lib/tract-store.js, не строит вторую систему временных маршрутов. */
async function restoreCoordinates(player, backScene, rng, deps) {
  const { characterScreen } = require('../named-character.js');

  if ((player.credits || 0) < COST) {
    return characterScreen('kayr', player, backScene, `Кайр качает головой: «Восстановление координат стоит 💳${COST}. Пока не по карману».\n\n`);
  }
  if (!deps.tractStore) {
    return characterScreen('kayr', player, backScene, 'Сейчас нет связи с навигационной сетью — попробуй позже.\n\n');
  }

  const target = RED_LOCATIONS[Math.floor(rng() * RED_LOCATIONS.length)];
  await deps.tractStore.createTemporaryTract({
    from: 'volny_port',
    to: target,
    durationMs: DURATION_MS,
    stability: STABILITY,
  });

  player.credits -= COST;
  bumpReputation(player);
  return characterScreen(
    'kayr',
    player,
    backScene,
    `Кайр долго копается в старых чипах, потом довольно хмыкает: «Есть. Открываю окно на 8 часов — оттуда до сих пор идёт слабый сигнал». Списано 💳${COST}.\n\n`
  );
}

/** «Задания старых маршрутов» — Кайр делится обрывком того, что помнит
 * о старых временах Вольного Порта. Одноразовое разрешение с
 * вариативностью (как у Ворна), не многошаговый квест — держит функцию
 * функцией, не подменяет собой lib/npc-arcs.js. */
async function oldRoutesLead(player, backScene, rng, deps) {
  const { characterScreen } = require('../named-character.js');
  const { recordDiscovery } = require('../../../lib/discoveries.js');

  bumpReputation(player);
  const roll = rng();
  let resultText;
  if (roll < 0.3) {
    player.credits = (player.credits || 0) + 200;
    resultText = 'Кайр вспоминает, где прежние экипажи прятали заначки от станционных сборов. Часть ещё цела — 💳200 нашлось прямо там, где он и говорил.';
  } else if (roll < 0.7) {
    recordDiscovery(player, 'old_port_founding_secret');
    resultText = '«То, с чего всё началось, — говорит Кайр тише обычного, — было не совсем случайностью». Дальше он не продолжает — но что-то явно недоговаривает специально.';
  } else {
    const { grantXp } = require('../../../engine/leveling.js');
    grantXp(player, 30);
    resultText = 'Старая карта маршрутов, которую Кайр держал больше для памяти, чем для дела — но кое-что в ней всё ещё точно. +30 опыта, за внимательность.';
  }

  return characterScreen('kayr', player, backScene, `${resultText}\n\n`);
}

const REPUTATION_TIERS = [
  { threshold: 6, title: 'Свой', bonus: true },
  { threshold: 3, title: 'Знакомый', bonus: false },
  { threshold: 0, title: 'Новичок', bonus: false },
];

/** «Репутация Старого дока» — показывает текущий статус доверия,
 * выдаёт разовый бонус при достижении порога "Свой" (один раз, не
 * повторяется — отслеживается отдельным флагом). */
async function oldDockReputationStatus(player, backScene, rng, deps) {
  const { characterScreen } = require('../named-character.js');
  const { recordDiscovery } = require('../../../lib/discoveries.js');

  const rep = player.oldDockReputation || 0;
  const tier = REPUTATION_TIERS.find((t) => rep >= t.threshold);

  let bonusText = '';
  if (tier.bonus && !player.flags?.old_dock_reputation_bonus_claimed) {
    player.flags = player.flags || {};
    player.flags.old_dock_reputation_bonus_claimed = true;
    recordDiscovery(player, 'old_port_founding_secret');
    player.credits = (player.credits || 0) + 300;
    bonusText = '\n\n«Ты уже свой здесь», — Кайр впервые показывает что-то похожее на настоящую улыбку и выдаёт 💳300 сверху, «за то, что не бросил старика с его историями».';
  }

  return characterScreen(
    'kayr',
    player,
    backScene,
    `Кайр смотрит на тебя оценивающе.\n\n«Твой статус здесь: ${tier.title}» (${rep} дел вместе).${bonusText}\n\n`
  );
}

module.exports = { restoreCoordinates, oldRoutesLead, oldDockReputationStatus };
