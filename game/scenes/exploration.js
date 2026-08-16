'use strict';

/**
 * Вылазки: генерация событий (обычных, секторных, динамических,
 * бестиарных) и все связанные с ними сцены — journey (путь), 
 * journey_continue (углубиться/вернуться/эвакуироваться), 
 * exploration_event_choice (ветвящиеся события), anomaly_choice,
 * neutral_encounter, stealth_explore (Архив теней Терминуса).
 */

const {
  rollEvent, rollLoot, ZONE_WEIGHTS, generateEnemy,
  resolveDistressChoice, resolveResonancePedestal, resolveTerminalHack,
  resolveEchoPlayback, resolveFragmentGuardian,
  resolveKailarAnomaly, resolveNeutralEncounter,
  resolveMicroDiscovery, resolveDeepExploration,
  resolveDynamicEvent,
} = require('../../engine/exploration-engine.js');

const {
  addToTripCargo,
  tripCargoUnits,
} = require('../../lib/trip-cargo.js');

const {
  addRadiation,
} = require('../../lib/radiation.js');

const {
  getGuildUpgradeLevel,
} = require('../../guilds/guild-store.js');

const {
  activeGuildBonuses,
} = require('../../guilds/guild-levels.js');

const {
  currentStation,
  stationButtons,
  hubMessage,
} = require('./common.js');

const {
  travelScreen,
} = require('./travel.js');

const {
  SCENES,
} = require('./ids.js');

const {
  imageForEnemy,
  imageForLocation,
  imageForEvent,
} = require('../../lib/image-assets.js');

const {
  applyWorldConsequence,
} = require('../../lib/consequence-engine.js');

const {
  getWorldState,
} = require('../../lib/world-state-store.js');

const {
  addWorldFeedEvent,
} = require('../../lib/world-feed.js');

const {
  addFactionReputation,
} = require('../../lib/faction-store.js');

const {
  addGuildResource,
} = require('../../guilds/guild-store.js');

const {
  grantXp,
} = require('../../engine/leveling.js');

const {
  checkAchievements,
} = require('../../lib/achievements.js');

const {
  combatFullCard,
} = require('../../lib/combat-card.js');

const {
  shipToFighter,
  applyFighterResultToShip,
} = require('../../engine/ship.js');

const {
  resolveTurn,
} = require('../../engine/combat-engine.js');

const {
  logEconomyEvent,
  EVENT_TYPES,
} = require('../../lib/economy-audit.js');

const {
  logWorldEvent,
} = require('../../lib/world-feed.js');

const {
  rollSpaceEvent,
} = require('../../engine/space-events.js');

const {
  addToInventory,
} = require('../../lib/inventory.js');

const {
  getPlayerState,
  savePlayerState,
} = require('../../lib/player-store.js');

const {
  dynamicEventById,
} = require('../../engine/dynamic-events.js');

const {
  getNextFragment,
} = require('../../lore/trakt-fragments.js');

const {
  updateLoreProgress,
} = require('../../lore/lore-store.js');

const {
  getLoreProgress,
} = require('../../lore/lore-store.js');

const {
  getHypothesisState,
} = require('../../lore/hypotheses.js');

const {
  recordDiscovery,
} = require('../../lore/discoveries.js');

const {
  getFaction,
} = require('../../factions/faction-data.js');

const {
  getFactionState,
} = require('../../factions/faction-store.js');

const {
  getGuild,
} = require('../../guilds/guild-store.js');

const {
  guildResourceBalance,
} = require('../../guilds/guild-store.js');

const {
  consumeGuildResource,
} = require('../../guilds/guild-store.js');

const {
  getPlayer,
} = require('../../lib/player-store.js');

const {
  savePlayer,
} = require('../../lib/player-store.js');

const {
  nodeById,
} = require('../../engine/tract-network.js');


function zoneWeights(zone) {
  return ZONE_WEIGHTS[zone] || ZONE_WEIGHTS.yellow;
}


function randomChoice(arr, rng = Math.random) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr[Math.floor(rng() * arr.length)];
}


function normalizeDepth(depth) {
  const value = Number(depth);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}


function explorationImageForZone(zone) {
  if (zone === 'red') return imageForLocation('red_zone');
  if (zone === 'yellow') return imageForLocation('yellow_zone');
  if (zone === 'green') return imageForLocation('green_zone');
  return imageForLocation('planet');
}


function makeExplorationState(
  scene,
  player,
  zone,
  depth,
  extra = {}
) {
  return {
    scene,
    player,
    zone,
    depth: normalizeDepth(depth),
    ...extra,
  };
}


function applyLoot(player, loot) {
  if (!loot) return null;

  const resource = loot.resource || loot.type || loot.name;
  const tier = loot.tier || 'common';
  const qty = Number(loot.qty || loot.quantity || 0);

  if (!resource || qty <= 0) return null;

  addToTripCargo(
    player,
    resource,
    tier,
    qty
  );

  return {
    resource,
    tier,
    qty,
  };
}


function applyCredits(player, credits) {
  const value = Number(credits || 0);
  if (!Number.isFinite(value) || value <= 0) return 0;

  player.credits = (player.credits || 0) + value;
  return value;
}


function applyXpReward(player, xp) {
  const value = Number(xp || 0);
  if (!Number.isFinite(value) || value <= 0) return 0;

  grantXp(player, value);
  return value;
}


