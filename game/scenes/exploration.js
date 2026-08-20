'use strict';

/**
 * Вылазки: генерация событий (обычных, секторных, динамических,
 * бестиарных) и все связанные с ними сцены.
 *
 * ВАЖНО:
 * Этот файл использует существующие exploration-engine,
 * anomaly-puzzles, artifacts, lore, combat и travel.
 * Нового параллельного движка здесь нет.
 */

const {
  rollEvent,
  rollLoot,
  ZONE_WEIGHTS,
  generateEnemy,
  resolveDistressChoice,
  resolveResonancePedestal,
  resolveTerminalHack,
  resolveEchoPlayback,
  resolveReactionHazard,
  resolveCorruptedAi,
} = require('../../engine/exploration-engine.js');

const TICK_RADIATION_GAIN = 2;

const EXPLORATION_XP_BY_ZONE = {
  blue: 5,
  yellow: 10,
  red: 15,
};

const {
  rollNamedEncounter,
  buildBestiaryFighter,
  BESTIARY,
} = require('../../engine/bestiary.js');

const {
  rollEventWithDepth,
} = require('../../engine/deep-exploration.js');

const {
  rollMicroDiscovery,
} = require('../../lib/micro-discovery.js');

const {
  resolvePackRound,
  packStatusText,
} = require('../../engine/pack-combat.js');

const {
  grantXp,
} = require('../../engine/leveling.js');

const {
  travelScreen,
} = require('./travel.js');

const {
  applyThemeWeightBias,
} = require('../../lib/named-locations.js');

const {
  attemptEvacuation,
} = require('../../engine/evacuation.js');

const {
  getEvacChanceBonus,
  getRadiationDiscount,
} = require('../../lib/housing.js');

const {
  pickAnomalyPuzzle,
  resolvePuzzleAttempt,
} = require('../../lib/anomaly-puzzles.js');

const {
  pickRandomArtifact,
} = require('../../lib/artifacts.js');

const {
  addFactionReputation,
} = require('../../engine/reputation.js');

const {
  rollFactionExclusiveResource,
} = require('../../engine/faction-resources.js');

const {
  activeGuildBonuses,
} = require('../../guilds/guild-levels.js');

const {
  getActiveGuildProjectEffects,
} = require('../../guilds/guild-projects.js');

const {
  discoverHypothesis,
} = require('../../lore/trakt-mythos.js');

const {
  applyConsequence,
} = require('../../choices/consequence-engine.js');

const {
  checkContractProgress,
} = require('../../contracts/contracts-engine.js');

const {
  imageForEnemy,
} = require('../enemy-images.js');

const {
  imageForLocation,
} = require('../location-images.js');

const {
  hubMessage,
  stationButtons,
  addToInventory,
  startJourney,
  buildGuardianEnemy,
  journeyContinueButtons,
  safeReturnChoice,
  stormRewardMult,
  ZONE_TRAVEL_PHRASES,
  STATION_TRAVEL_PHRASES,
  CURATORS,
  skillButtons,
  skillIdByName,
  skillCooldownNote,
  currentStation,
} = require('./common.js');

const {
  SKILLS,
} = require('../../engine/skills-data.js');

const {
  startCooldown,
  tickCooldowns,
} = require('../../engine/cooldowns.js');

const {
  combatPackCard,
} = require('../../lib/combat-card.js');

const {
  SCENES,
} = require('./ids.js');

/**
 * choices/consequence-engine.js работает со state.player.
 */
async function applyConsequenceToPlayer(
  deps,
  player,
  consequenceId
) {
  const currentWorldState =
    deps.worldStateStore
      ? await deps.worldStateStore.getWorldState()
      : {};

  const proxyState = {
    player,
    flags: player.flags || {},
    quests: {
      locked: player.questLocks || [],
      unlockedEndings:
        player.unlockedEndings || [],
    },
    worldState: currentWorldState,
    factionStanding:
      player.factionStanding || {},
  };

  try {
    applyConsequence(
      proxyState,
      consequenceId
    );
  } catch (err) {
    console.error(
      `applyConsequenceToPlayer('${consequenceId}') упал:`,
      err.message
    );
    return false;
  }

  player.flags =
    proxyState.flags;

  player.questLocks =
    proxyState.quests.locked;

  player.unlockedEndings =
    proxyState.quests.unlockedEndings;

  player.factionStanding =
    proxyState.factionStanding;

  if (deps.worldStateStore) {
    await deps.worldStateStore
      .applyWorldChange(
        proxyState.worldState
      )
      .catch((err) => {
        console.error(
          'не удалось сохранить глобальное состояние мира:',
          err.message
        );
      });
  }

  return true;
}

/**
 * Возвращение именно к кораблю.
 *
 * Город не является промежуточной точкой.
 */
function returnFromPlanet(
  deps,
  player,
  prefixText = ''
) {
  const distance =
    player.pendingShipDistance;

  if (distance === undefined) {
    return null;
  }

  const cleanPlayer = {
    ...player,
    currentNodeId: distance,
    pendingShipDistance:
      undefined,
  };

  return travelScreen(
    deps,
    cleanPlayer,
    prefixText
  );
}

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
      (1 +
        guildYieldBonusPct /
          100)
  );
}

async function guildYieldBonusFor(
  deps,
  player
) {
  if (
    !player.guildId ||
    !deps.guildStore
  ) {
    return 0;
  }

  const guildLevel =
    await deps.guildStore
      .getGuildUpgradeLevel(
        player.guildId
      );

  return activeGuildBonuses(
    guildLevel
  ).explorationYieldPct;
}

async function guildRareDiscoveryBonusFor(
  deps,
  player
) {
  if (
    !player.guildId ||
    !deps.guildStore
  ) {
    return 0;
  }

  const effects =
    await getActiveGuildProjectEffects(
      deps,
      player.guildId
    );

  return (
    effects?.rareDiscoveryBonusPct ||
    0
  );
}

function withExclusiveResourceBonus(
  result,
  player,
  rng,
  bonusPct = 0
) {
  if (
    !result ||
    !bonusPct ||
    rng() * 100 > bonusPct
  ) {
    return result;
  }

  if (result.reply?.text) {
    result.reply.text +=
      '\n\n🏛️ Гильдейский проект помог найти редкий фракционный ресурс.';
  }

  return result;
}

