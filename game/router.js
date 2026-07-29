/**
 * Игровой роутер: то, что раньше рисовалось кубами в SaleBot, теперь —
 * обычная функция от (текущая сцена, входящее сообщение) к (ответ, новая сцена).
 * Ничего не завязано на ВК напрямую — vk.sendMessage(peerId, text, buttons)
 * это единственная точка выхода, поэтому в тестах подставляется fake-клиент.
 */
'use strict';

const { resolveTurn } = require('../engine/combat-engine.js');
const { SKILLS } = require('../engine/skills-data.js');
const { rollEvent, rollLoot, ZONE_WEIGHTS } = require('../engine/exploration-engine.js');
const { rollLootByEnemyName } = require('../engine/bestiary.js');
const { grantXp, xpToNext, xpForTier } = require('../engine/leveling.js');
const { availableQuests, getQuest, describeObjective, progressText, objectiveMet, consumeObjective } = require('./quests-data.js');
const { imageForEnemy } = require('./enemy-images.js');
const { imageForLocation } = require('./location-images.js');
const { getDailyContracts, checkContractProgress, claimContractRewards, getReputationTitle } = require('../contracts/contracts-engine.js');
const { getDistrictAtmosphere } = require('../city/city-engine.js');
const { DISTRICTS } = require('../city/districts-data.js');
const { getNpcLine } = require('../city/npc-roster.js');
const { applyConsequence, CONSEQUENCE_TRIGGERS } = require('../choices/consequence-engine.js');
const {
  TRAKT_FRAGMENTS, HYPOTHESES, HYPOTHESIS_INFO,
  getFragmentStatus, collectFragment, describeCondition, conditionProgress,
  getActiveHypothesis, setHypothesis, discoverHypothesis, getEnding
} = require('../lore/trakt-mythos.js');
const { RECIPES, hasResourcesFor, describeRecipe, craft } = require('../crafting/crafting-engine.js');
const { createQuestState, advanceQuest, completeQuest, renderQuestText } = require('../quests/quest-engine.js');
const { SHYOPOT_HYPOTHESES_QUEST } = require('../quests/narrative/shyopot-hypotheses.js');

const FACTIONS = ['Приют', 'Терминус', 'Арсенал', 'Вуаль'];

const FACTION_KIT = {
  'Приют':    { skills: ['heal_field'], statBias: { mind: 6, endurance: 4 } },
  'Терминус': { skills: ['living_heat'], statBias: { endurance: 8, power: 2 } },
  'Арсенал':  { skills: ['plasma_bolt', 'overload'], statBias: { power: 6, firepowerBonus: 4 } },
  'Вуаль':    { skills: ['anima_drain', 'corrosion'], statBias: { mind: 6, reaction: 4 } }
};

const MAX_EQUIPPED_SKILLS = 3;
const RESET_COMMAND = 'Сброс';

const HUB_BUTTONS = ['Исследовать', 'Мостик', 'Отсек', 'Декон-камера', 'Кантина', 'Контракты', 'Врата Тракта', 'Статус', 'Профиль', 'Сброс'];
const ZONE_BUTTONS = ['Патрулируемый', 'Спорный', 'Открытый космос', 'К другим станциям', 'Назад'];
const ZONE_BY_LABEL = { 'Патрулируемый': 'blue', 'Спорный': 'yellow', 'Открытый космос': 'red' };
const ZONE_LABEL = { blue: 'Патрулируемый сектор', yellow: 'Спорный сектор', red: 'Открытый космос' };
const MIN_LEVEL_FOR_ZONE = { blue: 1, yellow: 3, red: 7 };

const CURATORS = { 'Приют': 'Ирис Вейл', 'Терминус': 'Шёпот', 'Арсенал': 'Рен Окса', 'Вуаль': 'Дрого Кейн' };

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
    killCount: 0,
    zoneVisits: { blue: 0, yellow: 0, red: 0 },
    completedQuests: [],
    reputation: 0,
    npcMeetings: {}
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

/** Персональная ссылка на профиль как кнопка-ссылка — добавляется к хабу
 * станции почти везде, где игрок туда возвращается. */
function stationButtons(deps, player) {
  const link = typeof deps.getProfileLink === 'function' ? deps.getProfileLink() : null;
  let buttons = link ? [{ label: 'Открыть профиль', url: link }, ...HUB_BUTTONS] : [...HUB_BUTTONS];

  const extras = [];
  if (player?.faction === 'Вуаль') extras.push('Мастерская');
  if (player?.faction === 'Терминус') extras.push('Архив теней');
  if (extras.length) {
    const idx = buttons.findIndex((b) => b === 'Исследовать');
    const insertAt = idx === -1 ? buttons.length : idx + 1;
    buttons = [...buttons.slice(0, insertAt), ...extras, ...buttons.slice(insertAt)];
  }
  return buttons;
}

