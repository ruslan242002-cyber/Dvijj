'use strict';
const ENEMY_IMAGES = {
  'Тракт-эхо-матка': 'trakt-eho-matka.jpg',
  'Кураторский страж': 'kuratorskiy-strazh.jpg',
  'Сигнальный клещ': 'signalniy-kleshch.jpg',
  'Тракт-плакальщица': 'trakt-plakalschitsa.jpg',
  'Хитин-ткач': 'hitin-tkach.jpg',
  'Скрап-жук': 'skrap-zhuk.jpg',
  'Гравиарх': 'graviarh.jpg',
  'Разломник': 'razlomnik.jpg',
  'Игольник': 'igolnik.jpg',
  'Пылевой Падальщик': 'pylevoy-padalschik.jpg',
  'Хроножнец': 'hronozhnets.jpg',
  'Нулевой жнец': 'nulevoy-zhnets.jpg',
  'Скиталец-щелкун': 'skitalets-schelkun.jpg',
  'Пульсарид': 'pulsarid.jpg',
  'Пустотный Пожиратель': 'pustotniy-pozhiratel.jpg',
};
function imageForEnemy(name) {
  return ENEMY_IMAGES[name] || null;
}
module.exports = { ENEMY_IMAGES, imageForEnemy };
