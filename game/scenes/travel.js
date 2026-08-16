'use strict';

/**
 * Трактовая навигация.
 *
 * ВАЖНО:
 * travel.js НЕ создаёт отдельную систему исследования или боя.
 *
 * Его задача:
 *   город/узел
 *      ↓
 *   Тракт
 *      ↓
 *   узел назначения
 *      ↓
 *   существующий JOURNEY / exploration.js
 *      ↓
 *   существующий combat.js
 *      ↓
 *   обратно к кораблю
 *      ↓
 *   следующий Тракт
 *      ↓
 *   город
 *
 * Все события поверхности, глубина вылазки, наземный бой,
 * награды, радиация и эвакуация остаются в существующих системах.
 */

const {
  ROUTE_VARIANTS,
  availableRoutesFrom,
  nodeById,
} = require('../../engine/tract-network.js');

const {
  fuelCostForStep,
  distanceRewardMultiplier,
  zoneForDistance,
  shipLevelRequiredForDistance,
} = require('../../engine/travel.js');

const {
  bankTripCargo,
  tripCargoUnits,
} = require('../../lib/trip-cargo.js');

const {
  stationButtons,
  startJourney,
} = require('./common.js');

const { SCENES } = require('./ids.js');

const HOME_NODE_BY_FACTION = {
  Приют: 'priyut',
  Вуаль: 'vual',
  Терминус: 'terminus',
  Арсенал: 'arsenal',
  Кузница: 'kuznitsa',
};

function currentNodeId(player) {
  return (
    player.currentNodeId ||
    HOME_NODE_BY_FACTION[player.faction] ||
    'priyut'
  );
}

function currentNode(player) {
  return nodeById(currentNodeId(player));
}

async function activeTracts(deps) {
  if (
    deps &&
    deps.tractStore &&
    typeof deps.tractStore.getActiveTracts === 'function'
  ) {
    return deps.tractStore.getActiveTracts();
  }

  return [];
}

function routeVariant(route) {
  if (!route) return null;

  return Object.values(ROUTE_VARIANTS).find(
    (variant) => variant.id === route.variant
  ) || null;
}

function routeFuelCost(route, rng) {
  const variant = routeVariant(route);

  if (!variant) {
    return Infinity;
  }

  /*
   * Базовый расход берём из engine/travel.js.
   * Таким образом game/scenes/travel.js не содержит
   * собственной конкурирующей формулы топлива.
   */
  const base = fuelCostForStep(rng);

  return Math.max(
    1,
    Math.round(base * variant.fuelMult)
  );
}

function routeRiskIcon(route) {
  if (!route) return '🟡';

  if (route.riskLabel === 'green') {
    return '🟢';
  }

  if (route.riskLabel === 'red') {
    return '🔴';
  }

  return '🟡';
}

function routeVariantName(route) {
  if (!route) return 'Обычный';

  if (route.variant === 'safe') {
    return 'Безопасный';
  }

  if (route.variant === 'dangerous') {
    return 'Опасный';
  }

  return 'Обычный';
}

function state(player, extra = {}) {
  return {
    scene: SCENES.SHIP_TRAVEL,
    player,
    ...extra,
  };
}

function clearRouteSelection(player) {
  delete player.availableRoutes;
  delete player.pendingRoutes;
}

function markTravel(
  player,
  originNodeId,
  destinationNodeId,
  route
) {
  player.travelOriginNodeId = originNodeId;
  player.travelDestinationNodeId = destinationNodeId;

  /*
   * Один переход по Тракту — это начало нового рейса.
   *
   * Дальнейшая дистанция уже увеличивается существующей
   * механикой exploration/deep-exploration, а не здесь.
   */
  player.pendingShipDistance = 1;

  player.currentNodeId = destinationNodeId;

  player.travelRouteVariant =
    route.variant;

  player.travelRewardMultiplier =
    distanceRewardMultiplier(1);
}

