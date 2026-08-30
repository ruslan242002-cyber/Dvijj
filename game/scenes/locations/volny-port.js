'use strict';

/**
 * ВОЛЬНЫЙ ПОРТ — почти город по масштабу (6 районов, 5 "правителей"),
 * но НИГДЕ формально не значится городом: не в FACTIONS, не в
 * CITY_UNLOCK_LEVEL, нет домашней станции для него, нельзя вступить.
 * Просто отдельная посещаемая локация в сети Трактов (engine/tract-
 * network.js: volny_port), только гораздо крупнее обычной локации по
 * содержимому.
 *
 * "Пять Швартовых" держат каждый свой сектор экономики станции —
 * функции завязаны на уже существующие системы (крафт-стор ресурсной
 * жилы, рынок, PvP-контракты, скины кораблей), не изобретают новые
 * параллельные механики с нуля.
 */
const { requiredTool, RESONANCE_DRILL, VEIN_ANNIHILATOR } = require('../../../engine/resource-vein.js');
const { SHIP_SKINS, skinsAvailableFor, ownedSkins, purchaseSkin } = require('../../../engine/ship-skins.js');
const { PASSIVE_SKILLS } = require('../../../engine/passive-skills.js');
const { characterScreen } = require('../named-character.js');
const { buildBestiaryFighter, BESTIARY } = require('../../../engine/bestiary.js');
const { resolveTurn } = require('../../../engine/combat-engine.js');
const { hubMessage, stationButtons, addToInventory } = require('../common.js');
const { SCENES } = require('../ids.js');

const BLACK_MARKET_DISCOUNT = 0.18; // дешевле официальной цены — краденое, вопросов не задают

const SHLAK_OFFERS = [
  { resource: 'Сплавы', tier: 1, qty: 10, basePrice: 100 },
  { resource: 'Реголит', tier: 1, qty: 10, basePrice: 90 },
  { resource: 'Изотопы', tier: 2, qty: 8, basePrice: 160 },
  { resource: 'Полимеры', tier: 2, qty: 8, basePrice: 150 },
  { resource: 'Биомасса', tier: 1, qty: 10, basePrice: 85 },
];

const TOOL_OFFERS = {
  [RESONANCE_DRILL]: { name: 'Резонансный бур', price: 350 }, // дороже честного крафта — платишь за скорость, не за цену
  [VEIN_ANNIHILATOR]: { name: 'Аннигилятор жилы', price: 1300 },
};

function volnyPortHub(player, prefixText = '') {
  return {
    reply: {
      text: `${prefixText}🏴‍☠️ ВОЛЬНЫЙ ПОРТ\n\n«Здесь закон заканчивается там, где начинается договор».\n\nСтанция без единой юрисдикции — территория Пяти Швартовых. Куда пойдёшь?`,
      buttons: ['⚓ Нижние доки', '🏪 Рынок «Шлак»', '🛌 Пилотский квартал', '🔴 Красный сектор', '🏙️ Верхний город', '🗿 Старый док', '🔫 Наёмники', '🕶️ Чёрный рынок', '⬅️ Назад'],
      imageKey: 'locations/hub.jpg',
    },
    nextState: { scene: 'volny_port_hub', player },
  };
}

function docksScreen(player, prefixText = '') {
  const missingHp = Math.max(0, player.ship.hpMax - player.ship.hp);
  const cost = Math.round(missingHp * 4); // дороже честной станции — плата за отсутствие вопросов
  return {
    reply: {
      text: `${prefixText}⚓ НИЖНИЕ ДОКИ\n\nМатрос Гейл, не поднимая глаз от чертежей: «Чиню что угодно, без вопросов о происхождении. Дороже, чем на станции — зато без документов».\n\n${missingHp > 0 ? `Ремонт корпуса: 💳${cost}` : 'Корабль и так цел.'}`,
      buttons: missingHp > 0 ? ['🔧 Починить без вопросов', '⬅️ Назад'] : ['⬅️ Назад'],
      imageKey: 'locations/nizhnie-doki.jpg',
    },
    nextState: { scene: 'volny_port_docks', player },
  };
}