/** Богатое сообщение станции — статы, сектор, куратор. Показывается при
 * обычном возврате в хаб, а не при особых событиях (там своя сводка). */
function hubMessage(player) {
  const next = xpToNext(player.level || 1);
  const curator = CURATORS[player.faction] || 'куратор станции';
  const atmosphere = getDistrictAtmosphere(player.faction);
  const atmosphereLine = atmosphere ? `\n\n${atmosphere.time}` : '';
  return `🛰️ СТАНЦИЯ «${player.faction}»\n${curator} на связи.${atmosphereLine}\n\n${player.name} · Ур. ${player.level || 1} (${player.xp || 0}/${next} XP)\n❤️ ${player.hp}/${player.hpMax}   💳 ${player.credits || 0}\n📍 ${ZONE_LABEL[player.zone] || 'Патрулируемый сектор'}${player.radiation ? `\n☢️ Облучение: ${player.radiation}%` : ''}${player.statPoints ? `\n✨ Нераспределённых очков: ${player.statPoints}` : ''}`;
}

function statusText(p) {
  const repLine = p.reputation ? `\n⭐ Репутация: ${p.reputation} (${getReputationTitle(p.reputation)})` : '';
  return hubMessage(p) + repLine;
}

function contractsBoard(player) {
  player.contracts = getDailyContracts(player);
  const lines = player.contracts.list.map((c) => {
    const status = c.completed ? '✅' : `(${c.current}/${c.target})`;
    return `${status} ${c.text} — 💳${c.reward.credits}, ⭐+${c.reward.reputation}`;
  });
  const title = getReputationTitle(player.reputation || 0);
  const anyClaimable = player.contracts.list.some((c) => c.completed && !player.contracts.claimed.includes(c.id));
  return {
    reply: {
      text: `📋 КОНТРАКТЫ КУРАТОРА\n⭐ Репутация: ${player.reputation || 0} (${title})\n\n${lines.join('\n')}`,
      buttons: anyClaimable ? ['Забрать награды', 'Назад'] : ['Назад']
    },
    nextState: { scene: 'contracts', player }
  };
}

/** Разговор с Шёпотом про 4 гипотезы Тракта — первый настоящий диалоговый
 * квест на quests/quest-engine.js. input=null форсирует свежий старт
 * разговора (используется при входе через кнопку «Гипотезы»); иначе
 * input — подпись выбранной кнопки текущего этапа. */
function stepShyopotQuest(playerIn, input) {
  const player = { ...playerIn };
  player.questStates = { ...(player.questStates || {}) };
  let qs = player.questStates.shyopot_hypotheses;
  const needsFreshStart = !qs || qs.status !== 'active';

  if (needsFreshStart) {
    qs = createQuestState('shyopot_hypotheses');
    player.questStates.shyopot_hypotheses = qs;
  } else if (input) {
    const rendered = renderQuestText(SHYOPOT_HYPOTHESES_QUEST, qs, player);
    const choice = rendered.choices.find((c) => c.label === input);
    if (choice) {
      advanceQuest(qs, choice.next, choice.choiceId || null, choice.flags || {});
      if (choice.next === 'end' && choice.choiceId) {
        setHypothesis(player, choice.choiceId);
        if (qs.flags.heard_catastrophe) discoverHypothesis(player, 'CATASTROPHE');
        if (qs.flags.heard_infection) discoverHypothesis(player, 'INFECTION');
        if (qs.flags.heard_evolution) discoverHypothesis(player, 'EVOLUTION');
        if (qs.flags.heard_betrayal) discoverHypothesis(player, 'BETRAYAL');
      }
    }
  }

  const rendered = renderQuestText(SHYOPOT_HYPOTHESES_QUEST, qs, player);
  if (rendered.isTerminal && qs.status === 'active') {
    completeQuest(qs, {});
    player.completedQuests = player.completedQuests || [];
    if (!player.completedQuests.includes('shyopot_hypotheses')) player.completedQuests.push('shyopot_hypotheses');
  }
  const buttons = rendered.isTerminal ? ['Назад'] : rendered.choices.map((c) => c.label);
  return { reply: { text: rendered.text, buttons }, nextState: { scene: 'quest_shyopot', player } };
}

