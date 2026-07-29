/**
 * Связка "локация станции -> файл картинки". Файлы кладутся в
 * public/locations/, в этой табличке справа — просто имя файла (без пути).
 * Ключи слева — фиксированные, привязаны к сценам в game/router.js, их
 * менять не нужно, только заполнять значения по мере появления картинок.
 *
 * Как добавить картинку для локации:
 *   1. Положите файл (jpg/png, до ~5 МБ) в public/locations/имя-файла.jpg
 *   2. Впишите его напротив нужного ключа ниже
 * Готово — сервер сам загрузит её в ВК при первом заходе и закэширует.
 */
'use strict';

const LOCATION_IMAGES = {
  bridge: null,   // Мостик
  repair: null,   // Ремонтный отсек
  decon: null,    // Декон-камера
  cantina: null,  // Кантина
  gates: null,    // Врата Тракта
  station: null,  // Главный хаб станции (общий для всех 4 станций)
};

function imageForLocation(key) {
  const file = LOCATION_IMAGES[key];
  return file ? `locations/${file}` : null;
}

module.exports = { LOCATION_IMAGES, imageForLocation };