function applyReputationReward(player, factionId, amount) {
  const value = Number(amount || 0);
  if (!factionId || !Number.isFinite(value) || value === 0) {
    return;
  }

  addFactionReputation(
    player,
    factionId,
    value
  );
}


function addRadiationSafe(player, amount) {
  const value = Number(amount || 0);
  if (!Number.isFinite(value) || value <= 0) return;

  addRadiation(player, value);
}


async function guildYieldBonusFor(deps, player) {
  if (!player?.guildId) return 0;

  if (deps?.guildStore?.getGuildUpgradeLevel) {
    const level = await deps.guildStore
      .getGuildUpgradeLevel(player.guildId)
      .catch(() => 0);

    return activeGuildBonuses(level)
      .explorationYieldPct || 0;
  }

  if (getGuildUpgradeLevel) {
    const level = await getGuildUpgradeLevel(
      deps,
      player.guildId
    ).catch(() => 0);

    return activeGuildBonuses(level)
      .explorationYieldPct || 0;
  }

  return 0;
}


/**
 * Гильдейский бонус к добыче.
 */
function applyYieldBonus(
  qty,
  guildYieldBonusPct
) {
  if (
    !guildYieldBonusPct ||
    guildYieldBonusPct <= 0
  ) {
    return qty;
  }

  return Math.round(
    qty *
      (1 + guildYieldBonusPct / 100)
  );
}


async function applyExplorationLoot(
  deps,
  player,
  loot
) {
  if (!loot) return null;

  const bonus =
    await guildYieldBonusFor(
      deps,
      player
    );

  const adjustedLoot = {
    ...loot,
    qty: applyYieldBonus(
      Number(loot.qty || 0),
      bonus
    ),
  };

  return applyLoot(
    player,
    adjustedLoot
  );
}


function formatLoot(loot) {
  if (!loot) return '';

  const resource =
    loot.resource ||
    loot.type ||
    loot.name ||
    'ресурс';

  return `📦 ${resource}: +${loot.qty}`;
}


function formatCredits(credits) {
  const value = Number(credits || 0);

  if (!Number.isFinite(value) || value <= 0) {
    return '';
  }

  return `💰 +${value} кредитов`;
}


function formatXp(xp) {
  const value = Number(xp || 0);

  if (!Number.isFinite(value) || value <= 0) {
    return '';
  }

  return `⭐ +${value} XP`;
}


function consequenceText(result) {
  if (!result) return '';

  if (typeof result === 'string') {
    return result;
  }

  if (result.text) return result.text;
  if (result.message) return result.message;

  return '';
}


async function applyDynamicConsequences(
  deps,
  player,
  consequence
) {
  if (!consequence) return null;

  try {
    return await applyWorldConsequence(
      deps,
      player,
      consequence
    );
  } catch (error) {
    console.error(
      'exploration: consequence failed',
      error
    );

    return null;
  }
}


async function explorationHeader(
  deps,
  player,
  zone,
  depth
) {
  const cargo = tripCargoUnits(player);

  const lines = [
    `🔭 ВЫЛАЗКА`,
    '',
    `Зона: ${
      zone === 'red'
        ? '🔴 красная'
        : zone === 'green'
          ? '🟢 зелёная'
          : '🟡 жёлтая'
    }`,
    `Глубина: ${normalizeDepth(depth)}`,
    `📦 Груз рейса: ${cargo} ед.`,
  ];

  if (player.radiation) {
    lines.push(
      `☢️ Радиация: ${player.radiation}`
    );
  }

  return lines.join('\n');
}


function journeyButtons() {
  return [
    '🔎 Продолжить исследование',
    '🚀 Вернуться к кораблю',
  ];
}


function journeyContinueButtons() {
  return [
    '🔎 Углубиться',
    '🚀 Вернуться к кораблю',
    '🏃 Эвакуироваться',
  ];
}


function eventChoiceButtons(options) {
  return options.map(
    (option) =>
      option.label ||
      option.text ||
      option.id
  );
}


async function startJourney(
  deps,
  player,
  zone,
  depth = 0,
  extra = {}
) {
  const normalizedDepth =
    normalizeDepth(depth);

  return {
    reply: {
      text: [
        await explorationHeader(
          deps,
          player,
          zone,
          normalizedDepth
        ),
        '',
        '🛰️ Корабль остаётся на орбите.',
        'Ты начинаешь исследование района.',
      ].join('\n'),
      buttons: journeyButtons(),
      imageKey:
        explorationImageForZone(zone),
    },
    nextState: makeExplorationState(
      SCENES.JOURNEY,
      player,
      zone,
      normalizedDepth,
      extra
    ),
  };
}


function generateJourneyEvent(
  zone,
  depth,
  rng
) {
  const weights = zoneWeights(zone);

  const event =
    rollEvent(
      zone,
      depth,
      rng,
      weights
    );

  return event;
}


async function explore(
  deps,
  player,
  zone,
  depth,
  rng = Math.random
) {
  const event =
    generateJourneyEvent(
      zone,
      depth,
      rng
    );

  if (!event) {
    return {
      reply: {
        text:
          '🔭 Вокруг только пыль, камни и слабые сигналы.\n\n' +
          'Но где-то впереди что-то есть.',
        buttons: journeyContinueButtons(),
        imageKey:
          explorationImageForZone(zone),
      },
      nextState: makeExplorationState(
        SCENES.JOURNEY_CONTINUE,
        player,
        zone,
        depth
      ),
    };
  }

  return resolveExplorationEvent(
    deps,
    player,
    zone,
    depth,
    event,
    rng
  );
}