function mythosScreen(player, prefixText = '') {
  const statuses = getFragmentStatus(player);
  const hyp = getActiveHypothesis(player);
  const lines = statuses.map((f) => {
    const icon = f.collected ? '✅' : f.unlocked ? '🔓' : '🔒';
    let extra = '';
    if (!f.collected) extra = f.unlocked ? ' — готов к сбору!' : ` — ${describeCondition(f.unlockCondition)} (${conditionProgress(player, f.unlockCondition)})`;
    return `${icon} ${f.shortName}${extra}`;
  });
  const collectible = statuses.filter((f) => f.unlocked && !f.collected);
  const buttons = [...collectible.map((f) => `Собрать: ${f.shortName}`), 'Гипотезы', 'Назад'];
  const hypLine = hyp ? `Твоя гипотеза: ${HYPOTHESIS_INFO[hyp].name}` : 'Гипотеза ещё не выбрана.';
  return {
    reply: { text: `${prefixText}📜 МИФОЛОГИЯ ТРАКТА\n\n${hypLine}\n\n${lines.join('\n')}`, buttons },
    nextState: { scene: 'lore_mythos', player }
  };
}

function cantinaBoard(player) {
  const curatorId = (DISTRICTS[player.faction]?.npcs || [])[0];
  player.npcMeetings = player.npcMeetings || {};
  const meetCount = player.npcMeetings[curatorId] || 0;
  const greeting = curatorId ? getNpcLine(curatorId, meetCount) : null;
  player.npcMeetings[curatorId] = meetCount + 1;

  const quests = availableQuests(player);
  if (quests.length === 0) {
    return {
      reply: { text: `🍸 КАНТИНА\n\n${greeting ? `${greeting}\n\n` : ''}Куратору сейчас нечего тебе предложить.`, buttons: ['Назад'] },
      nextState: { scene: 'loc_cantina', player }
    };
  }const lines = quests.map((q, i) => `${i + 1}. «${q.title}» — ${describeObjective(q.objective)} (${progressText(player, q.objective)})`);
  return {
    reply: { text: `🍸 КАНТИНА\n\n${greeting ? `${greeting}\n\n` : ''}Доступные задания куратора:\n${lines.join('\n')}`, buttons: [...quests.map((q) => q.title), 'Назад'] },
    nextState: { scene: 'loc_cantina', player }
  };
}

function startJourney(player, kind, payload, rng) {
  const stepsLeft = 2 + Math.floor(rng() * 2);
  const pool = kind === 'explore' ? (ZONE_TRAVEL_PHRASES[payload.zone] || ZONE_TRAVEL_PHRASES.blue) : STATION_TRAVEL_PHRASES;
  const text = pool[Math.floor(rng() * pool.length)];
  return {
    reply: { text, buttons: ['Продолжить путь'] },
    nextState: { scene: 'journey', player, kind, payload, stepsLeft }
  };
}

function explore(player, zone, rng, deps, stealthMode = false) {
  player.zoneVisits = player.zoneVisits || { blue: 0, yellow: 0, red: 0 };
  player.zoneVisits[zone] = (player.zoneVisits[zone] || 0) + 1;
  checkContractProgress(player, 'explore', { zone });

  let weightsOverride = null;
  if (stealthMode) {
    const base = ZONE_WEIGHTS[zone] || ZONE_WEIGHTS.blue;
    const spared = Math.round(base.ambush * 0.6);
    weightsOverride = { ...base, ambush: base.ambush - spared, find: base.find + spared };
  }

  const event = rollEvent(zone, rng, player.level || 1, weightsOverride);

  if (stealthMode && event.type !== 'ambush') {
    player.stealthLog = [...(player.stealthLog || []), `Уклонение в ${ZONE_LABEL[zone] || zone}`].slice(-5);
  }
  if (event.type === 'ambush') {
    return {
      reply: { text: `⚠️ ОТГОЛОСОК\n\n${event.text}`, buttons: ['Атаковать', 'Отступить'], imageKey: imageForEnemy(event.enemy.name) },
      nextState: { scene: 'pre_combat', player, enemy: event.enemy, zone }
    };
  }
  if (event.type === 'anomaly') {
    player.radiation = Math.min(100, (player.radiation || 0) + event.radiationGain);
    return {
      reply: {
        text: `🌀 АНОМАЛИЯ\n\n${event.text}\n☢️ Облучение: ${player.radiation}%\n\nЧто делать с находкой?`,
        buttons: ['Доложить куратору', 'Утаить находку']
      },
      nextState: { scene: 'anomaly_choice', player }
    };
  }
  if (event.type === 'distress') {
    player.credits = (player.credits || 0) + event.reward.credits;
    return {
      reply: { text: `📡 СИГНАЛ БЕДСТВИЯ\n\n${event.text}\n💳 +${event.reward.credits} кредитов за спасательный рейс.`, buttons: stationButtons(deps, player) },
      nextState: { scene: 'station', player }
    };
  }
  if (event.type === 'node') {
    addToInventory(player, event.resource, event.tier, 1);
    checkContractProgress(player, 'loot', { resource: event.resource, amount: 1 });
    return {
      reply: { text: `⛏️ ЗАЛЕЖЬ\n\n${event.text}\nВ трюм добавлено: 1× ${event.resource} T${event.tier}.`, buttons: stationButtons(deps, player) },
      nextState: { scene: 'station', player }
    };
  }
  addToInventory(player, event.loot.resource, event.loot.tier, event.loot.qty);
  player.credits = (player.credits || 0) + event.loot.credits;
  checkContractProgress(player, 'loot', { resource: event.loot.resource, amount: event.loot.qty });
  return {
    reply: { text: `🔭 ${event.text}`, buttons: stationButtons(deps, player) },
    nextState: { scene: 'station', player }
  };
}

