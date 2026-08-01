'use strict';
const ENEMY_IMAGES = {
  'Тракт-эхо-матка': 'trakt-eho-matka.jpeg',
  'Кураторский страж': 'kuratorskiy-strazh.jpeg',
  'Сигнальный клещ': 'signalniy-kleshch.jpeg',
  'Тракт-плакальщица': 'trakt-plakalschitsa.jpeg',
  'Хитин-ткач': 'hitin-tkach.jpeg',
  'Скрап-жук': 'skrap-zhuk.jpeg',
  'Гравиарх': 'graviarh.jpeg',
  'Разломник': 'razlomnik.jpeg',
  'Игольник': 'igolnik.jpeg',
  'Пылевой Падальщик': 'pylevoy-padalschik.jpeg',
  'Хроножнец': 'hronozhnets.jpeg',
  'Нулевой жнец': 'nulevoy-zhnets.jpeg',
  'Скиталец-щелкун': 'skitalets-schelkun.jpeg',
  'Пульсарид': 'pulsarid.jpeg',
  'Пустотный Пожиратель': 'pustotniy-pozhiratel.jpeg',
};
function imageForEnemy(name) {
  return ENEMY_IMAGES[name] || null;
}
module.exports = { ENEMY_IMAGES, imageForEnemy };
