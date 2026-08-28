/**
 * Игровой роутер: диспетчер сцен. Раньше это был файл на 1500+ строк с
 * единым switch на все сцены игры сразу — теперь router.js только решает,
 * какой модуль в game/scenes/ отвечает за текущую сцену, и передаёт ему
 * управление. Вся игровая логика живёт в game/scenes/*.js.
 *
 * ВАЖНО для вызывающего кода (без изменений с прошлой версии):
 *   1. step() асинхронный — await step(...), не step(...).
 *   2. Пятый параметр — playerId (нужен только Бирже/Дуэли).
 *   3. deps.marketStore / deps.pvpStore — для реальной работы Биржи/PvP.
 */
'use strict';

const { SCENES } = require('./scenes/ids.js');
const {
  RESET_COMMAND, FACTIONS, FACTION_KIT, CURATORS, MAX_EQUIPPED_SKILLS, ZONE_BUTTONS, MIN_LEVEL_FOR_ZONE,
  freshPlayer, equippedSkillIds, addToInventory, sellInventory, hubMessage, stationButtons,
} = require('./scenes/common.js');

const { handleStart } = require('./scenes/start.js');
const { handleHub } = require('./scenes/hub.js');
const { handleCombat } = require('./scenes/combat.js');
const { handleExploration } = require('./scenes/exploration.js');
const { handleGuild } = require('./scenes/guild.js');
const { handleBridge } = require('./scenes/locations/bridge.js');
const { handleRepair } = require('./scenes/locations/repair.js');
const { handleDecon } = require('./scenes/locations/decon.js');
const { handleCantina, contractsBoard } = require('./scenes/locations/cantina.js');
const { handleGates } = require('./scenes/locations/gates.js');
const { handleWorkshop } = require('./scenes/locations/workshop.js');
const { handleCuratorQuest } = require('./scenes/quests/curator.js');
const { handleNpc } = require('./scenes/quests/npc.js');
const { handleBoss } = require('./scenes/boss.js');
const { handleRaid } = require('./scenes/raid.js');
const { handleMarket } = require('./scenes/market.js');
const { handlePvp } = require('./scenes/pvp.js');
const { handleHousing } = require('./scenes/housing.js');
const { handleTravel } = require('./scenes/travel.js');
const { handlePartyCombat } = require('./scenes/party-combat.js');
const { handleVolnyPort } = require('./scenes/locations/volny-port.js');
const { handleVein } = require('./scenes/vein.js');
const { shouldCheckSpawn, rollSpawn, randomVeinTier } = require('../engine/vein-spawn-timer.js');
const { createVein } = require('../engine/resource-vein.js');
const {
  shouldCheckSpawn: shouldCheckTractSpawn, rollSpawn: rollTractSpawn,
  rollTractDuration, rollDeadEndOrigin,
} = require('../engine/tract-spawn-timer.js');