function step(state, text, rng = Math.random, deps = {}) {
  const input = (text || '').trim();

  if (input === RESET_COMMAND) {
    return {
      reply: { text: '🔄 Прогресс сброшен подчистую.\n\n🛰️ ПЕРИФЕРИЯ\n\nТы не должен был очнуться. Спасательная капсула шла на автопилоте три века — с того дня, как Тракт разорвался и выбросил тысячи ковчегов на край известного космоса.\n\nНо что-то разбудило тебя именно сейчас. Не авария. Не таймер. Слабый сигнал — идущий не из капсулы и не со станции, к которой ты пристыковался.\n\nРазберёшься позже. Как тебя записать в журнал станции?', buttons: [] },
      nextState: { scene: 'ask_name' }
    };
  }

  const scene = state?.scene || 'start';

  switch (scene) {
    case 'start': {
      return {
        reply: { text: '🛰️ ПЕРИФЕРИЯ\n\nТы не должен был очнуться. Спасательная капсула шла на автопилоте три века — с того дня, как Тракт разорвался и выбросил тысячи ковчегов на край известного космоса.\n\nНо что-то разбудило тебя именно сейчас. Не авария. Не таймер. Слабый сигнал — идущий не из капсулы и не со станции, к которой ты пристыковался.\n\nРазберёшься позже. Как тебя записать в журнал станции?', buttons: [] },
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
          buttons: stationButtons(deps, state.player)
        },
        nextState: { scene: 'station', player }
      };
    }

    case 'station': {
      if (input === 'Статус') {
        return { reply: { text: statusText(state.player), buttons: stationButtons(deps, state.player) }, nextState: state };
      }
      if (input === 'Профиль') {
        const link = typeof deps.getProfileLink === 'function' ? deps.getProfileLink() : null;
        if (!link) return { reply: { text: 'Терминал профиля сейчас недоступен, попробуйте позже.', buttons: HUB_BUTTONS }, nextState: state };
        return { reply: { text: 'Личный терминал профиля готов:', buttons: [{ label: 'Открыть профиль', url: link }, 'Исследовать', 'Статус', 'Сброс'] }, nextState: state };
      }
      if (input === 'Мостик') {
        return { reply: { text: '🎛️ МОСТИК\n\nЗдесь решают судьбу станции. Смена позывного и станции приписки — скоро.', buttons: ['Мифология Тракта', 'Назад'], imageKey: imageForLocation('bridge') }, nextState: { scene: 'loc_bridge', player: state.player } };
      }
      if (input === 'Отсек') {
        const p = state.player;
        const items = (p.inventory || []).map((i) => `${i.resource} T${i.tier} ×${i.qty}`).join(', ');
        return {
          reply: { text: `🔧 РЕМОНТНЫЙ ОТСЕК\n\n${items ? `В трюме: ${items}` : 'Трюм пуст.'}`, buttons: items ? ['Продать всё', 'Назад'] : ['Назад'], imageKey: imageForLocation('repair') },
          nextState: { scene: 'loc_repair', player: state.player }
        };
      }
      if (input === 'Декон-камера') {
        const p = state.player;
        return {
          reply: { text: `☢️ ДЕКОН-КАМЕРА\n\nТекущее облучение: ${p.radiation || 0}%`, buttons: p.radiation ? ['Снять облучение', 'Назад'] : ['Назад'], imageKey: imageForLocation('decon') },
          nextState: { scene: 'loc_decon', player: state.player }
        };
      }
      if (input === 'Кантина') {
        const board = cantinaBoard(state.player);
        board.reply.imageKey = imageForLocation('cantina');
        return board;
      }
      if (input === 'Контракты') {
        return contractsBoard({ ...state.player });
      }
      if (input === 'Мастерская') {
        if (state.player.faction !== 'Вуаль') {
          return { reply: { text: 'Мастерская есть только у Вуали — здесь пока не доступна.', buttons: stationButtons(deps, state.player) }, nextState: state };
        }
        const lines = RECIPES.map((r, i) => `${i + 1}. ${describeRecipe(r)}${hasResourcesFor(state.player, r) ? ' ✅' : ''}`);
        return {
          reply: { text: `🔧 МАСТЕРСКАЯ\n\nВуаль первой из станций открыла настоящую мастерскую — превращай находки в постоянные модули.\n\n${lines.join('\n')}`, buttons: [...RECIPES.map((r) => r.name), 'Назад'] },
          nextState: { scene: 'workshop', player: state.player }
        };
      }
      if (input === 'Архив теней') {
        if (state.player.faction !== 'Терминус') {
          return { reply: { text: 'Архив теней есть только у Терминуса — здесь пока не доступен.', buttons: stationButtons(deps, state.player) }, nextState: state };
        }
        return {
          reply: { text: '🕶️ АРХИВ ТЕНЕЙ\n\nСкрытная вылазка — шанс нарваться на засаду заметно ниже обычного, но и находки скромнее: аккуратность стоит времени.', buttons: ['Уйти в тень', 'Назад'] },
          nextState: { scene: 'stealth_explore', player: state.player }
        };
      }
      if (input === 'Врата Тракта') {
        return { reply: { text: '🌀 ВРАТА ТРАКТА\n\nВыбери, куда прыгнуть:', buttons: ZONE_BUTTONS, imageKey: imageForLocation('gates') }, nextState: { scene: 'loc_gates', player: state.player } };
      }
      if (input === 'Исследовать') {
        return startJourney(state.player, 'explore', { zone: state.player.zone || 'blue' }, rng);
      }
      return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player), imageKey: imageForLocation('station') }, nextState: state };
    }

    case 'loc_bridge': {
      if (input === 'Мифология Тракта') {
        return mythosScreen(state.player);
      }
      return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player), imageKey: imageForLocation('station') }, nextState: { scene: 'station', player: state.player } };
    }

    case 'lore_mythos': {
      if (input === 'Назад') {
        return { reply: { text: '🎛️ МОСТИК\n\nЗдесь решают судьбу станции. Смена позывного и станции приписки — скоро.', buttons: ['Мифология Тракта', 'Назад'], imageKey: imageForLocation('bridge') }, nextState: { scene: 'loc_bridge', player: state.player } };
      }
      if (input === 'Гипотезы') {
        return stepShyopotQuest(state.player, null);
      }
      const fragMatch = /^Собрать: (.+)$/.exec(input);
      const fragment = fragMatch ? TRAKT_FRAGMENTS.find((f) => f.shortName === fragMatch[1]) : null;
      if (fragment) {
        const player = { ...state.player };
        const res = collectFragment(player, fragment.id);
        if (res.success) {
          let text = `✨ Фрагмент собран: ${fragment.name}\n\n${fragment.lore}\n\n`;
          const ending = getEnding(player);
          const totalCollected = (player.lore?.fragments || []).length;
          if (ending) {
            text += `🌌 ВСЕ ФРАГМЕНТЫ СОБРАНЫ\n\n${ending.name}\n${ending.text}\n\n`;
          } else if (totalCollected === TRAKT_FRAGMENTS.length) {
            text += `🌌 Все 7 фрагментов собраны, но твоя гипотеза ещё не ясна — загляни в «Гипотезы».\n\n`;
          }
          return mythosScreen(player, text);
        }
      }
      return mythosScreen(state.player);
    }

    case 'quest_shyopot': {
      if (input === 'Назад') {
        return mythosScreen(state.player)}
      return stepShyopotQuest(state.player, input);
    }

    case 'loc_repair': {
      if (input === 'Продать всё') {
        const player = { ...state.player };
        const gained = sellInventory(player);
        return { reply: { text: gained ? `Завхоз отсчитывает ${gained} кредитов за находки.` : 'Продавать нечего.', buttons: stationButtons(deps, state.player) }, nextState: { scene: 'station', player } };
      }
      return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player), imageKey: imageForLocation('station') }, nextState: { scene: 'station', player: state.player } };
    }

    case 'loc_decon': {
      if (input === 'Снять облучение') {
        const player = { ...state.player, radiation: 0 };
        return { reply: { text: 'Мягкое гудение очистителей — облучение снято подчистую.', buttons: stationButtons(deps, state.player) }, nextState: { scene: 'station', player } };
      }
      return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player), imageKey: imageForLocation('station') }, nextState: { scene: 'station', player: state.player } };
    }

    case 'loc_cantina': {
      if (input === 'Назад') {
        return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player), imageKey: imageForLocation('station') }, nextState: { scene: 'station', player: state.player } };
      }
      const quest = availableQuests(state.player).find((q) => q.title === input);
      if (!quest) return cantinaBoard(state.player);

      if (!objectiveMet(state.player, quest.objective)) {
        return {
          reply: {
            text: `Ещё не готово: ${describeObjective(quest.objective)} — сейчас ${progressText(state.player, quest.objective)}. Возвращайся, когда выполнишь.`,
            buttons: ['Назад']
          },
          nextState: { scene: 'loc_cantina', player: state.player }
        };
      }

      const player = { ...state.player };
      consumeObjective(player, quest.objective);
      player.completedQuests = [...(player.completedQuests || []), quest.id];
      let rewardText = `${quest.text}\n\n✅ Выполнено! Награда:`;
      if (quest.reward.xp) {
        const { leveledUp, level } = grantXp(player, quest.reward.xp);
        rewardText += `\n✨ +${quest.reward.xp} XP`;
        if (leveledUp) rewardText += ` — новый уровень: ${level}! (+2 очка, +20 HP, полное исцеление)`;
      }
      if (quest.reward.credits) { player.credits = (player.credits || 0) + quest.reward.credits; rewardText += `\n💳 +${quest.reward.credits} кредитов`; }
      if (quest.reward.statPoints) { player.statPoints = (player.statPoints || 0) + quest.reward.statPoints; rewardText += `\n🔧 +${quest.reward.statPoints} очков параметров`; }

      return { reply: { text: rewardText, buttons: stationButtons(deps, state.player) }, nextState: { scene: 'station', player } };
    }

    case 'contracts': {
      if (input === 'Назад') {
        return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player), imageKey: imageForLocation('station') }, nextState: { scene: 'station', player: state.player } };
      }
      if (input === 'Забрать награды') {
        const player = { ...state.player };
        const claimableIds = (player.contracts?.list || [])
          .filter((c) => c.completed && !player.contracts.claimed.includes(c.id))
          .map((c) => c.id);
        let totalCredits = 0, totalRep = 0;
        for (const id of claimableIds) {
          const res = claimContractRewards(player, id);
          if (res.success) { totalCredits += res.reward.credits; totalRep += res.reward.reputation; }
        }
        const text = claimableIds.length
          ? `Получено: 💳 ${totalCredits} кредитов, ⭐ +${totalRep} репутации.`
          : 'Нечего забирать — сначала выполни хотя бы один контракт.';
        return { reply: { text, buttons: ['Назад'] }, nextState: { scene: 'contracts', player } };
      }
      return contractsBoard({ ...state.player });
    }

    case 'loc_gates': {
      if (input === 'Назад') {
        return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player), imageKey: imageForLocation('station') }, nextState: { scene: 'station', player: state.player } };
      }
      if (input === 'К другим станциям') {
        const others = FACTIONS.filter((f) => f !== state.player.faction);
        return { reply: { text: 'Куда проложить курс?', buttons: [...others, 'Назад'] }, nextState: { scene: 'loc_gates_travel', player: state.player } };
      }
      const zone = ZONE_BY_LABEL[input];
      if (!zone) {
        return { reply: { text: 'Выбери сектор кнопкой ниже.', buttons: ZONE_BUTTONS }, nextState: state };
      }
      const requiredLevel = MIN_LEVEL_FOR_ZONE[zone];
      if ((state.player.level || 1) < requiredLevel) {
        return {
          reply: { text: `⛔ Слишком опасно. «${ZONE_LABEL[zone]}» открывается с ${requiredLevel} уровня — сейчас у тебя ${state.player.level || 1}.`, buttons: ZONE_BUTTONS },
          nextState: state
        };
      }
      const player = { ...state.player, zone };
      return startJourney(player, 'explore', { zone }, rng);
    }

    case 'loc_gates_travel': {
      if (input === 'Назад') {
        return { reply: { text: 'Выбери, куда прыгнуть:', buttons: ZONE_BUTTONS }, nextState: { scene: 'loc_gates', player: state.player } };
      }
      if (!FACTIONS.includes(input) || input === state.player.faction) {
        const others = FACTIONS.filter((f) => f !== state.player.faction);
        return { reply: { text: 'Выбери станцию кнопкой ниже.', buttons: [...others, 'Назад'] }, nextState: state };
      }
      return startJourney(state.player, 'travel', { targetFaction: input }, rng);
    }

    case 'workshop': {
      if (input === 'Назад') {
        return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player), imageKey: imageForLocation('station') }, nextState: { scene: 'station', player: state.player } };
      }
      const recipe = RECIPES.find((r) => r.name === input);
      if (!recipe) {
        const lines = RECIPES.map((r, i) => `${i + 1}. ${describeRecipe(r)}${hasResourcesFor(state.player, r) ? ' ✅' : ''}`);
        return { reply: { text: `🔧 МАСТЕРСКАЯ\n\n${lines.join('\n')}`, buttons: [...RECIPES.map((r) => r.name), 'Назад'] }, nextState: state };
      }
      const player = { ...state.player, inventory: (state.player.inventory || []).map((i) => ({ ...i })) };
      const result = craft(player, recipe.id);
      const text = result.success
        ? `Собрано: ${result.recipe.name}. +${result.recipe.statBonus.amount} к ${result.recipe.statBonus.stat} — навсегда.`
        : result.reason;
      const lines = RECIPES.map((r, i) => `${i + 1}. ${describeRecipe(r)}${hasResourcesFor(player, r) ? ' ✅' : ''}`);
      return {
        reply: { text: `${text}\n\n🔧 МАСТЕРСКАЯ\n\n${lines.join('\n')}`, buttons: [...RECIPES.map((r) => r.name), 'Назад'] },
        nextState: { scene: 'workshop', player }
      };
    }

    case 'stealth_explore': {
      if (input === 'Назад') {
        return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player), imageKey: imageForLocation('station') }, nextState: { scene: 'station', player: state.player } };
      }
      if (input === 'Уйти в тень') {
        return explore({ ...state.player }, state.player.zone || 'blue', rng, deps, true);
      }
      return { reply: { text: 'Выбери действие кнопкой ниже.', buttons: ['Уйти в тень', 'Назад'] }, nextState: state };
    }

    case 'journey': {
      const stepsLeft = state.stepsLeft - 1;
      if (stepsLeft > 0) {
        const pool = state.kind === 'explore' ? (ZONE_TRAVEL_PHRASES[state.payload.zone] || ZONE_TRAVEL_PHRASES.blue) : STATION_TRAVEL_PHRASES;
        const phraseText = pool[Math.floor(rng() * pool.length)];
        return {
          reply: { text: phraseText, buttons: ['Продолжить путь'] },
          nextState: { scene: 'journey', player: state.player, kind: state.kind, payload: state.payload, stepsLeft }
        };
      }
      if (state.kind === 'explore') {
        return explore(state.player, state.payload.zone, rng, deps);
      }
      const player = { ...state.player, faction: state.payload.targetFaction };
      const curator = CURATORS[player.faction] || '';
      return {
        reply: { text: `Стыковка завершена. Станция «${player.faction}» приветствует тебя — куратор ${curator} на связи.`, buttons: stationButtons(deps, player) },
        nextState: { scene: 'station', player }
      };
    }

    case 'anomaly_choice': {
      const player = { ...state.player };
      if (input === 'Доложить куратору') {
        applyConsequence(player, 'report_anomaly_find');
        const rep = CONSEQUENCE_TRIGGERS.report_anomaly_find.immediate.reputation;
        return {
          reply: { text: `Куратор внимательно выслушивает доклад и кивает. +${rep} репутации станции.`, buttons: stationButtons(deps, state.player) },
          nextState: { scene: 'station', player }
        };
      }
      if (input === 'Утаить находку') {
        applyConsequence(player, 'hide_anomaly_find');
        return {
          reply: { text: 'Ты решаешь промолчать об увиденном. Что-то в этом решении отзывается в теле неприятным холодом — но, возможно, не только в теле.', buttons: stationButtons(deps, state.player) },
          nextState: { scene: 'station', player }
        };
      }
      return { reply: { text: 'Выбери: доложить куратору или утаить находку.', buttons: ['Доложить куратору', 'Утаить находку'] }, nextState: state };
    }

    case 'pre_combat': {
      if (input === 'Отступить') {
        return { reply: { text: 'Ты отступаешь на безопасное расстояние.', buttons: stationButtons(deps, state.player) }, nextState: { scene: 'station', player: state.player } };
      }
      const buttons = ['Обычная атака', ...skillButtons(state.player)];
      return {
        reply: { text: `${state.enemy.name}: ❤️ ${state.enemy.hp}/${state.enemy.hpMax}\n\nВыбери действие:`, buttons },
        nextState: { scene: 'combat', player: state.player, enemy: state.enemy, trainingFight: state.trainingFight, zone: state.zone }
      };
    }

    case 'combat': {
      const skillId = input === 'Обычная атака' ? null : skillIdByName(input);
      const skill = skillId ? SKILLS[skillId] : null;
      if (input !== 'Обычная атака' && !skill) {
        const buttons = ['Обычная атака', ...skillButtons(state.player)];
        return { reply: { text: 'Выбери действие кнопкой ниже.', buttons }, nextState: state };
      }

      const result = resolveTurn({ attacker: state.player, defender: state.enemy, skill, rng });

      if (result.finished) {
        if (result.winner === 'attacker') {
          if (state.trainingFight) {
            return {
              reply: { text: `💥 ${result.log.join(' ')}\n\n✅ Дрон-манекен деактивирован. Тренировка окончена — это была только симуляция, статы и HP полностью восстановлены.`, buttons: ['Доложить куратору'] },
              nextState: { scene: 'quest_report', player: { ...result.attacker, hp: result.attacker.hpMax } }
            };
          }
          const loot = rollLoot(state.zone || 'blue', rng);
          const player = { ...result.attacker };
          addToInventory(player, loot.resource, loot.tier, loot.qty);
          player.credits = (player.credits || 0) + loot.credits;
          player.killCount = (player.killCount || 0) + 1;
          if ((state.enemy.tier || 0) >= 5) player.highTierKills = (player.highTierKills || 0) + 1;
          checkContractProgress(player, 'combat_win', { zone: state.zone || 'blue' });
          checkContractProgress(player, 'loot', { resource: loot.resource, amount: loot.qty });
          const xpGain = xpForTier(state.enemy.tier || 1);
          const { leveledUp, level } = grantXp(player, xpGain);
          const bestiaryDrops = rollLootByEnemyName(state.enemy.name, rng);
          if (bestiaryDrops.length) {
            player.bestiaryItems = [...(player.bestiaryItems || []), ...bestiaryDrops.map((d) => d.id)];
          }
          let victoryText = `💥 ${result.log.join(' ')}\n\n🏆 ${state.enemy.name} уничтожен.\n💳 +${loot.credits} кредитов, +${loot.qty}× ${loot.resource} T${loot.tier}\n✨ +${xpGain} XP`;
          if (bestiaryDrops.length) victoryText += `\n🎖️ Особая добыча: ${bestiaryDrops.map((d) => d.name).join(', ')}`;
          if (leveledUp) victoryText += `\n🆙 Новый уровень: ${level}! (+2 очка, +20 HP, полное исцеление)`;
          return { reply: { text: victoryText, buttons: stationButtons(deps, state.player) }, nextState: { scene: 'station', player } };
        }
        return {
          reply: { text: `💥 ${result.log.join(' ')}\n\n💀 Скафандр пробит. Аварийная капсула эвакуирует тебя на станцию.`, buttons: stationButtons(deps, state.player) },
          nextState: { scene: 'station', player: { ...result.attacker, hp: Math.round(result.attacker.hpMax * 0.5) } }
        };
      }

      const enemyTurn = resolveTurn({ attacker: result.defender, defender: result.attacker, rng });
      const log = result.log.concat(enemyTurn.log).join(' ');

      if (enemyTurn.finished && enemyTurn.winner === 'attacker') {
        return {
          reply: { text: `💥 ${log}\n\n💀 Скафандр пробит.`, buttons: stationButtons(deps, state.player) },
          nextState: { scene: 'station', player: { ...enemyTurn.defender, hp: Math.round(enemyTurn.defender.hpMax * 0.5) } }
        };
      }

      const buttons = ['Обычная атака', ...skillButtons(enemyTurn.defender)];
      return {
        reply: { text: `💥 ${log}\n\n${state.enemy.name}: ❤️ ${enemyTurn.attacker.hp}/${enemyTurn.attacker.hpMax}`, buttons },
        nextState: { scene: 'combat', player: enemyTurn.defender, enemy: enemyTurn.attacker, trainingFight: state.trainingFight, zone: state.zone }
      };
    }

    default:
      return { reply: { text: 'Что-то пошло не так, начнём заново.', buttons: [] }, nextState: { scene: 'start' } };
  }
}

module.exports = {
  step, freshPlayer, equippedSkillIds, addToInventory, sellInventory, hubMessage, stationButtons, contractsBoard,
  FACTIONS, FACTION_KIT, CURATORS, MAX_EQUIPPED_SKILLS, HUB_BUTTONS, ZONE_BUTTONS, MIN_LEVEL_FOR_ZONE
};