function withMicroDiscovery(
  result,
  rng
) {
  if (
    !result ||
    rng() > 0.22
  ) {
    return result;
  }

  const discovery =
    rollMicroDiscovery(rng);

  if (!discovery) {
    return result;
  }

  result.nextState = {
    ...(result.nextState || {}),
    microDiscovery:
      discovery,
  };

  if (result.reply?.text) {
    result.reply.text +=
      `\n\n🔎 ${discovery.text}`;
  }

  if (
    result.reply?.buttons &&
    !result.reply.buttons.includes(
      `Изучить: ${discovery.name}`
    )
  ) {
    result.reply.buttons = [
      `Изучить: ${discovery.name}`,
      ...result.reply.buttons,
    ];
  }

  return result;
}

const ZONE_LABEL = {
  blue: 'Синяя зона',
  yellow: 'Жёлтая зона',
  red: 'Красная зона',
};

const ZONE_DEPTH_LIMITS = {
  blue: 4,
  yellow: 7,
  red: 10,
};

/**
 * Общий экран для всех интерактивных событий,
 * уже существующих в exploration-engine.
 */
function interactiveEventState(
  event,
  player,
  zone,
  depth
) {
  if (
    event.type ===
    'resonance_pedestal'
  ) {
    return {
      scene:
        SCENES.RESONANCE_PEDESTAL_CHOICE,
      player,
      zone,
      depth,
      event,
    };
  }

  if (
    event.type ===
    'terminal_hack'
  ) {
    return {
      scene:
        SCENES.TERMINAL_HACK_CHOICE,
      player,
      zone,
      depth,
      event,
    };
  }

  if (
    event.type ===
    'echo_playback'
  ) {
    return {
      scene:
        SCENES.ECHO_PLAYBACK_CHOICE,
      player,
      zone,
      depth,
      event,
    };
  }

  if (
    event.type ===
    'reaction_hazard'
  ) {
    return {
      scene:
        SCENES.REACTION_HAZARD_CHOICE,
      player,
      zone,
      depth,
      event,
    };
  }

  if (
    event.type ===
    'corrupted_ai'
  ) {
    return {
      scene:
        SCENES.CORRUPTED_AI_CHOICE,
      player,
      zone,
      depth,
      event,
    };
  }

  if (
    event.type ===
    'distress'
  ) {
    return {
      scene:
        SCENES.DISTRESS_CHOICE,
      player,
      zone,
      depth,
      event,
    };
  }

  if (
    event.type ===
    'anomaly'
  ) {
    const puzzle =
      pickAnomalyPuzzle();

    return {
      scene:
        SCENES.ANOMALY_PUZZLE,
      player,
      zone,
      depth,
      event,
      puzzle,
    };
  }

  return null;
}

/**
 * Разбор результата интерактивного события.
 */
async function resolveInteractiveOutcome(
  deps,
  player,
  zone,
  depth,
  result,
  rng
) {
  if (!result) {
    return {
      reply: {
        text:
          'Событие не удалось обработать.',
        buttons:
          journeyContinueButtons(
            zone,
            false
          ),
      },
      nextState: {
        scene:
          SCENES.JOURNEY_CONTINUE,
        player,
        zone,
        depth,
      },
    };
  }

  if (
    result.outcome ===
      'ambush' ||
    result.outcome ===
      'fail_alarm' ||
    result.outcome ===
      'ambushed'
  ) {
    return {
      reply: {
        text:
          result.text ||
          '⚔️ Событие переросло в бой.',
        buttons: [
          '⚔️ Атаковать',
          'Отступить',
        ],
        imageKey:
          result.enemy
            ? imageForEnemy(
                result.enemy.name
              )
            : undefined,
      },
      nextState: {
        scene:
          SCENES.PRE_COMBAT,
        player,
        enemy:
          result.enemy,
        zone,
        depth,
      },
    };
  }

  if (result.loot) {
    const loot =
      result.loot;

    const qty =
      applyYieldBonus(
        loot.qty,
        await guildYieldBonusFor(
          deps,
          player
        )
      );

    addToInventory(
      player,
      loot.resource,
      loot.tier,
      qty
    );

    result.text +=
      `\n\n📦 +${qty}× ${loot.resource} T${loot.tier}.`;
  }

  if (result.xp) {
    grantXp(
      player,
      result.xp
    );

    result.text +=
      `\n✨ +${result.xp} XP.`;
  }

  if (
    result.credits
  ) {
    player.credits =
      (player.credits || 0) +
      result.credits;

    result.text +=
      `\n💰 +${result.credits} кредитов.`;
  }

  if (
    result.reputationGain
  ) {
    addFactionReputation(
      player,
      result.faction ||
        player.faction,
      result.reputationGain
    );
  }

  if (
    result.radiationGain
  ) {
    const discount =
      getRadiationDiscount(
        player
      );

    const gain =
      Math.max(
        0,
        Math.round(
          result.radiationGain *
            (1 - discount)
        )
      );

    player.radiation =
      Math.min(
        100,
        (player.radiation || 0) +
          gain
      );

    result.text +=
      `\n☢️ Радиация +${gain}%.`;
  }

  return {
    reply: {
      text:
        result.text,
      buttons:
        journeyContinueButtons(
          zone,
          false
        ),
    },
    nextState: {
      scene:
        SCENES.JOURNEY_CONTINUE,
      player,
      zone,
      depth,
    },
  };
}

/**
 * Основной разбор события.
 *
 * Раньше здесь были подключены anomaly-puzzles,
 * artifacts и все resolver-функции, но часть event.type
 * не имела перехода в соответствующую сцену.
 *
 * Теперь каждый интерактивный тип передаётся
 * своему уже существующему сценарию.
 */
