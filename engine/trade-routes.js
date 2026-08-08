'use strict';

/**
 * ТОРГОВЫЕ МАРШРУТЫ — довези ресурс с одной станции на другую, получи
 * бонус к награде за риск в пути (в отличие от продажи на бирже на месте —
 * тут награда выше именно за то, что вёз груз через открытый космос, где
 * его можно потерять). Опирается на уже готовые инвентарь и кредиты
 * игрока — никакого нового хранилища ресурсов не требуется.
 *
 * ОТЛИЧИЕ ОТ АРХИВНОЙ ВЕРСИИ: проверки "на своей ли станции" смотрят на
 * effectiveFaction (передаётся вызывающим кодом как currentStation(player)
 * из game/scenes/common.js), а не на player.faction напрямую. Раньше
 * прибытие на другую станцию МЕНЯЛО player.faction навсегда — это был
 * баг, который заодно нашли и починили при подключении маршрутов; теперь
 * faction — родной дом, а "где ты сейчас" отдельная временная метка.
 * Маршруты должны отслеживать именно текущее местоположение.
 *
 * ПРОВЕРЬ: qty и reward.credits у каждого маршрута были обрезаны при
 * экспорте в PDF — восстановлены по шкале (T2 ≈ 30 кред/ед, T3 ≈ 44 кред/ед,
 * т.е. заметно выгоднее прямой продажи ресурса на бирже). Поправь под
 * реальный баланс, если оригинальные цифры были другие. Также: маршруты
 * пока покрывают только 4 из 5 фракций — Кузницы среди ROUTES нет вовсе,
 * это не обрезание архивом, а пробел в самой системе.
 */
const ROUTES = [
  { id: 'route_priyut_terminus', from: 'Приют', to: 'Терминус', resource: 'Биомасса', tier: 2, qty: 6, reward: { credits: 180 } },
  { id: 'route_terminus_arsenal', from: 'Терминус', to: 'Арсенал', resource: 'Реголит', tier: 2, qty: 6, reward: { credits: 180 } },
  { id: 'route_arsenal_vual', from: 'Арсенал', to: 'Вуаль', resource: 'Изотопы', tier: 2, qty: 6, reward: { credits: 180 } },
  { id: 'route_vual_priyut', from: 'Вуаль', to: 'Приют', resource: 'Полимеры', tier: 2, qty: 6, reward: { credits: 180 } },
  { id: 'route_terminus_priyut', from: 'Терминус', to: 'Приют', resource: 'Сплавы', tier: 2, qty: 6, reward: { credits: 180 } },
  { id: 'route_vual_arsenal', from: 'Вуаль', to: 'Арсенал', resource: 'Изотопы', tier: 3, qty: 5, reward: { credits: 220 } },
];

function routesFrom(station) {
  return ROUTES.filter((r) => r.from === station);
}

function findRoute(routeId) {
  return ROUTES.find((r) => r.id === routeId) || null;
}

/** effectiveFaction — где игрок СЕЙЧАС (currentStation), не обязательно
 *  его родная фракция. */
function acceptRoute(player, routeId, effectiveFaction = null) {
  if (player.activeRoute) return { success: false, reason: 'ALREADY_ON_ROUTE' };
  const route = findRoute(routeId);
  if (!route) return { success: false, reason: 'ROUTE_NOT_FOUND' };
  const station = effectiveFaction || player.faction;
  if (station !== route.from) return { success: false, reason: 'WRONG_STATION' };
  const stack = (player.inventory || []).find((i) => i.resource === route.resource && i.tier === route.tier);
  if (!stack || stack.qty < route.qty) return { success: false, reason: 'NOT_ENOUGH_CARGO' };
  stack.qty -= route.qty;
  player.inventory = player.inventory.filter((i) => i.qty > 0);
  player.activeRoute = { routeId, acceptedAt: Date.now() };
  return { success: true, route };
}

function completeRoute(player, effectiveFaction = null) {
  if (!player.activeRoute) return { success: false, reason: 'NO_ACTIVE_ROUTE' };
  const route = findRoute(player.activeRoute.routeId);
  if (!route) { player.activeRoute = null; return { success: false, reason: 'ROUTE_NOT_FOUND' }; }
  const station = effectiveFaction || player.faction;
  if (station !== route.to) return { success: false, reason: 'WRONG_DESTINATION' };
  player.credits = (player.credits || 0) + route.reward.credits;
  player.activeRoute = null;
  return { success: true, route, reward: route.reward };
}

/** Вызывать при смерти/потере корабля — груз маршрута теряется без
 *  возврата ресурсов (цена риска, отличающая маршрут от обычной продажи
 *  на месте). */
function loseRouteOnDeath(player) {
  if (player.activeRoute) player.activeRoute = null;
}

module.exports = { ROUTES, routesFrom, findRoute, acceptRoute, completeRoute, loseRouteOnDeath };
