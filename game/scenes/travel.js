'use strict';

const {
  NODES,
  ROUTE_VARIANTS,
  availableRoutesFrom,
  nodeById,
  hasRouteBack,
} = require('../../engine/tract-network.js');

const { rollSpaceEvent } = require('../../engine/space-events.js');
const {
  shipToFighter,
  applyFighterResultToShip,
} = require('../../engine/ship.js');
const { resolveTurn } = require('../../engine/combat-engine.js');
const {
  addToTripCargo,
  bankTripCargo,
  loseFullCargo,
  tripCargoUnits,
} = require('../../lib/trip-cargo.js');
const { combatFullCard } = require('../../lib/combat-card.js');
const { hubMessage, stationButtons } = require('./common.js');
const { SCENES } = require('./ids.js');

const FUEL_BASE_COST = 8;

const HOME_NODE_BY_FACTION = {
  'Приют': 'priyut',
  'Вуаль': 'vual',
  'Терминус': 'terminus',
  'Арсенал': 'arsenal',
  'Кузница': 'kuznitsa',
};

function currentNodeId(player) {
  return (
    player.currentNodeId ||
    HOME_NODE_BY_FACTION[player.faction] ||
    'priyut'
  );
}

function fuelCostForVariant(variant) {
  if (!variant) return Infinity;

  return Math.max(
    1,
    Math.round(FUEL_BASE_COST * variant.fuelMult)
  );
}

function riskEmoji(riskLabel) {
  if (riskLabel === 'red') return '🔴';
  if (riskLabel === 'yellow') return '🟡';
  return '🟢';
}

function variantLabel(id) {
  if (id === 'dangerous') return 'Опасный';
  if (id === 'safe') return 'Безопасный';
  return 'Обычный';
}

function routeVariant(variantId) {
  return (
    Object.values(ROUTE_VARIANTS).find(
      (variant) => variant.id === variantId
    ) || null
  );
}

function routeDistance(route) {
  if (route.variant === 'dangerous') return 8;
  if (route.variant === 'safe') return 2;
  return 5;
}

function travelState(player, extra = {}) {
  return {
    scene: SCENES.SHIP_TRAVEL,
    player,
    ...extra,
  };
}

function clearTravelState(player) {
  delete player.travelDestinationNodeId;
  delete player.travelOriginNodeId;
  delete player.pendingShipDistance;
  delete player.availableRoutes;
  delete player.pendingRoutes;
  delete player.locationNodeId;
}

function routeSelectionText(destinationName) {
  return [
    `Маршрут до «${destinationName}» — выбери вариант:`,
    '🔴 опасный — быстро, PvP разрешён',
    '🟡 обычный — баланс',
    '🟢 безопасный — стабильнее, без PvP',
  ].join('\n');
}

async function activeTractsFor(deps) {
  if (
    deps &&
    deps.tractStore &&
    typeof deps.tractStore.getActiveTracts === 'function'
  ) {
    return deps.tractStore.getActiveTracts();
  }

  return [];
}

async function arriveAtNode(
  deps,
  player,
  nodeId,
  prefixText = ''
) {
  const node = nodeById(nodeId);

  if (!node) {
    console.error(
      `travel.js: unknown destinationNodeId=${nodeId}`
    );

    return {
      reply: {
        text: [
          prefixText,
          '⚠️ Навигационная ошибка: точка назначения не распознана.',
          'Корабль остаётся в космосе, груз не банкуется.',
        ].join('\n'),
        buttons: ['🚀 Открыть Тракт'],
      },
      nextState: travelState(player),
    };
  }

  player.currentNodeId = nodeId;

  /*
   * ВАЖНО:
   * pendingShipDistance нельзя очищать здесь для обычного Node.
   *
   * После прибытия в Node игрок может высадиться на планету.
   * exploration.js использует pendingShipDistance при возврате
   * с планеты обратно к кораблю.
   *
   * Очищаем его только при фактическом прибытии в город,
   * где рейс завершён и tripCargo переводится в безопасный склад.
   */

  if (node.type === 'city') {
    player.pendingShipDistance = undefined;

    const { banked } = bankTripCargo(player);

    clearTravelState(player);
    player.currentNodeId = nodeId;

    return {
      reply: {
        text: [
          prefixText,
          `🛰️ Прибытие: ${node.name}.`,
          banked.length
            ? '📦 Груз доставлен в город и помещён в безопасный склад.'
            : '',
        ]
          .filter(Boolean)
          .join('\n'),
        buttons: stationButtons(deps, player),
      },
      nextState: {
        scene: SCENES.STATION,
        player,
      },
    };
  }

  const activeTracts = await activeTractsFor(deps);

  const outbound = availableRoutesFrom(
    nodeId,
    activeTracts
  );

  const canReturn = hasRouteBack(
    nodeId,
    player.travelOriginNodeId,
    activeTracts
  );

  const cargo = tripCargoUnits(player);

  const buttons = [];

  if (outbound.length) {
    buttons.push('🚀 Продолжить полёт');
  }

  buttons.push('🔭 Исследовать');

  if (canReturn) {
    buttons.push('↩️ Вернуться по Тракту');
  }

  const routeNote = outbound.length
    ? 'Можно продолжить рейс или высадиться на локацию.'
    : canReturn
      ? 'Исходящих Трактов сейчас нет. Доступен только путь назад.'
      : 'Исходящих Трактов сейчас нет. Корабль остаётся здесь до появления нового окна Тракта.';

  return {
    reply: {
      text: [
        prefixText,
        `🛰️ Прибытие: ${node.name}.`,
        `📦 Несданный груз: ${cargo} ед.`,
        '',
        routeNote,
      ].join('\n'),
      buttons,
    },
    nextState: travelState(player, {
      availableRoutes: outbound,
      locationNodeId: nodeId,
      travelOriginNodeId: player.travelOriginNodeId,
    }),
  };
}