function clearCompletedTravel(player) {
  delete player.travelOriginNodeId;
  delete player.travelDestinationNodeId;
  delete player.availableRoutes;
  delete player.pendingRoutes;
  delete player.travelRouteVariant;
  delete player.travelRewardMultiplier;
  delete player.pendingShipDistance;
}

function routeListForNode(
  nodeId,
  temporaryTracts
) {
  return availableRoutesFrom(
    nodeId,
    temporaryTracts
  );
}

function destinationGroups(routes) {
  const groups = new Map();

  for (const route of routes) {
    if (!groups.has(route.to)) {
      groups.set(route.to, []);
    }

    groups
      .get(route.to)
      .push(route);
  }

  return groups;
}

async function travelScreen(
  deps,
  player,
  prefixText = ''
) {
  if (!player || !player.ship) {
    return {
      reply: {
        text:
          `${prefixText}⚠️ Корабль не найден.`,
        buttons: ['⬅️ Назад'],
      },
      nextState: {
        scene: SCENES.STATION,
        player,
      },
    };
  }

  const node = currentNode(player);

  if (!node) {
    return {
      reply: {
        text:
          `${prefixText}⚠️ Текущая позиция корабля не определена.`,
        buttons: ['⬅️ Назад'],
      },
      nextState: state(player),
    };
  }

  const temporaryTracts =
    await activeTracts(deps);

  const routes =
    routeListForNode(
      node.id,
      temporaryTracts
    );

  const groups =
    destinationGroups(routes);

  const buttons = [];

  for (
    const [destinationId]
    of groups
  ) {
    const destination =
      nodeById(destinationId);

    if (!destination) {
      continue;
    }

    buttons.push(
      `→ ${destination.name}`
    );
  }

  /*
   * Исследование показывается только
   * для реального космического Node,
   * а не для города.
   */
  if (node.type !== 'city') {
    buttons.push(
      '🔭 Исследовать'
    );
  }

  buttons.push(
    '⬅️ Назад'
  );

  const routeText = [];

  for (
    const [
      destinationId,
      variants,
    ] of groups
  ) {
    const destination =
      nodeById(destinationId);

    if (!destination) {
      continue;
    }

    routeText.push(
      `${variants
        .map(routeRiskIcon)
        .join('')} ${destination.name}`
    );
  }

  const distance =
    player.pendingShipDistance || 0;

  const zone =
    zoneForDistance(distance);

  return {
    reply: {
      text: [
        prefixText,
        `🛰️ ${node.name}`,
        '',
        `⛽ Топливо: ${player.ship.fuel}/${player.ship.fuelMax}`,
        `📦 Груз рейса: ${tripCargoUnits(player)} ед.`,
        distance
          ? `📡 Дистанция рейса: ${distance}`
          : '',
        distance
          ? `🌌 Сектор: ${zone}`
          : '',
        '',
        routeText.length
          ? '🛰️ Доступные Тракты:'
          : '🛰️ Доступных Трактов сейчас нет.',
        ...routeText,
      ]
        .filter(Boolean)
        .join('\n'),
      buttons,
    },
    nextState: state(
      player,
      {
        locationNodeId: node.id,
        availableRoutes: routes,
      }
    ),
  };
}

async function chooseDestination(
  deps,
  player,
  routes,
  destinationName
) {
  const matching =
    routes.filter((route) => {
      const node =
        nodeById(route.to);

      return (
        node &&
        node.name ===
          destinationName
      );
    });

  if (!matching.length) {
    return travelScreen(
      deps,
      player,
      '⚠️ Этот Тракт сейчас недоступен.\n\n'
    );
  }

  const destination =
    nodeById(matching[0].to);

  const buttons =
    matching.map(
      (route) =>
        `${routeRiskIcon(route)} ${routeVariantName(route)}`
    );

  buttons.push(
    '⬅️ Назад'
  );

  return {
    reply: {
      text: [
        `🛰️ Курс: ${currentNode(player)?.name || '???'} → ${destination.name}`,
        '',
        'Выбери вариант Тракта:',
        '',
        '🟢 Безопасный — без PvP.',
        '🟡 Обычный — стандартный риск.',
        '🔴 Опасный — возможны космические столкновения.',
      ].join('\n'),
      buttons,
    },
    nextState: state(
      player,
      {
        pendingRoutes:
          matching,
        locationNodeId:
          currentNodeId(player),
      }
    ),
  };
}