function shlakMarketScreen(player, prefixText = '') {
  const lines = SHLAK_OFFERS.map((o) => {
    const price = Math.round(o.basePrice * (1 - BLACK_MARKET_DISCOUNT));
    return `${o.resource} T${o.tier} ×${o.qty} — 💳${price} (дешевле официальной цены)`;
  });
  const buttons = SHLAK_OFFERS.map((o) => `Купить: ${o.resource} T${o.tier}`);
  buttons.push('⬅️ Назад');
  return {
    reply: { text: `${prefixText}🏪 РЫНОК «ШЛАК»\n\nДама Ренци держит рынок целиком — каждая лавка платит ей за право торговать. Вежлива, расчётлива, никогда не повышает голос.\n\n${lines.join('\n')}`, buttons, imageKey: 'locations/rynok-shalak.jpg' },
    nextState: { scene: 'volny_port_market', player },
  };
}

function toolsScreen(player, prefixText = '') {
  const owned = player.tools || [];
  const lines = Object.entries(TOOL_OFFERS).map(([id, t]) => `${t.name} — 💳${t.price}${owned.includes(id) ? ' (уже есть)' : ''}`);
  const buttons = Object.entries(TOOL_OFFERS).filter(([id]) => !owned.includes(id)).map(([, t]) => `Купить инструмент: ${t.name}`);
  buttons.push('⬅️ Назад');
  return {
    reply: { text: `${prefixText}🕶️ ЧЁРНЫЙ РЫНОК\n\nТень Мару встречается только по рекомендации. Здесь есть то, чего у фракций официально нет.\n\n🔧 Инструменты жилы без крафта:\n${lines.join('\n')}`, buttons },
    nextState: { scene: 'volny_port_blackmarket', player },
  };
}

function mercenariesScreen(player, prefixText = '') {
  return {
    reply: {
      text: `${prefixText}🔫 НАЁМНИКИ\n\nКапитан Дрейк «Восемь Пуль» кивает на доску контрактов: «Охрана груза, зачистка, разное. Спрашивай — может, что-то как раз для тебя».\n\n(Контракты на конкретных игроков — пока не реализовано, придержано на будущее.)`,
      buttons: ['⬅️ Назад'],
    },
    nextState: { scene: 'volny_port_mercs', player },
  };
}

function pilotQuarterScreen(player, prefixText = '') {
  const owned = ownedSkins(player);
  // "Нейтральные" — без привязки к фракции (faction не задан) и не дроп-эксклюзив.
  const neutralSkins = SHIP_SKINS.filter((s) => !s.faction && !s.dropOnly && s.cost > 0);
  const lines = neutralSkins.map((s) => `${s.name} — 💳${s.cost}${owned.includes(s.id) ? ' (уже есть)' : ''}`);
  const buttons = neutralSkins.filter((s) => !owned.includes(s.id)).map((s) => `Купить скин: ${s.name}`);
  buttons.push('⬅️ Назад');
  return {
    reply: { text: `${prefixText}🛌 ПИЛОТСКИЙ КВАРТАЛ\n\nДешёвые гостиницы, бары, симуляторы полётов. Здесь — нейтральные окраски корабля, без привязки к станции.\n\n${lines.join('\n')}`, buttons, imageKey: 'locations/pilotskiy-kvartal.jpg' },
    nextState: { scene: 'volny_port_pilots', player },
  };
}

/** Красный сектор — территория местных банд, где даже пираты стараются
 * не нарушать правила. Заход сюда — реальный риск: случайная стычка с
 * бандитом (переиспользую бестиарий, не отдельную сущность), победа
 * даёт добычу лучше обычной уличной драки. */
function redSectorScreen(player, prefixText = '') {
  return {
    reply: {
      text: `${prefixText}🔴 КРАСНЫЙ СЕКТОР\n\nДаже здесь есть правила — просто их держат не законом, а страхом. Соваться сюда без причины опасно.`,
      buttons: ['⚔️ Пойти вглубь (риск)', '⬅️ Назад'],
    },
    nextState: { scene: 'volny_port_redsector', player },
  };
}

function redSectorEncounter(player, rng) {
  const bestiaryIds = Object.keys(BESTIARY);
  const pickId = bestiaryIds[Math.floor(rng() * bestiaryIds.length)];
  const enemy = buildBestiaryFighter(BESTIARY[pickId], player.level || 1);
  enemy.name = `Бандит с позывным «${enemy.name}»`; // тот же противник по силе, другая подача — не дикий зверь, а местная банда
  return { reply: { text: `Из тени переулка выходит фигура: «Не туда забрёл, чужак».`, buttons: ['⚔️ Атаковать', '🏃 Уйти'] }, nextState: { scene: 'pre_combat', player, enemy, redSectorFight: true } };
}