// scene -> обработчик. Несколько сцен могут указывать на один и тот же
// модуль (например STATION и DISTRICT_HUB оба идут в handleHub) — каждый
// модуль сам разбирается, какая именно сцена пришла, через свой switch
// или явную проверку state.scene.
const SCENE_HANDLERS = {
  [SCENES.START]: handleStart,
  [SCENES.ASK_NAME]: handleStart,
  [SCENES.ASK_FACTION]: handleStart,
  [SCENES.QUEST_REPORT]: handleStart,
  [SCENES.QUEST_SHOP]: handleStart,
  [SCENES.QUEST_GATES]: handleStart,

  [SCENES.STATION]: handleHub,
  [SCENES.DISTRICT_HUB]: handleHub,

  [SCENES.PRE_COMBAT]: handleCombat,
  [SCENES.COMBAT]: handleCombat,
  [SCENES.COMBAT_STIM_SELECT]: handleCombat,

  [SCENES.JOURNEY]: handleExploration,
  [SCENES.JOURNEY_CONTINUE]: handleExploration,
  [SCENES.EXPLORATION_EVENT_CHOICE]: handleExploration,
  [SCENES.ANOMALY_CHOICE]: handleExploration,
  [SCENES.ANOMALY_PUZZLE]: handleExploration,
  [SCENES.NEUTRAL_ENCOUNTER]: handleExploration,
  [SCENES.STEALTH_EXPLORE]: handleExploration,

  [SCENES.LOC_BRIDGE]: handleBridge,
  [SCENES.LORE_MYTHOS]: handleBridge,
  [SCENES.PASSIVE_MANAGEMENT]: handleBridge,
  [SCENES.FACTION_TRANSFER]: handleBridge,
  [SCENES.MENTOR_CLASS]: handleBridge,
  [SCENES.QUEST_SHYOPOT]: handleBridge,

  [SCENES.LOC_REPAIR]: handleRepair,
  [SCENES.LOC_DECON]: handleDecon,

  [SCENES.LOC_CANTINA]: handleCantina,
  [SCENES.CONTRACTS]: handleCantina,
  [SCENES.DICE_GAME]: handleCantina,

  [SCENES.LOC_GATES]: handleGates,
  [SCENES.LOC_GATES_TRAVEL]: handleGates,

  [SCENES.WORKSHOP]: handleWorkshop,
  [SCENES.REFORGE_PICK]: handleWorkshop,
  [SCENES.REFORGE_TARGET]: handleWorkshop,
  [SCENES.CURATOR_QUEST]: handleCuratorQuest,
  [SCENES.NPC_PEOPLE]: handleNpc,
  [SCENES.NPC_QUEST]: handleNpc,
  [SCENES.BOSS_HUB]: handleBoss,
  [SCENES.BOSS_COMBAT]: handleBoss,
  [SCENES.RAID_LOBBY]: handleRaid,
  [SCENES.RAID_BATTLE]: handleRaid,

  [SCENES.MARKET_HUB]: handleMarket,
  [SCENES.MARKET_SELL_PICK]: handleMarket,
  [SCENES.MARKET_SELL_PRICE]: handleMarket,
  [SCENES.MARKET_MY_LISTINGS]: handleMarket,
  [SCENES.TRADE_ROUTES]: handleMarket,
  [SCENES.MARKET_ITEM_BOOK]: handleMarket,
  [SCENES.MARKET_BUY_QTY]: handleMarket,

  [SCENES.PVP_MENU]: handlePvp,
  [SCENES.PVP_DUEL]: handlePvp,

  [SCENES.HOUSING_HUB]: handleHousing,
  [SCENES.HOUSING_ITEM_PICK]: handleHousing,

  [SCENES.SHIP_TRAVEL]: handleTravel,
  [SCENES.SHIP_RETURNING]: handleTravel,
  [SCENES.PACK_PRE_COMBAT]: handleExploration,
  [SCENES.PACK_COMBAT]: handleExploration,
  [SCENES.PACK_TARGET]: handleExploration,
  [SCENES.DISTRESS_CHOICE]: handleExploration,
  [SCENES.RESONANCE_PEDESTAL_CHOICE]: handleExploration,
  [SCENES.TERMINAL_HACK_CHOICE]: handleExploration,
  [SCENES.ECHO_PLAYBACK_CHOICE]: handleExploration,
  [SCENES.REACTION_HAZARD_CHOICE]: handleExploration,
  [SCENES.CORRUPTED_AI_CHOICE]: handleExploration,
  [SCENES.GUILD_HUB]: handleGuild,
  [SCENES.GUILD_CREATE_NAME]: handleGuild,
  [SCENES.GUILD_JOIN_NAME]: handleGuild,
  [SCENES.GUILD_DONATE_CREDITS]: handleGuild,
  [SCENES.GUILD_DONATE_RESOURCE]: handleGuild,
  [SCENES.GUILD_WITHDRAW_RESOURCE]: handleGuild,
  [SCENES.GUILD_UPGRADE]: handleGuild,
  [SCENES.GUILD_PROJECTS_LIST]: handleGuild,
  [SCENES.GUILD_PROJECT_DETAIL]: handleGuild,
  [SCENES.GUILD_PROJECT_DONATE_CREDITS]: handleGuild,
  [SCENES.GUILD_PROJECT_DONATE_RESOURCE]: handleGuild,
  [SCENES.SHIP_PRE_COMBAT]: handleTravel,
  [SCENES.SHIP_COMBAT]: handleTravel,
  [SCENES.SHIP_TRADER]: handleTravel,

  [SCENES.VEIN_HUB]: handleVein,
  [SCENES.VEIN_ATTACK_LIST]: handleVein,
  [SCENES.VEIN_PVP_COMBAT]: handleVein,
  [SCENES.VEIN_MONSTER_COMBAT]: handleVein,
  [SCENES.VEIN_BOSS_COMBAT]: handleVein,

  ['party_combat_menu']: handlePartyCombat,
  ['party_combat_round']: handlePartyCombat,

  ['volny_port_hub']: handleVolnyPort,
  ['volny_port_docks']: handleVolnyPort,
  ['volny_port_market']: handleVolnyPort,
  ['volny_port_blackmarket']: handleVolnyPort,
  ['volny_port_pilots']: handleVolnyPort,
  ['volny_port_mercs']: handleVolnyPort,
  ['volny_port_redsector']: handleVolnyPort,
  ['volny_port_uppercity']: handleVolnyPort,
  ['volny_port_olddock']: handleVolnyPort,

  ['people_in_city']: handleHub,
};

