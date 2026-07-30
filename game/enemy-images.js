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
  // === Патрулируемый (blue) ===
  // 'Дрейф-обломок': 'dreif-oblomok.jpg',
  // 'Слабый резонанс': 'slabiy-rezonans.jpg',
  // 'Отбившийся зонд': 'otbivshiysya-zond.jpg',
  // 'Ржавый автомат': 'rzhaviy-avtomat.jpg',
  // 'Эхо-помеха': 'eho-pomeha.jpg',
  'Скиталец-щелкун': 'skitalets-schelkun.jpg',
  'Пылевой Падальщик': 'pylevoy-padalschik.jpg',
  'Игольник': 'igolnik.jpg',
  // 'Эхоид': 'ehoid.jpg',
  // 'Кристаллоид': 'kristalloid.jpg',
  'Скрап-жук': 'skrap-zhuk.jpg',

  // === Спорный (yellow) ===
  // 'Отголосок-падальщик': 'otgolosok-padalschik.jpg',
  'Резонансный хищник': 'graviarh.jpg', // судя по описанию, "Гравиарх" — это и есть ваш "Резонансный хищник"; если нет, уберите эту строку
  // 'Сбойный дрон': 'sboyniy-dron.jpg',
  // 'Тракт-паразит': 'trakt-parazit.jpg',
  // 'Радиационный рой': 'radiatsionniy-roy.jpg',
  'Гравиарх': 'graviarh.jpg',
  'Разломник': 'razlomnik.jpg',
  // 'Тенекрыл': 'tenekril.jpg',
  // 'Сквернолап': 'skvernolap.jpg',
  // 'Шлакожор': 'shlakozhor.jpg',
  'Сигнальный клещ': 'signalniy-kleshch.jpg',
  'Тракт-плакальщица': 'trakt-plakalschitsa.jpg',
  'Хроножнец': 'hronozhnets.jpg',
  'Хитин-ткач': 'hitin-tkach.jpg',
  // 'Импульсный странник': 'impulsniy-strannik.jpg',

  // === Открытый космос (red) ===
  // 'Глубинный Отголосок': 'glubinniy-otgolosok.jpg',
  'Тракт-порождение': 'pustotniy-pozhiratel.jpg', // если это разные монстры у вас — уберите/поправьте
  // 'Искажённый страж': 'iskazhenniy-strazh.jpg',
  // 'Голос из разлома': 'golos-iz-razloma.jpg',
  'Пожиратель сигналов': 'pustotniy-pozhiratel.jpg', // см. комментарий выше
  'Пульсарид': 'pulsarid.jpg',
  'Пустотный пожиратель': 'pustotniy-pozhiratel.jpg',
  'Нулевой жнец': 'nulevoy-zhnets.jpg',
  // 'Пустотный Кусач': 'pustotniy-kusach.jpg',
  // 'Экзо-парсер': 'ekzo-parser.jpg',
  'Кураторский страж': 'kuratorskiy-strazh.jpg',
  'Тракт-эхо-матка': 'trakt-eho-matka.jpg',
  // 'Осколок Тракта': 'oskolok-trakta.jpg',

  // === Особые (тренировка/кураторы/стражи фрагментов) ===
  // 'Дрон-манекен': 'dron-maneken.jpg',
  // 'Одичавший складской дрон': 'odichavshiy-skladskoy-dron.jpg',
  // 'Взбунтовавшийся охранный протокол': 'vzbuntovavshiysya-ohranniy-protokol.jpg',
  // 'Отголосок-часовой': 'otgolosok-chasovoy.jpg',
  // 'Страж Разлома': 'strazh-razloma.jpg',
  // 'Силовик зачистки': 'silovik-zachistki.jpg',
  // 'Разведчик-перебежчик': 'razvedchik-perebezhchik.jpg',
  // 'Древний Зонд-Хранитель': 'drevniy-zond-hranitel.jpg',
  // 'Резонансный Коллектив': 'rezonansniy-kollektiv.jpg',
  // 'Порождение Разлома': 'porozhdenie-razloma.jpg',
  // 'Искажённый Куратор': 'iskazhenniy-kurator.jpg',
  // 'Тень Себя': 'ten-sebya.jpg',
  // 'Аварийный ИИ Тракта': 'avariyniy-ii-trakta.jpg',
  // 'Сердце Тракта': 'serdtse-trakta.jpg',
};

function imageForEnemy(name) {
  return ENEMY_IMAGES[name] || null;
}

module.exports = { ENEMY_IMAGES, imageForEnemy };
