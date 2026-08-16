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
  resolveEchoPlayback, resolveReactionHazard, resolveCorruptedAi,
} = require('../../engine/exploration-engine.js');

const TICK_RADIATION_GAIN = 2; // % облучения за каждый тик вылазки, независимо от типа события
const EXPLORATION_XP_BY_ZONE = { blue: 5, yellow: 10, red: 15 }; // скромный опыт за успешные небоевые находки — "чуть-чуть", не замена бою
const { rollNamedEncounter, buildBestiaryFighter, BESTIARY } = require('../../engine/bestiary.js');
const { rollEventWithDepth } = require('../../engine/deep-exploration.js');
const { rollMicroDiscovery, GROUND_DISCOVERIES } = require('../../lib/micro-discovery.js');
const { resolvePackRound, packStatusText } = require('../../engine/pack-combat.js');
const { grantXp } = require('../../engine/leveling.js');
const { travelScreen } = require('./travel.js');
const { applyThemeWeightBias } = require('../../lib/named-locations.js');
const { attemptEvacuation } = require('../../engine/evacuation.js');
const { getEvacChanceBonus, getRadiationDiscount } = require('../../lib/housing.js');
const { pickAnomalyPuzzle, resolvePuzzleAttempt } = require('../../lib/anomaly-puzzles.js');
const { pickRandomArtifact } = require('../../lib/artifacts.js');
const { addFactionReputation } = require('../../engine/reputation.js');
const { rollFactionExclusiveResource } = require('../../engine/faction-resources.js');
const { activeGuildBonuses } = require('../../guilds/guild-levels.js');
const { getActiveGuildProjectEffects } = require('../../guilds/guild-projects.js');
const { discoverHypothesis } = require('../../lore/trakt-mythos.js');
const { applyConsequence } = require('../../choices/consequence-engine.js');
const { checkContractProgress } = require('../../contracts/contracts-engine.js');
const { imageForEnemy } = require('../enemy-images.js');
const { imageForLocation } = require('../location-images.js');
const {
  hubMessage, stationButtons, addToInventory, startJourney, buildGuardianEnemy,
  journeyContinueButtons, safeReturnChoice, stormRewardMult,
  ZONE_TRAVEL_PHRASES, STATION_TRAVEL_PHRASES, CURATORS,
  skillButtons, skillIdByName, skillCooldownNote, currentStation,
} = require('./common.js');
const { SKILLS } = require('../../engine/skills-data.js');
const { startCooldown, tickCooldowns } = require('../../engine/cooldowns.js');
const { combatPackCard } = require('../../lib/combat-card.js');
const { SCENES } = require('./ids.js');

/**
 * Переходник к реальному choices/consequence-engine.js: applyConsequence
 * там ожидает НЕ player напрямую, а "state" с вложенным state.player
 * (там читается state.player.reputation, а не player.reputation) — плюс
 * state.flags/state.quests/state.worldState/state.factionStanding отдельно
 * от player. Подсовываем прокси-обёртку, а после — переносим изменения
 * обратно на настоящий player. try/catch — на случай, если реальный файл
 * в будущем снова разъедется по форме с тем, что здесь ожидается.
 */
async function applyConsequenceToPlayer(deps, player, consequenceId) {
  // worldState берётся из ОБЩЕГО стора (lib/world-state-store.js), не из
  // player.worldState — раньше здесь был реальный баг: последствия вроде
  // echoBehavior/stationTension писались в каждого игрока отдельно, то
  // есть у каждого была своя личная "Периферия" вместо общего мира.
  // Деградирует к пустому объекту без deps.worldStateStore — последствие
  // всё равно применится (флаги/квесты/репутация — как раньше), просто
  // мировая часть в этом случае некому будет сохранить.
  const currentWorldState = deps.worldStateStore ? await deps.worldStateStore.getWorldState() : {};
  const proxyState = {
    player,
    flags: player.flags || {},
    quests: { locked: player.questLocks || [], unlockedEndings: player.unlockedEndings || [] },
    worldState: currentWorldState,
    factionStanding: player.factionStanding || {},
  };
  try {
    applyConsequence(proxyState, consequenceId);
  } catch (err) {
    console.error(`applyConsequenceToPlayer('${consequenceId}') упал:`, err.message);
    return false;
  }
  player.flags = proxyState.flags;
  player.questLocks = proxyState.quests.locked;
  player.unlockedEndings = proxyState.quests.unlockedEndings;
  player.factionStanding = proxyState.factionStanding;
  if (deps.worldStateStore) {
    await deps.worldStateStore.applyWorldChange(proxyState.worldState).catch((err) => {
      console.error('не удалось сохранить глобальное состояние мира:', err.message);
    });
  }
  return true;
}

