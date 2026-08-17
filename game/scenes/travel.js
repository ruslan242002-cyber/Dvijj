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
  shouldDropWreckage,
} = require('../../lib/wreckage-store.js');

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
  return Math.round(
    FUEL_BASE_COST *
      variant.fuelMult
  );
}

function riskEmoji(riskLabel) {
  return riskLabel === 'red'
    ? '🔴'
    : riskLabel === 'yellow'
      ? '🟡'
      : '🟢';
}

/**
 * Города остаются станциями.
 * Location-узлы Тракта становятся точкой высадки
 * и передают управление существующей системе JOURNEY.
 *
 * Никакой новой системы планетарного исследования здесь нет.
 */
function destinationState(
  player,
  destinationNodeId
) {
  const node =
    nodeById(
      destinationNodeId
    );

  if (
    node?.type ===
    'location'
  ) {
    return {
      scene:
        SCENES.JOURNEY,

      player,

      /*
       * Глубина — состояние текущей вылазки,
       * а не постоянный прогресс игрока.
       */
      depth: 0,

      /*
       * Exploration уже использует zone.
       * У самого графа Трактов zone не задана,
       * поэтому сохраняем существующую зону игрока,
       * если она есть, и только для нового входа
       * используем yellow как нейтральный fallback.
       */
      zone:
        player.explorationZone ||
        player.currentExplorationZone ||
        'yellow',

      currentNodeId:
        destinationNodeId,

      planetaryNodeId:
        destinationNodeId,

      /*
       * Служебный признак: мы пришли сюда
       * именно через Тракт.
       */
      fromTract: true,
    };
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
          `${prefixText}📍 ${node?.name || nodeId}\n` +
          `⛽ Топливо: ${player.ship.fuel}/${player.ship.fuelMax}\n` +
          `📦 Несданный груз: ${cargo} ед.\n\n` +
          `Отсюда сейчас нет ни одного доступного маршрута — ` +
          `Тракт разорван в этой точке. Жди появления временного окна ` +
          `или возвращайся станционным транспортом.`,

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
    byDestination[
      route.to
    ] =
      byDestination[
        route.to
      ] || [];

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

        const icons =
          variants
            .map(
              (variant) =>
                riskEmoji(
                  variant.riskLabel
                )
            )
            .join('');

        const tempNote =
          variants[0]
            .temporary
            ? ` (временный, ~${Math.max(
                0,
                Math.round(
                  (
                    variants[0]
                      .expiresAt -
                    Date.now()
                  ) /
                    60000
                )
              )} мин)`
            : '';

        return (
          `${icons} ` +
          `${toNode?.name || toId}` +
          tempNote
        );
      }
    );

  const buttons =
    Object.keys(
      byDestination
    ).map(
      (toId) =>
        `→ ${
          nodeById(toId)
            ?.name || toId
        }`
    );

  buttons.push(
    '🕳️ Засада',
    '⬅️ Назад'
  );

  return {
    reply: {
      text:
        `${prefixText}📍 ${
          node?.name || nodeId
        }\n` +
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
        `🟢 безопасный — медленно, без PvP`,

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

/**
 * Завершение прибытия.
 *
 * Ключевое изменение:
 *
 * city     → station
 * location → journey
 *
 * Таким образом arrival не теряет связь
 * с планетарной системой.
 */
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

  const state =
    destinationState(
      player,
      destinationNodeId
    );

  if (
    node?.type ===
    'location'
  ) {
    return {
      reply: {
        text:
          `${prefixText}` +
          `🛰️ Прибытие: ${node.name}.\n\n` +
          `🪐 Планета/локация доступна для высадки.\n` +
          `Можно начать вылазку.` +
          (
            banked.length
              ? '\n📦 Груз сдан в трюм.'
              : ''
          ),

        buttons: [
          '🪐 Высадиться',
          '🚀 Остаться на корабле',
        ],
      },

      nextState: {
        ...state,

        /*
         * Отдельно запоминаем, что высадка уже
         * подготовлена. Следующий клик переводит
         * в JOURNEY.
         */
        landingReady: true,
      },
    };
  }

  return {
    reply: {
      text:
        `${prefixText}` +
        `🛰️ Прибытие: ${node?.name || destinationNodeId}.` +
        (
          banked.length
            ? '\n📦 Груз сдан в трюм.'
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
      '⚠️ Маршрут повреждён. Выбран неизвестный вариант Тракта.\n\n'
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
          '⛽ Не хватает топлива на этот маршрут.',

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
              nodeById(route.to)
                ?.name ||
              route.to
            }» наперерез выходит ${
              enemy.name
            } — кто-то реально ждал именно здесь.`,

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

      const items =
        wreck.cargo
          .map(
            (item) =>
              `${item.resource} T${item.tier} ×${item.qty}`
          )
          .join(', ');

      wreckageNote =
        `📡 Обломки чужого корабля — груз ${
          wreck.victimName ||
          'неизвестного'
        }: ${items}.\n\n`;
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
          `🧑‍🚀 Встречный торговец предлагает сделку:\n\n` +
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
    addToTripCargo(
      player,
      event.loot.resource,
      event.loot.tier,
      event.loot.qty
    );

    player.credits =
      (
        player.credits ||
        0
      ) +
      (
        event.loot.credits ||
        0
      );
  }

  return travelToDestination(
    deps,
    player,
    route.to,
    `${wreckageNote}${
      event.text
        ? event.text +
          '\n\n'
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
    state.player;

  if (playerId) {
    player.id =
      playerId;
  }

  /*
   * Высадка — отдельное действие.
   *
   * Мы не запускаем JOURNEY автоматически после
   * прибытия: игрок сначала видит, куда прибыл,
   * и сам выбирает высадку.
   */
  if (
    state.scene ===
      SCENES.JOURNEY &&
    state.landingReady
  ) {
    if (
      input ===
      '🪐 Высадиться'
    ) {
      return {
        reply: {
          text:
            `🪐 Ты высаживаешься на ${
              nodeById(
                state.planetaryNodeId
              )?.name ||
              'поверхность'
            }.\n\n` +
            `Начинается вылазка.`,

          buttons: [
            '➡️ Начать исследование',
          ],
        },

        nextState: {
          scene:
            SCENES.JOURNEY,

          player,

          zone:
            state.zone ||
            'yellow',

          depth: 0,

          currentNodeId:
            state.currentNodeId,

          planetaryNodeId:
            state.planetaryNodeId,

          fromTract:
            true,

          landingReady:
            false,
        },
      };
    }

    if (
      input ===
      '🚀 Остаться на корабле'
    ) {
      return travelScreen(
        deps,
        player
      );
    }
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
      const match =
        /^(?:🔴|🟡|🟢) (Опасный|Обычный|Безопасный)/u.exec(
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

      const wantVariant =
        match[1] ===
        'Опасный'
          ? 'dangerous'
          : match[1] ===
              'Безопасный'
            ? 'safe'
            : 'normal';

      const route =
        state.pendingRoutes.find(
          (item) =>
            item.variant ===
            wantVariant
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
          player,
          '🕳️ Засады сейчас недоступны.\n\n'
        );
      }

      const nodeId =
        currentNodeId(
          player
        );

      const ambush =
        createAmbush(
          player.id,
          nodeId,
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

      const minutes =
        Math.round(
          AMBUSH_DURATION_MS /
            60000
        );

      return travelScreen(
        deps,
        player,
        `🕳️ Глушишь двигатели и уходишь в тень обломков — ` +
          `засада активна ${minutes} мин в этом узле. ` +
          `Кто-то может не заметить тебя вовремя.\n\n`
      );
    }

    const destMatch =
      /^→ (.+)$/.exec(
        input
      );

    if (
      destMatch &&
      state.availableRoutes
    ) {
      const toNode =
        Object.values(
          NODES
        ).find(
          (node) =>
            node.name ===
            destMatch[1]
        );

      if (toNode) {
        const routesToDestination =
          state.availableRoutes.filter(
            (route) =>
              route.to ===
              toNode.id
          );

        if (
          routesToDestination.length
        ) {
          return variantPickScreen(
            player,
            routesToDestination,
            toNode.name
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
      /^Купить: (.+) T(\d+)$/.exec(
        input
      );

    if (match) {
      const [
        ,
        resource,
        tierStr,
      ] = match;

      const res =
        buyFromTrader(
          player,
          state.offers,
          resource,
          Number(tierStr)
        );

      if (res.success) {
        addToTripCargo(
          player,
          res.offer.resource,
          res.offer.tier,
          res.offer.qty
        );

        return travelToDestination(
          deps,
          player,
          state.destinationNodeId,
          `Сделка заключена: ${res.offer.resource} T${res.offer.tier} ×${res.offer.qty}.\n\n`
        );
      }

      return {
        reply: {
          text:
            res.reason ===
            'INSUFFICIENT_CREDITS'
              ? '💳 Не хватает кредитов.'
              : 'Не получилось купить.',

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

    return {
      reply: {
        text:
          'Выбери предложение кнопкой ниже.',

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
      '🏃 Уйти'
    ) {
      const escapeChance =
        0.6;

      if (
        rng() <
        escapeChance
      ) {
        return travelScreen(
          deps,
          player,
          '🏃 Манёвр удался — отрываешься на форсаже.\n\n'
        );
      }
    }

    const buttons =
      [
        '⚔️ Атаковать',
      ];

    const playerFighter =
      shipToFighter(
        player.ship,
        'Твой корабль'
      );

    return {
      reply: {
        text:
          `${combatFullCard(
            playerFighter,
            state.enemy
          )}\n\nВыбери действие:`,

        buttons,
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
    const playerFighter =
      shipToFighter(
        player.ship,
        'Твой корабль'
      );

    const enemyFighter =
      state.enemy;

    /*
     * Реальная сигнатура combat-engine:
     * resolveTurn({ attacker, defender, rng, ... })
     */
    const result =
      resolveTurn({
        attacker:
          playerFighter,

        defender:
          enemyFighter,

        rng,

        pvpMode:
          !!state.ambusherPlayerId,
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
        `⚔️ ${result.log.join(
          ' '
        )}\n\n${
          enemyFighter.name
        } уничтожен. `
      );
    }

    const enemyTurn =
      resolveTurn({
        attacker:
          enemyFighter,

        defender:
          playerFighter,

        rng,

        pvpMode:
          !!state.ambusherPlayerId,
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
      } =
        loseFullCargo(
          player
        );

      player.ship.hp =
        Math.round(
          player.ship.hpMax *
            0.2
        );

      const allLost = [
        ...lostTrip,
        ...lostInventory,
      ];

      const lostNote =
        allLost.length
          ? '\n📦 Груз потерян полностью.'
          : '';

      if (
        state.ambusherPlayerId &&
        allLost.length &&
        deps.wreckageStore
      ) {
        await deps.wreckageStore
          .dropWreckage(
            currentNodeId(
              player
            ),
            allLost,
            player.name
          )
          .catch(
            () => {}
          );

        notifyPlayer(
          deps,
          state.ambusherPlayerId,
          `🕳️ Твоя засада сработала — ` +
            `жертва потеряла груз, он ждёт в том же узле.`
        ).catch(
          () => {}
        );
      }

      return {
        reply: {
          text:
            `⚔️ ${result.log.join(
              ' '
            )} ${
              enemyTurn.log.join(
                ' '
              )
            }\n\n` +
            `💥 Корабль обездвижен. ` +
            `Спасательная капсула тянет тебя на станцию.` +
            lostNote,

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
          `⚔️ ${result.log.join(
            ' '
          )} ${
            enemyTurn.log.join(
              ' '
            )
          }\n\n` +
          combatFullCard(
            shipToFighter(
              player.ship,
              'Твой корабль'
            ),
            enemyFighter
          ),

        buttons: [
          '⚔️ Атаковать',
        ],
      },

      nextState: {
        scene:
          SCENES.SHIP_COMBAT,

        player,

        enemy:
          enemyFighter,

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
  HOME_NODE_BY_FACTION,
};
