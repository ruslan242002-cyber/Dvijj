/**
 * Игровой роутер: то, что раньше рисовалось кубами в SaleBot, теперь —
 * обычная функция от (текущая сцена, входящее сообщение) к (ответ, новая сцена).
 * Ничего не завязано на ВК напрямую — vk.sendMessage(peerId, text, buttons)
 * это единственная точка выхода, поэтому в тестах подставляется fake-клиент.
 */
'use strict';

const { resolveTurn } = require('../engine/combat-engine.js');
const { SKILLS } = require('../engine/skills-data.js');
const { rollEvent, rollLoot } = require('../engine/exploration-engine.js');
const { grantXp, xpToNext, xpForTier } = require('../engine/leveling.js');
const { availableQuests, getQuest } = require('./quests-data.js');

const FACTIONS = ['Приют', 'Терминус', 'Арсенал', 'Вуаль'];

const FACTION_KIT = {
  'Приют':    { skills: ['heal_field'], statBias: { mind: 6, endurance: 4 } },
  'Терминус': { skills: ['living_heat'], statBias: { endurance: 8, power: 2 } },
  'Арсенал':  { skills: ['plasma_bolt', 'overload'], statBias: { power: 6, firepowerBonus: 4 } },
  'Вуаль':    { skills: ['anima_drain', 'corrosion'], statBias: { mind: 6, reaction: 4 } }
};

const MAX_EQUIPPED_SKILLS = 3;
const RESET_COMMAND = 'Сброс';

const HUB_BUTTONS = ['Исследовать', 'Мостик', 'Отсек', 'Декон-камера', 'Кантина', 'Врата Тракта', 'Статус', 'Профиль', 'Сброс'];
const ZONE_BUTTONS = ['Патрулируемый', 'Спорный', 'Открытый космос', 'К другим станциям', 'Назад'];
const ZONE_BY_LABEL = { 'Патрулируемый': 'blue', 'Спорный': 'yellow', 'Открытый космос': 'red' };
const ZONE_LABEL = { blue: 'Патрулируемый сектор', yellow: 'Спорный сектор', red: 'Открытый космос' };
// Минимальный уровень для входа в зону — первый рубеж защиты от "убило одним ударом".
const MIN_LEVEL_FOR_ZONE = { blue: 1, yellow: 3, red: 7 };

const CURATORS = { 'Приют': 'Ирис Вейл', 'Терминус': 'Дрого Кейн', 'Арсенал': 'Рен Окса', 'Вуаль': 'Шёпот' };

const ZONE_TRAVEL_PHRASES = {
  blue: [
    'Патрульный дрон станции лениво сканирует твой позывной и отворачивается — путь свободен.',
    'Знакомый гул генераторов станции затихает за спиной.',
    'Курс проложен, приборы спокойны — сектор патрулируемый.'
  ],
  yellow: [
    'Датчик радиации тихо щёлкает — пока в пределах нормы, но чаще, чем час назад.',
    'Обрывок чужих переговоров на общей частоте — сектор явно оспаривается.',
    'Обломки чужого корабля проплывают мимо — здесь недавно был бой.'
  ],
  red: [
    'Здесь эхо Тракта не в приборах — оно в голове.',
    'Связь со станцией слабеет с каждой секундой.',
    'Приборы фиксируют резонанс, для которого нет описания в базе.'
  ]
};
const STATION_TRAVEL_PHRASES = [
  'Тракт прокладывает курс между станциями — недолго, но не мгновенно.',
  'Обломки давно потерянных ковчегов мелькают за бортом.',
  'Резонанс Тракта на секунду искажает показания приборов — обычное дело для прыжка.',
  'Станция назначения уже видна вдалеке — почти на месте.'
];

/** Дежурный дрон-манекен — фиксированный слабый противник для тренировочного
 * боя, тот самый, что описан в тексте онбординга («Тренировочный отсек»). */
function trainerDrone() {
  return {
    name: 'Дрон-манекен', tier: 0,
    hp: 100, hpMax: 100,
    stats: { power: 8, mind: 8, reaction: 8, endurance: 10, firepower: 10, shielding: 5 },
    luck: 0, accuracy: 0.5, dodge: 0.05, focus: 0.4, periodic: []
  };
}

