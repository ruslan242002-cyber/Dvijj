'use strict';

const {
  NODES,
  ROUTE_VARIANTS,
  availableRoutesFrom,
  nodeById,
} = require('../../engine/tract-network.js');

const {
  findLocationById,
  locationsForZone,
} = require('../../lib/named-locations.js');

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
  hubMessage,
  stationButtons,
  addToInventory,
} = require('./common.js');

const {
  createAmbush,
  pickAmbusher,
  AMBUSH_DURATION_MS,
} = require('../../lib/ambush-registry.js');

const {
  rollTraderOffers,
  buyFromTrader,
} = require('../../engine/trader-encounter.js');

const {
  notifyPlayer,
} = require('../../lib/notifications.js');

const {
  SCENES,
} = require('./ids.js');

const FUEL_BASE_COST = 8;

const HOME_NODE_BY_FACTION = {
  Приют: 'priyut',
  Вуаль: 'vual',
  Терминус: 'terminus',
  Арсенал: 'arsenal',
  Кузница: 'kuznitsa',
};

const CITY_NODE_IDS = new Set([
  'priyut',
  'vual',
  'terminus',
  'arsenal',
  'kuznitsa',
]);

/*
 * ВАЖНО:
 * Тракт и named-locations исторически использовали разные ID.
 * Здесь единый слой соответствия.
 */
const LOCATION_NODE_ALIASES = {
  kovcheg9: 'kovcheg9',
  sputnik_tishiny: 'tishina',
  tishina: 'tishina',
  prichal_pervogo: 'prichal_pervogo',

  razlom_kaylara: 'razlom_kaylara',
  pustosh_tabira: 'pustosh_tabira',

  tanvir: 'perimetr_tanvir',
  perimetr_tanvir: 'perimetr_tanvir',

  yarmarka_tenej: 'yarmarka_tenej',

  nekropol_ksarn: 'nekropol_ksarn',
  bezdna_orrin: 'bezdna_orrin',
  kuznya_zabytyh: 'kuznya_zabytyh',
  kladbische_flota: 'kladbische_flota',
  poligon_arsenala: 'poligon_arsenala',
};

function currentNodeId(player) {
  return (
    player.currentNodeId ||
    HOME_NODE_BY_FACTION[player.faction] ||
    'priyut'
  );
}

function fuelCostForVariant(variant) {
  return Math.round(
    FUEL_BASE_COST * variant.fuelMult
  );
}

function riskEmoji(riskLabel) {
  return riskLabel === 'red'
    ? '🔴'
    : riskLabel === 'yellow'
      ? '🟡'
      : '🟢';
}

/*
 * Не доверяем только node.type.
 *
 * Реальная система именованных планет находится в
 * lib/named-locations.js. Если место существует там —
 * это место высадки, даже если старый узел Тракта
 * случайно помечен city/location неправильно.
 */
function resolveNamedLocation(nodeId) {
  const canonicalId =
    LOCATION_NODE_ALIASES[nodeId] || nodeId;

  return findLocationById(canonicalId);
}

function isCityNode(nodeId) {
  return CITY_NODE_IDS.has(nodeId);
}

function isPlanetaryLocation(nodeId) {
  return Boolean(
    resolveNamedLocation(nodeId)
  );
}

function resolveLocationZone(location) {
  if (!location) {
    return 'yellow';
  }

  for (const [zone, locations] of Object.entries(
    {
      blue: locationsForZone('blue'),
      yellow: locationsForZone('yellow'),
      red: locationsForZone('red'),
    }
  )) {
    if (
      locations.some(
        (item) =>
          item.id === location.id
      )
    ) {
      return zone;
    }
  }

  return 'yellow';
}

/*
 * Вход в существующую систему exploration.
 *
 * Здесь НЕ создаётся новый движок.
 * Вся информация о конкретном месте передаётся
 * внутрь payload, чтобы exploration мог использовать
 * обычную механику вылазок + named-locations.
 */