/** Верхний город — здесь продают то, что редко валяется под ногами:
 * готовые пассивные нейрочипы (обычно только случайная находка на
 * вылазках, engine/passive-skills.js) — за деньги, без удачи. */
const UPPER_CITY_CHIP_IDS = ['xp_gain_1', 'loot_find_1', 'credit_gain_1', 'regeneration_1', 'focus_1'];
const UPPER_CITY_CHIP_PRICE = 600;

function upperCityScreen(player, prefixText = '') {
  const owned = player.knownPassives || [];
  const chips = player.passiveChips || [];
  const available = UPPER_CITY_CHIP_IDS.filter((id) => !owned.includes(id) && !chips.includes(id));
  const lines = available.map((id) => `${PASSIVE_SKILLS[id].name} — 💳${UPPER_CITY_CHIP_PRICE}`);
  const buttons = available.map((id) => `Купить чип: ${PASSIVE_SKILLS[id].name}`);
  buttons.push('Айрин Вельмор', '⬅️ Назад');
  return {
    reply: {
      text: `${prefixText}🏙️ ВЕРХНИЙ ГОРОД\n\nВысотные здания, дорогие рестораны, панорамные окна с видом на космос — самая неожиданная часть Вольного Порта.\n\nЗдесь продают нейрочипы напрямую — то, что обычно достаётся только удачей на вылазках.\n\n${lines.length ? lines.join('\n') : 'Сейчас нечего предложить.'}`,
      buttons,
      imageKey: 'locations/verhniy-gorod.jpg',
    },
    nextState: { scene: 'volny_port_uppercity', player },
  };
}

/** Старый док — раньше был чисто лорной остановкой без механики, теперь
 * здесь можно поговорить с Кайром «Старый Радар» (city/named-characters.js,
 * пока status:'stub' — функции честно отвечают "в разработке"). */
function oldDockScreen(player, prefixText = '') {
  return {
    reply: {
      text: `${prefixText}🗿 СТАРЫЙ ДОК\n\nИменно вокруг этого причала когда-то и вырос весь Вольный Порт — задолго до неоновых улиц и рынка «Шлак». Обшивка здесь старше самой станции, латана десятками разных рук.\n\nНикто уже не помнит, кто пристыковался первым. Но каждый Швартовый в этом сходится: без Старого дока не было бы ничего остального.`,
      buttons: ['Поговорить с Кайром', '⬅️ Назад'],
      imageKey: 'npc/kayr.jpg',
    },
    nextState: { scene: 'volny_port_olddock', player },
  };
}


