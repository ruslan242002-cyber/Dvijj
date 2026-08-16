'use strict';

const {
  NODES,
  ROUTE_VARIANTS,
  availableRoutesFrom,
  nodeById,
} = require('../../engine/tract-network.js');

const {
  rollSpaceEvent,
} = require('../../engine/space-events.js');

const {
  shipToFighter,
  applyFighterResultToShip,
} = require('../../engine/ship.js');

const {
  resolveTurn,
} = require('../../engine/combat-engine.js');

const {
  addToTripCargo,
  bankTripCargo,
  loseFullCargo,
  tripCargoUnits,
} = require('../../lib/trip-cargo.js');

const {
  combatFullCard,
} = require('../../lib/combat-card.js');

const {
  stationButtons,
} = require('./common.js');

const {
  SCENES,
} = require('./ids.js');

/*
 * ВАЖНО
 * -------
 * Этот файл не создаёт второй travel-engine.
 *
 * engine/travel.js остаётся источником правил дистанции,
 * топлива, зон и риска.
 *
 * engine/tract-network.js отвечает только за сеть Трактов.
 *
 * game/scenes/travel.js отвечает только за переходы между
 * существующими сценами игры.
 */

const FUEL_BASE_COST = 8;

const HOME_NODE_BY_FACTION = {
  Приют: 'priyut',
  Вуаль: 'vual',
  Терминус: 'terminus',
  Арсенал: 'arsenal',
  Кузница: 'kuznitsa',
};

function getNodeId(player) {
  return (
    player.currentNodeId ||
    HOME_NODE_BY_FACTION[player.faction] ||
    'priyut'
  );
}

function getNode(player) {
  return nodeById(getNodeId(player));
}

function getActiveTracts(deps) {
  if (
    deps &&
    deps.tractStore &&
    typeof deps.tractStore.getActiveTracts === 'function'
  ) {
    return Promise.resolve(
      deps.tractStore.getActiveTracts()
    );
  }

  return Promise.resolve([]);
}

function getVariant(route) {
  if (!route) return null;

  return Object.values(ROUTE_VARIANTS).find(
    (variant) =>
      variant.id === route.variant
  ) || null;
}

function fuelCost(route) {
  const variant = getVariant(route);

  if (!variant) {
    return Infinity;
  }

  return Math.max(
    1,
    Math.round(
      FUEL_BASE_COST *
      variant.fuelMult
    )
  );
}

function routeDistance(route) {
  if (!route) return 0;

  /*
   * Это не заменяет engine/travel.js.
   * Значение используется только как состояние текущего
   * рейса для существующей exploration-механики.
   */
  if (route.variant === 'dangerous') {
    return 8;
  }

  if (route.variant === 'safe') {
    return 2;
  }

  return 5;
}

function riskIcon(route) {
  if (!route) return '🟡';

  if (route.riskLabel === 'red') {
    return '🔴';
  }

  if (route.riskLabel === 'green') {
    return '🟢';
  }

  return '🟡';
}

function variantName(route) {
  if (!route) {
    return 'Обычный';
  }

  if (route.variant === 'dangerous') {
    return 'Опасный';
  }

  if (route.variant === 'safe') {
    return 'Безопасный';
  }

  return 'Обычный';
}

function makeState(player, extra = {}) {
  return {
    scene: SCENES.SHIP_TRAVEL,
    player,
    ...extra,
  };
}

function clearCompletedTrip(player) {
  delete player.travelOriginNodeId;
  delete player.travelDestinationNodeId;
  delete player.availableRoutes;
  delete player.pendingRoutes;
  delete player.locationNodeId;
  delete player.pendingShipDistance;
}

function clearRouteSelection(player) {
  delete player.pendingRoutes;
  delete player.availableRoutes;
}

function setTravelState(
  player,
  originNodeId,
  destinationNodeId,
  route
) {
  player.travelOriginNodeId =
    originNodeId;

  player.travelDestinationNodeId =
    destinationNodeId;

  /*
   * Не удаляем это поле при прибытии
   * в обычный Node.
   *
   * Оно необходимо exploration.js:
   *
   * корабль
   *   ↓
   * Node
   *   ↓
   * планета
   *   ↓
   * корабль
   *
   * Только окончательное возвращение
   * в город завершает рейс.
   */
  player.pendingShipDistance =
    routeDistance(route);
}