function buildJourneyState(
  player,
  destinationNodeId
) {
  const location =
    resolveNamedLocation(
      destinationNodeId
    );

  const zone =
    resolveLocationZone(
      location
    );

  return {
    scene:
      SCENES.JOURNEY,

    player,

    /*
     * Сохраняем оба идентификатора:
     * node Тракта и canonical ID места.
     */
    currentNodeId:
      destinationNodeId,

    planetaryNodeId:
      destinationNodeId,

    locationId:
      location
        ? location.id
        : null,

    fromTract: true,

    depth: 0,

    zone,

    /*
     * named-locations уже содержит theme,
     * поэтому exploration не должен угадывать
     * место по названию.
     */
    locationTheme:
      location
        ? location.theme
        : null,

    locationName:
      location
        ? location.name
        : nodeById(
            destinationNodeId
          )?.name ||
          destinationNodeId,

    locationBlurb:
      location
        ? location.blurb
        : null,

    locationDetail:
      location
        ? location.detail
        : null,
  };
}

function destinationState(
  player,
  destinationNodeId
) {
  /*
   * Сначала проверяем настоящие города.
   */
  if (
    isCityNode(
      destinationNodeId
    )
  ) {
    return {
      scene:
        SCENES.STATION,

      player,
    };
  }

  /*
   * Затем реальные именованные места.
   *
   * Это намеренно выше проверки node.type:
   * named-locations — источник правды для высадки.
   */
  if (
    isPlanetaryLocation(
      destinationNodeId
    )
  ) {
    return buildJourneyState(
      player,
      destinationNodeId
    );
  }

  /*
   * Только неизвестный узел считаем
   * обычным станционным прибытием.
   */
  const node =
    nodeById(
      destinationNodeId
    );

  if (
    node?.type ===
    'location'
  ) {
    return buildJourneyState(
      player,
      destinationNodeId
    );
  }

  return {
    scene:
      SCENES.STATION,

    player,
  };
}

async function travelScreen(
  deps,
  player,
  prefixText = ''
) {
  const nodeId =
    currentNodeId(player);

  const node =
    nodeById(nodeId);

  const activeTracts =
    deps.tractStore
      ? await deps.tractStore
          .getActiveTracts()
      : [];

  const routes =
    availableRoutesFrom(
      nodeId,
      activeTracts
    );

  const cargo =
    tripCargoUnits(
      player
    );

  if (!routes.length) {
    return {
      reply: {
        text:
          `${prefixText}📍 ${
            node?.name ||
            nodeId
          }\n` +
          `⛽ Топливо: ${
            player.ship.fuel
          }/${
            player.ship.fuelMax
          }\n` +
          `📦 Несданный груз: ${
            cargo
          } ед.\n\n` +
          `Отсюда сейчас нет доступных маршрутов.`,

        buttons: [
          '⬅️ Назад',
        ],
      },

      nextState: {
        scene:
          SCENES.SHIP_TRAVEL,

        player,
      },
    };
  }

  const byDestination =
    {};

  for (
    const route of routes
  ) {
    if (
      !byDestination[
        route.to
      ]
    ) {
      byDestination[
        route.to
      ] = [];
    }

    byDestination[
      route.to
    ].push(route);
  }

  const lines =
    Object.entries(
      byDestination
    ).map(
      ([
        toId,
        variants,
      ]) => {
        const toNode =
          nodeById(toId);

        const location =
          resolveNamedLocation(
            toId
          );

        const icons =
          variants
            .map(
              (variant) =>
                riskEmoji(
                  variant.riskLabel
                )
            )
            .join('');

        const typeLabel =
          isCityNode(toId)
            ? '🏙️'
            : location
              ? '🪐'
              : '📍';

        return (
          `${typeLabel} ` +
          `${icons} ` +
          `${
            location?.name ||
            toNode?.name ||
            toId
          }`
        );
      }
    );

  const buttons =
    Object.keys(
      byDestination
    ).map(
      (toId) => {
        const location =
          resolveNamedLocation(
            toId
          );

        const node =
          nodeById(toId);

        return (
          `→ ${
            location?.name ||
            node?.name ||
            toId
          }`
        );
      }
    );

  buttons.push(
    '🕳️ Засада',
    '⬅️ Назад'
  );

  return {
    reply: {
      text:
        `${prefixText}📍 ${
          node?.name ||
          nodeId
        }\n` +
        `⛽ Топливо: ${
          player.ship.fuel
        }/${
          player.ship.fuelMax
        }\n` +
        `📦 Несданный груз: ${
          cargo
        } ед.\n\n` +
        `🗺️ Доступные направления:\n` +
        lines.join('\n'),

      buttons,
    },

    nextState: {
      scene:
        SCENES.SHIP_TRAVEL,

      player,

      availableRoutes:
        routes,
    },
  };
}

