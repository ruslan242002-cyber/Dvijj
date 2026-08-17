'use strict';

const {
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
  startJourney,
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
 * Старые ID Тракта и canonical ID named-locations.
 * Не создаём новый справочник локаций — только связываем
 * уже существующие системы.
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
  if (riskLabel === 'red') return '🔴';
  if (riskLabel === 'yellow') return '🟡';
  return '🟢';
}

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

  for (const zone of [
    'blue',
    'yellow',
    'red',
  ]) {
    const locations =
      locationsForZone(zone);

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
 * ВАЖНО:
 * Это НЕ готовое состояние для exploration.
 * Это описание места, из которого после подтверждения
 * высадки создаётся нормальный JOURNEY через startJourney().
 */
function buildJourneyContext(
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
    player,
    currentNodeId:
      destinationNodeId,
    planetaryNodeId:
      destinationNodeId,
    locationId:
      location?.id || null,
    locationTheme:
      location?.theme || null,
    locationName:
      location?.name ||
      nodeById(destinationNodeId)?.name ||
      destinationNodeId,
    locationBlurb:
      location?.blurb || null,
    locationDetail:
      location?.detail || null,
    zone,
  };
}

/*
 * Создаёт именно тот JOURNEY, который принимает
 * exploration.js:
 *
 * scene
 * player
 * kind
 * payload
 * stepsLeft
 *
 * startJourney уже является существующим общим
 * механизмом common.js, поэтому второй генератор
 * путешествия здесь не создаём.
 */