async function beginPlanetExploration(
  player,
  rng
) {
  const distance =
    Math.max(
      1,
      player.pendingShipDistance || 1
    );

  const zone =
    zoneForDistance(distance);

  /*
   * Здесь НЕТ собственной системы событий.
   *
   * startJourney() уже является связующим
   * переходом в существующий exploration.js.
   */
  const result =
    startJourney(
      player,
      'explore',
      {
        zone,
        depth: 0,
        shipNodeId:
          player.currentNodeId,
        shipDistance:
          distance,
        rewardMultiplier:
          distanceRewardMultiplier(
            distance
          ),
      },
      rng
    );

  return {
    ...result,
    nextState: {
      ...result.nextState,
      shipNodeId:
        player.currentNodeId,
      shipDistance:
        distance,
      rewardMultiplier:
        distanceRewardMultiplier(
          distance
        ),
    },
  };
}

async function performTransit(
  deps,
  player,
  route,
  rng
) {
  const variant =
    routeVariant(route);

  if (!variant) {
    return travelScreen(
      deps,
      player,
      '⚠️ Вариант Тракта повреждён.\n\n'
    );
  }

  const requiredShipLevel =
    shipLevelRequiredForDistance(1);

  const shipLevel =
    player.ship.level || 1;

  if (
    shipLevel <
    requiredShipLevel
  ) {
    return {
      reply: {
        text: [
          '🚫 Корабль не готов к этому рейсу.',
          `Требуется уровень корабля: ${requiredShipLevel}.`,
          `Текущий уровень: ${shipLevel}.`,
        ].join('\n'),
        buttons: ['⬅️ Назад'],
      },
      nextState:
        state(player),
    };
  }

  const fuel =
    routeFuelCost(
      route,
      rng
    );

  if (
    !Number.isFinite(
      player.ship.fuel
    ) ||
    player.ship.fuel < fuel
  ) {
    return {
      reply: {
        text: [
          '⛽ Недостаточно топлива.',
          '',
          `Нужно: ${fuel}`,
          `Есть: ${player.ship.fuel}`,
        ].join('\n'),
        buttons: ['⬅️ Назад'],
      },
      nextState:
        state(player),
    };
  }

  const origin =
    currentNodeId(player);

  player.ship.fuel -= fuel;

  markTravel(
    player,
    origin,
    route.to,
    route
  );

  clearRouteSelection(
    player
  );

  const destination =
    nodeById(route.to);

  if (!destination) {
    return travelScreen(
      deps,
      player,
      '⚠️ Точка назначения Тракта не найдена.\n\n'
    );
  }

  /*
   * Мы НЕ генерируем здесь космический бой.
   *
   * После перехода игрок находится в Node.
   * Исследование и наземные события запускаются
   * только существующими сценами.
   */
  return {
    reply: {
      text: [
        `🚀 Прибытие: ${destination.name}.`,
        '',
        `🛰️ Вариант Тракта: ${routeVariantName(route)}.`,
        `⛽ Расход топлива: ${fuel}.`,
        '',
        destination.type === 'city'
          ? '🏙️ Корабль прибыл в город.'
          : '🌌 Корабль остаётся на орбите.',
      ].join('\n'),
      buttons:
        destination.type === 'city'
          ? stationButtons(
              deps,
              player
            )
          : [
              '🔭 Исследовать',
              ...(
                (await routeListForNode(
                  destination.id,
                  await activeTracts(deps)
                )).length
                  ? ['🚀 Продолжить полёт']
                  : []
              ),
              '⬅️ Назад',
            ],
    },
    nextState:
      destination.type === 'city'
        ? (() => {
            bankTripCargo(player);
            clearCompletedTravel(player);

            return {
              scene:
                SCENES.STATION,
              player,
            };
          })()
        : state(
            player,
            {
              locationNodeId:
                destination.id,
            }
          ),
  };
}