function handleVolnyPort(state, input, rng, deps) {
  switch (state.scene) {
    case 'volny_port_hub': {
      if (input === '⬅️ Назад') {
        return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player) }, nextState: { scene: 'station', player: state.player } };
      }
      if (input === '⚓ Нижние доки') return docksScreen(state.player);
      if (input === '🏪 Рынок «Шлак»') return shlakMarketScreen(state.player);
      if (input === '🛌 Пилотский квартал') return pilotQuarterScreen(state.player);
      if (input === '🔫 Наёмники') return mercenariesScreen(state.player);
      if (input === '🕶️ Чёрный рынок') return toolsScreen(state.player);
      if (input === '🔴 Красный сектор') return redSectorScreen(state.player);
      if (input === '🏙️ Верхний город') return upperCityScreen(state.player);
      if (input === '🗿 Старый док') return oldDockScreen(state.player);
      return volnyPortHub(state.player);
    }

    case 'volny_port_redsector': {
      if (input === '⬅️ Назад') return volnyPortHub(state.player);
      if (input === '⚔️ Пойти вглубь (риск)') return redSectorEncounter(state.player, rng);
      return redSectorScreen(state.player);
    }

    case 'volny_port_uppercity': {
      if (input === '⬅️ Назад') return volnyPortHub(state.player);
      if (input === 'Айрин Вельмор') {
        return characterScreen('ayrin_velmor', state.player, 'volny_port_uppercity');
      }
      const match = /^Купить чип: (.+)$/.exec(input);
      if (match) {
        const id = UPPER_CITY_CHIP_IDS.find((cid) => PASSIVE_SKILLS[cid].name === match[1]);
        if (!id) return upperCityScreen(state.player);
        if ((state.player.credits || 0) < UPPER_CITY_CHIP_PRICE) return upperCityScreen(state.player, 'Не хватает кредитов.\n\n');
        const player = { ...state.player, passiveChips: [...(state.player.passiveChips || [])] };
        player.credits -= UPPER_CITY_CHIP_PRICE;
        player.passiveChips.push(id);
        return upperCityScreen(player, `Чип куплен: ${PASSIVE_SKILLS[id].name}. Изучить его можно на Мостике («Пассивки»).\n\n`);
      }
      return upperCityScreen(state.player);
    }

    case 'volny_port_olddock': {
      if (input === 'Поговорить с Кайром') {
        return characterScreen('kayr', state.player, 'volny_port_olddock');
      }
      return oldDockScreen(state.player);
    }

    case 'volny_port_docks': {
      if (input === '⬅️ Назад') return volnyPortHub(state.player);
      if (input === '🔧 Починить без вопросов') {
        const player = { ...state.player, ship: { ...state.player.ship } };
        const missingHp = Math.max(0, player.ship.hpMax - player.ship.hp);
        const cost = Math.round(missingHp * 4);
        if (missingHp === 0) return docksScreen(player);
        if ((player.credits || 0) < cost) return docksScreen(player, `Не хватает кредитов (нужно 💳${cost}).\n\n`);
        player.credits -= cost;
        player.ship.hp = player.ship.hpMax;
        return docksScreen(player, `Матрос Гейл кивает и включает сварочный аппарат. Списано 💳${cost}.\n\n`);
      }
      return docksScreen(state.player);
    }

    case 'volny_port_market': {
      if (input === '⬅️ Назад') return volnyPortHub(state.player);
      const match = /^Купить: (.+) T(\d+)$/.exec(input);
      if (match) {
        const [, resource, tierStr] = match;
        const tier = Number(tierStr);
        const offer = SHLAK_OFFERS.find((o) => o.resource === resource && o.tier === tier);
        if (!offer) return shlakMarketScreen(state.player);
        const price = Math.round(offer.basePrice * (1 - BLACK_MARKET_DISCOUNT));
        if ((state.player.credits || 0) < price) return shlakMarketScreen(state.player, 'Не хватает кредитов.\n\n');
        const player = { ...state.player };
        player.credits -= price;
        addToInventory(player, offer.resource, offer.tier, offer.qty);
        return shlakMarketScreen(player, `Сделка заключена: ${offer.resource} T${offer.tier} ×${offer.qty}.\n\n`);
      }
      return shlakMarketScreen(state.player);
    }

    case 'volny_port_blackmarket': {
      if (input === '⬅️ Назад') return volnyPortHub(state.player);
      const match = /^Купить инструмент: (.+)$/.exec(input);
      if (match) {
        const entry = Object.entries(TOOL_OFFERS).find(([, t]) => t.name === match[1]);
        if (!entry) return toolsScreen(state.player);
        const [toolId, tool] = entry;
        if ((state.player.tools || []).includes(toolId)) return toolsScreen(state.player, 'Этот инструмент у тебя уже есть.\n\n');
        if ((state.player.credits || 0) < tool.price) return toolsScreen(state.player, 'Не хватает кредитов.\n\n');
        const player = { ...state.player, tools: [...(state.player.tools || [])] };
        player.credits -= tool.price;
        player.tools.push(toolId);
        return toolsScreen(player, `Тень Мару молча кивает и передаёт инструмент. Списано 💳${tool.price}.\n\n`);
      }
      return toolsScreen(state.player);
    }

    case 'volny_port_pilots': {
      if (input === '⬅️ Назад') return volnyPortHub(state.player);
      const match = /^Купить скин: (.+)$/.exec(input);
      if (match) {
        const skin = SHIP_SKINS.find((s) => s.name === match[1]);
        if (!skin) return pilotQuarterScreen(state.player);
        const player = { ...state.player, ship: { ...state.player.ship, ownedSkins: [...(state.player.ship?.ownedSkins || ['skin_default'])] } };
        const result = purchaseSkin(player, skin.id);
        if (!result.success) {
          const reasonText = { ALREADY_OWNED: 'Этот скин у тебя уже есть.', INSUFFICIENT_CREDITS: 'Не хватает кредитов.', WRONG_FACTION: 'Этот скин не для твоей фракции.' }[result.reason] || 'Не получилось купить.';
          return pilotQuarterScreen(state.player, `${reasonText}\n\n`);
        }
        return pilotQuarterScreen(player, `Куплено: ${skin.name}. Списано 💳${skin.cost}.\n\n`);
      }
      return pilotQuarterScreen(state.player);
    }

    case 'volny_port_mercs': {
      return volnyPortHub(state.player);
    }

    default:
      return null;
  }
}

module.exports = { handleVolnyPort, volnyPortHub };
