'use strict';

/**
 * СЕТЬ ТРАКТОВ
 *
 * Тракт — граф пространства, а не линейная дистанция.
 *
 * Есть два типа маршрутов:
 *
 * 1. ЕСТЕСТВЕННЫЕ — постоянные коридоры между соседними узлами.
 *    Они существуют всегда.
 *
 * 2. ВРЕМЕННЫЕ — нестабильные окна Тракта из Redis.
 *    Они появляются/исчезают независимо от постоянной сети.
 *
 * ВАЖНО:
 * Ни одна исследуемая локация не должна превращаться в ловушку.
 * Поэтому у каждой planetary/location-точки есть хотя бы один
 * естественный выход.
 */

const NODES = {
  // Города
  priyut: {
    id: 'priyut',
    name: 'Приют',
    type: 'city',
  },

  vual: {
    id: 'vual',
    name: 'Вуаль',
    type: 'city',
  },

  terminus: {
    id: 'terminus',
    name: 'Терминус',
    type: 'city',
  },

  arsenal: {
    id: 'arsenal',
    name: 'Арсенал',
    type: 'city',
  },

  kuznitsa: {
    id: 'kuznitsa',
    name: 'Кузница',
    type: 'city',
  },

  // Синяя зона
  kovcheg9: {
    id: 'kovcheg9',
    name: 'Астероид «Ковчег-9»',
    type: 'location',
  },

  sputnik_tishiny: {
    id: 'sputnik_tishiny',
    name: 'Спутник Тишины',
    type: 'location',
    locationId: 'tishina',
  },

  prichal_pervogo: {
    id: 'prichal_pervogo',
    name: 'Причал Первого Прибытия',
    type: 'location',
  },

  poligon_arsenala: {
    id: 'poligon_arsenala',
    name: 'Старый полигон Арсенала',
    type: 'location',
  },

  // Жёлтая зона
  razlom_kaylara: {
    id: 'razlom_kaylara',
    name: 'Разлом Кайлара',
    type: 'location',
  },

  pustosh_tabira: {
    id: 'pustosh_tabira',
    name: 'Пустошь Табира',
    type: 'location',
  },

  tanvir: {
    id: 'tanvir',
    name: 'Спорный периметр Танвир',
    type: 'location',
    locationId: 'perimetr_tanvir',
  },

  yarmarka_tenej: {
    id: 'yarmarka_tenej',
    name: 'Ярмарка Теней',
    type: 'location',
  },

  // Красная зона
  nekropol_ksarn: {
    id: 'nekropol_ksarn',
    name: 'Некрополь Ксарн',
    type: 'location',
  },

  bezdna_orrin: {
    id: 'bezdna_orrin',
    name: 'Бездна Оррин',
    type: 'location',
  },

  kuznya_zabytyh: {
    id: 'kuznya_zabytyh',
    name: 'Кузня Забытых',
    type: 'location',
  },

  kladbische_flota: {
    id: 'kladbische_flota',
    name: 'Кладбище флота',
    type: 'location',
  },
};

const ROUTE_VARIANTS = {
  DANGEROUS: {
    id: 'dangerous',
    speedMult: 2.0,
    fuelMult: 1.3,
    pvpAllowed: true,
    riskLabel: 'red',
  },

  NORMAL: {
    id: 'normal',
    speedMult: 1.0,
    fuelMult: 1.0,
    pvpAllowed: true,
    riskLabel: 'yellow',
  },

  SAFE: {
    id: 'safe',
    speedMult: 0.6,
    fuelMult: 0.8,
    pvpAllowed: false,
    riskLabel: 'green',
  },
};

/**
 * ЕСТЕСТВЕННЫЕ ТРАКТЫ.
 *
 * Здесь специально нет случайных teleport-like связей.
 * Сеть строится как соседние коридоры:
 *
 * Приют
 *   ├─ Ковчег-9
 *   ├─ Причал Первого Прибытия
 *   └─ Вуаль
 *
 * Вуаль
 *   └─ Разлом Кайлара
 *
 * Кузница
 *   ├─ Пустошь Табира
 *   └─ Арсенал
 *
 * Жёлтые локации соединены между собой,
 * а красная зона образует отдельный опасный пояс.
 *
 * КАЖДОЕ направление прописано отдельно.
 * Поэтому отсутствие обратного пути — осознанное
 * свойство конкретного маршрута, а не баг.
 */
