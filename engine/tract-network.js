'use strict';

/**
 * СЕТЬ ТРАКТОВ — навигация как граф узлов и направленных маршрутов, не
 * линейная дистанция (как сейчас в engine/travel.js). Это НОВЫЙ слой,
 * который пока не заменяет существующую систему полётов — она стоит
 * рядом, тестируется отдельно, и подключается к game/scenes/travel.js
 * отдельным шагом, когда сама модель проверена.
 *
 * Ключевое свойство, ради которого всё это: Тракт может быть
 * ОДНОСТОРОННИМ. Приют → Ковчег-9 может существовать, а обратного пути
 * в моменте может не быть вообще — не искусственный запрет, а свойство
 * пространства после разрыва Тракта. Кнопки "лететь назад" физически
 * нет в списке доступных маршрутов, если обратного узла нет.
 */

// ── Узлы ──
const NODES = {
  priyut: { id: 'priyut', name: 'Приют', type: 'city' },
  vual: { id: 'vual', name: 'Вуаль', type: 'city' },
  terminus: { id: 'terminus', name: 'Терминус', type: 'city' },
  arsenal: { id: 'arsenal', name: 'Арсенал', type: 'city' },
  kuznitsa: { id: 'kuznitsa', name: 'Кузница', type: 'city' },
  kovcheg9: { id: 'kovcheg9', name: 'Астероид «Ковчег-9»', type: 'location' },
  sputnik_tishiny: { id: 'sputnik_tishiny', name: 'Спутник Тишины', type: 'location' },
  prichal_pervogo: { id: 'prichal_pervogo', name: 'Причал Первого Прибытия', type: 'location' },
  razlom_kaylara: { id: 'razlom_kaylara', name: 'Разлом Кайлара', type: 'location' },
  pustosh_tabira: { id: 'pustosh_tabira', name: 'Пустошь Табира', type: 'location' },
  tanvir: { id: 'tanvir', name: 'Спорный периметр Танвир', type: 'location' },
  nekropol_ksarn: { id: 'nekropol_ksarn', name: 'Некрополь Ксарн', type: 'location' },
  bezdna_orrin: { id: 'bezdna_orrin', name: 'Бездна Оррин', type: 'location' },
  kuznya_zabytyh: { id: 'kuznya_zabytyh', name: 'Кузня Забытых', type: 'location' },
};

/**
 * ПОСТОЯННЫЕ маршруты — долгоживущий каркас, не истекают. Каждый —
 * ОДНОНАПРАВЛЕННЫЙ (from→to), обратный путь нужно указывать отдельной
 * записью, если он реально существует. variants — 3 варианта риска на
 * один и тот же маршрут (опасный/обычный/безопасный), см. заметку про
 * "безопасный не должен быть просто хуже" — у него нет PvP и он
 * стабильнее, а не просто медленнее без компенсации.
 */
const ROUTE_VARIANTS = {
  DANGEROUS: { id: 'dangerous', speedMult: 2.0, fuelMult: 1.3, pvpAllowed: true, riskLabel: 'red' },
  NORMAL: { id: 'normal', speedMult: 1.0, fuelMult: 1.0, pvpAllowed: true, riskLabel: 'yellow' },
  SAFE: { id: 'safe', speedMult: 0.6, fuelMult: 0.8, pvpAllowed: false, riskLabel: 'green' },
};

const PERMANENT_ROUTES = [
  { id: 'route_priyut_kovcheg9', from: 'priyut', to: 'kovcheg9' },
  { id: 'route_kovcheg9_priyut', from: 'kovcheg9', to: 'priyut' },
  { id: 'route_priyut_vual', from: 'priyut', to: 'vual' },
  { id: 'route_vual_priyut', from: 'vual', to: 'priyut' },
  { id: 'route_priyut_prichal', from: 'priyut', to: 'prichal_pervogo' },
  { id: 'route_prichal_priyut', from: 'prichal_pervogo', to: 'priyut' },
  { id: 'route_vual_razlom', from: 'vual', to: 'razlom_kaylara' },
  { id: 'route_priyut_kuznitsa', from: 'priyut', to: 'kuznitsa' },
  { id: 'route_kuznitsa_priyut', from: 'kuznitsa', to: 'priyut' },
  { id: 'route_kuznitsa_pustosh', from: 'kuznitsa', to: 'pustosh_tabira' },
  { id: 'route_terminus_arsenal', from: 'terminus', to: 'arsenal' },
  { id: 'route_arsenal_terminus', from: 'arsenal', to: 'terminus' },
];

/**
 * Временные Тракты — живут в Redis (см. lib/tract-store.js, следующий
 * шаг), не здесь. Здесь только чистая логика работы с уже загруженным
 * списком: как из постоянных+временных маршрутов собрать то, что РЕАЛЬНО
 * доступно игроку в узле прямо сейчас.
 */

/** Все исходящие маршруты из узла — постоянные + ещё не истёкшие
 *  временные (переданные явно, не читаются из стора здесь). Каждый
 *  маршрут развёрнут в 3 варианта риска — итоговый список кнопок для
 *  игрока получается умножением количества направлений на 3. */
function availableRoutesFrom(nodeId, activeTemporaryTracts = [], now = Date.now()) {
  const permanent = PERMANENT_ROUTES.filter((r) => r.from === nodeId);
  const temporary = activeTemporaryTracts.filter((t) => t.from === nodeId && t.expiresAt > now);
  const routes = [...permanent, ...temporary.map((t) => ({ id: t.id, from: t.from, to: t.to, temporary: true, expiresAt: t.expiresAt, stability: t.stability }))];

  const result = [];
  for (const route of routes) {
    for (const variant of Object.values(ROUTE_VARIANTS)) {
      result.push({ ...route, variant: variant.id, speedMult: variant.speedMult, fuelMult: variant.fuelMult, pvpAllowed: variant.pvpAllowed, riskLabel: variant.riskLabel });
    }
  }
  return result;
}

/** Есть ли ВООБЩЕ путь назад из nodeId в originNodeId прямо сейчас —
 *  для UX-правила "не показывать кнопку назад, если пути физически нет"
 *  (не техническое сообщение об ошибке, а честное отсутствие маршрута). */
function hasRouteBack(nodeId, originNodeId, activeTemporaryTracts = [], now = Date.now()) {
  return availableRoutesFrom(nodeId, activeTemporaryTracts, now).some((r) => r.to === originNodeId);
}

function nodeById(nodeId) {
  return NODES[nodeId] || null;
}

module.exports = {
  NODES, PERMANENT_ROUTES, ROUTE_VARIANTS,
  availableRoutesFrom, hasRouteBack, nodeById,
};