function freshPlayer(name, faction) {
  const bias = (FACTION_KIT[faction] || {}).statBias || {};
  const starterSkills = (FACTION_KIT[faction] || {}).skills || [];
  return {
    name, faction,
    hp: 220, hpMax: 220,
    stats: {
      power: 20 + (bias.power || 0),
      mind: 20 + (bias.mind || 0),
      reaction: 20 + (bias.reaction || 0),
      endurance: 22 + (bias.endurance || 0),
      firepower: 26 + (bias.firepowerBonus || 0),
      shielding: 18
    },
    luck: 10, accuracy: 0.8, dodge: 0.12, focus: 0.76,
    periodic: [],
    statPoints: 5,
    equippedSkills: starterSkills.slice(0, MAX_EQUIPPED_SKILLS),
    inventory: [],
    credits: 0,
    radiation: 0,
    zone: 'blue',
    level: 1,
    xp: 0,
    completedQuests: []
  };
}

function equippedSkillIds(player) {
  if (player.equippedSkills && player.equippedSkills.length) return player.equippedSkills;
  return (FACTION_KIT[player.faction] || {}).skills || [];
}
function skillButtons(player) {
  return equippedSkillIds(player).map((id) => SKILLS[id]?.name).filter(Boolean);
}
function skillIdByName(name) {
  return Object.values(SKILLS).find((s) => s.name === name)?.id || null;
}

function addToInventory(player, resource, tier, qty) {
  const inv = player.inventory || (player.inventory = []);
  const existing = inv.find((i) => i.resource === resource && i.tier === tier);
  if (existing) existing.qty += qty;
  else inv.push({ resource, tier, qty });
}

function sellInventory(player) {
  let total = 0;
  for (const item of player.inventory || []) total += item.qty * item.tier * 8;
  player.inventory = [];
  player.credits = (player.credits || 0) + total;
  return total;
}

function statusText(p) {
  const next = xpToNext(p.level || 1);
  return `${p.name} · ${p.faction}\n❤️ ${p.hp}/${p.hpMax}   💳 ${p.credits || 0}\n⭐ Ур. ${p.level || 1} (${p.xp || 0}/${next} XP)\n📍 Текущий сектор: ${ZONE_LABEL[p.zone] || 'Патрулируемый сектор'}${p.radiation ? `\n☢️ Облучение: ${p.radiation}%` : ''}${p.statPoints ? `\n✨ Нераспределённых очков: ${p.statPoints}` : ''}`;
}

function cantinaBoard(player) {
  const quests = availableQuests(player);
  if (quests.length === 0) {
    return { reply: { text: '🍸 КАНТИНА\n\nБармен пожимает плечами — куратору сейчас нечего тебе предложить.', buttons: ['Назад'] }, nextState: { scene: 'loc_cantina', player } };
  }
  return { reply: { text: '🍸 КАНТИНА\n\nДоступные задания куратора:', buttons: [...quests.map((q) => q.title), 'Назад'] }, nextState: { scene: 'loc_cantina', player } };
}

/** Начинает "путь" (2-3 хода) вместо мгновенного результата — и для похода
 * в сектор, и для перелёта между станциями. */
function startJourney(player, kind, payload, rng) {
  const stepsLeft = 2 + Math.floor(rng() * 2); // 2-3 шага
  const pool = kind === 'explore' ? (ZONE_TRAVEL_PHRASES[payload.zone] || ZONE_TRAVEL_PHRASES.blue) : STATION_TRAVEL_PHRASES;
  const text = pool[Math.floor(rng() * pool.length)];
  return {
    reply: { text, buttons: ['Продолжить путь'] },
    nextState: { scene: 'journey', player, kind, payload, stepsLeft }
  };
}