async function resolveExplorationEvent(
  deps,
  player,
  zone,
  depth,
  event,
  rng = Math.random
) {
  if (!event) {
    return {
      reply: {
        text: '⚠️ Событие не определено.',
        buttons: journeyContinueButtons(),
      },
      nextState: makeExplorationState(
        SCENES.JOURNEY_CONTINUE,
        player,
        zone,
        depth
      ),
    };
  }

  const eventType =
    event.type ||
    event.kind ||
    event.id;

  switch (eventType) {
    case 'empty':
    case 'empty_space':
    case 'quiet':
      return {
        reply: {
          text:
            event.text ||
            '🌫️ Район кажется совершенно пустым.',
          buttons:
            journeyContinueButtons(),
          imageKey:
            explorationImageForZone(zone),
        },
        nextState:
          makeExplorationState(
            SCENES.JOURNEY_CONTINUE,
            player,
            zone,
            depth
          ),
      };

    case 'loot':
    case 'resource':
    case 'cache': {
      const loot =
        await applyExplorationLoot(
          deps,
          player,
          event.loot
        );

      const credits =
        applyCredits(
          player,
          event.credits ||
            event.reward?.credits
        );

      return {
        reply: {
          text: [
            event.text ||
              '📦 Обнаружен тайник.',
            formatLoot(loot),
            formatCredits(
              credits
            ),
            '',
            'Груз помещён в трюм текущего рейса.',
          ]
            .filter(Boolean)
            .join('\n'),
          buttons:
            journeyContinueButtons(),
          imageKey:
            imageForEvent(
              eventType
            ),
        },
        nextState:
          makeExplorationState(
            SCENES.JOURNEY_CONTINUE,
            player,
            zone,
            depth,
            {
              lastEvent: eventType,
            }
          ),
      };
    }

    case 'enemy':
    case 'combat':
    case 'hostile':
    case 'creature': {
      const enemy =
        event.enemy ||
        generateEnemy(
          zone,
          depth,
          rng
        );

      return {
        reply: {
          text:
            event.text ||
            `⚔️ ${enemy.name} выходит из укрытия.`,
          buttons: [
            '⚔️ Атаковать',
            'Отступить',
          ],
          imageKey:
            imageForEnemy(
              enemy.name
            ),
        },
        nextState: {
          scene: 'pre_combat',
          player,
          enemy,
          zone,
          depth,
        },
      };
    }

    case 'distress_signal': {
      const choice =
        resolveDistressChoice(
          event,
          'inspect',
          rng
        );

      return {
        reply: {
          text:
            event.text ||
            '📡 Ты ловишь слабый сигнал бедствия.',
          buttons: [
            'Помочь',
            'Проигнорировать',
            'Исследовать сигнал',
          ],
          imageKey:
            imageForEvent(
              'distress_signal'
            ),
        },
        nextState: {
          scene:
            SCENES.EXPLORATION_EVENT_CHOICE,
          player,
          zone,
          depth,
          event,
          choiceResult: choice,
        },
      };
    }

    case 'anomaly':
    case 'space_anomaly':
    case 'kailar_anomaly': {
      const result =
        resolveKailarAnomaly(
          event,
          player,
          rng
        );

      return {
        reply: {
          text: [
            event.text ||
              '🌀 Пространство вокруг тебя начинает искажаться.',
            consequenceText(
              result
            ),
          ]
            .filter(Boolean)
            .join('\n\n'),
          buttons: [
            'Исследовать',
            'Отойти',
          ],
          imageKey:
            imageForEvent(
              'anomaly'
            ),
        },
        nextState: {
          scene:
            SCENES.ANOMALY_CHOICE,
          player,
          zone,
          depth,
          event,
        },
      };
    }

    case 'resonance_pedestal':
    case 'pedestal': {
      return {
        reply: {
          text:
            event.text ||
            '🗿 Перед тобой стоит древний резонансный пьедестал.',
          buttons: [
            'Активировать',
            'Осмотреть',
            'Отойти',
          ],
          imageKey:
            imageForEvent(
              'resonance_pedestal'
            ),
        },
        nextState: {
          scene:
            SCENES.EXPLORATION_EVENT_CHOICE,
          player,
          zone,
          depth,
          event,
        },
      };
    }

    case 'terminal':
    case 'terminal_hack': {
      return {
        reply: {
          text:
            event.text ||
            '💻 Ты находишь старый терминал.',
          buttons: [
            'Взломать',
            'Осмотреть',
            'Отойти',
          ],
          imageKey:
            imageForEvent(
              'terminal'
            ),
        },
        nextState: {
          scene:
            SCENES.EXPLORATION_EVENT_CHOICE,
          player,
          zone,
          depth,
          event,
        },
      };
    }

    case 'echo':
    case 'echo_playback': {
      return {
        reply: {
          text:
            event.text ||
            '📼 В древнем устройстве сохранился чей-то голос.',
          buttons: [
            'Прослушать',
            'Остановить',
          ],
          imageKey:
            imageForEvent(
              'echo'
            ),
        },
        nextState: {
          scene:
            SCENES.EXPLORATION_EVENT_CHOICE,
          player,
          zone,
          depth,
          event,
        },
      };
    }

    case 'fragment_guardian': {
      const fragment =
        getNextFragment(
          player
        );

      return {
        reply: {
          text: [
            event.text ||
              '👁️ Страж фрагмента появляется из темноты.',
            fragment
              ? `Фрагмент: ${fragment.title || fragment.id}`
              : 'Похоже, здесь уже нечего искать.',
          ].join('\n\n'),
          buttons: fragment
            ? [
                'Исследовать фрагмент',
                'Отойти',
              ]
            : ['Отойти'],
          imageKey:
            imageForEvent(
              'fragment_guardian'
            ),
        },
        nextState: {
          scene:
            SCENES.EXPLORATION_EVENT_CHOICE,
          player,
          zone,
          depth,
          event,
          fragment,
        },
      };
    }

    case 'micro_discovery':
    case 'micro_discovery_event': {
      const result =
        resolveMicroDiscovery(
          event,
          player,
          rng
        );

      return {
        reply: {
          text: [
            event.text ||
              '🔎 Ты замечаешь небольшую деталь, которую легко было пропустить.',
            consequenceText(
              result
            ),
          ]
            .filter(Boolean)
            .join('\n\n'),
          buttons:
            journeyContinueButtons(),
          imageKey:
            imageForEvent(
              'micro_discovery'
            ),
        },
        nextState:
          makeExplorationState(
            SCENES.JOURNEY_CONTINUE,
            player,
            zone,
            depth
          ),
      };
    }

    case 'deep_exploration':
    case 'deep': {
      return {
        reply: {
          text:
            event.text ||
            '🕳️ След ведёт глубже в неизвестную часть района.',
          buttons: [
            'Углубиться',
            'Вернуться к кораблю',
          ],
          imageKey:
            imageForEvent(
              'deep_exploration'
            ),
        },
        nextState: {
          scene:
            SCENES.DEEP_EXPLORATION,
          player,
          zone,
          depth,
          event,
        },
      };
    }

    case 'dynamic_event':
    case 'dynamic': {
      const dynamic =
        dynamicEventById(
          event.eventId ||
            event.id
        );

      return {
        reply: {
          text:
            dynamic?.text ||
            event.text ||
            '📡 В глубине зоны возникает необычное событие.',
          buttons:
            dynamic?.choices
              ? eventChoiceButtons(
                  dynamic.choices
                )
              : journeyContinueButtons(),
          imageKey:
            imageForEvent(
              'dynamic_event'
            ),
        },
        nextState: {
          scene:
            SCENES.EXPLORATION_EVENT_CHOICE,
          player,
          zone,
          depth,
          event,
          dynamic,
        },
      };
    }

    case 'neutral_encounter':
    case 'neutral': {
      return {
        reply: {
          text:
            event.text ||
            '🧭 Ты сталкиваешься с неизвестным путником.',
          buttons: [
            'Поговорить',
            'Наблюдать',
            'Уйти',
          ],
          imageKey:
            imageForEvent(
              'neutral_encounter'
            ),
        },
        nextState: {
          scene:
            SCENES.NEUTRAL_ENCOUNTER,
          player,
          zone,
          depth,
          event,
        },
      };
    }

    default:
      return {
        reply: {
          text:
            event.text ||
            '🔭 Ты обнаруживаешь нечто неизвестное.',
          buttons:
            journeyContinueButtons(),
          imageKey:
            imageForEvent(
              eventType
            ),
        },
        nextState:
          makeExplorationState(
            SCENES.JOURNEY_CONTINUE,
            player,
            zone,
            depth,
            {
              lastEvent: eventType,
            }
          ),
      };
  }
}


