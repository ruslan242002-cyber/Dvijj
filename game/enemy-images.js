/**
 * Связка "имя врага -> файл картинки". Файлы кладутся в public/enemies/,
 * ссылка в этой табличке — просто имя файла (без пути). Пока файла нет —
 * враг показывается без картинки, ничего не ломается.
 *
 * Как добавить картинку для нового врага:
 *   1. Положите файл (jpg/png, до ~5 МБ) в public/enemies/имя-файла.jpg
 *   2. Добавьте строку сюда: 'Точное Имя Врага': 'имя-файла.jpg'
 * Готово — сервер сам загрузит её в ВК при первой встрече и закэширует.
 */
'use strict';

const ENEMY_IMAGES = {
  // 'Дрон-манекен': 'dron-maneken.jpg',
  // 'Дрейф-обломок': 'dreif-oblomok.jpg',
  // 'Отголосок-падальщик': 'otgolosok-padalschik.jpg',
};

function imageForEnemy(name) {
  return ENEMY_IMAGES[name] || null;
}

module.exports = { ENEMY_IMAGES, imageForEnemy };