async function returnToNode(
  deps,
  player,
  nodeId,
  prefixText = ''
) {
  const node = nodeById(nodeId);

  if (!node) {
    return {
      reply: {
        text: [
          prefixText,
          '⚠️ Точка назначения не найдена.',
        ].join('\n'),
        buttons: ['⬅️ Назад'],
      },
      nextState: makeState(player),
    };
  }

  player.currentNodeId =
    node.id;

  /*
   * ГОРОД = единственная точка,
   * где рискованный tripCargo становится
   * безопасным inventory.
   */
  if (node.type === 'city') {
    const result =
      bankTripCargo(player);

    clearCompletedTrip(player);

    player.currentNodeId =
      node.id;

    return {
      reply: {
        text: [
          prefixText,
          `🛰️ Прибытие: ${node.name}.`,
          result &&
          Array.isArray(result.banked) &&
          result.banked.length
            ? '📦 Груз доставлен на склад.'
            : '',
        ]
          .filter(Boolean)
          .join('\n'),
        buttons:
          stationButtons(
            deps,
            player
          ),
      },
      nextState: {
        scene:
          SCENES.STATION,
        player,
      },
    };
  }

  const activeTracts =
    await getActiveTracts(deps);

  const routes =
    availableRoutesFrom(
      node.id,
      activeTracts
    );

  const cargo =
    tripCargoUnits(player);

  const buttons = [];

  /*
   * На Node сначала можно продолжить
   * космический рейс.
   */
  if (routes.length) {
    buttons.push(
      '🚀 Продолжить полёт'
    );
  }

  /*
   * Высадка существующей системой
   * exploration.
   */
  buttons.push(
    '🔭 Исследовать'
  );

  /*
   * Назад разрешаем только если
   * физически существует обратный Тракт.
   */
  const origin =
    player.travelOriginNodeId;

  const hasReturn =
    routes.some(
      (route) =>
        route.to === origin
    );

  if (hasReturn) {
    buttons.push(
      '↩️ Вернуться по Тракту'
    );
  }

  if (!buttons.length) {
    buttons.push('⬅️ Назад');
  }

  return {
    reply: {
      text: [
        prefixText,
        `🛰️ ${node.name}`,
        `📦 Груз рейса: ${cargo} ед.`,
        '',
        routes.length
          ? 'Тракт доступен.'
          : 'Исходящих Трактов сейчас нет.',
        '',
        'Корабль остаётся в космосе.',
        'Груз пока не считается доставленным.',
      ].join('\n'),
      buttons,
    },
    nextState: makeState(
      player,
      {
        locationNodeId:
          node.id,
        availableRoutes:
          routes,
      }
    ),
  };
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
          `${prefixText}⚠️ Состояние корабля не найдено.`,
        buttons: ['⬅️ Назад'],
      },
      nextState: {
        scene:
          SCENES.STATION,
        player,
      },
    };
  }

  const node =
    getNode(player);

  if (!node) {
    return {
      reply: {
        text:
          `${prefixText}⚠️ Текущая позиция корабля не найдена.`,
        buttons: ['⬅️ Назад'],
      },
      nextState:
        makeState(player),
    };
  }

  const activeTracts =
    await getActiveTracts(deps);

  const routes =
    availableRoutesFrom(
      node.id,
      activeTracts
    );

  const cargo =
    tripCargoUnits(player);

  const grouped =
    new Map();

  for (const route of routes) {
    if (!grouped.has(route.to)) {
      grouped.set(
        route.to,
        []
      );
    }

    grouped
      .get(route.to)
      .push(route);
  }

  const buttons = [];

  for (
    const [destinationId]
    of grouped
  ) {
    const destination =
      nodeById(
        destinationId
      );

    if (!destination) {
      continue;
    }

    buttons.push(
      `→ ${destination.name}`
    );
  }

  if (node.type !== 'city') {
    buttons.push(
      '🔭 Исследовать'
    );
  }

  buttons.push(
    '⬅️ Назад'
  );

  const destinationLines =
    [];

  for (
    const [
      destinationId,
      variants,
    ] of grouped
  ) {
    const destination =
      nodeById(
        destinationId
      );

    if (!destination) {
      continue;
    }

    destinationLines.push(
      `${variants
        .map(riskIcon)
        .join('')} ${destination.name}`
    );
  }

  return {
    reply: {
      text: [
        prefixText,
        `📍 ${node.name}`,
        `⛽ ${player.ship.fuel}/${player.ship.fuelMax}`,
        `📦 Груз рейса: ${cargo} ед.`,
        '',
        '🛰️ Доступные Тракты:',
        ...destinationLines,
      ].join('\n'),
      buttons,
    },
    nextState: makeState(
      player,
      {
        locationNodeId:
          node.id,
        availableRoutes:
          routes,
      }
    ),
  };
}

