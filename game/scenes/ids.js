'use strict';

/**
 * Константы имён сцен. Раньше сцена была голой строкой в каждом
 * nextState — опечатка вроде 'statoin' компилировалась молча и тихо
 * ломала переход только в рантайме. Теперь опечатка — это ReferenceError
 * на этапе require(), а не необъяснимое "бот завис" у игрока.
 *
 * Использование не обязательно везде и сразу — старые строки продолжат
 * работать (это те же самые значения), но новый код лучше писать через
 * SCENES.XXX.
 */
const SCENES = Object.freeze({
  START: 'start',
  ASK_NAME: 'ask_name',
  ASK_FACTION: 'ask_faction',
  QUEST_REPORT: 'quest_report',
  QUEST_SHOP: 'quest_shop',
  QUEST_GATES: 'quest_gates',

  STATION: 'station',
  DISTRICT_HUB: 'district_hub',

  LOC_BRIDGE: 'loc_bridge',
  LORE_MYTHOS: 'lore_mythos',
  PASSIVE_MANAGEMENT: 'passive_management',
  FACTION_TRANSFER: 'faction_transfer',
  QUEST_SHYOPOT: 'quest_shyopot',
  LOC_REPAIR: 'loc_repair',
  LOC_DECON: 'loc_decon',
  LOC_CANTINA: 'loc_cantina',
  CONTRACTS: 'contracts',
  LOC_GATES: 'loc_gates',
  LOC_GATES_TRAVEL: 'loc_gates_travel',
  WORKSHOP: 'workshop',
  STEALTH_EXPLORE: 'stealth_explore',
  CURATOR_QUEST: 'curator_quest',

  JOURNEY: 'journey',
  JOURNEY_CONTINUE: 'journey_continue',
  EXPLORATION_EVENT_CHOICE: 'exploration_event_choice',
  ANOMALY_CHOICE: 'anomaly_choice',
  ANOMALY_PUZZLE: 'anomaly_puzzle',
  NEUTRAL_ENCOUNTER: 'neutral_encounter',

  PRE_COMBAT: 'pre_combat',
  COMBAT: 'combat',
  COMBAT_STIM_SELECT: 'combat_stim_select',

  MARKET_HUB: 'market_hub',
  MARKET_SELL_PICK: 'market_sell_pick',
  MARKET_SELL_PRICE: 'market_sell_price',
  MARKET_MY_LISTINGS: 'market_my_listings',
  MARKET_ITEM_BOOK: 'market_item_book',
  MARKET_BUY_QTY: 'market_buy_qty',
  PVP_MENU: 'pvp_menu',
  PVP_DUEL: 'pvp_duel',
  HOUSING_HUB: 'housing_hub',
  HOUSING_ITEM_PICK: 'housing_item_pick',

  SHIP_TRAVEL: 'ship_travel',
  SHIP_PRE_COMBAT: 'ship_pre_combat',
  SHIP_COMBAT: 'ship_combat',
  SHIP_TRADER: 'ship_trader',

  VEIN_HUB: 'vein_hub',
  VEIN_ATTACK_LIST: 'vein_attack_list',
  VEIN_PVP_COMBAT: 'vein_pvp_combat',
  VEIN_MONSTER_COMBAT: 'vein_monster_combat',
  VEIN_BOSS_WAIT: 'vein_boss_wait',
  VEIN_BOSS_COMBAT: 'vein_boss_combat',
});

module.exports = { SCENES };