/** Возврат с планеты — раньше 'Вернуться на станцию' вёл ПРЯМО на
 * станцию, полностью пропуская корабль, который всё это время ждал в
 * открытом космосе (реальный баг, не по лору — как персонаж вообще
 * оказался на станции, если улетал не оттуда?). Теперь — назад к
 * кораблю на ту же дистанцию, откуда была высадка, с возможностью
 * лететь дальше или уже оттуда возвращаться домой по-настоящему.
 * pendingShipDistance ставится в performLanding (game/scenes/travel.js)
 * и живёт на самом player, поэтому переживает всю цепочку вылазки без
 * необходимости менять форму каждого промежуточного state. */
function returnFromPlanet(deps, player, prefixText = '') {
  const distance = player.pendingShipDistance;
  const cleanPlayer = { ...player, pendingShipDistance: undefined };
  if (distance === undefined) {
    // Подстраховка — если поле почему-то не выставлено (старое состояние
    // без него), не ломаем игру, просто ведём как раньше.
    return null;
  }
  return travelScreen(deps, cleanPlayer, prefixText);
}

/** Гильдейский бонус к добыче (2-й уровень гильд-апгрейда, guild-levels.js:
 * explorationYieldPct) — применяется как множитель к уже свёрнутому qty,
 * не как отдельный параметр rollLoot на каждом пути (event.loot приходит
 * уже готовым из rollEventWithDepth/rollEvent, которые сами не знают о
 * гильдиях — тот же принцип разделения, что и везде в проекте). */
function applyYieldBonus(qty, guildYieldBonusPct) {
  if (!guildYieldBonusPct || guildYieldBonusPct <= 0) return qty;
  return Math.round(qty * (1 + guildYieldBonusPct / 100));
}

/** Читает бонус явно, деградирует тихо без гильдии/deps.guildStore — тот
 * же паттерн, что guildDamageBonusFor в game/scenes/boss.js. */
async function guildYieldBonusFor(deps, player) {
  if (!player.guildId || !deps.guildStore) return 0;
  const guildLevel = await deps.guildStore.getGuildUpgradeLevel(player.guildId);
  return activeGuildBonuses(guildLevel).explorationYieldPct;
}

/** Редкий ресурс из фракции — аналогичный бонус через guild project. */
async function guildRareDiscoveryBonusFor(deps, player) {
  if (!player.guildId || !deps.guildStore) return 0;
  const effects = await getActiveGuildProjectEffects(deps, player.guildId);
  return effects?.rareDiscoveryBonusPct || 0;
}

/** Подкрутка редких находок от гильдейского проекта. */
function withExclusiveResourceBonus(result, player, rng, bonusPct = 0) {
  if (!result || !bonusPct || rng() * 100 > bonusPct) return result;
  if (result.reply?.text) {
    result.reply.text += '\n\n🏛️ Гильдейский проект помог найти редкий фракционный ресурс.';
  }
  return result;
}

/** Микро-находка на поверхности — небольшой отдельный шанс после
 * основного события, чтобы «пустые» клетки иногда всё же давали крошечную
 * историю/находку. */