function resolveExplorationEvent(
  player,
  event,
  zone,
  depth,
  deps,
  rng,
  prefix = '',
  useDepth = true,
  guildYieldBonusPct = 0
) {
  if (!event) {
    return {
      reply: {
        text:
          `${prefix}Вокруг тихо. Ничего необычного.`,
        buttons:
          journeyContinueButtons(
            zone,
            false
          ),
      },
      nextState: {
        scene:
          SCENES.JOURNEY_CONTINUE,
        player,
        zone,
        depth,
      },
    };
  }

  let text =
    `${prefix}${
      event.text ||
      'Ты обнаруживаешь нечто интересное.'
    }`;

  const interactive =
    interactiveEventState(
      event,
      player,
      zone,
      depth
    );

  if (interactive) {
    let buttons;

    switch (event.type) {
      case 'resonance_pedestal':
        buttons = [
          '🖐️ Коснуться артефакта',
          '🚶 Отойти',
        ];
        break;

      case 'terminal_hack':
        buttons = [
          '💻 Взломать',
          '🚶 Уйти',
        ];
        break;

      case 'echo_playback':
        buttons = [
          '🎧 Слушать кратко',
          '🎧 Слушать полностью',
          '🚶 Пропустить',
        ];
        break;

      case 'reaction_hazard':
        buttons = [
          '⚡ Реагировать',
        ];
        break;

      case 'corrupted_ai':
        buttons = [
          '❓ Спросить о Тракте',
          '🏛️ Спросить о станции',
          '🔇 Отключить',
        ];
        break;

      case 'distress':
        buttons = [
          '📡 Ответить',
          '🚶 Игнорировать',
          '🔭 Просканировать',
        ];
        break;

      case 'anomaly':
        buttons = [
          `🧩 Решить: ${interactive.puzzle.name}`,
          '🚶 Отойти',
        ];
        break;

      default:
        buttons =
          event.choices || [];
    }

    return {
      reply: {
        text,
        buttons,
        imageKey:
          imageForLocation(zone),
      },
      nextState: {
        ...interactive,
      },
    };
  }

  let buttons =
    event.choices?.map(
      (choice) =>
        choice.text
    ) ||
    journeyContinueButtons(
      zone,
      false
    );

  let nextState = {
    scene:
      SCENES.EXPLORATION_EVENT_CHOICE,
    player,
    zone,
    depth,
    event,
  };

  if (
    event.type === 'loot' &&
    event.loot
  ) {
    const loot = {
      ...event.loot,
    };

    loot.qty =
      applyYieldBonus(
        loot.qty,
        guildYieldBonusPct
      );

    addToInventory(
      player,
      loot.resource,
      loot.tier,
      loot.qty
    );

    text +=
      `\n\n📦 +${loot.qty}× ${loot.resource} T${loot.tier}.`;

    nextState = {
      scene:
        SCENES.JOURNEY_CONTINUE,
      player,
      zone,
      depth,
    };

    buttons =
      journeyContinueButtons(
        zone,
        false
      );
  }

  if (
    event.type === 'xp'
  ) {
    const xp =
      event.xp ||
      EXPLORATION_XP_BY_ZONE[
        zone
      ] ||
      5;

    grantXp(
      player,
      xp
    );

    text +=
      `\n\n✨ +${xp} XP.`;

    nextState = {
      scene:
        SCENES.JOURNEY_CONTINUE,
      player,
      zone,
      depth,
    };

    buttons =
      journeyContinueButtons(
        zone,
        false
      );
  }

  if (
    event.type ===
    'radiation'
  ) {
    const discount =
      getRadiationDiscount(
        player
      );

    const gain =
      Math.max(
        0,
        Math.round(
          (
            event.amount ||
            TICK_RADIATION_GAIN
          ) *
            (1 - discount)
        )
      );

    player.radiation =
      Math.min(
        100,
        (player.radiation || 0) +
          gain
      );

    text +=
      `\n\n☢️ Радиация +${gain}%.`;

    nextState = {
      scene:
        SCENES.JOURNEY_CONTINUE,
      player,
      zone,
      depth,
    };

    buttons =
      journeyContinueButtons(
        zone,
        false
      );
  }

  if (
    event.type === 'ambush'
  ) {
    const enemy =
      event.enemy ||
      generateEnemy(
        zone,
        rng,
        player.level || 1
      );

    text +=
      `\n\n⚔️ ${enemy.name} выходит из укрытия.`;

    nextState = {
      scene:
        SCENES.PRE_COMBAT,
      player,
      enemy,
      zone,
      depth,
    };

    buttons = [
      '⚔️ Атаковать',
      'Отступить',
    ];
  }

  if (
    event.type ===
    'pack_ambush'
  ) {
    nextState = {
      scene:
        SCENES.PACK_PRE_COMBAT,
      player,
      pack:
        event.pack || [],
      zone,
      depth,
    };

    buttons = [
      '⚔️ Атаковать',
      'Отступить',
    ];
  }

  if (
    event.type ===
    'named_encounter'
  ) {
    const named =
      rollNamedEncounter(
        zone,
        depth,
        rng,
        player
      );

    if (named) {
      text +=
        `\n\n${named.text}`;

      if (named.enemy) {
        nextState = {
          scene:
            SCENES.PRE_COMBAT,
          player,
          enemy:
            buildBestiaryFighter(
              named.enemy,
              player.level || 1
            ),
          zone,
          depth,
        };

        buttons = [
          '⚔️ Атаковать',
          'Отступить',
        ];
      }
    }
  }

  if (
    event.type ===
    'micro_discovery'
  ) {
    const discovery =
      rollMicroDiscovery(
        rng
      );

    if (discovery) {
      text +=
        `\n\n🔎 ${discovery.text}`;

      nextState.microDiscovery =
        discovery;

      buttons = [
        `Изучить: ${discovery.name}`,
        ...buttons,
      ];
    }
  }

  if (
    event.type ===
    'dynamic'
  ) {
    const dynamic =
      event.dynamic;

    if (dynamic) {
      text +=
        `\n\n${dynamic.text}`;

      buttons =
        dynamic.choices?.map(
          (choice) =>
            choice.text
        ) ||
        buttons;

      nextState.dynamicEvent =
        dynamic;
    }
  }

  /*
   * CACHE и NODE не должны зависать на экране.
   * Они превращаются в нормальное продолжение вылазки.
   */
  if (
    event.type === 'cache'
  ) {
    nextState = {
      scene:
        SCENES.JOURNEY_CONTINUE,
      player,
      zone,
      depth,
      cache:
        event.items || [],
    };

    buttons = [
      '📦 Обыскать тайник',
      ...journeyContinueButtons(
        zone,
        false
      ),
    ];
  }

  if (
    event.type === 'node'
  ) {
    nextState = {
      scene:
        SCENES.JOURNEY_CONTINUE,
      player,
      zone,
      depth,
      resourceNode: event,
    };

    if (
      event.nodeState ===
      'guarded'
    ) {
      nextState = {
        scene:
          SCENES.PRE_COMBAT,
        player,
        enemy:
          event.guardEnemy,
        zone,
        depth,
        resourceNode:
          event,
      };

      buttons = [
        '⚔️ Атаковать',
        'Отступить',
      ];
    } else {
      buttons = [
        '⛏️ Добывать',
        ...journeyContinueButtons(
          zone,
          false
        ),
      ];
    }
  }

  return {
    reply: {
      text,
      buttons,
      imageKey:
        event.enemy
          ? imageForEnemy(
              event.enemy.name
            )
          : imageForLocation(
              zone
            ),
    },
    nextState,
  };
}