async function travelScreen(
  depsOrPlayer,
  playerOrDistance,
  prefixText = ''
) {
  /*
   * Совместимость со старым вызовом:
   *
   * travelScreen(player, distance, prefixText)
   *
   * Новый вызов:
   *
   * travelScreen(deps, player, prefixText)
   */
  let deps;
  let player;

  if (
    depsOrPlayer &&
    depsOrPlayer.ship &&
    typeof playerOrDistance === 'number'
  ) {
    deps = {};
    player = depsOrPlayer;
  } else {
    deps = depsOrPlayer || {};
    player = playerOrDistance;
  }

  if (!player || !player.ship) {
    return {
      reply: {
        text: `${prefixText}⚠️ Состояние корабля не найдено.`,
        buttons: ['⬅️ Назад'],
      },
      nextState: {
        scene: SCENES.STATION,
        player,
      },
    };
  }

  const nodeId = currentNodeId(player);
  const node = nodeById(nodeId);

  if (!node) {
    return {
      reply: {
        text: `${prefixText}⚠️ Текущая точка корабля не распознана.`,
        buttons: ['⬅️ Назад'],
      },
      nextState: travelState(player),
    };
  }

  const activeTracts = await activeTractsFor(deps);

  const routes = availableRoutesFrom(
    nodeId,
    activeTracts
  );

  const cargo = tripCargoUnits(player);

  if (!routes.length) {
    const canReturn = hasRouteBack(
      nodeId,
      player.travelOriginNodeId,
      activeTracts
    );

    const buttons = [];

    if (node.type !== 'city') {
      buttons.push('🔭 Исследовать');
    }

    if (canReturn) {
      buttons.push('↩️ Вернуться по Тракту');
    }

    if (!buttons.length) {
      buttons.push('⬅️ Назад');
    }

    const noRouteText =
      node.type === 'city'
        ? 'Отсюда сейчас нет доступных Трактов.'
        : canReturn
          ? 'Отсюда сейчас нет исходящих Трактов. Доступен путь назад.'
          : 'Отсюда сейчас нет исходящих Трактов. Корабль не возвращается автоматически и не теряет прогресс.';

    return {
      reply: {
        text: [
          prefixText,
          `📍 ${node.name}`,
          `⛽ Топливо: ${player.ship.fuel}/${player.ship.fuelMax}`,
          `📦 Несданный груз: ${cargo} ед.`,
          '',
          noRouteText,
        ].join('\n'),
        buttons,
      },
      nextState: travelState(player, {
        availableRoutes: [],
        locationNodeId: nodeId,
      }),
    };
  }

  const byDestination = {};

  for (const route of routes) {
    if (!byDestination[route.to]) {
      byDestination[route.to] = [];
    }

    byDestination[route.to].push(route);
  }

  const lines = Object.entries(byDestination).map(
    ([toId, variants]) => {
      const destination = nodeById(toId);

      const icons = variants
        .map((route) => riskEmoji(route.riskLabel))
        .join('');

      const temporary = variants.find(
        (route) => route.temporary
      );

      const temporaryNote = temporary
        ? ` (временный, ~${Math.max(
            0,
            Math.round(
              (temporary.expiresAt - Date.now()) / 60000
            )
          )} мин)`
        : '';

      return `${icons} ${destination?.name || toId}${temporaryNote}`;
    }
  );

  const buttons = Object.keys(byDestination).map(
    (toId) =>
      `→ ${nodeById(toId)?.name || toId}`
  );

  if (node.type !== 'city') {
    buttons.push('🔭 Исследовать');
  }

  buttons.push('⬅️ Назад');

  return {
    reply: {
      text: [
        prefixText,
        `📍 ${node.name}`,
        `⛽ Топливо: ${player.ship.fuel}/${player.ship.fuelMax}`,
        `📦 Несданный груз: ${cargo} ед.`,
        '',
        '🗺️ Доступные направления:',
        ...lines,
      ].join('\n'),
      buttons,
    },
    nextState: travelState(player, {
      availableRoutes: routes,
      locationNodeId: nodeId,
    }),
  };
}