function startPlanetExploration(
  player,
  destinationNodeId,
  rng
) {
  const context =
    buildJourneyContext(
      player,
      destinationNodeId
    );

  const journey =
    startJourney(
      player,
      'explore',
      {
        zone:
          context.zone,

        depth: 0,

        locationId:
          context.locationId,

        locationNodeId:
          destinationNodeId,

        locationTheme:
          context.locationTheme,

        locationName:
          context.locationName,
      },
      rng
    );

  return {
    ...journey,

    nextState: {
      ...journey.nextState,

      /*
       * Эти поля не используются самим
       * exploration-engine, но позволяют сохранить
       * конкретное место высадки между шагами.
       */
      currentNodeId:
        destinationNodeId,

      planetaryNodeId:
        destinationNodeId,

      locationId:
        context.locationId,

      locationTheme:
        context.locationTheme,

      locationName:
        context.locationName,

      locationBlurb:
        context.locationBlurb,

      locationDetail:
        context.locationDetail,

      fromTract: true,

      pendingShipDistance:
        destinationNodeId,
    },
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
    tripCargoUnits(player);

  if (!routes.length) {
    return {
      reply: {
        text:
          `${prefixText}` +
          `📍 ${node?.name || nodeId}\n` +
          `⛽ Топливо: ${player.ship.fuel}/${player.ship.fuelMax}\n` +
          `📦 Несданный груз: ${cargo} ед.\n\n` +
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

  const byDestination = {};

  for (const route of routes) {
    if (!byDestination[route.to]) {
      byDestination[route.to] = [];
    }

    byDestination[route.to].push(
      route
    );
  }

  const lines =
    Object.entries(
      byDestination
    ).map(
      ([toId, variants]) => {
        const toNode =
          nodeById(toId);

        const location =
          resolveNamedLocation(toId);

        const icons =
          variants
            .map((variant) =>
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
          `${typeLabel} ${icons} ` +
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
    ).map((toId) => {
      const location =
        resolveNamedLocation(toId);

      const node =
        nodeById(toId);

      return (
        `→ ${
          location?.name ||
          node?.name ||
          toId
        }`
      );
    });

  buttons.push(
    '🕳️ Засада',
    '⬅️ Назад'
  );

  return {
    reply: {
      text:
        `${prefixText}` +
        `📍 ${node?.name || nodeId}\n` +
        `⛽ Топливо: ${player.ship.fuel}/${player.ship.fuelMax}\n` +
        `📦 Несданный груз: ${cargo} ед.\n\n` +
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

function variantPickScreen(
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

        const label =
          route.variant ===
          'dangerous'
            ? 'Опасный'
            : route.variant ===
                'safe'
              ? 'Безопасный'
              : 'Обычный';

        return (
          `${riskEmoji(
            route.riskLabel
          )} ${label} ` +
          `(⛽${fuelCostForVariant(
            variant
          )})`
        );
      }
    );

  buttons.push(
    '⬅️ Назад'
  );

  return {
    reply: {
      text:
        `Маршрут до «${destinationName}» — выбери вариант:\n` +
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

  const { banked } =
    bankTripCargo(player);

  const node =
    nodeById(destinationNodeId);

  const location =
    resolveNamedLocation(
      destinationNodeId
    );

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

  if (location) {
    const context =
      buildJourneyContext(
        player,
        destinationNodeId
      );

    return {
      reply: {
        text:
          `${prefixText}` +
          `🛰️ Прибытие к локации:\n` +
          `🪐 ${location.name}\n\n` +
          `${location.blurb || ''}\n\n` +
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
        scene:
          SCENES.SHIP_TRAVEL,

        player,

        currentNodeId:
          destinationNodeId,

        planetaryNodeId:
          destinationNodeId,

        locationId:
          context.locationId,

        locationTheme:
          context.locationTheme,

        locationName:
          context.locationName,

        locationBlurb:
          context.locationBlurb,

        locationDetail:
          context.locationDetail,

        zone:
          context.zone,

        landingReady:
          true,

        pendingShipDistance:
          destinationNodeId,
      },
    };
  }

  if (
    node?.type ===
    'location'
  ) {
    return {
      reply: {
        text:
          `${prefixText}` +
          `🛰️ Прибытие к локации:\n` +
          `📍 ${node.name}\n\n` +
          `Локация ещё не связана с каталогом именованных мест.`,

        buttons: [
          '🪐 Высадиться',
          '🚀 Остаться на корабле',
        ],
      },

      nextState: {
        scene:
          SCENES.SHIP_TRAVEL,

        player,

        currentNodeId:
          destinationNodeId,

        planetaryNodeId:
          destinationNodeId,

        landingReady:
          true,

        pendingShipDistance:
          destinationNodeId,
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

  let wreckageNote = '';

  if (deps.wreckageStore) {
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
        wreck.cargo || []
      ) {
        addToInventory(
          player,
          item.resource,
          item.tier,
          item.qty
        );
      }

      wreckageNote =
        '📡 Обломки: груз найден.\n\n';
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
          `${wreckageNote}${event.text}`,

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

  if (rng() < 0.12) {
    const offers =
      rollTraderOffers(rng);

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
        (player.credits || 0) +
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
   * Игрок подтверждает высадку.
   *
   * ВАЖНО: после этого мы НЕ оставляем state.scene=JOURNEY
   * вручную. Сначала показываем подтверждение высадки,
   * а JOURNEY создаётся только кнопкой «Начать исследование».
   */
  if (
    state.landingReady &&
    input ===
      '🪐 Высадиться'
  ) {
    const context =
      buildJourneyContext(
        player,
        state.planetaryNodeId ||
          state.currentNodeId
      );

    return {
      reply: {
        text:
          `🪐 Ты высаживаешься на «${context.locationName}».\n\n` +
          `${
            context.locationDetail ||
            context.locationBlurb ||
            'Поверхность незнакомой локации встречает тебя тишиной.'
          }`,

        buttons: [
          '➡️ Начать исследование',
        ],
      },

      nextState: {
        scene:
          SCENES.SHIP_TRAVEL,

        player,

        currentNodeId:
          state.currentNodeId,

        planetaryNodeId:
          state.planetaryNodeId,

        locationId:
          context.locationId,

        locationTheme:
          context.locationTheme,

        locationName:
          context.locationName,

        locationBlurb:
          context.locationBlurb,

        locationDetail:
          context.locationDetail,

        zone:
          context.zone,

        landingReady:
          false,

        landed:
          true,

        pendingShipDistance:
          state.pendingShipDistance ||
          state.planetaryNodeId ||
          state.currentNodeId,
      },
    };
  }

  /*
   * Теперь начинается настоящая вылазка.
   *
   * Здесь используется существующий startJourney()
   * из common.js. Именно он формирует корректный:
   *
   * scene: journey
   * kind: explore
   * payload
   * stepsLeft
   */
  if (
    state.landed &&
    input ===
      '➡️ Начать исследование'
  ) {
    return startPlanetExploration(
      player,
      state.planetaryNodeId ||
        state.currentNodeId,
      rng
    );
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
            hubMessage(player),

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
          currentNodeId(player),
          {
            shipSnapshot: {
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
          AMBUSH_DURATION_MS / 60000
        )} мин.\n\n`
      );
    }

    const destination =
      input.replace(
        /^→\s+/,
        ''
      );

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
            nodeById(route.to);

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
          'Сделка заключена.\n\n'
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
      rng() < 0.6
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
        '⚔️ Бой завершён.\n\n'
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
          `${result.log.join(' ')}\n` +
          `${enemyTurn.log.join(' ')}\n\n` +
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
  buildJourneyContext,
  startPlanetExploration,
  HOME_NODE_BY_FACTION,
};
