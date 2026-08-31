'use strict';

/**
 * СКРЫТЫЕ МАРШРУТЫ — по модели раздела 14 periferia_live_space_TZ.txt.
 * НЕ меняют граф Трактов напрямую (engine/tract-network.js остаётся
 * источником истины для обычной навигации) — это ОТДЕЛЬНЫЙ, более
 * простой список, который травел-экран проверяет ДОПОЛНИТЕЛЬНО и
 * показывает только тем, у кого есть нужный discovery
 * (lib/discoveries.js). Каждый — прямой прыжок между двумя узлами в
 * обход обычной цепочки промежуточных остановок: быстрее, но опаснее
 * (риск всегда 'high', скидок по топливу/времени как у обычных
 * маршрутов нет — это компенсируется бонусом к награде на другом конце).
 */
const HIDDEN_ROUTES = [
  {
    id: 'hidden_route_ancient_shortcut',
    from: 'yarmarka_tenej',
    to: 'bezdna_orrin',
    requiresDiscovery: 'hidden_frequency',
    risk: 'high',
    rewardMultiplier: 1.8,
    label: '📡 Резонансный проход',
    description: 'Расшифрованная частота открывает окно прямо через искажённое поле — обычный путь занял бы гораздо больше времени и остановок.',
  },
  {
    id: 'hidden_route_defector_network',
    from: 'priyut',
    to: 'yarmarka_tenej',
    requiresDiscovery: 'ship_trail_coordinates',
    risk: 'high',
    rewardMultiplier: 1.5,
    label: '🛰️ Контрабандный коридор',
    description: 'Координаты сети беглецов — согласились провести коротким путём, минуя обычную цепочку остановок.',
  },
];

/** Скрытые маршруты, доступные ИМЕННО этому игроку из этого узла — уже
 * отфильтровано по discovery, ничего дополнительно проверять на
 * стороне вызывающего кода не нужно. */
function availableHiddenRoutesFrom(nodeId, player) {
  const { hasDiscovery } = require('../lib/discoveries.js');
  return HIDDEN_ROUTES.filter(
    (route) => route.from === nodeId && hasDiscovery(player, route.requiresDiscovery)
  );
}

function findHiddenRoute(routeId) {
  return HIDDEN_ROUTES.find((r) => r.id === routeId) || null;
}

module.exports = { HIDDEN_ROUTES, availableHiddenRoutesFrom, findHiddenRoute };