async function variantPickScreen(
  player,
  routesToDestination,
  destinationName
) {
  const buttons = routesToDestination.map(
    (route) => {
      const variant = routeVariant(route.variant);

      return `${riskEmoji(
        route.riskLabel
      )} ${variantLabel(route.variant)} (⛽${fuelCostForVariant(
        variant
      )})`;
    }
  );

  buttons.push('⬅️ Назад');

  return {
    reply: {
      text: routeSelectionText(
        destinationName
      ),
      buttons,
    },
    nextState: travelState(player, {
      pendingRoutes: routesToDestination,
    }),
  };
}

function safeEventPrefix(event) {
  return event?.text
    ? `${event.text}\n\n`
    : '';
}

async function resolveTransit(
  deps,
  player,
  route,
  rng
) {
  const variant = routeVariant(route.variant);

  if (!variant) {
    return {
      reply: {
        text: '⚠️ Неизвестный вариант маршрута. Полёт не выполнен.',
        buttons: ['⬅️ Назад'],
      },
      nextState: travelState(player),
    };
  }

  const fuelCost =
    fuelCostForVariant(variant);

  if (
    !Number.isFinite(player.ship?.fuel) ||
    player.ship.fuel < fuelCost
  ) {
    return {
      reply: {
        text: '⛽ Не хватает топлива на этот маршрут.',
        buttons: ['⬅️ Назад'],
      },
      nextState: travelState(player),
    };
  }

  const fromNodeId = currentNodeId(player);

  player.ship.fuel -= fuelCost;

  player.travelOriginNodeId =
    fromNodeId;

  player.travelDestinationNodeId =
    route.to;

  player.pendingShipDistance =
    routeDistance(route);

  const event = rollSpaceEvent(
    player,
    player.pendingShipDistance,
    rng,
    null
  );

  if (!event || !event.type) {
    return arriveAtNode(
      deps,
      player,
      route.to
    );
  }

  const isPvpEvent =
    event.type === 'hostile_ship' ||
    event.type === 'ambush_pvp';

  if (
    isPvpEvent &&
    !variant.pvpAllowed
  ) {
    return arriveAtNode(
      deps,
      player,
      route.to,
      '🛡️ Безопасный маршрут прошёл без боя.\n\n'
    );
  }

  if (
    event.type === 'hostile_ship'
  ) {
    return {
      reply: {
        text:
          event.text ||
          '⚔️ Вражеский корабль перехватывает тебя на Тракте.',
        buttons: [
          '⚔️ Атаковать',
          '🏃 Уйти',
        ],
      },
      nextState: {
        scene: SCENES.SHIP_PRE_COMBAT,
        player,
        destinationNodeId:
          route.to,
        originNodeId:
          fromNodeId,
        enemy: event.enemy,
      },
    };
  }

  if (
    event.type === 'ambush_pvp'
  ) {
    return {
      reply: {
        text:
          event.text ||
          '⚠️ В пути обнаружена засада другого пилота.',
        buttons: [
          '⚔️ Атаковать',
          '🏃 Уйти',
        ],
      },
      nextState: {
        scene: SCENES.SHIP_PRE_COMBAT,
        player,
        destinationNodeId:
          route.to,
        originNodeId:
          fromNodeId,
        enemy: event.enemy || null,
        ambusherPlayerId:
          event.ambusherPlayerId,
      },
    };
  }

  if (
    (
      event.type === 'derelict_wreck' ||
      event.type === 'asteroid_field'
    ) &&
    event.loot
  ) {
    addToTripCargo(
      player,
      event.loot.resource,
      event.loot.tier,
      event.loot.qty
    );

    player.credits =
      (player.credits || 0) +
      (event.loot.credits || 0);
  }

  if (
    event.type === 'distress_signal'
  ) {
    player.credits =
      (player.credits || 0) +
      (event.reward?.credits || 0);
  }

  if (
    event.type === 'space_anomaly' ||
    event.type === 'gravity_anomaly'
  ) {
    const drain = Math.max(
      0,
      Number(event.fuelDrain) || 0
    );

    player.ship.fuel = Math.max(
      0,
      player.ship.fuel - drain
    );
  }

  return arriveAtNode(
    deps,
    player,
    route.to,
    safeEventPrefix(event)
  );
}