async function applyExplorationTick(
  deps,
  player
) {
  const discount =
    getRadiationDiscount(
      player
    );

  const gain =
    Math.max(
      0,
      Math.round(
        TICK_RADIATION_GAIN *
          (1 - discount)
      )
    );

  if (gain <= 0) {
    return;
  }

  player.radiation =
    Math.min(
      100,
      (player.radiation || 0) +
        gain
    );

  if (
    deps?.worldStateStore
  ) {
    await deps.worldStateStore
      .touch?.()
      .catch(() => {});
  }
}

async function explore(
  player,
  zone,
  rng,
  deps,
  stealthMode = false,
  depth = 0
) {
  const zoneBase =
    ZONE_WEIGHTS[zone] ||
    ZONE_WEIGHTS.blue;

  const themedWeights =
    applyThemeWeightBias(
      zoneBase,
      player.currentLocationTheme
    );

  const guildYieldBonusPct =
    await guildYieldBonusFor(
      deps,
      player
    );

  const rareDiscoveryBonusPct =
    await guildRareDiscoveryBonusFor(
      deps,
      player
    );

  await applyExplorationTick(
    deps,
    player
  );

  if (stealthMode) {
    const spared =
      Math.round(
        themedWeights.ambush *
          0.6
      );

    const weightsOverride = {
      ...themedWeights,
      ambush:
        themedWeights.ambush -
        spared,
      find:
        themedWeights.find +
        spared,
    };

    const event =
      rollEvent(
        zone,
        rng,
        player.level || 1,
        weightsOverride,
        player.currentLocationTheme
      );

    if (
      event.type !==
      'ambush'
    ) {
      player.stealthLog = [
        ...(player.stealthLog || []),
        `Уклонение в ${
          ZONE_LABEL[zone] ||
          zone
        }`,
      ].slice(-5);
    }

    return withExclusiveResourceBonus(
      withMicroDiscovery(
        resolveExplorationEvent(
          player,
          event,
          zone,
          0,
          deps,
          rng,
          '',
          false,
          guildYieldBonusPct
        ),
        rng
      ),
      player,
      rng,
      rareDiscoveryBonusPct
    );
  }

  const event =
    rollEventWithDepth(
      player,
      zone,
      depth,
      rng,
      themedWeights,
      player.currentLocationTheme
    );

  return withExclusiveResourceBonus(
    withMicroDiscovery(
      resolveExplorationEvent(
        player,
        event,
        zone,
        depth,
        deps,
        rng,
        '',
        true,
        guildYieldBonusPct
      ),
      rng
    ),
    player,
    rng,
    rareDiscoveryBonusPct
  );
}

function resolvePackAction(
  state,
  targetName,
  skillId,
  rng,
  deps
) {
  const skill =
    skillId
      ? SKILLS[skillId]
      : null;

  const targetIndex =
    state.pack.findIndex(
      (p) =>
        p.name ===
          targetName &&
        p.hp > 0
    );

  const result =
    resolvePackRound(
      state.player,
      state.pack,
      targetIndex,
      skill,
      rng
    );

  const player =
    result.playerFighter;

  const cooldownsAfterUse =
    skillId
      ? startCooldown(
          state.packCooldowns ||
            {},
          skillId,
          skill,
          player.cooldownReductionPct ||
            0
        )
      : (
          state.packCooldowns ||
          {}
        );

  const tickedCooldowns =
    tickCooldowns(
      cooldownsAfterUse
    );

  if (
    result.playerDefeated
  ) {
    const defeatedPlayer = {
      ...player,
      hp: Math.round(
        player.hpMax * 0.3
      ),
    };

    const toShip =
      returnFromPlanet(
        deps,
        defeatedPlayer,
        ''
      );

    if (toShip) {
      toShip.reply.text =
        `💥 ${result.log.join(' ')}\n\n` +
        `💀 Стая берёт числом. Аварийная капсула тянет тебя обратно к кораблю.\n\n` +
        `${toShip.reply.text}`;

      return toShip;
    }

    return {
      reply: {
        text:
          `💥 ${result.log.join(' ')}\n\n` +
          `💀 Стая берёт числом. Эвакуация на станцию.`,
        buttons:
          stationButtons(
            deps,
            defeatedPlayer
          ),
      },
      nextState: {
        scene:
          SCENES.STATION,
        player:
          defeatedPlayer,
      },
    };
  }

  if (
    result.packDefeated
  ) {
    const loot =
      rollLoot(
        state.zone,
        rng,
        player.level || 1
      );

    const mult =
      stormRewardMult();

    addToInventory(
      player,
      loot.resource,
      loot.tier,
      loot.qty
    );

    player.credits =
      (player.credits || 0) +
      Math.round(
        loot.credits *
          mult
      );

    grantXp(
      player,
      loot.xp || 0
    );

    return {
      reply: {
        text:
          `${result.log.join(' ')}\n\n` +
          `🎉 Стая уничтожена.\n\n` +
          `📦 +${loot.qty}× ${loot.resource} T${loot.tier}.\n` +
          `💰 +${Math.round(
            loot.credits * mult
          )} кредитов.`,
        buttons:
          journeyContinueButtons(
            state.zone,
            state.isBossContext
          ),
      },
      nextState: {
        scene:
          SCENES.JOURNEY_CONTINUE,
        player,
        zone:
          state.zone,
        depth:
          state.depth,
        isBossContext:
          state.isBossContext,
      },
    };
  }

  return {
    reply: {
      text:
        `${result.log.join(' ')}\n\n` +
        `${packStatusText(
          result.pack
        )}`,
      buttons: [
        ...skillButtons(
          player,
          tickedCooldowns
        ),
        'Отступить',
      ],
      imageKey:
        imageForEnemy(
          result.pack[
            targetIndex
          ]?.name
        ),
    },
    nextState: {
      scene:
        SCENES.PACK_COMBAT,
      player,
      pack:
        result.pack,
      zone:
        state.zone,
      depth:
        state.depth,
      isBossContext:
        state.isBossContext,
      packCooldowns:
        tickedCooldowns,
    },
  };
}