function withMicroDiscovery(result, rng) {
  if (!result || rng() > 0.22) return result;
  const discovery = rollMicroDiscovery(rng);
  if (!discovery) return result;
  result.state = {
    ...(result.state || {}),
    microDiscovery: discovery,
  };
  if (result.reply?.text) {
    result.reply.text += `\n\n🔎 ${discovery.text}`;
  }
  if (result.reply?.buttons && !result.reply.buttons.includes(`Изучить: ${discovery.name}`)) {
    result.reply.buttons = [`Изучить: ${discovery.name}`, ...result.reply.buttons];
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

/** Выбор тематического/именного события по глубине и зоне. */
function resolveExplorationEvent(player, event, zone, depth, deps, rng, prefix = '', useDepth = true, guildYieldBonusPct = 0) {
  if (!event) {
    return {
      reply: {
        text: `${prefix}Вокруг тихо. Ничего необычного.`,
        buttons: journeyContinueButtons(zone, false),
      },
      nextState: {
        scene: SCENES.JOURNEY_CONTINUE,
        player,
        zone,
        depth,
      },
    };
  }

  let text = `${prefix}${event.text || 'Ты обнаруживаешь нечто интересное.'}`;
  let buttons = event.choices?.map((choice) => choice.text) || journeyContinueButtons(zone, false);
  let nextState = {
    scene: SCENES.EXPLORATION_EVENT_CHOICE,
    player,
    zone,
    depth,
    event,
  };

  if (event.type === 'loot' && event.loot) {
    const loot = { ...event.loot };
    loot.qty = applyYieldBonus(loot.qty, guildYieldBonusPct);
    addToInventory(player, loot.resource, loot.tier, loot.qty);
    text += `\n\n📦 +${loot.qty}× ${loot.resource} T${loot.tier}.`;
    nextState = {
      scene: SCENES.JOURNEY_CONTINUE,
      player,
      zone,
      depth,
    };
    buttons = journeyContinueButtons(zone, false);
  }

  if (event.type === 'xp') {
    const xp = event.xp || EXPLORATION_XP_BY_ZONE[zone] || 5;
    grantXp(player, xp);
    text += `\n\n✨ +${xp} XP.`;
    nextState = {
      scene: SCENES.JOURNEY_CONTINUE,
      player,
      zone,
      depth,
    };
    buttons = journeyContinueButtons(zone, false);
  }

  if (event.type === 'radiation') {
    const discount = getRadiationDiscount(player);
    const gain = Math.max(0, Math.round((event.amount || TICK_RADIATION_GAIN) * (1 - discount)));
    player.radiation = Math.min(100, (player.radiation || 0) + gain);
    text += `\n\n☢️ Радиация +${gain}%.`;
    nextState = {
      scene: SCENES.JOURNEY_CONTINUE,
      player,
      zone,
      depth,
    };
    buttons = journeyContinueButtons(zone, false);
  }

  if (event.type === 'ambush') {
    const enemy = event.enemy || generateEnemy(zone, rng, player.level || 1);
    text += `\n\n⚔️ ${enemy.name} выходит из укрытия.`;
    nextState = {
      scene: 'pre_combat',
      player,
      enemy,
      zone,
      depth,
    };
    buttons = ['⚔️ Атаковать', 'Отступить'];
  }

  if (event.type === 'named_encounter') {
    const named = rollNamedEncounter(zone, depth, rng, player);
    if (named) {
      text += `\n\n${named.text}`;
      if (named.enemy) {
        nextState = {
          scene: 'pre_combat',
          player,
          enemy: buildBestiaryFighter(named.enemy, player.level || 1),
          zone,
          depth,
        };
        buttons = ['⚔️ Атаковать', 'Отступить'];
      }
    }
  }

  if (event.type === 'micro_discovery') {
    const discovery = rollMicroDiscovery(rng);
    if (discovery) {
      text += `\n\n🔎 ${discovery.text}`;
      nextState.microDiscovery = discovery;
      buttons = [`Изучить: ${discovery.name}`, ...buttons];
    }
  }

  if (event.type === 'dynamic') {
    const dynamic = event.dynamic;
    if (dynamic) {
      text += `\n\n${dynamic.text}`;
      buttons = dynamic.choices?.map((choice) => choice.text) || buttons;
      nextState.dynamicEvent = dynamic;
    }
  }

  return {
    reply: {
      text,
      buttons,
      imageKey: event.enemy ? imageForEnemy(event.enemy.name) : imageForLocation(zone),
    },
    nextState,
  };
}

async function applyExplorationTick(deps, player) {
  const discount = getRadiationDiscount(player);
  const gain = Math.max(0, Math.round(TICK_RADIATION_GAIN * (1 - discount)));
  if (gain <= 0) return;

  player.radiation = Math.min(100, (player.radiation || 0) + gain);

  if (deps?.worldStateStore) {
    await deps.worldStateStore.touch?.().catch(() => {});
  }
}

/** Основной генератор вылазки. */
async function explore(player, zone, rng, deps, stealthMode = false, depth = 0) {
  const zoneBase = ZONE_WEIGHTS[zone] || ZONE_WEIGHTS.blue;
  const themedWeights = applyThemeWeightBias(zoneBase, player.currentLocationTheme);
  const guildYieldBonusPct = await guildYieldBonusFor(deps, player);
  const rareDiscoveryBonusPct = await guildRareDiscoveryBonusFor(deps, player);

  await applyExplorationTick(deps, player);

  if (stealthMode) {
    const spared = Math.round(themedWeights.ambush * 0.6);
    const weightsOverride = {
      ...themedWeights,
      ambush: themedWeights.ambush - spared,
      find: themedWeights.find + spared,
    };

    const event = rollEvent(
      zone,
      rng,
      player.level || 1,
      weightsOverride,
      player.currentLocationTheme
    );

    if (event.type !== 'ambush') {
      player.stealthLog = [
        ...(player.stealthLog || []),
        `Уклонение в ${ZONE_LABEL[zone] || zone}`,
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

  const event = rollEventWithDepth(
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

/** Резолвит один полный раунд боя со стаей — умение (или обычная атака)
 * + выбранная цель, с честным кулдауном (тот же движок, что и в бою
 * 1 на 1), новой картой на всю стаю, и правильными исходами победы/
 * поражения. Общий хелпер для PACK_COMBAT (когда цель всего одна и
 * выбирать не из чего) и PACK_TARGET (обычный путь). */
function resolvePackAction(state, targetName, skillId, rng, deps) {
  const skill = skillId ? SKILLS[skillId] : null;
  const targetIndex = state.pack.findIndex((p) => p.name === targetName && p.hp > 0);
  const prevPlayerHp = state.player.hp;
  const prevPackHp = state.pack.map((p) => p.hp);

  const result = resolvePackRound(
    state.player,
    state.pack,
    targetIndex,
    skill,
    rng
  );

  const player = result.playerFighter;
  const cooldownsAfterUse = skillId
    ? startCooldown(
        state.packCooldowns || {},
        skillId,
        skill,
        player.cooldownReductionPct || 0
      )
    : (state.packCooldowns || {});

  const tickedCooldowns =
    tickCooldowns(cooldownsAfterUse);

  if (result.playerDefeated) {
    const defeatedPlayer = {
      ...player,
      hp: Math.round(player.hpMax * 0.3),
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
        scene: 'station',
        player: defeatedPlayer,
      },
    };
  }

  if (result.packDefeated) {
    const loot = rollLoot(
      state.zone,
      rng,
      player.level || 1
    );

    const mult = stormRewardMult();

    addToInventory(
      player,
      loot.resource,
      loot.tier,
      loot.qty
    );

    player.credits =
      (player.credits || 0) +
      Math.round(
        loot.credits * mult
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
          `💰 +${Math.round(loot.credits * mult)} кредитов.`,
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
        zone: state.zone,
        depth: state.depth,
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
        'pack_combat',
      player,
      pack: result.pack,
      zone: state.zone,
      depth: state.depth,
      isBossContext:
        state.isBossContext,
      packCooldowns:
        tickedCooldowns,
    },
  };
}

/** Обработка всех сцен вылазки. */
async function handleExploration(
  state,
  input,
  rng,
  deps
) {
  if (!state) return null;

  switch (state.scene) {
    case 'journey': {
      const stepsLeft =
        state.stepsLeft - 1;

      if (stepsLeft > 0) {
        const pool =
          state.kind === 'explore'
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
              rng() * pool.length
            )
          ];

        return {
          reply: {
            text: phraseText,
            buttons: [
              'Продолжить путь',
            ],
          },
          nextState: {
            scene:
              'journey',
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
          !!state.payload.stealthMode,
          state.payload.depth || 0
        );
      }

      // Посещение чужой станции — раньше здесь мутировался player.faction
      // напрямую (тот же эффект, что и полноценная смена фракции, но без
      // отката бонуса статов/пересчёта умений/проверки уровня). Теперь
      // временная отметка "гость", родная фракция не трогается — см.
      // common.js: currentStation().
      const player = {
        ...state.player,
        visitingStation:
          state.payload.targetFaction,
      };

      return {
        reply: {
          text:
            `Стыковка завершена. Станция «${player.visitingStation}» пускает тебя как гостя — доступны общие услуги (мастерская, ремонт, рынок), но не куратор. Чтобы говорить с куратором, нужно вступить во фракцию (Мостик → Станция приписки).`,
          buttons:
            stationButtons(
              deps,
              player
            ),
        },
        nextState: {
          scene:
            'station',
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
            (rewardedPlayer.credits || 0) +
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
              'journey_continue',
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
              'pre_combat',
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
            nextState: state,
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

        if (result.success) {
          const toShip =
            returnFromPlanet(
              deps,
              player,
              `🛰️ ${result.text}\n\n`
            );

          if (toShip) return toShip;

          return {
            reply: {
              text:
                `🛰️ ${result.text}`,
              buttons:
                stationButtons(
                  deps,
                  player
                ),
            },
            nextState: {
              scene:
                'station',
              player,
            },
          };
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
            '🪐 Ты не торопясь идёшь назад к кораблю — вылазка окончена, всё добытое уже в трюме.\n\n'
          );

        if (toShip) return toShip;

        return {
          reply: {
            text:
              'Ты не торопясь идёшь назад пешком — вылазка окончена, всё добытое уже в трюме.',
            buttons:
              stationButtons(
                deps,
                player
              ),
          },
          nextState: {
            scene:
              'station',
            player,
          },
        };
      }

      const fallbackButtons =
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
            'Выбери действие кнопкой ниже.',
          buttons:
            fallbackButtons,
        },
        nextState: state,
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
              `${event.text}`,
            buttons:
              event.choices.map(
                (c) => c.text
              ),
          },
          nextState: state,
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
              'pre_combat',
            player,
            enemy,
            zone: combatZone,
            depth,
          },
        };
      }

      if (
        choice.loot
      ) {
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

    case 'pre_combat': {
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

        if (toShip) return toShip;

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
              'station',
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
              'combat',
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
        nextState: state,
      };
    }

    case 'combat': {
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

        if (toShip) return toShip;

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
              'station',
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
          nextState: state,
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
          player.level ||
            1
        );

      const result =
        require('../../engine/combat-engine.js')
          .resolveTurn(
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

        if (toShip) return toShip;

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
              'station',
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
          hp: Math.round(
            player.hpMax * 0.3
          ),
        };

        const toShip =
          returnFromPlanet(
            deps,
            defeatedPlayer,
            `☠️ ${result.log?.join(' ') || 'Ты потерпел поражение.'}\n\n`
          );

        if (toShip) return toShip;

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
              'station',
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
            'combat',
          player,
          enemy:
            result.defender,
          zone,
          depth,
        },
      };
    }

    case 'pack_combat': {
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

        if (toShip) return toShip;

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
              'station',
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
      return null;
  }
}

module.exports = {
  handleExploration,
  explore,
  resolveExplorationEvent,
  resolvePackAction,
  returnFromPlanet,
};
