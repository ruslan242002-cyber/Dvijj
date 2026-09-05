'use strict';

/**
 * КАЙР — «Восстановление координат». Реальная функция (не заглушка):
 * открывает временный Тракт из Вольного Порта в случайную красную
 * локацию — то самое "восстановление старых навигационных данных",
 * о котором говорит его карточка. Использует уже готовый
 * lib/tract-store.js, не строит вторую систему временных маршрутов.
 */
const RED_LOCATIONS = ['nekropol_ksarn', 'bezdna_orrin', 'kuznya_zabytyh', 'kladbische_flota'];
const COST = 500;
const DURATION_MS = 8 * 60 * 60 * 1000; // 8 часов
const STABILITY = 0.8;

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

module.exports = { restoreCoordinates };