const PERMANENT_ROUTES = [
  // ───────── Приют ─────────

  {
    id: 'route_priyut_kovcheg9',
    from: 'priyut',
    to: 'kovcheg9',
  },

  {
    id: 'route_kovcheg9_priyut',
    from: 'kovcheg9',
    to: 'priyut',
  },

  {
    id: 'route_priyut_prichal',
    from: 'priyut',
    to: 'prichal_pervogo',
  },

  {
    id: 'route_prichal_priyut',
    from: 'prichal_pervogo',
    to: 'priyut',
  },

  {
    id: 'route_priyut_vual',
    from: 'priyut',
    to: 'vual',
  },

  {
    id: 'route_vual_priyut',
    from: 'vual',
    to: 'priyut',
  },

  {
    id: 'route_priyut_kuznitsa',
    from: 'priyut',
    to: 'kuznitsa',
  },

  {
    id: 'route_kuznitsa_priyut',
    from: 'kuznitsa',
    to: 'priyut',
  },

  // ───────── Ковчег-9 / синяя зона ─────────

  {
    id: 'route_kovcheg9_tishina',
    from: 'kovcheg9',
    to: 'sputnik_tishiny',
  },

  {
    id: 'route_tishina_kovcheg9',
    from: 'sputnik_tishiny',
    to: 'kovcheg9',
  },

  {
    id: 'route_tishina_prichal',
    from: 'sputnik_tishiny',
    to: 'prichal_pervogo',
  },

  {
    id: 'route_prichal_tishina',
    from: 'prichal_pervogo',
    to: 'sputnik_tishiny',
  },

  {
    id: 'route_prichal_poligon',
    from: 'prichal_pervogo',
    to: 'poligon_arsenala',
  },

  {
    id: 'route_poligon_prichal',
    from: 'poligon_arsenala',
    to: 'prichal_pervogo',
  },

  {
    id: 'route_poligon_arsenal',
    from: 'poligon_arsenala',
    to: 'arsenal',
  },

  {
    id: 'route_arsenal_poligon',
    from: 'arsenal',
    to: 'poligon_arsenala',
  },

  // ───────── Вуаль / Разлом ─────────

  {
    id: 'route_vual_razlom',
    from: 'vual',
    to: 'razlom_kaylara',
  },

  {
    id: 'route_razlom_vual',
    from: 'razlom_kaylara',
    to: 'vual',
  },

  // Разлом — соседняя опасная зона.
  {
    id: 'route_razlom_tanvir',
    from: 'razlom_kaylara',
    to: 'tanvir',
  },

  {
    id: 'route_tanvir_razlom',
    from: 'tanvir',
    to: 'razlom_kaylara',
  },

  // ───────── Кузница / Табир ─────────

  {
    id: 'route_kuznitsa_pustosh',
    from: 'kuznitsa',
    to: 'pustosh_tabira',
  },

  {
    id: 'route_pustosh_kuznitsa',
    from: 'pustosh_tabira',
    to: 'kuznitsa',
  },

  {
    id: 'route_pustosh_tanvir',
    from: 'pustosh_tabira',
    to: 'tanvir',
  },

  {
    id: 'route_tanvir_pustosh',
    from: 'tanvir',
    to: 'pustosh_tabira',
  },

  // ───────── Жёлтая зона ─────────

  {
    id: 'route_tanvir_yarmarka',
    from: 'tanvir',
    to: 'yarmarka_tenej',
  },

  {
    id: 'route_yarmarka_tanvir',
    from: 'yarmarka_tenej',
    to: 'tanvir',
  },

  {
    id: 'route_yarmarka_vual',
    from: 'yarmarka_tenej',
    to: 'vual',
  },

  {
    id: 'route_vual_yarmarka',
    from: 'vual',
    to: 'yarmarka_tenej',
  },

  // ───────── Красный пояс ─────────

  {
    id: 'route_yarmarka_nekropol',
    from: 'yarmarka_tenej',
    to: 'nekropol_ksarn',
  },

  {
    id: 'route_nekropol_yarmarka',
    from: 'nekropol_ksarn',
    to: 'yarmarka_tenej',
  },

  {
    id: 'route_nekropol_orrin',
    from: 'nekropol_ksarn',
    to: 'bezdna_orrin',
  },

  {
    id: 'route_orrin_nekropol',
    from: 'bezdna_orrin',
    to: 'nekropol_ksarn',
  },

  {
    id: 'route_orrin_kuznya',
    from: 'bezdna_orrin',
    to: 'kuznya_zabytyh',
  },

  {
    id: 'route_kuznya_orrin',
    from: 'kuznya_zabytyh',
    to: 'bezdna_orrin',
  },

  {
    id: 'route_kuznya_kladbische',
    from: 'kuznya_zabytyh',
    to: 'kladbische_flota',
  },

  {
    id: 'route_kladbische_kuznya',
    from: 'kladbische_flota',
    to: 'kuznya_zabytyh',
  },

  /*
   * Красная зона не должна быть тупиком.
   * Из кладбища можно вернуться через Кузню,
   * а из Кузни — через Оррин.
   */

  // ───────── Города ─────────

  {
    id: 'route_terminus_arsenal',
    from: 'terminus',
    to: 'arsenal',
  },

  {
    id: 'route_arsenal_terminus',
    from: 'arsenal',
    to: 'terminus',
  },

  {
    id: 'route_terminus_vual',
    from: 'terminus',
    to: 'vual',
  },

  {
    id: 'route_vual_terminus',
    from: 'vual',
    to: 'terminus',
  },

  {
    id: 'route_arsenal_kuznitsa',
    from: 'arsenal',
    to: 'kuznitsa',
  },

  {
    id: 'route_kuznitsa_arsenal',
    from: 'kuznitsa',
    to: 'arsenal',
  },
];