async function handleExplorationEventChoice(
  deps,
  state,
  input,
  rng
) {
  const {
    player,
    zone,
    depth,
    event,
    dynamic,
    fragment,
  } = state;

  if (input === 'Отойти') {
    return {
      reply: {
        text:
          '🚶 Ты отходишь от объекта и возвращаешься к маршруту.',
        buttons:
          journeyContinueButtons(),
      },
      nextState:
        makeExplorationState(
          SCENES.JOURNEY_CONTINUE,
          player,
          zone,
          depth
        ),
    };
  }

  if (event?.type === 'distress_signal') {
    const result =
      resolveDistressChoice(
        event,
        input,
        rng
      );

    if (result?.loot) {
      await applyExplorationLoot(
        deps,
        player,
        result.loot
      );
    }

    applyCredits(
      player,
      result?.credits
    );

    applyXpReward(
      player,
      result?.xp
    );

    if (result?.radiation) {
      addRadiationSafe(
        player,
        result.radiation
      );
    }

    return {
      reply: {
        text: [
          result?.text ||
            '📡 Сигнал затихает.',
          formatLoot(
            result?.loot
          ),
          formatCredits(
            result?.credits
          ),
          formatXp(
            result?.xp
          ),
        ]
          .filter(Boolean)
          .join('\n\n'),
        buttons:
          journeyContinueButtons(),
      },
      nextState:
        makeExplorationState(
          SCENES.JOURNEY_CONTINUE,
          player,
          zone,
          depth
        ),
    };
  }

  if (
    event?.type ===
      'resonance_pedestal' &&
    input === 'Активировать'
  ) {
    const result =
      resolveResonancePedestal(
        event,
        player,
        rng
      );

    if (result?.xp) {
      applyXpReward(
        player,
        result.xp
      );
    }

    if (result?.loot) {
      await applyExplorationLoot(
        deps,
        player,
        result.loot
      );
    }

    return {
      reply: {
        text: [
          result?.text ||
            '✨ Пьедестал отвечает на твой сигнал.',
          formatLoot(
            result?.loot
          ),
          formatXp(
            result?.xp
          ),
        ]
          .filter(Boolean)
          .join('\n\n'),
        buttons:
          journeyContinueButtons(),
      },
      nextState:
        makeExplorationState(
          SCENES.JOURNEY_CONTINUE,
          player,
          zone,
          depth
        ),
    };
  }

  if (
    event?.type ===
      'terminal_hack' &&
    input === 'Взломать'
  ) {
    const result =
      resolveTerminalHack(
        event,
        player,
        rng
      );

    if (result?.xp) {
      applyXpReward(
        player,
        result.xp
      );
    }

    if (result?.credits) {
      applyCredits(
        player,
        result.credits
      );
    }

    if (result?.loot) {
      await applyExplorationLoot(
        deps,
        player,
        result.loot
      );
    }

    return {
      reply: {
        text: [
          result?.text ||
            '💻 Ты получаешь доступ к терминалу.',
          formatLoot(
            result?.loot
          ),
          formatCredits(
            result?.credits
          ),
          formatXp(
            result?.xp
          ),
        ]
          .filter(Boolean)
          .join('\n\n'),
        buttons:
          journeyContinueButtons(),
      },
      nextState:
        makeExplorationState(
          SCENES.JOURNEY_CONTINUE,
          player,
          zone,
          depth
        ),
    };
  }

  if (
    event?.type ===
      'echo_playback' &&
    input === 'Прослушать'
  ) {
    const result =
      resolveEchoPlayback(
        event,
        player,
        rng
      );

    if (result?.xp) {
      applyXpReward(
        player,
        result.xp
      );
    }

    if (result?.consequence) {
      await applyDynamicConsequences(
        deps,
        player,
        result.consequence
      );
    }

    return {
      reply: {
        text: [
          result?.text ||
            '📼 Запись заканчивается.',
          formatXp(
            result?.xp
          ),
        ]
          .filter(Boolean)
          .join('\n\n'),
        buttons:
          journeyContinueButtons(),
      },
      nextState:
        makeExplorationState(
          SCENES.JOURNEY_CONTINUE,
          player,
          zone,
          depth
        ),
    };
  }

  if (
    event?.type ===
      'fragment_guardian'
  ) {
    const nextFragment =
      fragment ||
      getNextFragment(
        player
      );

    if (
      input ===
      'Исследовать фрагмент'
    ) {
      if (nextFragment) {
        updateLoreProgress(
          player,
          nextFragment
        );

        recordDiscovery(
          player,
          nextFragment.id
        );

        const result = {
          text:
            `📜 Ты находишь фрагмент: ${nextFragment.title || nextFragment.id}.`,
          xp:
            nextFragment.xp ||
            0,
        };

        applyXpReward(
          player,
          result.xp
        );

        return {
          reply: {
            text: [
              result.text,
              formatXp(
                result.xp
              ),
            ]
              .filter(Boolean)
              .join('\n\n'),
            buttons:
              journeyContinueButtons(),
          },
          nextState:
            makeExplorationState(
              SCENES.JOURNEY_CONTINUE,
              player,
              zone,
              depth
            ),
        };
      }
    }
  }

  if (dynamic) {
    const selected =
      dynamic.choices?.find(
        (choice) =>
          (choice.label ||
            choice.text ||
            choice.id) ===
          input
      );

    if (selected) {
      const result =
        await resolveDynamicEvent(
          dynamic,
          selected,
          player,
          rng
        );

      if (result?.loot) {
        await applyExplorationLoot(
          deps,
          player,
          result.loot
        );
      }

      applyCredits(
        player,
        result?.credits
      );

      applyXpReward(
        player,
        result?.xp
      );

      if (result?.consequence) {
        await applyDynamicConsequences(
          deps,
          player,
          result.consequence
        );
      }

      return {
        reply: {
          text: [
            result?.text ||
              '📡 Событие завершено.',
            formatLoot(
              result?.loot
            ),
            formatCredits(
              result?.credits
            ),
            formatXp(
              result?.xp
            ),
          ]
            .filter(Boolean)
            .join('\n\n'),
          buttons:
            journeyContinueButtons(),
        },
        nextState:
          makeExplorationState(
            SCENES.JOURNEY_CONTINUE,
            player,
            zone,
            depth
          ),
      };
    }
  }

  return {
    reply: {
      text:
        'Выбери действие кнопкой ниже.',
      buttons:
        eventChoiceButtons(
          event?.choices ||
            dynamic?.choices ||
            []
        ).concat(
          ['Отойти']
        ),
    },
    nextState: state,
  };
}


