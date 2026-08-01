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
  [SCENES.NEUTRAL_ENCOUNTER]: handleExploration,
  [SCENES.STEALTH_EXPLORE]: handleExploration,

  [SCENES.LOC_BRIDGE]: handleBridge,
  [SCENES.LORE_MYTHOS]: handleBridge,
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
  [SCENES.SHIP_PRE_COMBAT]: handleTravel,
  [SCENES.SHIP_COMBAT]: handleTravel,
  [SCENES.SHIP_TRADER]: handleTravel,
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

  const scene = state?.scene || SCENES.START;
  const handler = SCENE_HANDLERS[scene];

  if (!handler) {
    return { reply: { text: 'Что-то пошло не так, начнём заново.', buttons: [] }, nextState: { scene: SCENES.START } };
  }

  const result = await handler(state, input, rng, deps, playerId);

  // Защитная сетка: если конкретный модуль почему-то не распознал сцену
  // (не должно происходить при верно заполненной SCENE_HANDLERS, но лучше
  // мягкий фолбэк, чем необъяснимый краш у игрока).
  if (!result) {
    return { reply: { text: 'Что-то пошло не так, начнём заново.', buttons: [] }, nextState: { scene: SCENES.START } };
  }

  return result;
}

module.exports = {
  step, freshPlayer, equippedSkillIds, addToInventory, sellInventory, hubMessage, stationButtons, contractsBoard,
  FACTIONS, FACTION_KIT, CURATORS, MAX_EQUIPPED_SKILLS, ZONE_BUTTONS, MIN_LEVEL_FOR_ZONE,
  SCENES,
};
