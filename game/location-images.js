/**
 * Связка "станция + локация -> файл картинки". Файлы кладутся в
 * public/locations/, в этой табличке справа — просто имя файла (без пути).
 * Структура вложенная: сначала станция, потом ключ локации.
 *
 * ВАЖНО: router.js сейчас вызывает imageForLocation('bridge') без станции —
 * чтобы эта структура заработала, вызовы нужно поменять на
 * imageForLocation('bridge', player.faction). Держу эту правку в памяти,
 * скажите, когда прислать router.js. Заодно там же нужно добавить
 * imageForLocation('market', player.faction) в сцену биржи — тоже в памяти.
 *
 * Как добавить картинку:
 *   1. Положите файл (jpg/png, до ~5 МБ) в public/locations/имя-файла.jpg
 *   2. Впишите его в нужную станцию и ключ ниже
 * Готово — сервер сам загрузит её в ВК при первом заходе и закэширует.
 */
'use strict';

const LOCATION_IMAGES = {
  'Приют': {
    bridge: 'priyut-shtab.jpg',    // Мостик — «Штаб города Приют»
    repair: null,                   // Ремонтный отсек — не прислано
    decon: 'decon-generic.jpg',     // Декон-камера — общая для всех станций
    cantina: 'priyut-bar.jpg',      // Кантина — «Последний Глоток»
    gates: 'priyut-gates.jpg',      // Врата Тракта — синий портал
    station: 'priyut-overview.jpg', // Общий хаб — «Добро пожаловать в Приют»
    market: 'priyut-market.jpg',    // Биржа — «Главный аукционный рынок Приют»
  },
  'Терминус': {
    bridge: 'terminus-most.jpg',
    repair: null,
    decon: 'decon-generic.jpg',
    cantina: null,
    gates: 'terminus-gates.jpg',
    station: 'terminus-hub.jpg',
    market: null,
  },
  'Арсенал': {
    bridge: 'arsenal-shtab.jpg',
    repair: 'arsenal-repair.jpg',
    decon: 'decon-generic.jpg',
    cantina: 'arsenal-bar.jpg',
    gates: 'arsenal-gates.jpg',
    station: 'arsenal-hub.jpg',
    market: null,
  },
  'Вуаль': {
    bridge: 'vual-shtab.jpg',
    repair: 'vual-scavenger.jpg',   // Отсек барахольщиков — продажа вещей за кредиты
    decon: 'decon-generic.jpg',
    cantina: null,
    gates: 'vual-gates.jpg',
    station: 'vual-hub.jpg',
    market: null,
  },
};

function imageForLocation(key, faction) {
  const stationImages = LOCATION_IMAGES[faction];
  const file = stationImages ? stationImages[key] : null;
  return file ? `locations/${file}` : null;
}

module.exports = { LOCATION_IMAGES, imageForLocation };