async function handleDeepExploration(
  deps,
  state,
  input,
  rng
) {
  const {
    player,
    zone,
    depth,
    event,
  } = state;

  if (
    input ===
    'Вернуться к кораблю'
  ) {
    return returnFromPlanet(
      deps,
      player,
      '🚀 Ты прекращаешь глубокую разведку и возвращаешься к кораблю.\n\n'
    );
  }

  if (
    input !==
    'Углубиться'
  ) {
    return {
      reply: {
        text:
          'Выбери действие кнопкой ниже.',
        buttons: [
          'Углубиться',
          'Вернуться к кораблю',
        ],
      },
      nextState: state,
    };
  }

  const result =
    resolveDeepExploration(
      event,
      player,
      zone,
      depth,
      rng
    );

  const nextDepth =
    normalizeDepth(
      depth + 1
    );

  if (result?.loot) {
    await applyExplorationLoot(
      deps,
      player,
      result.loot
    );
  }

  applyCredits(
    player,
    result?.credits
  );

  applyXpReward(
    player,
    result?.xp
  );

  if (result?.radiation) {
    addRadiationSafe(
      player,
      result.radiation
    );
  }

  return {
    reply: {
      text: [
        result?.text ||
          '🕳️ Ты углубляешься в неизвестность.',
        formatLoot(
          result?.loot
        ),
        formatCredits(
          result?.credits
        ),
        formatXp(
          result?.xp
        ),
        `Глубина: ${nextDepth}`,
      ]
        .filter(Boolean)
        .join('\n\n'),
      buttons:
        journeyContinueButtons(),
      imageKey:
        imageForEvent(
          'deep_exploration'
        ),
    },
    nextState:
      makeExplorationState(
        SCENES.JOURNEY_CONTINUE,
        player,
        zone,
        nextDepth,
        {
          deepExploration: true,
        }
      ),
  };
}