/**
 * Временные Тракты.
 *
 * Они НЕ находятся здесь постоянно.
 * Этот файл только принимает их из Redis через
 * availableRoutesFrom().
 *
 * Временный Тракт может:
 *
 * - открыть короткий обход;
 * - соединить две удалённые точки;
 * - временно открыть ранее недоступное направление;
 * - исчезнуть после expiresAt.
 *
 * Главное: временный маршрут никогда не должен быть
 * единственным способом выбраться из уже посещённой
 * локации.
 */

/**
 * Все исходящие маршруты:
 *
 * постоянные + активные временные.
 *
 * Каждый маршрут получает три варианта риска.
 */
function availableRoutesFrom(
  nodeId,
  activeTemporaryTracts = [],
  now = Date.now()
) {
  const permanent =
    PERMANENT_ROUTES.filter(
      (route) =>
        route.from ===
        nodeId
    );

  const temporary =
    activeTemporaryTracts
      .filter(
        (tract) =>
          tract.from ===
            nodeId &&
          Number(
            tract.expiresAt
          ) > now
      )
      .map(
        (tract) => ({
          id:
            tract.id,

          from:
            tract.from,

          to:
            tract.to,

          temporary:
            true,

          expiresAt:
            tract.expiresAt,

          stability:
            tract.stability,
        })
      );

  const routes = [
    ...permanent,
    ...temporary,
  ];

  const result = [];

  for (
    const route of routes
  ) {
    for (
      const variant of Object.values(
        ROUTE_VARIANTS
      )
    ) {
      result.push({
        ...route,

        variant:
          variant.id,

        speedMult:
          variant.speedMult,

        fuelMult:
          variant.fuelMult,

        pvpAllowed:
          variant.pvpAllowed,

        riskLabel:
          variant.riskLabel,
      });
    }
  }

  return result;
}

/**
 * Есть ли физический путь назад.
 */
function hasRouteBack(
  nodeId,
  originNodeId,
  activeTemporaryTracts = [],
  now = Date.now()
) {
  return availableRoutesFrom(
    nodeId,
    activeTemporaryTracts,
    now
  ).some(
    (route) =>
      route.to ===
      originNodeId
  );
}

/**
 * Проверка безопасности сети:
 *
 * ни одна location не должна остаться без
 * естественного выхода.
 *
 * Используется для тестов/проверки перед деплоем.
 */
function locationsWithoutExit() {
  return Object.values(
    NODES
  )
    .filter(
      (node) =>
        node.type ===
        'location'
    )
    .filter(
      (node) =>
        !PERMANENT_ROUTES.some(
          (route) =>
            route.from ===
            node.id
        )
    )
    .map(
      (node) =>
        node.id
    );
}

function nodeById(
  nodeId
) {
  return (
    NODES[nodeId] ||
    null
  );
}

module.exports = {
  NODES,
  PERMANENT_ROUTES,
  ROUTE_VARIANTS,
  availableRoutesFrom,
  hasRouteBack,
  locationsWithoutExit,
  nodeById,
};