async function chooseDestination(
  player,
  routes,
  destinationName
) {
  const destination =
    routes.filter(
      (route) => {
        const node =
          nodeById(
            route.to
          );

        return (
          node &&
          node.name ===
            destinationName
        );
      }
    );

  if (!destination.length) {
    return null;
  }

  const buttons =
    destination.map(
      (route) =>
        `${riskIcon(route)} ${variantName(route)}`
    );

  buttons.push(
    '⬅️ Назад'
  );

  return {
    reply: {
      text: [
        `🛰️ Курс на ${destinationName}.`,
        '',
        'Выбери вариант Тракта:',
        '',
        '🟢 безопасный — без PvP',
        '🟡 обычный — стандартный риск',
        '🔴 опасный — повышенный риск',
      ].join('\n'),
      buttons,
    },
    nextState:
      makeState(
        player,
        {
          pendingRoutes:
            destination,
        }
      ),
  };
}

async function performTransit(
  deps,
  player,
  route,
  rng
) {
  const variant =
    getVariant(route);

  if (!variant) {
    return travelScreen(
      deps,
      player,
      '⚠️ Некорректный вариант Тракта.\n\n'
    );
  }

  const cost =
    fuelCost(route);

  if (
    !Number.isFinite(
      player.ship.fuel
    ) ||
    player.ship.fuel <
      cost
  ) {
    return {
      reply: {
        text: [
          '⛽ Недостаточно топлива.',
          `Нужно: ${cost}`,
          `Есть: ${player.ship.fuel}`,
        ].join('\n'),
        buttons: [
          '⬅️ Назад',
        ],
      },
      nextState:
        makeState(player),
    };
  }

  const origin =
    getNodeId(player);

  player.ship.fuel -= cost;

  setTravelState(
    player,
    origin,
    route.to,
    route
  );

  clearRouteSelection(
    player
  );

  /*
   * Космическое событие —
   * существующая система.
   */
  const event =
    rollSpaceEvent(
      player,
      player.pendingShipDistance,
      rng,
      null
    );

  /*
   * Нет события — просто
   * прибываем в Node.
   */
  if (
    !event ||
    !event.type
  ) {
    return returnToNode(
      deps,
      player,
      route.to
    );
  }

  /*
   * Безопасный Тракт не запускает
   * PvP-событие.
   */
  const pvpEvent =
    event.type ===
      'hostile_ship' ||
    event.type ===
      'ambush_pvp';

  if (
    pvpEvent &&
    !variant.pvpAllowed
  ) {
    return returnToNode(
      deps,
      player,
      route.to,
      '🛡️ Безопасный Тракт миновал угрозу.\n\n'
    );
  }

  if (pvpEvent) {
    return {
      reply: {
        text:
          event.text ||
          '⚔️ Вражеский корабль перехватил тебя на Тракте.',
        buttons: [
          '⚔️ Атаковать',
          '🏃 Уйти',
        ],
      },
      nextState: {
        scene:
          SCENES.SHIP_PRE_COMBAT,
        player,
        enemy:
          event.enemy ||
          null,
        destinationNodeId:
          route.to,
        originNodeId:
          origin,
      },
    };
  }

  /*
   * Ресурсные события идут
   * в tripCargo, а не inventory.
   */
  if (
    event.loot &&
    event.loot.resource &&
    event.loot.qty
  ) {
    addToTripCargo(
      player,
      event.loot.resource,
      event.loot.tier || 1,
      event.loot.qty
    );
  }

  if (
    event.reward &&
    Number.isFinite(
      event.reward.credits
    )
  ) {
    player.credits =
      (player.credits || 0) +
      event.reward.credits;
  }

  return returnToNode(
    deps,
    player,
    route.to,
    event.text
      ? `${event.text}\n\n`
      : ''
  );
}