/** Общий обработчик исследования сектора — вызывается по прибытии (после journey) */
function explore(player, zone, rng) {
  const event = rollEvent(zone, rng, player.level || 1);
  if (event.type === 'ambush') {
    return {
      reply: { text: `⚠️ ОТГОЛОСОК\n\n${event.text}`, buttons: ['Атаковать', 'Отступить'] },
      nextState: { scene: 'pre_combat', player, enemy: event.enemy, zone }
    };
  }
  if (event.type === 'anomaly') {
    player.radiation = Math.min(100, (player.radiation || 0) + event.radiationGain);
    return {
      reply: { text: `🌀 АНОМАЛИЯ\n\n${event.text}\n☢️ Облучение: ${player.radiation}%`, buttons: HUB_BUTTONS },
      nextState: { scene: 'station', player }
    };
  }
  if (event.type === 'distress') {
    player.credits = (player.credits || 0) + event.reward.credits;
    return {
      reply: { text: `📡 СИГНАЛ БЕДСТВИЯ\n\n${event.text}\n💳 +${event.reward.credits} кредитов за спасательный рейс.`, buttons: HUB_BUTTONS },
      nextState: { scene: 'station', player }
    };
  }
  if (event.type === 'node') {
    addToInventory(player, event.resource, event.tier, 1);
    return {
      reply: { text: `⛏️ ЗАЛЕЖЬ\n\n${event.text}\nВ трюм добавлено: 1× ${event.resource} T${event.tier}.`, buttons: HUB_BUTTONS },
      nextState: { scene: 'station', player }
    };
  }
  addToInventory(player, event.loot.resource, event.loot.tier, event.loot.qty);
  player.credits = (player.credits || 0) + event.loot.credits;
  return {
    reply: { text: `🔭 ${event.text}`, buttons: HUB_BUTTONS },
    nextState: { scene: 'station', player }
  };
}

