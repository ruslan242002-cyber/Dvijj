'use strict';

/**
 * КАЙР — реальные функции. Держим обе в одном файле.
 */
const RED_LOCATIONS = ['nekropol_ksarn', 'bezdna_orrin', 'kuznya_zabytyh', 'kladbische_flota'];
const COST = 500;
const DURATION_MS = 8 * 60 * 60 * 1000; // 8 часов
const STABILITY = 0.8;

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

  const updatedPlayer = { ...player, credits: player.credits - COST };
  return characterScreen(
    'kayr',
    updatedPlayer,
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

  const roll = rng();
  let resultText;
  if (roll < 0.3) {
    player.credits = (player.credits || 0) + 200;
    resultText = 'Кайр вспоминает, где прежние экипажи прятали заначки от станционных сборов. Часть ещё цела — 💳200 нашлось прямо там, где он и говорил.';
  } else if (roll < 0.7) {
    recordDiscovery(player, 'old_port_founding_secret');
    resultText = '«То, с чего всё началось, — говорит Кайр тише обычного, — было не совсем случайностью». Дальше он не продолжает — но что-то явно недоговаривает специально.';
  } else {
    player.xp = (player.xp || 0);
    const { grantXp } = require('../../../engine/leveling.js');
    grantXp(player, 30);
    resultText = 'Старая карта маршрутов, которую Кайр держал больше для памяти, чем для дела — но кое-что в ней всё ещё точно. +30 опыта, за внимательность.';
  }

  return characterScreen('kayr', player, backScene, `${resultText}\n\n`);
}

module.exports = { restoreCoordinates, oldRoutesLead };