async function handleTravel(
  state,
  input,
  rng,
  deps,
  playerId
) {
  if (
    !state ||
    !state.player
  ) {
    return null;
  }

  const player =
    state.player;

  if (playerId) {
    player.id =
      playerId;
  }

  /*
   * ВЫСАДКА
   *
   * Не создаём новую exploration.
   * Передаём управление существующей
   * сцене journey через уже существующий
   * router flow.
   */
  if (
    state.scene ===
      SCENES.SHIP_TRAVEL &&
    input ===
      '🔭 Исследовать'
  ) {
    const node =
      nodeById(
        state.locationNodeId ||
        getNodeId(player)
      );

    if (!node) {
      return travelScreen(
        deps,
        player,
        '⚠️ Точка высадки не найдена.\n\n'
      );
    }

    /*
     * Критически важно:
     * pendingShipDistance уже записан
     * при полёте.
     *
     * Не отправляем игрока на станцию.
     * Он остаётся связан с кораблём.
     */
    player.currentNodeId =
      node.id;

    return {
      reply: {
        text: [
          `🪐 ВЫСАДКА: ${node.name}`,
          '',
          'Корабль остаётся на орбите.',
          'Можно начать исследование поверхности.',
        ].join('\n'),
        buttons: [
          'Начать вылазку',
          '🚀 Остаться на корабле',
        ],
      },
      nextState: {
        scene:
          SCENES.JOURNEY,
        player,
        zone:
          node.id ===
          'razlom_kaylara'
            ? 'red'
            : 'blue',
        depth: 0,
        shipNodeId:
          node.id,
      },
    };
  }

  if (
    state.scene ===
      SCENES.SHIP_TRAVEL &&
    input ===
      '🚀 Остаться на корабле'
  ) {
    return travelScreen(
      deps,
      player
    );
  }

  if (
    state.scene ===
      SCENES.SHIP_TRAVEL &&
    input ===
      '⬅️ Назад'
  ) {
    if (
      state.pendingRoutes
    ) {
      return travelScreen(
        deps,
        player
      );
    }

    return travelScreen(
      deps,
      player
    );
  }

  if (
    state.scene ===
      SCENES.SHIP_TRAVEL &&
    /^→\s+/u.test(input)
  ) {
    const destinationName =
      input.replace(
        /^→\s+/u,
        ''
      );

    return chooseDestination(
      player,
      state.availableRoutes ||
        [],
      destinationName
    );
  }

  if (
    state.scene ===
      SCENES.SHIP_TRAVEL &&
    state.pendingRoutes
  ) {
    const route =
      state.pendingRoutes.find(
        (candidate) =>
          `${riskIcon(candidate)} ${variantName(candidate)}` ===
          input
      );

    if (!route) {
      return travelScreen(
        deps,
        player
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
   * Бой на Тракте.
   *
   * Победа НЕ означает возвращение
   * в город.
   *
   * После боя продолжаем маршрут
   * к destinationNodeId.
   */
  if (
    state.scene ===
      SCENES.SHIP_PRE_COMBAT
  ) {
    if (
      input === '🏃 Уйти'
    ) {
      if (
        rng() < 0.6
      ) {
        return returnToNode(
          deps,
          player,
          state.destinationNodeId,
          '🏃 Удалось уйти от противника.\n\n'
        );
      }

      return {
        reply: {
          text:
            '⚔️ Манёвр не удался.',
          buttons: [
            '⚔️ Атаковать',
            '🏃 Уйти',
          ],
        },
        nextState: {
          scene:
            SCENES.SHIP_PRE_COMBAT,
          player,
          enemy:
            state.enemy,
          destinationNodeId:
            state.destinationNodeId,
          originNodeId:
            state.originNodeId,
        },
      };
    }

    if (
      input ===
        '⚔️ Атаковать'
    ) {
      return {
        reply: {
          text:
            combatFullCard(
              shipToFighter(
                player.ship,
                'Твой корабль'
              ),
              state.enemy
            ),
          buttons: [
            '⚔️ Атаковать',
            '🏃 Уйти',
          ],
        },
        nextState: {
          scene:
            SCENES.SHIP_COMBAT,
          player,
          enemy:
            state.enemy,
          destinationNodeId:
            state.destinationNodeId,
          originNodeId:
            state.originNodeId,
        },
      };
    }
  }

  if (
    state.scene ===
      SCENES.SHIP_COMBAT
  ) {
    if (
      input ===
        '🏃 Уйти'
    ) {
      if (
        rng() < 0.6
      ) {
        return returnToNode(
          deps,
          player,
          state.destinationNodeId,
          '🏃 Удалось уйти.\n\n'
        );
      }

      return {
        reply: {
          text:
            '⚔️ Не удалось оторваться.',
          buttons: [
            '⚔️ Атаковать',
            '🏃 Уйти',
          ],
        },
        nextState: {
          scene:
            SCENES.SHIP_COMBAT,
          player,
          enemy:
            state.enemy,
          destinationNodeId:
            state.destinationNodeId,
          originNodeId:
            state.originNodeId,
        },
      };
    }

    if (
      input !==
        '⚔️ Атаковать'
    ) {
      return {
        reply: {
          text:
            '⚔️ Выбери действие.',
          buttons: [
            '⚔️ Атаковать',
            '🏃 Уйти',
          ],
        },
        nextState: {
          scene:
            SCENES.SHIP_COMBAT,
          player,
          enemy:
            state.enemy,
          destinationNodeId:
            state.destinationNodeId,
          originNodeId:
            state.originNodeId,
        },
      };
    }

    const attacker =
      shipToFighter(
        player.ship,
        'Твой корабль'
      );

    const defender =
      state.enemy;

    if (!defender) {
      return returnToNode(
        deps,
        player,
        state.destinationNodeId,
        '⚠️ Контакт потерян. Курс сохранён.\n\n'
      );
    }

    const turn =
      resolveTurn({
        attacker,
        defender,
        rng,
      });

    applyFighterResultToShip(
      player.ship,
      turn.attacker,
      rng
    );

    if (
      turn.defender.hp <= 0
    ) {
      /*
       * ВАЖНО:
       * победа в космическом бою НЕ
       * завершает рейс.
       *
       * Продолжаем к Node.
       */
      return returnToNode(
        deps,
        player,
        state.destinationNodeId,
        [
          `⚔️ ${turn.log.join(' ')}`,
          '',
          '🏆 Враг уничтожен.',
          '🚀 Курс продолжается.',
          '',
        ].join('\n')
      );
    }

    const enemyTurn =
      resolveTurn({
        attacker: defender,
        defender: attacker,
        rng,
      });

    applyFighterResultToShip(
      player.ship,
      enemyTurn.defender,
      rng
    );

    if (
      enemyTurn.defender.hp <= 0
    ) {
      const lost =
        loseFullCargo(
          player
        );

      player.ship.hp =
        Math.max(
          1,
          Math.round(
            player.ship.hpMax *
            0.2
          )
        );

      return {
        reply: {
          text: [
            `⚔️ ${turn.log.join(' ')}`,
            `${enemyTurn.log.join(' ')}`,
            '',
            '💥 Корабль выведен из строя.',
            '🚑 Эвакуация на ближайшую станцию.',
            lost
              ? '📦 Груз рейса потерян.'
              : '',
          ]
            .filter(Boolean)
            .join('\n'),
          buttons:
            stationButtons(
              deps,
              player
            ),
        },
        nextState: {
          scene:
            SCENES.STATION,
          player,
        },
      };
    }

    return {
      reply: {
        text: [
          ...turn.log,
          ...enemyTurn.log,
          '',
          combatFullCard(
            shipToFighter(
              player.ship,
              'Твой корабль'
            ),
            defender
          ),
        ].join('\n'),
        buttons: [
          '⚔️ Атаковать',
          '🏃 Уйти',
        ],
      },
      nextState: {
        scene:
          SCENES.SHIP_COMBAT,
        player,
        enemy:
          defender,
        destinationNodeId:
          state.destinationNodeId,
        originNodeId:
          state.originNodeId,
      },
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
  currentNodeId: getNodeId,
  HOME_NODE_BY_FACTION,
};