async function handleTravel(
  stateValue,
  input,
  rng = Math.random,
  deps = {}
) {
  if (
    !stateValue ||
    !stateValue.player
  ) {
    return null;
  }

  const player =
    stateValue.player;

  /*
   * Высадка на планету.
   *
   * Никакой новой exploration-системы.
   * Передаём управление существующему
   * journey/exploration.js.
   */
  if (
    stateValue.scene ===
      SCENES.SHIP_TRAVEL &&
    input ===
      '🔭 Исследовать'
  ) {
    return beginPlanetExploration(
      player,
      rng
    );
  }

  /*
   * Продолжение полёта из Node.
   */
  if (
    stateValue.scene ===
      SCENES.SHIP_TRAVEL &&
    input ===
      '🚀 Продолжить полёт'
  ) {
    return travelScreen(
      deps,
      player
    );
  }

  /*
   * Выбор направления.
   */
  if (
    stateValue.scene ===
      SCENES.SHIP_TRAVEL &&
    input.startsWith('→ ')
  ) {
    const destinationName =
      input.slice(2).trim();

    return chooseDestination(
      deps,
      player,
      stateValue.availableRoutes ||
        [],
      destinationName
    );
  }

  /*
   * Выбор варианта Тракта.
   */
  if (
    stateValue.scene ===
      SCENES.SHIP_TRAVEL &&
    Array.isArray(
      stateValue.pendingRoutes
    )
  ) {
    const route =
      stateValue.pendingRoutes.find(
        (candidate) =>
          `${routeRiskIcon(candidate)} ${routeVariantName(candidate)}` ===
          input
      );

    if (!route) {
      return chooseDestination(
        deps,
        player,
        stateValue.pendingRoutes,
        nodeById(
          stateValue.pendingRoutes[0]?.to
        )?.name || ''
      );
    }

    return performTransit(
      deps,
      player,
      route,
      rng
    );
  }

  /*
   * Возврат в меню полёта.
   *
   * Не возвращаем игрока в город автоматически.
   */
  if (
    stateValue.scene ===
      SCENES.SHIP_TRAVEL &&
    input ===
      '⬅️ Назад'
  ) {
    return travelScreen(
      deps,
      player
    );
  }

  /*
   * Совместимость со старым состоянием:
   * если exploration.js вернул игрока через
   * travelScreen(), мы остаёмся в SHIP_TRAVEL.
   */
  if (
    stateValue.scene ===
      SCENES.SHIP_RETURNING
  ) {
    return travelScreen(
      deps,
      player
    );
  }

  /*
   * ВАЖНО:
   * SHIP_PRE_COMBAT и SHIP_COMBAT больше
   * не реализуются здесь.
   *
   * Космический combat должен проходить
   * через существующий combat flow проекта,
   * а travel отвечает только за навигацию.
   */
  if (
    stateValue.scene ===
      SCENES.SHIP_PRE_COMBAT ||
    stateValue.scene ===
      SCENES.SHIP_COMBAT
  ) {
    return {
      reply: {
        text:
          '⚠️ Космический бой передан основному боевому движку. Возвращаю управление ему.',
        buttons: [
          '⚔️ Атаковать',
          'Отступить',
        ],
      },
      nextState:
        stateValue,
    };
  }

  return travelScreen(
    deps,
    player
  );
}

module.exports = {
  handleTravel,
  travelScreen,
  currentNodeId,
  currentNode,
};