async function handleExploration(
  state,
  input,
  rng,
  deps
) {
  if (!state) {
    return null;
  }

  switch (state.scene) {
    case SCENES.JOURNEY: {
      const stepsLeft =
        state.stepsLeft - 1;

      if (
        stepsLeft > 0
      ) {
        const pool =
          state.kind ===
          'explore'
            ? (
                ZONE_TRAVEL_PHRASES[
                  state.payload.zone
                ] ||
                ZONE_TRAVEL_PHRASES.blue
              )
            : STATION_TRAVEL_PHRASES;

        const phraseText =
          pool[
            Math.floor(
              rng() *
                pool.length
            )
          ];

        return {
          reply: {
            text:
              phraseText,
            buttons: [
              'Продолжить путь',
            ],
          },
          nextState: {
            scene:
              SCENES.JOURNEY,
            player:
              state.player,
            kind:
              state.kind,
            payload:
              state.payload,
            stepsLeft,
          },
        };
      }

      if (
        state.kind ===
        'explore'
      ) {
        return await explore(
          state.player,
          state.payload.zone,
          rng,
          deps,
          !!state.payload
            .stealthMode,
          state.payload.depth ||
            0
        );
      }

      const player = {
        ...state.player,
        visitingStation:
          state.payload.targetFaction,
      };

      return {
        reply: {
          text:
            `Стыковка завершена. Станция «${player.visitingStation}» пускает тебя как гостя — доступны общие услуги (мастерская, ремонт, рынок), но не куратор.`,
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

    case SCENES.JOURNEY_CONTINUE: {
      const {
        player,
        zone,
        depth,
        isBossContext,
        sectorResident,
        microDiscovery,
        cache,
        resourceNode,
      } = state;

      if (
        microDiscovery &&
        input ===
          `Изучить: ${microDiscovery.name}`
      ) {
        const rewardedPlayer = {
          ...player,
        };

        let rewardNote;

        if (
          microDiscovery.reward
            .credits
        ) {
          rewardedPlayer.credits =
            (rewardedPlayer.credits ||
              0) +
            microDiscovery.reward
              .credits;

          rewardNote =
            `💳 +${microDiscovery.reward.credits} кредитов.`;
        } else {
          addToInventory(
            rewardedPlayer,
            microDiscovery.reward
              .resource,
            microDiscovery.reward
              .tier,
            microDiscovery.reward
              .qty
          );

          rewardNote =
            `📦 +${microDiscovery.reward.qty} ${microDiscovery.reward.resource} T${microDiscovery.reward.tier}.`;
        }

        const baseButtons =
          sectorResident
            ? [
                `⚔️ Атаковать: ${BESTIARY[sectorResident.residentId]?.name}`,
                ...journeyContinueButtons(
                  zone,
                  isBossContext
                ),
              ]
            : journeyContinueButtons(
                zone,
                isBossContext
              );

        return {
          reply: {
            text:
              `Забираешь находку. ${rewardNote}`,
            buttons:
              baseButtons,
          },
          nextState: {
            scene:
              SCENES.JOURNEY_CONTINUE,
            player:
              rewardedPlayer,
            zone,
            depth,
            isBossContext,
            sectorResident,
          },
        };
      }

      if (
        cache &&
        input ===
          '📦 Обыскать тайник'
      ) {
        let text =
          '🔎 Ты вскрываешь тайник.';

        for (
          const loot of cache
        ) {
          const qty =
            applyYieldBonus(
              loot.qty,
              await guildYieldBonusFor(
                deps,
                player
              )
            );

          addToInventory(
            player,
            loot.resource,
            loot.tier,
            qty
          );

          text +=
            `\n📦 +${qty}× ${loot.resource} T${loot.tier}.`;

          player.credits =
            (player.credits || 0) +
            loot.credits;
        }

        return {
          reply: {
            text,
            buttons:
              journeyContinueButtons(
                zone,
                isBossContext
              ),
          },
          nextState: {
            scene:
              SCENES.JOURNEY_CONTINUE,
            player,
            zone,
            depth,
            isBossContext,
            sectorResident,
          },
        };
      }

      if (
        resourceNode &&
        input ===
          '⛏️ Добывать'
      ) {
        const charges =
          resourceNode.charges ||
          1;

        addToInventory(
          player,
          resourceNode.resource,
          resourceNode.tier,
          charges
        );

        return {
          reply: {
            text:
              `⛏️ Добыча завершена.\n\n📦 +${charges}× ${resourceNode.resource} T${resourceNode.tier}.`,
            buttons:
              journeyContinueButtons(
                zone,
                isBossContext
              ),
          },
          nextState: {
            scene:
              SCENES.JOURNEY_CONTINUE,
            player,
            zone,
            depth,
            isBossContext,
            sectorResident,
          },
        };
      }

      if (
        sectorResident &&
        input ===
          `⚔️ Атаковать: ${BESTIARY[sectorResident.residentId]?.name}`
      ) {
        const enemy =
          buildBestiaryFighter(
            BESTIARY[
              sectorResident.residentId
            ],
            player.level
          );

        return {
          reply: {
            text:
              `⚔️ ${enemy.name} наконец обращает на тебя внимание.`,
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
            scene:
              SCENES.PRE_COMBAT,
            player,
            enemy,
            zone,
            depth,
            sectorResident,
          },
        };
      }

      if (
        input ===
        'Углубиться дальше'
      ) {
        return startJourney(
          player,
          'explore',
          {
            zone,
            depth:
              (depth || 0) + 1,
          },
          rng
        );
      }

      if (
        input ===
        'Эвакуироваться'
      ) {
        if (
          zone !== 'red' &&
          !isBossContext
        ) {
          return {
            reply: {
              text:
                'Выбери действие кнопкой ниже.',
              buttons:
                journeyContinueButtons(
                  zone,
                  isBossContext
                ),
            },
            nextState:
              state,
          };
        }

        const bonus =
          getEvacChanceBonus(
            player
          );

        const result =
          attemptEvacuation(
            player,
            zone,
            depth || 0,
            rng,
            bonus
          );

        if (
          result.success
        ) {
          const toShip =
            returnFromPlanet(
              deps,
              player,
              `🛰️ ${result.text}\n\n`
            );

          if (toShip) {
            return toShip;
          }
        }

        const rareDiscoveryBonusPct =
          await guildRareDiscoveryBonusFor(
            deps,
            player
          );

        return withExclusiveResourceBonus(
          withMicroDiscovery(
            resolveExplorationEvent(
              player,
              result.blockingEvent,
              zone,
              depth || 0,
              deps,
              rng,
              `⚠️ ${result.text}\n\n`
            ),
            rng
          ),
          player,
          rng,
          rareDiscoveryBonusPct
        );
      }

      if (
        input ===
        'Вернуться на станцию'
      ) {
        const toShip =
          returnFromPlanet(
            deps,
            player,
            '🪐 Ты возвращаешься к кораблю. Весь добытый груз остаётся в трюме рейса.\n\n'
          );

        if (toShip) {
          return toShip;
        }

        return {
          reply: {
            text:
              'Ты возвращаешься к кораблю.',
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
            'Выбери действие кнопкой ниже.',
          buttons:
            journeyContinueButtons(
              zone,
              isBossContext
            ),
        },
        nextState:
          state,
      };
    }

    case SCENES.EXPLORATION_EVENT_CHOICE: {
      const {
        player,
        zone,
        depth,
        event,
      } = state;

      const choice =
        (event.choices || [])
          .find(
            (c) =>
              c.text === input
          );

      if (!choice) {
        return {
          reply: {
            text:
              event.text,
            buttons:
              (event.choices || [])
                .map(
                  (c) => c.text
                ),
          },
          nextState:
            state,
        };
      }

      if (choice.combat) {
        const combatZone =
          choice.combat
            .zoneOverride ||
          zone;

        const enemy =
          choice.combat.enemy ||
          generateEnemy(
            combatZone,
            rng,
            player.level || 1
          );

        return {
          reply: {
            text:
              `${choice.text}\n\n⚔️ Бой начинается.`,
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
            scene:
              SCENES.PRE_COMBAT,
            player,
            enemy,
            zone:
              combatZone,
            depth,
          },
        };
      }

      if (choice.loot) {
        const loot =
          choice.loot;

        addToInventory(
          player,
          loot.resource,
          loot.tier,
          loot.qty
        );

        return {
          reply: {
            text:
              `${choice.text}\n\n📦 +${loot.qty}× ${loot.resource} T${loot.tier}.`,
            buttons:
              journeyContinueButtons(
                zone,
                false
              ),
          },
          nextState: {
            scene:
              SCENES.JOURNEY_CONTINUE,
            player,
            zone,
            depth,
          },
        };
      }

      if (
        choice.consequence
      ) {
        await applyConsequenceToPlayer(
          deps,
          player,
          choice.consequence
        );
      }

      if (
        choice.reputation
      ) {
        addFactionReputation(
          player,
          choice.faction ||
            player.faction,
          choice.reputation
        );
      }

      if (
        choice.xp
      ) {
        grantXp(
          player,
          choice.xp
        );
      }

      return {
        reply: {
          text:
            choice.text,
          buttons:
            journeyContinueButtons(
              zone,
              false
            ),
        },
        nextState: {
          scene:
            SCENES.JOURNEY_CONTINUE,
          player,
          zone,
          depth,
        },
      };
    }

    case SCENES.ANOMALY_PUZZLE: {
      const {
        player,
        zone,
        depth,
        puzzle,
      } = state;

      if (
        input ===
        '🚶 Отойти'
      ) {
        return {
          reply: {
            text:
              '🚶 Ты решаешь не трогать аномалию.',
            buttons:
              journeyContinueButtons(
                zone,
                false
              ),
          },
          nextState: {
            scene:
              SCENES.JOURNEY_CONTINUE,
            player,
            zone,
            depth,
          },
        };
      }

      if (
        input !==
        `🧩 Решить: ${puzzle.name}`
      ) {
        return {
          reply: {
            text:
              puzzle.intro,
            buttons: [
              `🧩 Решить: ${puzzle.name}`,
              '🚶 Отойти',
            ],
          },
          nextState:
            state,
        };
      }

      const attempt =
        resolvePuzzleAttempt(
          puzzle,
          player
        );

      if (
        attempt.hpDamage > 0
      ) {
        player.hp =
          Math.max(
            1,
            (player.hp || player.hpMax) -
              attempt.hpDamage
          );
      }

      let text =
        `${attempt.text}`;

      if (
        attempt.hpDamage > 0
      ) {
        text +=
          `\n\n❤️ -${attempt.hpDamage} HP.`;
      } else {
        grantXp(
          player,
          10
        );

        text +=
          '\n\n✨ +10 XP.';

        /*
         * Артефакты существуют отдельно от обычного лута
         * и появляются именно внутри аномальной ветки.
         */
        if (
          rng() < 0.35
        ) {
          const artifact =
            pickRandomArtifact(
              rng
            );

          player.artifacts =
            player.artifacts || [];

          if (
            !player.artifacts.includes(
              artifact.id
            )
          ) {
            player.artifacts.push(
              artifact.id
            );

            text +=
              `\n\n🧿 Найден артефакт: ${artifact.name}.`;
          }
        }
      }

      return {
        reply: {
          text,
          buttons:
            journeyContinueButtons(
              zone,
              false
            ),
        },
        nextState: {
          scene:
            SCENES.JOURNEY_CONTINUE,
          player,
          zone,
          depth,
        },
      };
    }

    case SCENES.DISTRESS_CHOICE: {
      const {
        player,
        zone,
        depth,
        event,
      } = state;

      const map = {
        '📡 Ответить':
          'respond',
        '🚶 Игнорировать':
          'ignore',
        '🔭 Просканировать':
          'scan',
      };

      const choice =
        map[input];

      if (!choice) {
        return {
          reply: {
            text:
              event.text,
            buttons: [
              '📡 Ответить',
              '🚶 Игнорировать',
              '🔭 Просканировать',
            ],
          },
          nextState:
            state,
        };
      }

      const result =
        resolveDistressChoice(
          choice,
          event,
          player
        );

      if (
        result.outcome ===
        'scan_failed'
      ) {
        return {
          reply: {
            text:
              result.text,
            buttons: [
              '📡 Ответить',
              '🚶 Игнорировать',
            ],
          },
          nextState:
            state,
        };
      }

      if (
        result.outcome ===
          'scan_trap_revealed' ||
        result.outcome ===
          'scan_genuine_revealed'
      ) {
        return {
          reply: {
            text:
              result.text,
            buttons: [
              result.outcome ===
              'scan_genuine_revealed'
                ? '📡 Ответить'
                : '🚶 Игнорировать',
            ],
          },
          nextState: {
            ...state,
            event: {
              ...event,
              isTrap:
                result.outcome ===
                'scan_trap_revealed',
            },
          },
        };
      }

      if (
        result.outcome ===
        'rewarded'
      ) {
        player.credits =
          (player.credits || 0) +
          (
            result.reward
              ?.credits || 0
          );

        addFactionReputation(
          player,
          player.faction,
          result.reward
            ?.reputation || 0
        );
      }

      return resolveInteractiveOutcome(
        deps,
        player,
        zone,
        depth,
        result,
        rng
      );
    }

    case SCENES.RESONANCE_PEDESTAL_CHOICE: {
      const {
        player,
        zone,
        depth,
        event,
      } = state;

      if (
        input ===
        '🚶 Отойти'
      ) {
        return {
          reply: {
            text:
              '🚶 Ты оставляешь артефакт нетронутым.',
            buttons:
              journeyContinueButtons(
                zone,
                false
              ),
          },
          nextState: {
            scene:
              SCENES.JOURNEY_CONTINUE,
            player,
            zone,
            depth,
          },
        };
      }

      if (
        input !==
        '🖐️ Коснуться артефакта'
      ) {
        return {
          reply: {
            text:
              event.text,
            buttons: [
              '🖐️ Коснуться артефакта',
              '🚶 Отойти',
            ],
          },
          nextState:
            state,
        };
      }

      const result =
        resolveResonancePedestal(
          rng,
          player.level || 1
        );

      return resolveInteractiveOutcome(
        deps,
        player,
        zone,
        depth,
        result,
        rng
      );
    }

    case SCENES.TERMINAL_HACK_CHOICE: {
      const {
        player,
        zone,
        depth,
        event,
      } = state;

      const map = {
        '💻 Взломать':
          'hack',
        '🚶 Уйти':
          'leave',
      };

      const choice =
        map[input];

      if (!choice) {
        return {
          reply: {
            text:
              event.text,
            buttons: [
              '💻 Взломать',
              '🚶 Уйти',
            ],
          },
          nextState:
            state,
        };
      }

      const result =
        resolveTerminalHack(
          choice,
          player,
          rng,
          player.level || 1
        );

      return resolveInteractiveOutcome(
        deps,
        player,
        zone,
        depth,
        result,
        rng
      );
    }

    case SCENES.ECHO_PLAYBACK_CHOICE: {
      const {
        player,
        zone,
        depth,
        event,
      } = state;

      const map = {
        '🎧 Слушать кратко':
          'listen_short',
        '🎧 Слушать полностью':
          'listen_full',
        '🚶 Пропустить':
          'skip',
      };

      const choice =
        map[input];

      if (!choice) {
        return {
          reply: {
            text:
              event.text,
            buttons: [
              '🎧 Слушать кратко',
              '🎧 Слушать полностью',
              '🚶 Пропустить',
            ],
          },
          nextState:
            state,
        };
      }

      const result =
        resolveEchoPlayback(
          choice,
          rng,
          player.level || 1
        );

      return resolveInteractiveOutcome(
        deps,
        player,
        zone,
        depth,
        result,
        rng
      );
    }

    case SCENES.REACTION_HAZARD_CHOICE: {
      const {
        player,
        zone,
        depth,
        event,
      } = state;

      if (
        input !==
        '⚡ Реагировать'
      ) {
        return {
          reply: {
            text:
              event.text,
            buttons: [
              '⚡ Реагировать',
            ],
          },
          nextState:
            state,
        };
      }

      const result =
        resolveReactionHazard(
          player,
          rng,
          player.level || 1
        );

      return resolveInteractiveOutcome(
        deps,
        player,
        zone,
        depth,
        result,
        rng
      );
    }

    case SCENES.CORRUPTED_AI_CHOICE: {
      const {
        player,
        zone,
        depth,
        event,
      } = state;

      const map = {
        '❓ Спросить о Тракте':
          'ask_about_trakt',
        '🏛️ Спросить о станции':
          'ask_about_station',
        '🔇 Отключить':
          'shut_down',
      };

      const choice =
        map[input];

      if (!choice) {
        return {
          reply: {
            text:
              event.text,
            buttons: [
              '❓ Спросить о Тракте',
              '🏛️ Спросить о станции',
              '🔇 Отключить',
            ],
          },
          nextState:
            state,
        };
      }

      const result =
        resolveCorruptedAi(
          choice,
          player
        );

      if (
        result.flag
      ) {
        player.flags =
          player.flags || {};

        player.flags[
          result.flag
        ] = true;
      }

      return resolveInteractiveOutcome(
        deps,
        player,
        zone,
        depth,
        result,
        rng
      );
    }

    case SCENES.PACK_PRE_COMBAT: {
      const {
        player,
        pack,
        zone,
        depth,
      } = state;

      if (
        input ===
        'Отступить'
      ) {
        const toShip =
          returnFromPlanet(
            deps,
            player,
            '🏃 Ты отступаешь от стаи и возвращаешься к кораблю.\n\n'
          );

        if (toShip) {
          return toShip;
        }

        return {
          reply: {
            text:
              '🏃 Ты отступаешь.',
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
        input ===
        '⚔️ Атаковать'
      ) {
        return {
          reply: {
            text:
              `⚔️ Стая выходит из укрытия: ${pack.map(
                (enemy) =>
                  enemy.name
              ).join(', ')}`,
            buttons: [
              '⚔️ Атаковать',
              'Отступить',
            ],
          },
          nextState: {
            scene:
              SCENES.PACK_COMBAT,
            player,
            pack,
            zone,
            depth,
          },
        };
      }

      return {
        reply: {
          text:
            `⚔️ Стая (${pack.length}) блокирует путь.`,
          buttons: [
            '⚔️ Атаковать',
            'Отступить',
          ],
        },
        nextState:
          state,
      };
    }

    case SCENES.PRE_COMBAT: {
      const {
        player,
        enemy,
        zone,
        depth,
      } = state;

      if (
        input ===
        'Отступить'
      ) {
        const toShip =
          returnFromPlanet(
            deps,
            player,
            '🏃 Ты отступаешь и возвращаешься к кораблю.\n\n'
          );

        if (toShip) {
          return toShip;
        }

        return {
          reply: {
            text:
              '🏃 Ты отступаешь.',
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
        input ===
        '⚔️ Атаковать'
      ) {
        return {
          reply: {
            text:
              `⚔️ ${enemy.name} готовится к бою.`,
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
            scene:
              SCENES.COMBAT,
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
        },
        nextState:
          state,
      };
    }

    case SCENES.COMBAT: {
      const {
        player,
        enemy,
        zone,
        depth,
      } = state;

      if (
        input ===
        'Отступить'
      ) {
        const toShip =
          returnFromPlanet(
            deps,
            player,
            '🏃 Ты вырываешься из боя и возвращаешься к кораблю.\n\n'
          );

        if (toShip) {
          return toShip;
        }

        return {
          reply: {
            text:
              '🏃 Ты отступаешь.',
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
          nextState:
            state,
        };
      }

      const attacker =
        buildBestiaryFighter(
          {
            name:
              player.name ||
              'Игрок',
            hp:
              player.hp,
            hpMax:
              player.hpMax,
            attack:
              player.attack ||
              10,
            defense:
              player.defense ||
              5,
          },
          player.level || 1
        );

      const result =
        require(
          '../../engine/combat-engine.js'
        ).resolveTurn(
          attacker,
          enemy,
          rng
        );

      if (
        result.defender.hp <=
        0
      ) {
        const xp =
          enemy.xp ||
          enemy.reward?.xp ||
          0;

        const credits =
          enemy.credits ||
          enemy.reward?.credits ||
          0;

        grantXp(
          player,
          xp
        );

        player.credits =
          (player.credits || 0) +
          credits;

        if (
          enemy.loot
        ) {
          addToInventory(
            player,
            enemy.loot.resource,
            enemy.loot.tier,
            enemy.loot.qty
          );
        }

        const toShip =
          returnFromPlanet(
            deps,
            player,
            `⚔️ ${result.log?.join(' ') || 'Противник повержен.'}\n\n` +
              `💥 ${enemy.name} уничтожен.\n\n` +
              `✨ +${xp} XP.\n` +
              `💰 +${credits} кредитов.\n\n`
          );

        if (toShip) {
          return toShip;
        }

        return {
          reply: {
            text:
              `⚔️ ${enemy.name} уничтожен.`,
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
        result.attacker.hp <=
        0
      ) {
        const defeatedPlayer = {
          ...player,
          hp:
            Math.round(
              player.hpMax * 0.3
            ),
        };

        const toShip =
          returnFromPlanet(
            deps,
            defeatedPlayer,
            `☠️ ${result.log?.join(' ') || 'Ты потерпел поражение.'}\n\n`
          );

        if (toShip) {
          return toShip;
        }

        return {
          reply: {
            text:
              '☠️ Ты потерпел поражение.',
            buttons:
              stationButtons(
                deps,
                defeatedPlayer
              ),
          },
          nextState: {
            scene:
              SCENES.STATION,
            player:
              defeatedPlayer,
          },
        };
      }

      player.hp =
        result.attacker.hp;

      return {
        reply: {
          text:
            result.log?.join(
              '\n'
            ) ||
            '⚔️ Бой продолжается.',
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
          scene:
            SCENES.COMBAT,
          player,
          enemy:
            result.defender,
          zone,
          depth,
        },
      };
    }

    case SCENES.PACK_COMBAT: {
      if (
        input ===
        'Отступить'
      ) {
        const toShip =
          returnFromPlanet(
            deps,
            state.player,
            '🏃 Ты отступаешь от стаи и возвращаешься к кораблю.\n\n'
          );

        if (toShip) {
          return toShip;
        }

        return {
          reply: {
            text:
              '🏃 Ты отступаешь.',
            buttons:
              stationButtons(
                deps,
                state.player
              ),
          },
          nextState: {
            scene:
              SCENES.STATION,
            player:
              state.player,
          },
        };
      }

      const skillId =
        skillIdByName(
          input
        );

      return resolvePackAction(
        state,
        state.pack.length === 1
          ? state.pack[0].name
          : state.pack.find(
              (p) =>
                p.hp > 0
            )?.name,
        skillId,
        rng,
        deps
      );
    }

    default:
      return {
        reply: {
          text:
            '⚠️ Состояние вылазки не распознано. Возвращаемся к управлению рейсом.',
          buttons: [
            '⬅️ Назад',
          ],
        },
        nextState: {
          scene:
            SCENES.JOURNEY_CONTINUE,
          player:
            state.player,
          zone:
            state.zone,
          depth:
            state.depth,
        },
      };
  }
}

module.exports = {
  handleExploration,
  explore,
  resolveExplorationEvent,
  resolvePackAction,
  returnFromPlanet,
};