const RESET_REPLY = {
  reply: {
    text: '🔄 Прогресс сброшен подчистую.\n\n🛰️ ПЕРИФЕРИЯ\n\nТы не должен был очнуться. Спасательная капсула шла на автопилоте три века — с того дня, как Тракт разорвался и выбросил тысячи ковчегов на край известного космоса.\n\nНо что-то разбудило тебя именно сейчас. Не авария. Не таймер. Слабый сигнал — идущий не из капсулы и не со станции, к которой ты пристыковался.\n\nРазберёшься позже. Как тебя записать в журнал станции?',
    buttons: []
  },
  nextState: { scene: SCENES.ASK_NAME }
};

async function step(state, text, rng = Math.random, deps = {}, playerId = null) {
  const input = (text || '').trim();

  if (input === RESET_COMMAND) {
    return RESET_REPLY;
  }

  // Обработчики сцен (handleStart и другие) читают state.scene напрямую,
  // без защиты — если state вообще не передан (по-настоящему новый
  // игрок, для которого ничего ещё не сохранялось), это раньше валило
  // всё исключением. Нормализуем здесь один раз, а не в каждом
  // обработчике отдельно.
  const safeState = state || { scene: SCENES.START };

  const scene = safeState.scene || SCENES.START;
  const handler = SCENE_HANDLERS[scene];

  // Раньше и "сцена не найдена", и "обработчик вернул null" вели прямо в
  // SCENES.START — то есть тихо стирали персонажа при ЛЮБОЙ мелкой
  // нестыковке (неопознанный ввод внутри конкретной сцены, опечатка в
  // имени сцены при сохранении и т.п.). Это и есть баг с исчезающим
  // персонажем при клике по жиле — конкретный сценовый обработчик не
  // распознал состояние/ввод и вернул null, а не потому что персонаж
  // реально пропал. Теперь: если player есть — всегда мягкий возврат на
  // станцию с ним, без потери прогресса. Полный сброс — ТОЛЬКО через
  // явную команду RESET_COMMAND, больше никак.
  if (!handler) {
    console.error('router.js: неизвестная сцена "' + scene + '" для playerId=' + playerId);
    if (safeState.player) {
      return { reply: { text: '⚠️ Что-то пошло не так на этом экране. Возвращаю тебя на станцию — прогресс не потерян.', buttons: [] }, nextState: { scene: SCENES.STATION, player: safeState.player } };
    }
    return { reply: { text: 'Что-то пошло не так, начнём заново.', buttons: [] }, nextState: { scene: SCENES.START } };
  }

  const result = await handler(safeState, input, rng, deps, playerId);

  // Защитная сетка: если конкретный модуль почему-то не распознал сцену
  // (не должно происходить при верно заполненной SCENE_HANDLERS, но лучше
  // мягкий фолбэк, чем необъяснимый краш у игрока).
  if (!result) {
    console.error('router.js: обработчик сцены "' + scene + '" вернул null для ввода "' + input + '", playerId=' + playerId);
    if (safeState.player) {
      return { reply: { text: '⚠️ Не получилось обработать это действие. Возвращаю тебя на станцию — прогресс не потерян.', buttons: [] }, nextState: { scene: SCENES.STATION, player: safeState.player } };
    }
    return { reply: { text: 'Что-то пошло не так, начнём заново.', buttons: [] }, nextState: { scene: SCENES.START } };
  }

  // HP персонажа лечится бесплатно и автоматически при ЛЮБОМ возврате на
  // станцию — независимо от того, откуда пришли (поражение в бою, конец
  // вылазки, возврат с полёта и т.д.). Централизовано здесь, а не в
  // каждом отдельном месте, которое строит nextState.scene='station' —
  // мест таких много, и раскидывать логику лечения по всем ним рискованно
  // забыть где-то одно. Ремонт КОРАБЛЯ, в отличие от HP персонажа,
  // остаётся платным — см. game/scenes/locations/repair.js.
  if (result.reply && result.nextState?.player?.pendingVoiceMessage) {
    result.reply = { ...result.reply, text: `${result.reply.text}\n\n${result.nextState.player.pendingVoiceMessage}` };
    result.nextState = { ...result.nextState, player: { ...result.nextState.player, pendingVoiceMessage: undefined } };
  }

  if (result.nextState?.scene === SCENES.STATION && result.nextState.player) {
    const player = result.nextState.player;
    if (player.hp < player.hpMax) {
      // Тот же сигнал "реально вернулся откуда-то" (не просто листает меню
      // станции, где HP и так уже полное) используем и для фонового
      // облучения Кузницы — иначе оно бы копилось на каждый клик по хабу.
      const ambientRadiation = player.faction === 'Кузница' ? 3 : 0;
      result.nextState = {
        ...result.nextState,
        player: { ...player, hp: player.hpMax, radiation: Math.min(100, (player.radiation || 0) + ambientRadiation) }
      };
    }

    // Ленивая проверка появления новой жилы — раз в ~30 минут, с любого
    // визита на станцию любого игрока (нет фонового процесса, см. заметку
    // в engine/vein-spawn-timer.js). Если жила действительно появилась —
    // вешаем её на result.veinJustSpawned, чтобы транспортный слой
    // (vk/webhook-handler.js) разослал уведомление всем известным игрокам —
    // сам router.js намеренно не делает сетевых вызовов.
    if (deps.veinStore) {
      try {
        const activeVein = await deps.veinStore.getActiveVein();
        if (!activeVein) {
          const lastCheck = await deps.veinStore.getLastSpawnCheckAt();
          if (shouldCheckSpawn(lastCheck)) {
            await deps.veinStore.markSpawnChecked();
            if (rollSpawn(rng)) {
              const tier = randomVeinTier(rng);
              const vein = createVein(tier, 1, rng);
              await deps.veinStore.createVein(vein);
              result.veinJustSpawned = vein;
            }
          }
        }
      } catch (err) {
        console.error('проверка появления жилы упала:', err.message);
      }
    }

    // Тот же ленивый принцип — появление временного Тракта из тупиковых
    // узлов (Разлом Кайлара/Пустошь Табира). Не привязано к тому, где
    // сейчас игрок — жила проверяется от лица зашедшего на станцию, Тракт
    // так же: сам факт визита кого угодно на станцию — повод проверить.
    if (deps.tractStore) {
      try {
        const lastTractCheck = await deps.tractStore.getLastSpawnCheckAt();
        if (shouldCheckTractSpawn(lastTractCheck)) {
          await deps.tractStore.markSpawnChecked();
          if (rollTractSpawn(rng)) {
            const origin = rollDeadEndOrigin(rng);
            const HOME_NODES = ['priyut', 'vual', 'terminus', 'arsenal', 'kuznitsa'];
            const destination = HOME_NODES[Math.floor(rng() * HOME_NODES.length)];
            const duration = rollTractDuration(rng);
            const stability = 0.4 + rng() * 0.5;
            const tract = await deps.tractStore.createTemporaryTract({ from: origin, to: destination, durationMs: duration, stability });
            result.tractJustSpawned = tract;
          }
        }
      } catch (err) {
        console.error('проверка появления временного Тракта упала:', err.message);
      }
    }
  }

  return result;
}

module.exports = {
  step, freshPlayer, equippedSkillIds, addToInventory, sellInventory, hubMessage, stationButtons, contractsBoard,
  FACTIONS, FACTION_KIT, CURATORS, MAX_EQUIPPED_SKILLS, ZONE_BUTTONS, MIN_LEVEL_FOR_ZONE,
  SCENES,
};