async function handleAnomalyChoice(
  deps,
  state,
  input,
  rng
) {
  const {
    player,
    zone,
    depth,
    event,
  } = state;

  if (input === 'Отойти') {
    return {
      reply: {
        text:
          '🌀 Ты отступаешь от аномалии.',
        buttons:
          journeyContinueButtons(),
      },
      nextState:
        makeExplorationState(
          SCENES.JOURNEY_CONTINUE,
          player,
          zone,
          depth
        ),
    };
  }

  if (input === 'Исследовать') {
    const result =
      resolveKailarAnomaly(
        event,
        player,
        rng
      );

    if (result?.loot) {
      await applyExplorationLoot(
        deps,
        player,
        result.loot
      );
    }

    applyCredits(
      player,
      result?.credits
    );

    applyXpReward(
      player,
      result?.xp
    );

    if (result?.radiation) {
      addRadiationSafe(
        player,
        result.radiation
      );
    }

    if (result?.consequence) {
      await applyDynamicConsequences(
        deps,
        player,
        result.consequence
      );
    }

    return {
      reply: {
        text: [
          result?.text ||
            '🌀 Аномалия отвечает на твоё присутствие.',
          formatLoot(
            result?.loot
          ),
          formatCredits(
            result?.credits
          ),
          formatXp(
            result?.xp
          ),
        ]
          .filter(Boolean)
          .join('\n\n'),
        buttons:
          journeyContinueButtons(),
      },
      nextState:
        makeExplorationState(
          SCENES.JOURNEY_CONTINUE,
          player,
          zone,
          depth
        ),
    };
  }

  return {
    reply: {
      text:
        'Выбери действие кнопкой ниже.',
      buttons: [
        'Исследовать',
        'Отойти',
      ],
    },
    nextState: state,
  };
}


async function handleNeutralEncounter(
  deps,
  state,
  input,
  rng
) {
  const {
    player,
    zone,
    depth,
    event,
  } = state;

  if (input === 'Уйти') {
    return {
      reply: {
        text:
          '🚶 Ты уходишь, не вмешиваясь.',
        buttons:
          journeyContinueButtons(),
      },
      nextState:
        makeExplorationState(
          SCENES.JOURNEY_CONTINUE,
          player,
          zone,
          depth
        ),
    };
  }

  const result =
    resolveNeutralEncounter(
      event,
      input,
      player,
      rng
    );

  if (result?.loot) {
    await applyExplorationLoot(
      deps,
      player,
      result.loot
    );
  }

  applyCredits(
    player,
    result?.credits
  );

  applyXpReward(
    player,
    result?.xp
  );

  if (result?.consequence) {
    await applyDynamicConsequences(
      deps,
      player,
      result.consequence
    );
  }

  return {
    reply: {
      text: [
        result?.text ||
          '🧭 Встреча заканчивается.',
        formatLoot(
          result?.loot
        ),
        formatCredits(
          result?.credits
        ),
        formatXp(
          result?.xp
        ),
      ]
        .filter(Boolean)
        .join('\n\n'),
      buttons:
        journeyContinueButtons(),
    },
    nextState:
      makeExplorationState(
        SCENES.JOURNEY_CONTINUE,
        player,
        zone,
        depth
      ),
  };
}


async function handleJourney(
  deps,
  state,
  input,
  rng
) {
  if (input === '🚀 Вернуться к кораблю') {
    return returnFromPlanet(
      deps,
      state.player,
      '🚀 Ты возвращаешься к кораблю.\n\n'
    );
  }

  if (
    input ===
    '🔎 Продолжить исследование'
  ) {
    return explore(
      deps,
      state.player,
      state.zone,
      state.depth,
      rng
    );
  }

  return {
    reply: {
      text:
        'Выбери действие кнопкой ниже.',
      buttons:
        journeyButtons(),
    },
    nextState: state,
  };
}