async function enterExploration(
  deps,
  player,
  nodeId
) {
  const node = nodeById(nodeId);

  if (!node || node.type === 'city') {
    return travelScreen(
      deps,
      player
    );
  }

  player.currentNodeId = nodeId;

  return {
    reply: {
      text: [
        `🔭 Высадка: ${node.name}.`,
        '',
        'Корабль остаётся на орбите.',
        'Ты входишь в зону вылазки.',
      ].join('\n'),
      buttons: [
        'Начать вылазку',
      ],
    },
    nextState: {
      scene: SCENES.JOURNEY,
      player,
      zone:
        node.id === 'razlom_kaylara'
          ? 'red'
          : 'yellow',
      depth: 0,
      shipNodeId: nodeId,
      shipOriginNodeId:
        player.travelOriginNodeId,
    },
  };
}

async function handleTravel(
  state,
  input,
  rng,
  deps,
  playerId
) {
  if (!state || !state.player) {
    return null;
  }

  const player = state.player;

  deps = deps || {};

  if (playerId) {
    player.id = playerId;
  }

  if (
    state.scene ===
    SCENES.SHIP_TRAVEL
  ) {
    if (
      input === '⬅️ Назад'
    ) {
      if (state.pendingRoutes) {
        return travelScreen(
          deps,
          player
        );
      }

      const node = nodeById(
        currentNodeId(player)
      );

      if (node?.type === 'city') {
        return {
          reply: {
            text: hubMessage(player),
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

      return travelScreen(
        deps,
        player
      );
    }

    if (
      input ===
      '🔭 Исследовать'
    ) {
      return enterExploration(
        deps,
        player,
        state.locationNodeId ||
          currentNodeId(player)
      );
    }

    if (
      input ===
      '↩️ Вернуться по Тракту'
    ) {
      const activeTracts =
        await activeTractsFor(
          deps
        );

      const current =
        currentNodeId(player);

      const origin =
        player.travelOriginNodeId;

      const backRoute =
        availableRoutesFrom(
          current,
          activeTracts
        ).find(
          (route) =>
            route.to === origin &&
            route.variant === 'normal'
        );

      if (!backRoute) {
        return travelScreen(
          deps,
          player,
          '⚠️ Обратный Тракт сейчас закрыт.\n\n'
        );
      }

      return resolveTransit(
        deps,
        player,
        backRoute,
        rng
      );
    }

    if (
      input ===
      '🚀 Продолжить полёт'
    ) {
      return travelScreen(
        deps,
        player
      );
    }

    if (state.pendingRoutes) {
      const match =
        /^(?:🔴|🟡|🟢)\s+(Опасный|Обычный|Безопасный)/u.exec(
          input
        );

      if (!match) {
        return variantPickScreen(
          player,
          state.pendingRoutes,
          nodeById(
            state.pendingRoutes[0].to
          )?.name || ''
        );
      }

      const wanted =
        match[1] === 'Опасный'
          ? 'dangerous'
          : match[1] === 'Безопасный'
            ? 'safe'
            : 'normal';

      const route =
        state.pendingRoutes.find(
          (candidate) =>
            candidate.variant ===
            wanted
        );

      if (!route) {
        return variantPickScreen(
          player,
          state.pendingRoutes,
          ''
        );
      }

      return resolveTransit(
        deps,
        player,
        route,
        rng
      );
    }

    const destinationMatch =
      /^→\s+(.+)$/u.exec(
        input
      );

    if (
      destinationMatch &&
      state.availableRoutes
    ) {
      const destination =
        Object.values(NODES).find(
          (node) =>
            node.name ===
            destinationMatch[1]
        );

      if (destination) {
        const routes =
          state.availableRoutes.filter(
            (route) =>
              route.to ===
              destination.id
          );

        if (routes.length) {
          return variantPickScreen(
            player,
            routes,
            destination.name
          );
        }
      }
    }

    return travelScreen(
      deps,
      player
    );
  }

  if (
    state.scene ===
    SCENES.SHIP_PRE_COMBAT
  ) {
    if (
      input === '🏃 Уйти'
    ) {
      if (rng() < 0.6) {
        return travelScreen(
          deps,
          player,
          '🏃 Манёвр удался — корабль отрывается от противника.\n\n'
        );
      }

      return {
        reply: {
          text: '🏃 Манёвр не удался. Противник остаётся на хвосте.',
          buttons: ['⚔️ Атаковать'],
        },
        nextState: {
          scene:
            SCENES.SHIP_COMBAT,
          player,
          enemy: state.enemy,
          destinationNodeId:
            state.destinationNodeId,
          originNodeId:
            state.originNodeId,
        },
      };
    }

    if (
      input === '⚔️ Атаковать'
    ) {
      const fighter =
        shipToFighter(
          player.ship,
          'Твой корабль'
        );

      return {
        reply: {
          text:
            combatFullCard(
              fighter,
              state.enemy
            ),
          buttons: [
            '⚔️ Атаковать',
          ],
        },
        nextState: {
          scene:
            SCENES.SHIP_COMBAT,
          player,
          enemy: state.enemy,
          destinationNodeId:
            state.destinationNodeId,
          originNodeId:
            state.originNodeId,
        },
      };
    }

    return {
      reply: {
        text:
          state.enemy?.name
            ? `⚔️ ${state.enemy.name} перехватил твой корабль.`
            : '⚔️ Вражеский корабль блокирует маршрут.',
        buttons: [
          '⚔️ Атаковать',
          '🏃 Уйти',
        ],
      },
      nextState: {
        scene:
          SCENES.SHIP_PRE_COMBAT,
        player,
        enemy: state.enemy,
        destinationNodeId:
          state.destinationNodeId,
        originNodeId:
          state.originNodeId,
      },
    };
  }

  if (
    state.scene ===
    SCENES.SHIP_COMBAT
  ) {
    if (
      input !== '⚔️ Атаковать'
    ) {
      return {
        reply: {
          text: '⚔️ Выбери действие.',
          buttons: [
            '⚔️ Атаковать',
          ],
        },
        nextState: {
          scene:
            SCENES.SHIP_COMBAT,
          player,
          enemy: state.enemy,
          destinationNodeId:
            state.destinationNodeId,
          originNodeId:
            state.originNodeId,
        },
      };
    }

    if (!state.enemy) {
      return travelScreen(
        deps,
        player,
        '⚠️ Контакт противника потерян. Курс сохранён.\n\n'
      );
    }

    const attacker =
      shipToFighter(
        player.ship,
        'Твой корабль'
      );

    const defender =
      state.enemy;

    const playerTurn =
      resolveTurn({
        attacker,
        defender,
        rng,
      });

    applyFighterResultToShip(
      player.ship,
      playerTurn.attacker,
      rng
    );

    if (
      playerTurn.defender.hp <=
      0
    ) {
      return arriveAtNode(
        deps,
        player,
        state.destinationNodeId,
        [
          `⚔️ ${playerTurn.log.join(' ')}`,
          '',
          `${defender.name || 'Противник'} уничтожен.`,
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
      enemyTurn.defender.hp <=
      0
    ) {
      const {
        lostTrip,
        lostInventory,
      } = loseFullCargo(
        player
      );

      player.ship.hp =
        Math.max(
          1,
          Math.round(
            player.ship.hpMax * 0.2
          )
        );

      const lost =
        lostTrip.length +
        lostInventory.length;

      return {
        reply: {
          text: [
            `⚔️ ${playerTurn.log.join(' ')}`,
            `${enemyTurn.log.join(' ')}`,
            '',
            '💥 Корабль обездвижен.',
            'Спасательная капсула доставляет тебя на станцию.',
            lost
              ? '📦 Груз потерян полностью.'
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
          `⚔️ ${playerTurn.log.join(' ')}`,
          `${enemyTurn.log.join(' ')}`,
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
        ],
      },
      nextState: {
        scene:
          SCENES.SHIP_COMBAT,
        player,
        enemy: defender,
        destinationNodeId:
          state.destinationNodeId,
        originNodeId:
          state.originNodeId,
      },
    };
  }

  if (
    state.scene ===
    SCENES.SHIP_RETURNING
  ) {
    player.currentNodeId =
      state.shipNodeId ||
      player.currentNodeId ||
      state.locationNodeId ||
      currentNodeId(player);

    delete player.pendingShipDistance;

    return travelScreen(
      deps,
      player,
      '🚀 Корабль снова под контролем. Груз всё ещё находится в трюме рейса.\n\n'
    );
  }

  if (
    state.scene ===
    SCENES.SHIP_TRADER
  ) {
    return travelScreen(
      deps,
      player
    );
  }

  return null;
}

module.exports = {
  handleTravel,
  travelScreen,
  currentNodeId,
  HOME_NODE_BY_FACTION,
};
