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
const { handleBridge } = require('./scenes/locations/bridge.js');
const { handleRepair } = require('./scenes/locations/repair.js');
const { handleDecon } = require('./scenes/locations/decon.js');
const { handleCantina, contractsBoard } = require('./scenes/locations/cantina.js');
const { handleGates } = require('./scenes/locations/gates.js');
const { handleWorkshop } = require('./scenes/locations/workshop.js');
const { handleCuratorQuest } = require('./scenes/quests/curator.js');
const { handleMarket } = require('./scenes/market.js');
const { handlePvp } = require('./scenes/pvp.js');
const { handleHousing } = require('./scenes/housing.js');
const { handleTravel } = require('./scenes/travel.js');
const { handleVein } = require('./scenes/vein.js');
const { shouldCheckSpawn, rollSpawn, randomVeinTier } = require('../engine/vein-spawn-timer.js');
const { createVein } = require('../engine/resource-vein.js');

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
  [SCENES.QUEST_SHYOPOT]: handleBridge,

  [SCENES.LOC_REPAIR]: handleRepair,
  [SCENES.LOC_DECON]: handleDecon,

  [SCENES.LOC_CANTINA]: handleCantina,
  [SCENES.CONTRACTS]: handleCantina,

  [SCENES.LOC_GATES]: handleGates,
  [SCENES.LOC_GATES_TRAVEL]: handleGates,

  [SCENES.WORKSHOP]: handleWorkshop,
  [SCENES.CURATOR_QUEST]: handleCuratorQuest,

  [SCENES.MARKET_HUB]: handleMarket,
  [SCENES.MARKET_SELL_PICK]: handleMarket,
  [SCENES.MARKET_SELL_PRICE]: handleMarket,
  [SCENES.MARKET_MY_LISTINGS]: handleMarket,
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
  [SCENES.SHIP_PRE_COMBAT]: handleTravel,
  [SCENES.SHIP_COMBAT]: handleTravel,
  [SCENES.SHIP_TRADER]: handleTravel,

  [SCENES.VEIN_HUB]: handleVein,
  [SCENES.VEIN_ATTACK_LIST]: handleVein,
  [SCENES.VEIN_PVP_COMBAT]: handleVein,
  [SCENES.VEIN_MONSTER_COMBAT]: handleVein,
  [SCENES.VEIN_BOSS_COMBAT]: handleVein,
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
  }

  return result;
}

module.exports = {
  step, freshPlayer, equippedSkillIds, addToInventory, sellInventory, hubMessage, stationButtons, contractsBoard,
  FACTIONS, FACTION_KIT, CURATORS, MAX_EQUIPPED_SKILLS, ZONE_BUTTONS, MIN_LEVEL_FOR_ZONE,
  SCENES,
};