async function handleJourneyContinue(
  deps,
  state,
  input,
  rng
) {
  if (
    input ===
      '🚀 Вернуться к кораблю' ||
    input ===
      '🏃 Эвакуироваться'
  ) {
    return returnFromPlanet(
      deps,
      state.player,
      input === '🏃 Эвакуироваться'
        ? '🏃 Ты эвакуируешься из зоны и возвращаешься к кораблю.\n\n'
        : '🚀 Ты возвращаешься к кораблю.\n\n'
    );
  }

  if (
    input ===
    '🔎 Углубиться'
  ) {
    const nextDepth =
      normalizeDepth(
        state.depth + 1
      );

    return explore(
      deps,
      state.player,
      state.zone,
      nextDepth,
      rng
    );
  }

  return {
    reply: {
      text:
        'Выбери действие кнопкой ниже.',
      buttons:
        journeyContinueButtons(),
    },
    nextState: state,
  };
}


function fighterForPlayer(
  player
) {
  return shipToFighter(
    player.ship,
    player.name ||
      'Игрок'
  );
}


function applyCombatDamageToPlayer(
  player,
  fighter,
  rng
) {
  if (!player.ship) return;

  applyFighterResultToShip(
    player.ship,
    fighter,
    rng
  );
}


async function handlePreCombat(
  deps,
  state,
  input,
  rng
) {
  const {
    player,
    enemy,
    zone,
    depth,
  } = state;

  if (input === 'Отступить') {
    if (rng() < 0.6) {
      return returnFromPlanet(
        deps,
        player,
        '🏃 Ты отступаешь от противника и возвращаешься к кораблю.\n\n'
      );
    }

    return {
      reply: {
        text:
          '🏃 Отступление не удалось. Противник перекрывает путь.',
        buttons: [
          '⚔️ Атаковать',
          'Отступить',
        ],
        imageKey:
          imageForEnemy(
            enemy.name
          ),
      },
      nextState: {
        scene: 'pre_combat',
        player,
        enemy,
        zone,
        depth,
      },
    };
  }

  if (
    input ===
    '⚔️ Атаковать'
  ) {
    const fighter =
      fighterForPlayer(
        player
      );

    return {
      reply: {
        text:
          combatFullCard(
            fighter,
            enemy
          ),
        buttons: [
          '⚔️ Атаковать',
          'Отступить',
        ],
        imageKey:
          imageForEnemy(
            enemy.name
          ),
      },
      nextState: {
        scene: 'combat',
        player,
        enemy,
        zone,
        depth,
      },
    };
  }

  return {
    reply: {
      text:
        'Выбери действие кнопкой ниже.',
      buttons: [
        '⚔️ Атаковать',
        'Отступить',
      ],
      imageKey:
        imageForEnemy(
          enemy.name
        ),
    },
    nextState: state,
  };
}


async function handleCombat(
  deps,
  state,
  input,
  rng
) {
  const {
    player,
    enemy,
    zone,
    depth,
  } = state;

  if (input === 'Отступить') {
    if (rng() < 0.6) {
      return returnFromPlanet(
        deps,
        player,
        '🏃 Ты вырываешься из боя и возвращаешься к кораблю.\n\n'
      );
    }

    return {
      reply: {
        text:
          '🏃 Манёвр не удался.',
        buttons: [
          '⚔️ Атаковать',
          'Отступить',
        ],
        imageKey:
          imageForEnemy(
            enemy.name
          ),
      },
      nextState: state,
    };
  }

  if (
    input !==
    '⚔️ Атаковать'
  ) {
    return {
      reply: {
        text:
          'Выбери действие кнопкой ниже.',
        buttons: [
          '⚔️ Атаковать',
          'Отступить',
        ],
      },
      nextState: state,
    };
  }

  const attacker =
    fighterForPlayer(
      player
    );

  const playerTurn =
    resolveTurn({
      attacker,
      defender: enemy,
      rng,
    });

  applyCombatDamageToPlayer(
    player,
    playerTurn.attacker,
    rng
  );

  if (
    playerTurn.defender.hp <=
    0
  ) {
    const xp =
      Number(
        enemy.reward?.xp ||
        enemy.xp ||
        0
      );

    const credits =
      Number(
        enemy.reward?.credits ||
        enemy.credits ||
        0
      );

    applyXpReward(
      player,
      xp
    );

    applyCredits(
      player,
      credits
    );

    if (
      enemy.loot
    ) {
      await applyExplorationLoot(
        deps,
        player,
        enemy.loot
      );
    }

    const note =
      [
        formatXp(xp),
        formatCredits(
          credits
        ),
      ]
        .filter(Boolean)
        .join('\n');

    return returnFromPlanet(
      deps,
      player,
      `⚔️ ${playerTurn.log.join(' ')}\n\n` +
        `💥 ${enemy.name || 'Противник'} уничтожен.\n\n` +
        `${note ? `${note}\n\n` : ''}` +
        `🚀 Ты возвращаешься к кораблю.`
    );
  }

  const enemyTurn =
    resolveTurn({
      attacker: enemy,
      defender: attacker,
      rng,
    });

  applyCombatDamageToPlayer(
    player,
    enemyTurn.defender,
    rng
  );

  if (
    enemyTurn.defender.hp <=
    0
  ) {
    const result =
      returnFromPlanet(
        deps,
        {
          ...player,
          hp: Math.round(
            player.hpMax *
              0.3
          ),
        },
        `⚡ ${playerTurn.log.join(' ')}\n\n` +
          `${enemyTurn.log.join(' ')}\n\n` +
          `☠️ Слишком сильный удар. ` +
          `Аварийная капсула тянет тебя обратно к кораблю.\n\n`
      );

    return result;
  }

  return {
    reply: {
      text: [
        `⚔️ ${playerTurn.log.join(' ')}`,
        enemyTurn.log.join(' '),
        '',
        combatFullCard(
          shipToFighter(
            player.ship,
            player.name ||
              'Игрок'
          ),
          enemy
        ),
      ].join('\n'),
      buttons: [
        '⚔️ Атаковать',
        'Отступить',
      ],
      imageKey:
        imageForEnemy(
          enemy.name
        ),
    },
    nextState: {
      scene: 'combat',
      player,
      enemy,
      zone,
      depth,
    },
  };
}