function step(state, text, rng = Math.random, deps = {}) {
  const input = (text || '').trim();

  if (input === RESET_COMMAND) {
    return {
      reply: { text: '🔄 Прогресс сброшен подчистую.\n\n🛰️ ПЕРИФЕРИЯ\n\nТракт оборвался триста лет назад. Как тебя записать в журнал станции?', buttons: [] },
      nextState: { scene: 'ask_name' }
    };
  }

  const scene = state?.scene || 'start';

  switch (scene) {
    case 'start': {
      return {
        reply: { text: '🛰️ ПЕРИФЕРИЯ\n\nТракт оборвался триста лет назад. Как тебя записать в журнал станции?', buttons: [] },
        nextState: { scene: 'ask_name' }
      };
    }

    case 'ask_name': {
      if (!input) return { reply: { text: 'Нужен хоть какой-то позывной.', buttons: [] }, nextState: state };
      return {
        reply: { text: `Позывной принят, ${input}.\n\nК какому доку пристыковаться?`, buttons: FACTIONS },
        nextState: { scene: 'ask_faction', name: input }
      };
    }

    case 'ask_faction': {
      if (!FACTIONS.includes(input)) {
        return { reply: { text: 'Выбери одну из четырёх станций кнопкой ниже.', buttons: FACTIONS }, nextState: state };
      }
      const player = freshPlayer(state.name, input);
      const curator = CURATORS[input] || 'куратор станции';
      return {
        reply: {
          text: `Добро пожаловать на борт, ${state.name}. Станция «${input}» тебя ждёт.\n\nКуратор ${curator} лично встречает новичков в тренировочном отсеке — активировался дежурный дрон-манекен, никакого риска, просто проверка со скафандром.`,
          buttons: ['Атаковать']
        },
        nextState: { scene: 'pre_combat', player, enemy: trainerDrone(), trainingFight: true }
      };
    }

    case 'quest_report': {
      const player = { ...state.player, statPoints: (state.player.statPoints || 0) + 1 };
      const curator = CURATORS[player.faction] || '';
      return {
        reply: {
          text: `Куратор ${curator}: «Неплохо для начала. Держи премию за инициативу — одно очко параметров сверху». Прежде чем отпустить тебя в космос, пройдёмся по станции — тут всё, что понадобится.`,
          buttons: ['Идём']
        },
        nextState: { scene: 'quest_shop', player }
      };
    }

    case 'quest_shop': {
      if (!state.player.inventory || state.player.inventory.length === 0) {
        const player = { ...state.player };
        addToInventory(player, 'Сплавы', 1, 3);
        return {
          reply: {
            text: `🔧 РЕМОНТНЫЙ ОТСЕК\n\nКуратор кивает Завхозу: «Покажи, как тут всё устроено». Завхоз суёт тебе в руки 3 куска обшивки: «Барахло с прошлой вылазки — продай, привыкай к обороту трюма».`,
            buttons: ['Продать хлам']
          },
          nextState: { scene: 'quest_shop', player }
        };
      }
      const player = { ...state.player };
      const gained = sellInventory(player);
      return {
        reply: { text: `💳 Завхоз отсчитывает ${gained} кредитов: «Вот и весь фокус — находишь, продаёшь, снаряжаешься». Последняя остановка — Врата Тракта.`, buttons: ['Идём к вратам'] },
        nextState: { scene: 'quest_gates', player }
      };
    }

    case 'quest_gates': {
      const player = { ...state.player, zone: 'blue' };
      return {
        reply: {
          text: `🌀 ВРАТА ТРАКТА\n\nКуратор указывает на мерцающий контур: «Патрулируемые секторы — спокойно, спорные — держи ухо востро, открытый космос — только с седьмого уровня, и то по готовности». Станция полностью открыта.`,
          buttons: HUB_BUTTONS
        },
        nextState: { scene: 'station', player }
      };
    }

    // ───────────────────────────────── ГЛАВНЫЙ ХАБ СТАНЦИИ ─────────────────────────────────

    case 'station': {
      if (input === 'Статус') {
        return { reply: { text: statusText(state.player), buttons: HUB_BUTTONS }, nextState: state };
      }
      if (input === 'Профиль') {
        const link = typeof deps.getProfileLink === 'function' ? deps.getProfileLink() : null;
        if (!link) return { reply: { text: 'Терминал профиля сейчас недоступен, попробуйте позже.', buttons: HUB_BUTTONS }, nextState: state };
        return { reply: { text: 'Личный терминал профиля готов:', buttons: [{ label: 'Открыть профиль', url: link }, 'Исследовать', 'Статус', 'Сброс'] }, nextState: state };
      }
      if (input === 'Мостик') {
        return { reply: { text: '🎛️ МОСТИК\n\nЗдесь решают судьбу станции. Смена позывного и станции приписки — скоро.', buttons: ['Назад'] }, nextState: { scene: 'loc_bridge', player: state.player } };
      }
      if (input === 'Отсек') {
        const p = state.player;
        const items = (p.inventory || []).map((i) => `${i.resource} T${i.tier} ×${i.qty}`).join(', ');
        return {
          reply: { text: `🔧 РЕМОНТНЫЙ ОТСЕК\n\n${items ? `В трюме: ${items}` : 'Трюм пуст.'}`, buttons: items ? ['Продать всё', 'Назад'] : ['Назад'] },
          nextState: { scene: 'loc_repair', player: state.player }
        };
      }
      if (input === 'Декон-камера') {
        const p = state.player;
        return {
          reply: { text: `☢️ ДЕКОН-КАМЕРА\n\nТекущее облучение: ${p.radiation || 0}%`, buttons: p.radiation ? ['Снять облучение', 'Назад'] : ['Назад'] },
          nextState: { scene: 'loc_decon', player: state.player }
        };
      }
      if (input === 'Кантина') {
        return cantinaBoard(state.player);
      }
      if (input === 'Врата Тракта') {
        return { reply: { text: '🌀 ВРАТА ТРАКТА\n\nВыбери, куда прыгнуть:', buttons: ZONE_BUTTONS }, nextState: { scene: 'loc_gates', player: state.player } };
      }
      if (input === 'Исследовать') {
        return startJourney(state.player, 'explore', { zone: state.player.zone || 'blue' }, rng);
      }
      return { reply: { text: 'Выбери действие кнопкой ниже.', buttons: HUB_BUTTONS }, nextState: state };
    }

    // ───────────────────────────────── ЛОКАЦИИ СТАНЦИИ ─────────────────────────────────

    case 'loc_bridge': {
      return { reply: { text: 'Возвращаешься в главный отсек станции.', buttons: HUB_BUTTONS }, nextState: { scene: 'station', player: state.player } };
    }

    case 'loc_repair': {
      if (input === 'Продать всё') {
        const player = { ...state.player };
        const gained = sellInventory(player);
        return { reply: { text: gained ? `Завхоз отсчитывает ${gained} кредитов за находки.` : 'Продавать нечего.', buttons: HUB_BUTTONS }, nextState: { scene: 'station', player } };
      }
      return { reply: { text: 'Возвращаешься в главный отсек станции.', buttons: HUB_BUTTONS }, nextState: { scene: '
