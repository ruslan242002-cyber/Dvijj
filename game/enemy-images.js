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
'Импульсный странник': 'impulsniy-strannik.jpeg',
'Экзо-парсер': 'ekzo-parser.jpeg',
'Пожиратель сигналов': 'pozhiratel-signalov.jpeg',
'Осколок Тракта': 'oskolok-trakta.jpeg',
'Резонант': 'rezonant.jpeg',
'Пустотник': 'pustotnik.jpeg',
'Плазмоид-ткач': 'plazmoid-tkach.jpeg',
'Шипастый связник': 'shipastiy-svyaznik.jpeg',
'Безмолвный жнец': 'bezmolvniy-zhnets.jpeg',
'Теневой головорез рынка': 'tenevoy-golovorez-rynka.jpeg',
};
function imageForEnemy(name) {
return ENEMY_IMAGES[name] || null;
}
module.exports = { ENEMY_IMAGES, imageForEnemy };