/**
 * Возврат с планеты.
 *
 * ВАЖНО:
 * здесь больше не передаётся старый distance как второй аргумент
 * travelScreen().
 *
 * Travel теперь получает актуальные deps, включая tractStore/world
 * dependencies, и сам определяет положение корабля через currentNodeId.
 *
 * pendingShipDistance используется только как маркер того, что игрок
 * действительно находился на планете в рамках текущего рейса.
 */
function returnFromPlanet(
  deps,
  player,
  prefixText = ''
) {
  const cleanPlayer = {
    ...player,
    pendingShipDistance: undefined,
  };

  if (
    !player ||
    player.pendingShipDistance ===
      undefined
  ) {
    return null;
  }

  return travelScreen(
    deps,
    cleanPlayer,
    prefixText
  );
}


async function handleStealthExplore(
  deps,
  state,
  input,
  rng
) {
  if (
    input === '⬅️ Назад'
  ) {
    return {
      reply: {
        text:
          hubMessage(
            state.player
          ),
        buttons:
          stationButtons(
            deps,
            state.player
          ),
        imageKey:
          imageForLocation(
            'station',
            state.player.faction
          ),
      },
      nextState: {
        scene: 'station',
        player:
          state.player,
      },
    };
  }

  const player =
    state.player;

  if (
    input ===
    'Проникнуть'
  ) {
    const success =
      rng() < 0.65;

    if (success) {
      const loot =
        rollLoot(
          'yellow',
          state.depth || 0,
          rng
        );

      await applyExplorationLoot(
        deps,
        player,
        loot
      );

      return {
        reply: {
          text: [
            '🌑 Ты бесшумно проникаешь в Архив теней.',
            'Системы безопасности не успевают тебя заметить.',
            formatLoot(
              loot
            ),
          ]
            .filter(Boolean)
            .join('\n\n'),
          buttons:
            journeyContinueButtons(),
          imageKey:
            imageForLocation(
              'terminus'
            ),
        },
        nextState:
          makeExplorationState(
            SCENES.JOURNEY_CONTINUE,
            player,
            state.zone,
            state.depth
          ),
      };
    }

    return {
      reply: {
        text:
          '🚨 Система безопасности замечает движение.',
        buttons: [
          '⚔️ Атаковать',
          'Отступить',
        ],
        imageKey:
          imageForLocation(
            'terminus'
          ),
      },
      nextState: {
        scene: 'pre_combat',
        player,
        enemy:
          generateEnemy(
            state.zone,
            state.depth,
            rng
          ),
        zone:
          state.zone,
        depth:
          state.depth,
      },
    };
  }

  if (
    input ===
    'Осмотреть'
  ) {
    return {
      reply: {
        text:
          '🌑 Архив теней скрывает данные, которых нет ни в одном официальном реестре.',
        buttons: [
          'Проникнуть',
          '⬅️ Назад',
        ],
        imageKey:
          imageForLocation(
            'terminus'
          ),
      },
      nextState: state,
    };
  }

  return {
    reply: {
      text:
        'Выбери действие кнопкой ниже.',
      buttons: [
        'Проникнуть',
        'Осмотреть',
        '⬅️ Назад',
      ],
    },
    nextState: state,
  };
}


async function handleExploration(
  state,
  input,
  rng,
  deps
) {
  switch (
    state.scene
  ) {
    case SCENES.STEALTH_EXPLORE: {
      return handleStealthExplore(
        deps,
        state,
        input,
        rng
      );
    }

    case SCENES.JOURNEY: {
      return handleJourney(
        deps,
        state,
        input,
        rng
      );
    }

    case SCENES.JOURNEY_CONTINUE: {
      return handleJourneyContinue(
        deps,
        state,
        input,
        rng
      );
    }

    case SCENES.EXPLORATION_EVENT_CHOICE: {
      return handleExplorationEventChoice(
        deps,
        state,
        input,
        rng
      );
    }

    case SCENES.DEEP_EXPLORATION: {
      return handleDeepExploration(
        deps,
        state,
        input,
        rng
      );
    }

    case SCENES.ANOMALY_CHOICE: {
      return handleAnomalyChoice(
        deps,
        state,
        input,
        rng
      );
    }

    case SCENES.NEUTRAL_ENCOUNTER: {
      return handleNeutralEncounter(
        deps,
        state,
        input,
        rng
      );
    }

    case 'pre_combat': {
      return handlePreCombat(
        deps,
        state,
        input,
        rng
      );
    }

    case 'combat': {
      return handleCombat(
        deps,
        state,
        input,
        rng
      );
    }

    default:
      return null;
  }
}


module.exports = {
  handleExploration,
  explore,
  resolveExplorationEvent,
  returnFromPlanet,
};
