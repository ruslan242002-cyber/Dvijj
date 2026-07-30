/**
 * Связка "станция + локация -> файл картинки". Файлы кладутся в
 * public/locations/, в этой табличке справа — просто имя файла (без пути).
 * Структура вложенная: сначала станция, потом ключ локации.
 *
 * ВАЖНО: router.js сейчас вызывает imageForLocation('bridge') без станции —
 * чтобы эта структура заработала, вызовы нужно поменять на
 * imageForLocation('bridge', player.faction). Держу эту правку в памяти,
 * скажите, когда прислать router.js.
 *
 * Как добавить картинку:
 *   1. Положите файл (jpg/png, до ~5 МБ) в public/locations/имя-файла.jpg
 *   2. Впишите его в нужную станцию и ключ ниже
 * Готово — сервер сам загрузит её в ВК при первом заходе и закэширует.
 */
'use strict';

const LOCATION_IMAGES = {
  'Приют': {
    bridge: 'priyut-shtab.jpg',   // Мостик — «Штаб города Приют» (тронный зал с голотаблицей)
    repair: null,                  // Ремонтный отсек — не прислано
    decon: null,                   // Декон-камера — не прислано
    cantina: 'priyut-bar.jpg',     // Кантина — «Последний Глоток»
    gates: 'priyut-gates.jpg',     // Врата Тракта — синий портал
    station: 'priyut-overview.jpg',// Общий хаб — «Добро пожаловать в Приют»
  },
  'Терминус': {
    bridge: 'terminus-most.jpg',   // Мостик — командный зал, фиолетовый
    repair: null,
    decon: null,
    cantina: null,                 // Кантина — не прислано
    gates: 'terminus-gates.jpg',   // Врата Тракта — фиолетовые
    station: 'terminus-hub.jpg',   // Общий хаб — вид города
  },
  'Арсенал': {
    bridge: 'arsenal-shtab.jpg',   // Мостик — «Штаб Арсенала», красный
    repair: 'arsenal-repair.jpg',  // Ремонтный отсек — проверьте, подходит ли (образ с «МАГАЗИН»)
    decon: null,
    cantina: 'arsenal-bar.jpg',    // Кантина — «Бар города Арсенал»
    gates: 'arsenal-gates.jpg',    // Врата Тракта Арсенала, красные
    station: 'arsenal-hub.jpg',    // Общий хаб — «Главный вход в город Арсенал»
  },
  'Вуаль': {
    bridge: 'vual-shtab.jpg',      // Мостик — «Вуаль / Штаб города» (новое)
    repair: 'vual-repair.jpg',     // Ремонтный отсек — «Ремонтный цех Вуали»
    decon: null,
    cantina: null,                 // Кантина — не прислано
    gates: 'vual-gates.jpg',       // Врата Тракта — «Вуаль в цифрах» внизу (новое)
    station: 'vual-hub.jpg',       // Общий хаб — «Жилой сектор города Вуаль»
  },
};

function imageForLocation(key, faction) {
  const stationImages = LOCATION_IMAGES[faction];
  const file = stationImages ? stationImages[key] : null;
  return file ? `locations/${file}` : null;
}

module.exports = { LOCATION_IMAGES, imageForLocation };