async function variantPickScreen(
  player,
  routesToDestination,
  destinationName
) {
  const buttons =
    routesToDestination.map(
      (route) => {
        const variant =
          Object.values(
            ROUTE_VARIANTS
          ).find(
            (item) =>
              item.id ===
              route.variant
          );

        if (!variant) {
          return '⚠️ Неизвестный маршрут';
        }

        return (
          `${riskEmoji(
            route.riskLabel
          )} ` +
          `${
            route.variant ===
            'dangerous'
              ? 'Опасный'
              : route.variant ===
                  'safe'
                ? 'Безопасный'
                : 'Обычный'
          } ` +
          `(⛽${
            fuelCostForVariant(
              variant
            )
          })`
        );
      }
    );

  buttons.push(
    '⬅️ Назад'
  );

  return {
    reply: {
      text:
        `Маршрут до «${
          destinationName
        }» — выбери вариант:\n` +
        `🔴 опасный — быстро, PvP разрешён\n` +
        `🟡 обычный — баланс\n` +
        `🟢 безопасный — медленнее, без PvP`,

      buttons,
    },

    nextState: {
      scene:
        SCENES.SHIP_TRAVEL,

      player,

      pendingRoutes:
        routesToDestination,
    },
  };
}

function travelToDestination(
  deps,
  player,
  destinationNodeId,
  prefixText = ''
) {
  player.currentNodeId =
    destinationNodeId;

  const {
    banked,
  } =
    bankTripCargo(
      player
    );

  const node =
    nodeById(
      destinationNodeId
    );

  const location =
    resolveNamedLocation(
      destinationNodeId
    );

  const state =
    destinationState(
      player,
      destinationNodeId
    );

  /*
   * ГОРОД.
   */
  if (
    isCityNode(
      destinationNodeId
    )
  ) {
    return {
      reply: {
        text:
          `${prefixText}` +
          `🛰️ Прибытие на станцию: ${
            node?.name ||
            destinationNodeId
          }.` +
          (
            banked.length
              ? '\n📦 Груз сдан.'
              : ''
          ),

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

  /*
   * ПЛАНЕТА / ИМЕНОВАННОЕ МЕСТО.
   *
   * Никакого handleHub.
   */
  if (location) {
    return {
      reply: {
        text:
          `${prefixText}` +
          `🛰️ Прибытие к локации:\n` +
          `🪐 ${
            location.name
          }\n\n` +
          `${location.blurb}\n\n` +
          `Можно высаживаться.` +
          (
            banked.length
              ? '\n📦 Груз сдан.'
              : ''
          ),

        buttons: [
          '🪐 Высадиться',
          '🚀 Остаться на корабле',
        ],
      },

      nextState: {
        ...state,

        landingReady:
          true,
      },
    };
  }

  /*
   * Неизвестный узел — безопасный fallback.
   * Но НЕ выдаём его за город, если он объявлен
   * location в графе.
   */
  if (
    node?.type ===
    'location'
  ) {
    return {
      reply: {
        text:
          `${prefixText}` +
          `🛰️ Прибытие к неизвестной локации:\n` +
          `📍 ${
            node.name
          }\n\n` +
          `Локация ещё не связана с каталогом именованных мест.`,

        buttons: [
          '🪐 Высадиться',
          '🚀 Остаться на корабле',
        ],
      },

      nextState: {
        ...buildJourneyState(
          player,
          destinationNodeId
        ),

        landingReady:
          true,
      },
    };
  }

  return {
    reply: {
      text:
        `${prefixText}` +
        `🛰️ Прибытие: ${
          node?.name ||
          destinationNodeId
        }.`,
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

async function resolveTransit(
  deps,
  player,
  route,
  rng
) {
  const variant =
    Object.values(
      ROUTE_VARIANTS
    ).find(
      (item) =>
        item.id ===
        route.variant
    );

  if (!variant) {
    return travelScreen(
      deps,
      player,
      '⚠️ Неизвестный вариант Тракта.\n\n'
    );
  }

  const fuelCost =
    fuelCostForVariant(
      variant
    );

  if (
    player.ship.fuel <
    fuelCost
  ) {
    return {
      reply: {
        text:
          '⛽ Не хватает топлива.',

        buttons: [
          '⬅️ Назад',
        ],
      },

      nextState: {
        scene:
          SCENES.SHIP_TRAVEL,

        player,
      },
    };
  }

  player.ship.fuel -=
    fuelCost;

  if (
    variant.pvpAllowed &&
    deps.ambushStore
  ) {
    const activeAmbushes =
      await deps.ambushStore
        .listActiveAmbushes();

    const ambusher =
      pickAmbusher(
        route.to,
        activeAmbushes,
        player.id,
        rng
      );

    if (
      ambusher &&
      ambusher.shipSnapshot
    ) {
      const enemy =
        shipToFighter(
          ambusher.shipSnapshot,
          ambusher.playerName ||
            'Неизвестный корабль'
        );

      return {
        reply: {
          text:
            `⚠️ На подлёте к «${
              resolveNamedLocation(
                route.to
              )?.name ||
              nodeById(
                route.to
              )?.name ||
              route.to
            }» обнаружен вражеский корабль.`,

          buttons: [
            '⚔️ Атаковать',
            '🏃 Уйти',
          ],
        },

        nextState: {
          scene:
            SCENES.SHIP_PRE_COMBAT,

          player,

          destinationNodeId:
            route.to,

          enemy,

          ambusherPlayerId:
            ambusher.playerId,
        },
      };
    }
  }

  let wreckageNote =
    '';

  if (
    deps.wreckageStore
  ) {
    const wreck =
      await deps.wreckageStore
        .claimWreckage(
          route.to
        )
        .catch(
          () => null
        );

    if (wreck) {
      for (
        const item of
        wreck.cargo
      ) {
        addToInventory(
          player,
          item.resource,
          item.tier,
          item.qty
        );
      }

      wreckageNote =
        `📡 Обломки: груз найден.\n\n`;
    }
  }

  const pseudoDistance =
    variant.id ===
    'dangerous'
      ? 8
      : variant.id ===
          'safe'
        ? 2
        : 5;

  const event =
    variant.pvpAllowed
      ? rollSpaceEvent(
          player,
          pseudoDistance,
          rng,
          null
        )
      : {
          type:
            'empty_space',

          text:
            'Безопасный маршрут прошёл спокойно.',
        };

  if (
    event.type ===
    'hostile_ship'
  ) {
    return {
      reply: {
        text:
          `${wreckageNote}${
            event.text
          }`,

        buttons: [
          '⚔️ Атаковать',
          '🏃 Уйти',
        ],
      },

      nextState: {
        scene:
          SCENES.SHIP_PRE_COMBAT,

        player,

        destinationNodeId:
          route.to,

        enemy:
          event.enemy,
      },
    };
  }

  if (
    rng() <
    0.12
  ) {
    const offers =
      rollTraderOffers(
        rng
      );

    return {
      reply: {
        text:
          `${wreckageNote}` +
          `🧑‍🚀 Встречный торговец:\n\n` +
          offers
            .map(
              (offer) =>
                `${offer.resource} T${offer.tier} ×${offer.qty} — 💳${offer.price}`
            )
            .join('\n'),

        buttons: [
          ...offers.map(
            (offer) =>
              `Купить: ${offer.resource} T${offer.tier}`
          ),
          '🚫 Отказаться',
        ],
      },

      nextState: {
        scene:
          SCENES.SHIP_TRADER,

        player,

        destinationNodeId:
          route.to,

        offers,
      },
    };
  }

  if (
    event.type ===
      'derelict_wreck' ||
    event.type ===
      'asteroid_field'
  ) {
    if (
      event.loot?.resource
    ) {
      addToTripCargo(
        player,
        event.loot.resource,
        event.loot.tier,
        event.loot.qty
      );
    }

    if (
      event.loot?.credits
    ) {
      player.credits =
        (
          player.credits ||
          0
        ) +
        event.loot.credits;
    }
  }

  return travelToDestination(
    deps,
    player,
    route.to,
    `${wreckageNote}${
      event.text
        ? `${event.text}\n\n`
        : ''
    }`
  );
}

async function handleTravel(
  state,
  input,
  rng,
  deps,
  playerId
) {
  const player =
    state?.player;

  if (!player) {
    return null;
  }

  if (playerId) {
    player.id =
      playerId;
  }

  /*
   * Высадка.
   */
  if (
    state.landingReady &&
    input ===
      '🪐 Высадиться'
  ) {
    const next =
      buildJourneyState(
        player,
        state.planetaryNodeId ||
          state.currentNodeId
      );

    return {
      reply: {
        text:
          `🪐 Ты высаживаешься на «${
            next.locationName
          }».\n\n` +
          `${
            next.locationDetail ||
            next.locationBlurb ||
            'Поверхность незнакомой локации встречает тебя тишиной.'
          }`,

        buttons: [
          '➡️ Начать исследование',
        ],
      },

      nextState: {
        ...next,

        landingReady:
          false,
      },
    };
  }

  if (
    state.landingReady &&
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
    SCENES.SHIP_TRAVEL
  ) {
    if (
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

      return {
        reply: {
          text:
            hubMessage(
              player
            ),

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

    if (
      state.pendingRoutes
    ) {
      const labels = {
        Опасный:
          'dangerous',
        Обычный:
          'normal',
        Безопасный:
          'safe',
      };

      const match =
        /^(?:🔴|🟡|🟢)\s+(Опасный|Обычный|Безопасный)/u.exec(
          input
        );

      if (!match) {
        return variantPickScreen(
          player,
          state.pendingRoutes,
          ''
        );
      }

      const route =
        state.pendingRoutes.find(
          (item) =>
            item.variant ===
            labels[match[1]]
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

    if (
      input ===
      '🕳️ Засада'
    ) {
      if (
        !deps.ambushStore ||
        !player.id
      ) {
        return travelScreen(
          deps,
          player
        );
      }

      const ambush =
        createAmbush(
          player.id,
          currentNodeId(
            player
          ),
          {
            shipSnapshot:
              {
                ...player.ship,
              },

            playerName:
              player.name,
          }
        );

      await deps.ambushStore
        .addAmbush(
          ambush
        );

      return travelScreen(
        deps,
        player,
        `🕳️ Засада активна ${Math.round(
          AMBUSH_DURATION_MS /
            60000
        )} мин.\n\n`
      );
    }

    const destination =
      input.replace(
        /^→\s+/,
        ''
      );

    const destinationEntry =
      Object.keys(
        state.availableRoutes ||
          []
      ).length
        ? null
        : null;

    const routes =
      state.availableRoutes ||
      [];

    const matchingRoutes =
      routes.filter(
        (route) => {
          const location =
            resolveNamedLocation(
              route.to
            );

          const node =
            nodeById(
              route.to
            );

          return (
            location?.name ===
              destination ||
            node?.name ===
              destination
          );
        }
      );

    if (
      matchingRoutes.length
    ) {
      const name =
        resolveNamedLocation(
          matchingRoutes[0].to
        )?.name ||
        nodeById(
          matchingRoutes[0].to
        )?.name ||
        destination;

      return variantPickScreen(
        player,
        matchingRoutes,
        name
      );
    }

    return travelScreen(
      deps,
      player
    );
  }

  if (
    state.scene ===
    SCENES.SHIP_TRADER
  ) {
    if (
      input ===
      '🚫 Отказаться'
    ) {
      return travelToDestination(
        deps,
        player,
        state.destinationNodeId
      );
    }

    const match =
      /^Купить:\s+(.+)\s+T(\d+)$/u.exec(
        input
      );

    if (match) {
      const result =
        buyFromTrader(
          player,
          state.offers,
          match[1],
          Number(match[2])
        );

      if (
        result.success
      ) {
        addToTripCargo(
          player,
          result.offer.resource,
          result.offer.tier,
          result.offer.qty
        );

        return travelToDestination(
          deps,
          player,
          state.destinationNodeId,
          `Сделка заключена.\n\n`
        );
      }
    }

    return {
      reply: {
        text:
          'Выбери предложение.',

        buttons: [
          ...state.offers.map(
            (offer) =>
              `Купить: ${offer.resource} T${offer.tier}`
          ),
          '🚫 Отказаться',
        ],
      },

      nextState:
        state,
    };
  }

  if (
    state.scene ===
    SCENES.SHIP_PRE_COMBAT
  ) {
    if (
      input ===
      '🏃 Уйти' &&
      rng() <
        0.6
    ) {
      return travelScreen(
        deps,
        player,
        '🏃 Удалось уйти от боя.\n\n'
      );
    }

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

        ambusherPlayerId:
          state.ambusherPlayerId,
      },
    };
  }

  if (
    state.scene ===
    SCENES.SHIP_COMBAT
  ) {
    const attacker =
      shipToFighter(
        player.ship,
        'Твой корабль'
      );

    const defender =
      state.enemy;

    const result =
      resolveTurn({
        attacker,
        defender,
        rng,
        pvpMode:
          Boolean(
            state.ambusherPlayerId
          ),
      });

    applyFighterResultToShip(
      player.ship,
      result.attacker,
      rng
    );

    if (
      result.defender.hp <=
      0
    ) {
      return travelToDestination(
        deps,
        player,
        state.destinationNodeId,
        `⚔️ Бой завершён.\n\n`
      );
    }

    const enemyTurn =
      resolveTurn({
        attacker:
          defender,

        defender:
          attacker,

        rng,

        pvpMode:
          Boolean(
            state.ambusherPlayerId
          ),
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
          text:
            `💥 Корабль потерял бой.\n` +
            `Спасательная капсула доставила тебя на станцию.`,

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
        text:
          `${result.log.join(
            ' '
          )}\n` +
          `${enemyTurn.log.join(
            ' '
          )}\n\n` +
          combatFullCard(
            shipToFighter(
              player.ship,
              'Твой корабль'
            ),
            defender
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
          defender,

        destinationNodeId:
          state.destinationNodeId,

        ambusherPlayerId:
          state.ambusherPlayerId,
      },
    };
  }

  return null;
}

module.exports = {
  handleTravel,
  travelScreen,
  currentNodeId,
  isCityNode,
  isPlanetaryLocation,
  resolveNamedLocation,
  buildJourneyState,
  HOME_NODE_BY_FACTION,
};
