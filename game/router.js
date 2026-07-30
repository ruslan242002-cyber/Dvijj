/**
 * Игровой роутер: то, что раньше рисовалось кубами в SaleBot, теперь —
 * обычная функция от (текущая сцена, входящее сообщение) к (ответ, новая сцена).
 * Ничего не завязано на ВК напрямую — vk.sendMessage(peerId, text, buttons)
 * это единственная точка выхода, поэтому в тестах подставляется fake-клиент.
 *
 * ВАЖНО — ДВЕ ВЕЩИ, КОТОРЫЕ МЕНЯЮТСЯ ДЛЯ ВЫЗЫВАЮЩЕГО КОДА (webhook-handler.js):
 *
 * 1. step() теперь ASYNC. Биржа и PvP делают запросы в Redis (deps.marketStore /
 *    deps.pvpStore), это не может быть синхронным. Вызывающий код должен
 *    писать `await step(...)`, а не `step(...)`.
 *
 * 2. У step() новый 5-й параметр — playerId (стабильный ID игрока, скорее
 *    всего ваш VK user id). Он нужен ТОЛЬКО бирже и PvP, чтобы отличать
 *    покупателя от продавца и сторону дуэли — больше нигде в игре такого
 *    ID не было (player раньше идентифицировался только по ключу в Redis
 *    снаружи, не по полю внутри себя). Без playerId «Биржа» и «Дуэль»
 *    вежливо ответят «недоступно», не уронив всё остальное.
 *
 * Deps теперь ожидает (в дополнение к уже знакомому getProfileLink):
 *   deps.marketStore — результат createUpstashMarketStore(redis) из market/market-store-upstash.js
 *   deps.pvpStore     — результат createUpstashPvpStore(redis) из pvp/pvp-store-upstash.js
 */
'use strict';

const { resolveTurn } = require('../engine/combat-engine.js');
const { SKILLS, STIMS } = require('../engine/skills-data.js');
const { rollEvent, rollLoot, ZONE_WEIGHTS, generateEnemy } = require('../engine/exploration-engine.js');
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
const { getCurrentAct } = require('../lore/trakt-acts.js');
const { RECIPES, hasResourcesFor, describeRecipe, craft } = require('../crafting/crafting-engine.js');
const { createQuestState, advanceQuest, completeQuest, renderQuestText } = require('../quests/quest-engine.js');
const { SHYOPOT_HYPOTHESES_QUEST } = require('../quests/narrative/shyopot-hypotheses.js');
const { getArcForFaction, getNextAvailableQuest } = require('../storylines/curator-arcs.js');

// ── новое в этой сессии ──
const { rollEventWithDepth } = require('../engine/deep-exploration.js');
const { attemptEvacuation } = require('../engine/evacuation.js');
const { resolvePlayerTurn } = require('../engine/combat-turn.js');
const { stimButtons, stimIdByName } = require('../engine/stim-buttons.js');
const {
  HOUSING, HOUSE_ITEMS, HousingError, HOUSING_ERRORS,
  ownsHousing, purchaseHousing, purchaseHouseItem,
  getMarketFeeDiscount, getRadiationDiscount, getEvacChanceBonus,
} = require('../lib/housing.js');
const { createListing, purchaseListing, listActiveListings, MarketError } = require('../market/market-engine.js');
const { createDuel, submitTurn: submitPvpTurn, getDuel, winnerReward, PvpError } = require('../pvp/pvp-engine.js');
const { findRandomOpponent } = require('../pvp/matchmaking-engine.js');

const FACTIONS = ['Приют', 'Терминус', 'Арсенал', 'Вуаль'];

const FACTION_KIT = {
  'Приют':    { skills: ['heal_field'], statBias: { mind: 6, endurance: 4 } },
  'Терминус': { skills: ['living_heat'], statBias: { endurance: 8, power: 2 } },
  'Арсенал':  { skills: ['plasma_bolt', 'overload'], statBias: { power: 6, firepowerBonus: 4 } },
  'Вуаль':    { skills: ['anima_drain', 'corrosion'], statBias: { mind: 6, reaction: 4 } }
};

const MAX_EQUIPPED_SKILLS = 3;
const RESET_COMMAND = 'Сброс';

const HUB_BUTTONS = ['Исследовать', 'Мостик', 'Отсек', 'Декон-камера', 'Кантина', 'Контракты', 'Биржа', 'Дуэль', 'Жильё', 'Врата Тракта', 'Статус', 'Профиль', 'Сброс'];
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

function stationButtons(deps, player) {
  const link = typeof deps.getProfileLink === 'function' ? deps.getProfileLink() : null;
  // Если есть прямая ссылка на профиль, убираем текстовую кнопку "Профиль"
  // из HUB_BUTTONS — иначе получаются две кнопки профиля одновременно:
  // готовая ссылка и текстовая, которая при нажатии просто покажет ту же
  // ссылку ещё раз.
  const baseButtons = link ? HUB_BUTTONS.filter((b) => b !== 'Профиль') : HUB_BUTTONS;
  let buttons = link ? [{ label: 'Открыть профиль', url: link }, ...baseButtons] : [...baseButtons];

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

/**
 * Диалоговый движок для квестов арок кураторов (storylines/curator-arcs.js).
 * Отдельно от stepShyopotQuest — тот полагается на quest-engine.js
 * (createQuestState/advanceQuest/renderQuestText), формат которого не
 * подтверждён под isCombat/winNext/loseNext/reward/terminal, а именно эти
 * поля arc-квесты используют насквозь. Интерпретирую stage-объекты
 * напрямую, раз я сам их и написал в этом формате.
 */
function renderCuratorStage(player, questId, stageId) {
  const arc = getArcForFaction(player.faction);
  const quest = arc?.quests.find((q) => q.id === questId);
  if (!quest || !quest.stages[stageId]) return null;
  return { arc, quest, stage: quest.stages[stageId] };
}

function curatorQuestScreen(deps, player, questId, stageId) {
  const found = renderCuratorStage(player, questId, stageId);
  if (!found) {
    return { reply: { text: hubMessage(player), buttons: stationButtons(deps, player) }, nextState: { scene: 'station', player } };
  }
  const { stage } = found;
  const text = (stage.text || '').replace(/\$\{playerName\}/g, player.name || '');

  if (stage.isCombat) {
    return {
      reply: { text, buttons: ['Атаковать', 'Отступить'], imageKey: imageForEnemy(stage.enemy.name) },
      nextState: { scene: 'pre_combat', player, enemy: { ...stage.enemy, periodic: [] }, curatorQuest: { questId, winNext: stage.winNext, loseNext: stage.loseNext } }
    };
  }

  if (stage.terminal) {
    const nextPlayer = { ...player };
    const rewardLines = [];
    if (stage.reward) {
      if (stage.reward.reputation) { nextPlayer.reputation = (nextPlayer.reputation || 0) + stage.reward.reputation; rewardLines.push(`⭐ ${stage.reward.reputation > 0 ? '+' : ''}${stage.reward.reputation} репутации`); }
      if (stage.reward.credits) { nextPlayer.credits = (nextPlayer.credits || 0) + stage.reward.credits; rewardLines.push(`💳 +${stage.reward.credits} кредитов`); }
      if (stage.reward.statPoints) { nextPlayer.statPoints = (nextPlayer.statPoints || 0) + stage.reward.statPoints; rewardLines.push(`🔧 +${stage.reward.statPoints} очков параметров`); }
    }
    nextPlayer.completedQuests = [...(nextPlayer.completedQuests || [])];
    if (!nextPlayer.completedQuests.includes(questId)) nextPlayer.completedQuests.push(questId);
    const fullText = rewardLines.length ? `${text}\n\n${rewardLines.join('\n')}` : text;
    return { reply: { text: fullText, buttons: ['Назад'] }, nextState: { scene: 'station', player: nextPlayer } };
  }

  return {
    reply: { text, buttons: (stage.choices || []).map((c) => c.label) },
    nextState: { scene: 'curator_quest', player, questId, stageId }
  };
}

function mythosScreen(player, prefixText = '') {
  const act = getCurrentAct(player);
  const statuses = getFragmentStatus(player);
  const hyp = getActiveHypothesis(player);
  // Защита: если в реальном lore/trakt-mythos.js нет describeCondition/
  // conditionProgress (или они называются иначе) — не роняем экран
  // мифологии, а показываем нейтральный текст вместо конкретного условия.
  const describe = typeof describeCondition === 'function' ? describeCondition : () => 'условие ещё не описано';
  const progress = typeof conditionProgress === 'function' ? conditionProgress : () => '';
  const lines = statuses.map((f) => {
    const icon = f.collected ? '✅' : f.unlocked ? '🔓' : '🔒';
    let extra = '';
    if (!f.collected) extra = f.unlocked ? ' — готов к сбору!' : ` — ${describe(f.unlockCondition)} (${progress(player, f.unlockCondition)})`;
    return `${icon} ${f.shortName}${extra}`;
  });
  const collectible = statuses.filter((f) => f.unlocked && !f.collected);
  const buttons = [...collectible.map((f) => `Собрать: ${f.shortName}`), 'Гипотезы', 'Назад'];
  const hypLine = hyp ? `Твоя гипотеза: ${HYPOTHESIS_INFO[hyp].name}` : 'Гипотеза ещё не выбрана.';
  return {
    reply: { text: `${prefixText}📜 МИФОЛОГИЯ ТРАКТА\n\n${act.name}\n\n${hypLine}\n\n${lines.join('\n')}`, buttons },
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
  const arc = getArcForFaction(player.faction);
  const arcQuest = arc ? getNextAvailableQuest(player, arc) : null;

  if (quests.length === 0 && !arcQuest) {
    return {
      reply: { text: `🍸 КАНТИНА\n\n${greeting ? `${greeting}\n\n` : ''}Куратору сейчас нечего тебе предложить.`, buttons: ['Назад'] },
      nextState: { scene: 'loc_cantina', player }
    };
  }
  const lines = quests.map((q, i) => `${i + 1}. «${q.title}» — ${describeObjective(q.objective)} (${progressText(player, q.objective)})`);
  if (arcQuest) lines.push(`✨ Куратор ${CURATORS[player.faction] || ''} хочет поговорить лично: «${arcQuest.name}»`);
  const buttons = [...quests.map((q) => q.title), ...(arcQuest ? [`Поговорить: ${arcQuest.name}`] : []), 'Назад'];
  return {
    reply: { text: `🍸 КАНТИНА\n\n${greeting ? `${greeting}\n\n` : ''}Доступные задания куратора:\n${lines.join('\n')}`, buttons },
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

function buildGuardianEnemy(name, tier, rng) {
  const dangerMult = 1.4;
  const hp = Math.round((80 + rng() * 120) * dangerMult * (1 + tier * 0.1));
  const base = 12 + tier * 4;
  return {
    name: name || 'Страж фрагмента', tier, hp, hpMax: hp,
    stats: {
      power: Math.round(base * 1.1), mind: Math.round(base * 1.1), reaction: Math.round(base * 1.1),
      endurance: Math.round(base * 1.1), firepower: Math.round(base * 1.3), shielding: Math.min(70, Math.round(base * 0.7))
    },
    luck: Math.round(8 + tier * 1.5),
    accuracy: 0.72 + Math.min(tier, 5) * 0.02,
    dodge: 0.08 + Math.min(tier, 5) * 0.015,
    focus: 0.65 + Math.min(tier, 5) * 0.02,
    periodic: []
  };
}

/** Кнопки после безопасного события/победы во время вылазки. "Эвакуироваться"
 * — только для красной зоны или после боя со стражем фрагмента (isBossContext) —
 * в обычных вылазках уже есть бесплатный "Вернуться на станцию", отдельная
 * рискованная эвакуация там просто не нужна. */
function journeyContinueButtons(zone, isBossContext = false) {
  const buttons = ['Углубиться дальше', 'Вернуться на станцию'];
  if (zone === 'red' || isBossContext) buttons.push('Эвакуироваться');
  return buttons;
}

function safeReturnChoice(text, player, zone, depth, isBossContext = false) {
  return {
    reply: { text, buttons: journeyContinueButtons(zone, isBossContext) },
    nextState: { scene: 'journey_continue', player, zone, depth, isBossContext }
  };
}

function resolveExplorationEvent(player, event, zone, depth, deps, rng, prefixText = '', allowContinue = true) {
  const safe = (text) => allowContinue
    ? safeReturnChoice(text, player, zone, depth)
    : { reply: { text, buttons: stationButtons(deps, player) }, nextState: { scene: 'station', player } };

  switch (event.type) {
    case 'ambush': {
      const bonusNote = event.depthBonusTier ? `\n(усилен глубиной вылазки: +${event.depthBonusTier} к тиру)` : '';
      return {
        reply: { text: `${prefixText}⚠️ ОТГОЛОСОК\n\n${event.text}${bonusNote}`, buttons: ['Атаковать', 'Отступить'], imageKey: imageForEnemy(event.enemy.name) },
        nextState: { scene: 'pre_combat', player, enemy: event.enemy, zone, depth }
      };
    }
    case 'anomaly': {
      const discount = getRadiationDiscount(player);
      const gain = Math.max(0, Math.round(event.radiationGain * (1 - discount)));
      player.radiation = Math.min(100, (player.radiation || 0) + gain);
      return {
        reply: { text: `${prefixText}🌀 АНОМАЛИЯ\n\n${event.text}\n☢️ Облучение: ${player.radiation}%\n\nЧто делать с находкой?`, buttons: ['Доложить куратору', 'Утаить находку'] },
        nextState: { scene: 'anomaly_choice', player, zone, depth }
      };
    }
    case 'distress': {
      player.credits = (player.credits || 0) + event.reward.credits;
      return safe(`${prefixText}📡 СИГНАЛ БЕДСТВИЯ\n\n${event.text}\n💳 +${event.reward.credits} кредитов за спасательный рейс.`);
    }
    case 'node': {
      addToInventory(player, event.resource, event.tier, 1);
      checkContractProgress(player, 'loot', { resource: event.resource, amount: 1 });
      return safe(`${prefixText}⛏️ ЗАЛЕЖЬ\n\n${event.text}\nВ трюм добавлено: 1× ${event.resource} T${event.tier}.`);
    }
    case 'find': {
      addToInventory(player, event.loot.resource, event.loot.tier, event.loot.qty);
      player.credits = (player.credits || 0) + event.loot.credits;
      checkContractProgress(player, 'loot', { resource: event.loot.resource, amount: event.loot.qty });
      return safe(`${prefixText}🔭 ${event.text}`);
    }
    case 'sector': {
      player.currentSectorId = event.sectorId;
      return safe(`${prefixText}${event.text}`);
    }
    case 'story': {
      return safe(`${prefixText}📨 ${event.text}`);
    }
    case 'discovery': {
      if (event.hypothesisConfirm) discoverHypothesis(player, event.hypothesisConfirm);
      if (event.reward?.credits) player.credits = (player.credits || 0) + event.reward.credits;
      return safe(`${prefixText}📖 ${event.text}`);
    }
    case 'choice':
    case 'combat_choice': {
      if (!allowContinue) {
        return safe(`${prefixText}${event.text}`);
      }
      return {
        reply: { text: `${prefixText}${event.text}`, buttons: event.choices.map((c) => c.text) },
        nextState: { scene: 'exploration_event_choice', player, zone, depth, event }
      };
    }
    case 'boss': {
      const enemy = buildGuardianEnemy(event.combat?.guardianName, event.combat?.tier || 5, rng);
      return {
        reply: { text: `${prefixText}👁️ ${event.text}`, buttons: ['Атаковать', 'Отступить'], imageKey: imageForEnemy(enemy.name) },
        nextState: { scene: 'pre_combat', player, enemy, zone, depth, fragmentId: event.fragmentId }
      };
    }
    default:
      return safe(`${prefixText}${event.text || 'Ничего не произошло.'}`);
  }
}

function explore(player, zone, rng, deps, stealthMode = false, depth = 0) {
  player.zoneVisits = player.zoneVisits || { blue: 0, yellow: 0, red: 0 };
  player.zoneVisits[zone] = (player.zoneVisits[zone] || 0) + 1;
  checkContractProgress(player, 'explore', { zone });

  if (stealthMode) {
    const base = ZONE_WEIGHTS[zone] || ZONE_WEIGHTS.blue;
    const spared = Math.round(base.ambush * 0.6);
    const weightsOverride = { ...base, ambush: base.ambush - spared, find: base.find + spared };
    const event = rollEvent(zone, rng, player.level || 1, weightsOverride);
    if (event.type !== 'ambush') {
      player.stealthLog = [...(player.stealthLog || []), `Уклонение в ${ZONE_LABEL[zone] || zone}`].slice(-5);
    }
    return resolveExplorationEvent(player, event, zone, 0, deps, rng, '', false);
  }

  const event = rollEventWithDepth(player, zone, depth, rng);
  return resolveExplorationEvent(player, event, zone, depth, deps, rng);
}

function marketItemId(resource, tier) { return `${resource}__T${tier}`; }
function marketItemName(resource, tier) { return `${resource} T${tier}`; }
function parseMarketItemId(itemId) {
  const m = /^(.+)__T(\d+)$/.exec(itemId || '');
  return m ? { resource: m[1], tier: Number(m[2]) } : null;
}
function suggestedListingPrice(tier) {
  // За ЕДИНИЦУ — market-engine.js сам умножает на qty при покупке
  // (purchaseListing: totalCost = listing.price * qty). Передавать сюда
  // уже умноженную на qty сумму — баг, из-за которого покупатель платит
  // в qty раз больше, чем должен.
  return Math.max(1, Math.round(tier * 8 * 1.5));
}

async function buyFromMarket(deps, player, playerId, listing) {
  const feeDiscount = getMarketFeeDiscount(player);
  const proxyBuyer = { id: playerId, credits: player.credits || 0, inventory: [] };
  const { purchase } = await purchaseListing({ store: deps.marketStore }, proxyBuyer, listing.id, listing.qty, feeDiscount);
  const nextPlayer = { ...player, credits: proxyBuyer.credits };
  const parsed = parseMarketItemId(listing.itemId);
  if (parsed) addToInventory(nextPlayer, parsed.resource, parsed.tier, purchase.qtyBought);
  return nextPlayer;
}

async function sellToMarket(deps, player, playerId, resource, tier, qty, price) {
  const proxySeller = { id: playerId, inventory: [{ id: marketItemId(resource, tier), name: marketItemName(resource, tier), qty }] };
  const { listing } = await createListing({ store: deps.marketStore }, proxySeller, {
    itemId: marketItemId(resource, tier), itemName: marketItemName(resource, tier), qty, price,
  });
  const inv = player.inventory || [];
  const item = inv.find((i) => i.resource === resource && i.tier === tier);
  if (item) {
    item.qty -= qty;
    player.inventory = item.qty > 0 ? inv : inv.filter((i) => i !== item);
  }
  return listing;
}

async function marketHub(deps, player, playerId) {
  if (!deps.marketStore || !playerId) {
    return { reply: { text: '📈 Биржа сейчас недоступна.', buttons: stationButtons(deps, player) }, nextState: { scene: 'station', player } };
  }
  const listings = await listActiveListings({ store: deps.marketStore }, { limit: 6 });
  const lines = listings.length
    ? listings.map((l) => `${l.itemName} ×${l.qty} — 💳${l.price}/шт (итого 💳${l.price * l.qty})${l.sellerId === playerId ? ' (ваш лот)' : ''}`)
    : ['Пока пусто.'];
  const buyable = listings.filter((l) => l.sellerId !== playerId);
  const buttons = [...buyable.map((l) => `Купить: ${l.itemName}`), 'Выставить из трюма', 'Назад'];
  return {
    reply: { text: `📈 БИРЖА\n\n${lines.join('\n')}`, buttons },
    nextState: { scene: 'market_hub', player, listings }
  };
}

async function pvpDuelScreen(deps, player, playerId, duelId, duelMaybe) {
  const duel = duelMaybe || await getDuel({ store: deps.pvpStore }, duelId);
  if (!duel || duel.status === 'finished') {
    return { reply: { text: 'Дуэль не найдена или уже завершена.', buttons: stationButtons(deps, player) }, nextState: { scene: 'station', player } };
  }
  const side = duel.fighterA.id === playerId ? 'A' : 'B';
  const myTurn = side === duel.turnOf;
  const me = side === 'A' ? duel.fighterA : duel.fighterB;
  const opp = side === 'A' ? duel.fighterB : duel.fighterA;

  if (!myTurn) {
    return {
      reply: { text: `⚔️ Дуэль с ${opp.name}\n\nТы: ❤️${me.hp}/${me.hpMax} — Соперник: ❤️${opp.hp}/${opp.hpMax}\n\nСейчас не твой ход — жди ответа соперника и загляни попозже.`, buttons: ['Обновить', 'Назад'] },
      nextState: { scene: 'pvp_duel', player, duelId }
    };
  }
  const buttons = ['Обычная атака', ...(me.equippedSkills || []).map((id) => SKILLS[id]?.name).filter(Boolean), 'Назад'];
  return {
    reply: { text: `⚔️ Дуэль с ${opp.name}\n\nТы: ❤️${me.hp}/${me.hpMax} — Соперник: ❤️${opp.hp}/${opp.hpMax}\n\nТвой ход:`, buttons },
    nextState: { scene: 'pvp_duel', player, duelId }
  };
}

async function pvpHub(deps, player, playerId) {
  if (!deps.pvpStore || !playerId) {
    return { reply: { text: '⚔️ PvP сейчас недоступен.', buttons: stationButtons(deps, player) }, nextState: { scene: 'station', player } };
  }
  const activeDuelId = await deps.pvpStore.getActiveDuelId(playerId);
  if (activeDuelId) return pvpDuelScreen(deps, player, playerId, activeDuelId);
  return {
    reply: { text: '⚔️ ДУЭЛЬНАЯ АРЕНА\n\nНайти случайного соперника близкой силы?', buttons: ['Искать соперника', 'Назад'] },
    nextState: { scene: 'pvp_menu', player }
  };
}

function housingHub(deps, player) {
  const lines = Object.entries(HOUSING).map(([station, listing]) => {
    const owned = ownsHousing(player, station);
    return `${owned ? '🏠' : '🔒'} ${station}: ${listing.name} — ${owned ? 'куплено' : `💳${listing.price}`}`;
  });
  const buyButtons = Object.keys(HOUSING).filter((s) => !ownsHousing(player, s)).map((s) => `Купить дом: ${s}`);
  const itemButtons = Object.keys(HOUSING).filter((s) => ownsHousing(player, s)).map((s) => `Интерьер: ${s}`);
  return {
    reply: { text: `🏠 ЖИЛЬЁ\n\n${lines.join('\n')}`, buttons: [...buyButtons, ...itemButtons, 'Назад'] },
    nextState: { scene: 'housing_hub', player }
  };
}

async function step(state, text, rng = Math.random, deps = {}, playerId = null) {
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
      if (input === 'Биржа') {
        return marketHub(deps, state.player, playerId);
      }
      if (input === 'Дуэль') {
        return pvpHub(deps, state.player, playerId);
      }
      if (input === 'Жильё') {
        return housingHub(deps, state.player);
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
        return startJourney(state.player, 'explore', { zone: state.player.zone || 'blue', depth: 0 }, rng);
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
        return mythosScreen(state.player);
      }
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
      const talkMatch = /^Поговорить: (.+)$/.exec(input);
      if (talkMatch) {
        const arc = getArcForFaction(state.player.faction);
        const arcQuest = arc ? getNextAvailableQuest(state.player, arc) : null;
        if (arcQuest && arcQuest.name === talkMatch[1]) {
          return curatorQuestScreen(deps, state.player, arcQuest.id, 'start');
        }
        return cantinaBoard(state.player);
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
      return startJourney(player, 'explore', { zone, depth: 0 }, rng);
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
        return explore(state.player, state.payload.zone, rng, deps, false, state.payload.depth || 0);
      }
      const player = { ...state.player, faction: state.payload.targetFaction };
      const curator = CURATORS[player.faction] || '';
      return {
        reply: { text: `Стыковка завершена. Станция «${player.faction}» приветствует тебя — куратор ${curator} на связи.`, buttons: stationButtons(deps, player) },
        nextState: { scene: 'station', player }
      };
    }

    case 'journey_continue': {
      const { player, zone, depth, isBossContext } = state;
      if (input === 'Углубиться дальше') {
        return startJourney(player, 'explore', { zone, depth: (depth || 0) + 1 }, rng);
      }
      if (input === 'Эвакуироваться') {
        if (zone !== 'red' && !isBossContext) {
          // Эвакуация не предлагалась в этой ситуации — не даём случайно
          // сработать на нераспознанном вводе.
          return { reply: { text: 'Выбери действие кнопкой ниже.', buttons: journeyContinueButtons(zone, isBossContext) }, nextState: state };
        }
        const bonus = getEvacChanceBonus(player);
        const result = attemptEvacuation(player, zone, depth || 0, rng, bonus);
        if (result.success) {
          return { reply: { text: `🛰️ ${result.text}`, buttons: stationButtons(deps, player) }, nextState: { scene: 'station', player } };
        }
        return resolveExplorationEvent(player, result.blockingEvent, zone, depth || 0, deps, rng, `⚠️ ${result.text}\n\n`);
      }
      if (input === 'Вернуться на станцию') {
        return { reply: { text: 'Ты не торопясь идёшь назад пешком — вылазка окончена, всё добытое уже в трюме.', buttons: stationButtons(deps, player) }, nextState: { scene: 'station', player } };
      }
      return { reply: { text: 'Выбери действие кнопкой ниже.', buttons: journeyContinueButtons(zone, isBossContext) }, nextState: state };
    }

    case 'exploration_event_choice': {
      const { player, zone, depth, event } = state;
      const choice = (event.choices || []).find((c) => c.text === input);
      if (!choice) {
        return { reply: { text: `${event.text}`, buttons: event.choices.map((c) => c.text) }, nextState: state };
      }
      if (choice.combat) {
        const combatZone = choice.combat.zoneOverride || zone;
        const enemy = generateEnemy(combatZone, rng, player.level || 1);
        return {
          reply: { text: `⚔️ ${event.text}`, buttons: ['Атаковать', 'Отступить'], imageKey: imageForEnemy(enemy.name) },
          nextState: { scene: 'pre_combat', player, enemy, zone, depth }
        };
      }
      const nextPlayer = { ...player };
      const result = choice.result || {};
      if (result.reward) {
        if (result.reward.credits) nextPlayer.credits = (nextPlayer.credits || 0) + result.reward.credits;
        if (result.reward.reputation) nextPlayer.reputation = (nextPlayer.reputation || 0) + result.reward.reputation;
        if (result.reward.flag) { nextPlayer.flags = nextPlayer.flags || {}; nextPlayer.flags[result.reward.flag] = true; }
      }
      if (result.flag) { nextPlayer.flags = nextPlayer.flags || {}; nextPlayer.flags[result.flag] = true; }
      if (choice.consequenceId) applyConsequence(nextPlayer, choice.consequenceId);
      if (event.flag) { nextPlayer.flags = nextPlayer.flags || {}; nextPlayer.flags[event.flag] = true; }
      return safeReturnChoice(result.text || event.text, nextPlayer, zone, depth);
    }

    case 'curator_quest': {
      const found = renderCuratorStage(state.player, state.questId, state.stageId);
      if (!found) {
        return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player) }, nextState: { scene: 'station', player: state.player } };
      }
      const choice = (found.stage.choices || []).find((c) => c.label === input);
      if (!choice) {
        return { reply: { text: found.stage.text, buttons: found.stage.choices.map((c) => c.label) }, nextState: state };
      }
      const nextPlayer = { ...state.player };
      if (choice.flags) {
        nextPlayer.flags = { ...(nextPlayer.flags || {}), ...choice.flags };
      }
      return curatorQuestScreen(deps, nextPlayer, state.questId, choice.next);
    }

    case 'anomaly_choice': {
      const player = { ...state.player };
      const zone = state.zone, depth = state.depth;
      if (input === 'Доложить куратору') {
        applyConsequence(player, 'report_anomaly_find');
        const rep = CONSEQUENCE_TRIGGERS.report_anomaly_find.immediate.reputation;
        return safeReturnChoice(`Куратор внимательно выслушивает доклад и кивает. +${rep} репутации станции.`, player, zone, depth);
      }
      if (input === 'Утаить находку') {
        applyConsequence(player, 'hide_anomaly_find');
        return safeReturnChoice('Ты решаешь промолчать об увиденном. Что-то в этом решении отзывается в теле неприятным холодом — но, возможно, не только в теле.', player, zone, depth);
      }
      return { reply: { text: 'Выбери: доложить куратору или утаить находку.', buttons: ['Доложить куратору', 'Утаить находку'] }, nextState: state };
    }

    case 'pre_combat': {
      if (input === 'Отступить') {
        return { reply: { text: 'Ты отступаешь на безопасное расстояние.', buttons: stationButtons(deps, state.player) }, nextState: { scene: 'station', player: state.player } };
      }
      const buttons = ['Обычная атака', ...skillButtons(state.player), 'Стим'];
      return {
        reply: { text: `${state.enemy.name}: ❤️ ${state.enemy.hp}/${state.enemy.hpMax}\n\nВыбери действие:`, buttons },
        nextState: { scene: 'combat', player: state.player, enemy: state.enemy, trainingFight: state.trainingFight, zone: state.zone, depth: state.depth, fragmentId: state.fragmentId, stimUsedThisFight: false, curatorQuest: state.curatorQuest }
      };
    }

    case 'combat_stim_select': {
      const backButtons = ['Обычная атака', ...skillButtons(state.player)];
      if (!state.stimUsedThisFight) backButtons.push('Стим');
      if (input === 'Назад') {
        return {
          reply: { text: `${state.enemy.name}: ❤️ ${state.enemy.hp}/${state.enemy.hpMax}\n\nВыбери действие:`, buttons: backButtons },
          nextState: { scene: 'combat', player: state.player, enemy: state.enemy, trainingFight: state.trainingFight, zone: state.zone, depth: state.depth, fragmentId: state.fragmentId, stimUsedThisFight: state.stimUsedThisFight, curatorQuest: state.curatorQuest }
        };
      }
      const stimId = stimIdByName(input);
      if (!stimId) {
        return { reply: { text: 'Выбери стим кнопкой ниже.', buttons: [...stimButtons(), 'Назад'] }, nextState: state };
      }
      const result = resolvePlayerTurn({ player: state.player, enemy: state.enemy, skill: null, stimId, stimUsedThisFight: state.stimUsedThisFight, rng });
      return resolveCombatTurn(deps, state, result, rng);
    }

    case 'combat': {
      if (input === 'Стим') {
        if (state.stimUsedThisFight) {
          const buttons = ['Обычная атака', ...skillButtons(state.player)];
          return { reply: { text: 'Стим уже использован в этом бою.', buttons }, nextState: state };
        }
        return {
          reply: { text: 'Выбери стим:', buttons: [...stimButtons(), 'Назад'] },
          nextState: { scene: 'combat_stim_select', player: state.player, enemy: state.enemy, trainingFight: state.trainingFight, zone: state.zone, depth: state.depth, fragmentId: state.fragmentId, stimUsedThisFight: state.stimUsedThisFight, curatorQuest: state.curatorQuest }
        };
      }
      const skillId = input === 'Обычная атака' ? null : skillIdByName(input);
      const skill = skillId ? SKILLS[skillId] : null;
      if (input !== 'Обычная атака' && !skill) {
        const buttons = ['Обычная атака', ...skillButtons(state.player)];
        if (!state.stimUsedThisFight) buttons.push('Стим');
        return { reply: { text: 'Выбери действие кнопкой ниже.', buttons }, nextState: state };
      }

      const result = resolvePlayerTurn({ player: state.player, enemy: state.enemy, skill, stimId: null, stimUsedThisFight: state.stimUsedThisFight, rng });
      return resolveCombatTurn(deps, state, result, rng);
    }

    case 'market_hub': {
      if (input === 'Назад') {
        return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player), imageKey: imageForLocation('station') }, nextState: { scene: 'station', player: state.player } };
      }
      if (input === 'Выставить из трюма') {
        const inv = state.player.inventory || [];
        if (!inv.length) {
          return { reply: { text: 'Трюм пуст — нечего выставлять.', buttons: ['Назад'] }, nextState: { scene: 'market_hub', player: state.player, listings: state.listings || [] } };
        }
        const buttons = inv.map((i) => `Лот: ${i.resource} T${i.tier} ×${i.qty}`).concat('Назад');
        return { reply: { text: 'Что выставить целиком?', buttons }, nextState: { scene: 'market_sell_pick', player: state.player } };
      }
      const buyMatch = /^Купить: (.+)$/.exec(input);
      if (buyMatch) {
        const listing = (state.listings || []).find((l) => l.itemName === buyMatch[1] && l.sellerId !== playerId);
        if (!listing) return marketHub(deps, state.player, playerId);
        try {
          const player = await buyFromMarket(deps, state.player, playerId, listing);
          return { reply: { text: `Куплено: ${listing.itemName}.`, buttons: stationButtons(deps, player) }, nextState: { scene: 'station', player } };
        } catch (e) {
          if (e instanceof MarketError) {
            return { reply: { text: `Не удалось купить: ${e.code}`, buttons: ['Назад'] }, nextState: { scene: 'market_hub', player: state.player, listings: state.listings || [] } };
          }
          throw e;
        }
      }
      return marketHub(deps, state.player, playerId);
    }

    case 'market_sell_pick': {
      if (input === 'Назад') return marketHub(deps, state.player, playerId);
      const match = /^Лот: (.+) T(\d+) ×(\d+)$/.exec(input);
      if (!match) return marketHub(deps, state.player, playerId);
      const [, resource, tierStr, qtyStr] = match;
      const tier = Number(tierStr), qty = Number(qtyStr);
      const price = suggestedListingPrice(tier);
      const player = { ...state.player, inventory: (state.player.inventory || []).map((i) => ({ ...i })) };
      try {
        await sellToMarket(deps, player, playerId, resource, tier, qty, price);
        return { reply: { text: `Выставлено: ${resource} T${tier} ×${qty} по 💳${price}/шт (итого 💳${price * qty} за весь стек).`, buttons: stationButtons(deps, player) }, nextState: { scene: 'station', player } };
      } catch (e) {
        if (e instanceof MarketError) {
          return { reply: { text: `Не удалось выставить: ${e.code}`, buttons: ['Назад'] }, nextState: { scene: 'market_hub', player: state.player, listings: [] } };
        }
        throw e;
      }
    }

    case 'pvp_menu': {
      if (input === 'Назад') {
        return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player), imageKey: imageForLocation('station') }, nextState: { scene: 'station', player: state.player } };
      }
      if (input === 'Искать соперника') {
        try {
          const result = await findRandomOpponent({ store: deps.pvpStore }, { ...state.player, id: playerId });
          if (result.matched) return pvpDuelScreen(deps, state.player, playerId, result.duel.id, result.duel);
          return { reply: { text: 'Ты встал в очередь — при следующем заходе в «Дуэль» проверим, не нашёлся ли соперник.', buttons: ['Назад'] }, nextState: { scene: 'pvp_menu', player: state.player } };
        } catch (e) {
          if (e instanceof PvpError) return { reply: { text: `Не удалось: ${e.code}`, buttons: ['Назад'] }, nextState: state };
          throw e;
        }
      }
      return pvpHub(deps, state.player, playerId);
    }

    case 'pvp_duel': {
      if (input === 'Назад') {
        return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player), imageKey: imageForLocation('station') }, nextState: { scene: 'station', player: state.player } };
      }
      if (input === 'Обновить') {
        return pvpDuelScreen(deps, state.player, playerId, state.duelId);
      }
      const skillId = input === 'Обычная атака' ? null : skillIdByName(input);
      if (input !== 'Обычная атака' && !skillId) {
        return pvpDuelScreen(deps, state.player, playerId, state.duelId);
      }
      try {
        const duel = await submitPvpTurn({ store: deps.pvpStore }, playerId, state.duelId, { skillId }, SKILLS, STIMS, rng);
        if (duel.status === 'finished') {
          const mySide = duel.fighterA.id === playerId ? 'A' : 'B';
          const won = duel.winner === mySide;
          const player = { ...state.player };
          const reward = winnerReward();
          if (won) {
            player.credits = (player.credits || 0) + reward.credits;
            player.reputation = (player.reputation || 0) + reward.reputation;
          }
          return {
            reply: { text: `⚔️ Дуэль окончена. ${won ? `Победа! +${reward.credits} кредитов, +${reward.reputation} репутации.` : 'Поражение.'}`, buttons: stationButtons(deps, player) },
            nextState: { scene: 'station', player }
          };
        }
        return pvpDuelScreen(deps, state.player, playerId, state.duelId, duel);
      } catch (e) {
        if (e instanceof PvpError) return { reply: { text: `Не удалось: ${e.code}`, buttons: ['Обновить', 'Назад'] }, nextState: state };
        throw e;
      }
    }

    case 'housing_hub': {
      if (input === 'Назад') {
        return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player), imageKey: imageForLocation('station') }, nextState: { scene: 'station', player: state.player } };
      }
      const buyMatch = /^Купить дом: (.+)$/.exec(input);
      if (buyMatch) {
        try {
          const player = { ...state.player };
          purchaseHousing(player, buyMatch[1]);
          return housingHub(deps, player);
        } catch (e) {
          if (e instanceof HousingError) {
            const msg = e.code === HOUSING_ERRORS.INSUFFICIENT_CREDITS ? 'не хватает кредитов' : e.code;
            return { reply: { text: `Не получилось: ${msg}`, buttons: ['Назад'] }, nextState: { scene: 'housing_hub', player: state.player } };
          }
          throw e;
        }
      }
      const itemMatch = /^Интерьер: (.+)$/.exec(input);
      if (itemMatch) {
        const station = itemMatch[1];
        const catalog = HOUSE_ITEMS[station] || [];
        const owned = (state.player.housing?.[station]?.items) || [];
        const available = catalog.filter((i) => !owned.includes(i.id));
        if (!available.length) {
          return { reply: { text: 'Всё уже куплено для этого дома.', buttons: ['Назад'] }, nextState: { scene: 'housing_hub', player: state.player } };
        }
        const buttons = available.map((i) => `Купить: ${i.name} (💳${i.price})`).concat('Назад');
        return { reply: { text: HOUSING[station].flavor, buttons }, nextState: { scene: 'housing_item_pick', player: state.player, station } };
      }
      return housingHub(deps, state.player);
    }

    case 'housing_item_pick': {
      if (input === 'Назад') return housingHub(deps, state.player);
      const match = /^Купить: (.+?) \(/.exec(input);
      const catalog = HOUSE_ITEMS[state.station] || [];
      const item = match ? catalog.find((i) => i.name === match[1]) : null;
      if (!item) return housingHub(deps, state.player);
      try {
        const player = { ...state.player };
        purchaseHouseItem(player, state.station, item.id);
        return housingHub(deps, player);
      } catch (e) {
        if (e instanceof HousingError) {
          return { reply: { text: `Не получилось: ${e.code}`, buttons: ['Назад'] }, nextState: { scene: 'housing_hub', player: state.player } };
        }
        throw e;
      }
    }

    default:
      return { reply: { text: 'Что-то пошло не так, начнём заново.', buttons: [] }, nextState: { scene: 'start' } };
  }
}

function resolveCombatTurn(deps, state, result, rng) {
  if (result.finished) {
    if (result.winner === 'attacker') {
      if (state.trainingFight) {
        return {
          reply: { text: `💥 ${result.log.join(' ')}\n\n✅ Дрон-манекен деактивирован. Тренировка окончена — это была только симуляция, статы и HP полностью восстановлены.`, buttons: ['Доложить куратору'] },
          nextState: { scene: 'quest_report', player: { ...result.attacker, hp: result.attacker.hpMax } }
        };
      }
      if (state.curatorQuest) {
        return curatorQuestScreen(deps, { ...result.attacker, hp: result.attacker.hpMax }, state.curatorQuest.questId, state.curatorQuest.winNext);
      }
      const zone = state.zone || 'blue';
      const depth = state.depth || 0;
      const loot = rollLoot(zone, rng);
      const player = { ...result.attacker };
      addToInventory(player, loot.resource, loot.tier, loot.qty);
      player.credits = (player.credits || 0) + loot.credits;
      player.killCount = (player.killCount || 0) + 1;
      if ((state.enemy.tier || 0) >= 5) player.highTierKills = (player.highTierKills || 0) + 1;
      checkContractProgress(player, 'combat_win', { zone });
      checkContractProgress(player, 'loot', { resource: loot.resource, amount: loot.qty });
      const xpGain = xpForTier(state.enemy.tier || 1);
      const { leveledUp, level } = grantXp(player, xpGain);
      const bestiaryDrops = rollLootByEnemyName(state.enemy.name, rng);
      if (bestiaryDrops.length) player.bestiaryItems = [...(player.bestiaryItems || []), ...bestiaryDrops.map((d) => d.id)];

      let fragmentNote = '';
      if (state.fragmentId) {
        const res = collectFragment(player, state.fragmentId);
        if (res.success) fragmentNote = `\n✨ Фрагмент собран за победу над стражем.`;
      }

      let victoryText = `💥 ${result.log.join(' ')}\n\n🏆 ${state.enemy.name} уничтожен.\n💳 +${loot.credits} кредитов, +${loot.qty}× ${loot.resource} T${loot.tier}\n✨ +${xpGain} XP${fragmentNote}`;
      if (bestiaryDrops.length) victoryText += `\n🎖️ Особая добыча: ${bestiaryDrops.map((d) => d.name).join(', ')}`;
      if (leveledUp) victoryText += `\n🆙 Новый уровень: ${level}! (+2 очка, +20 HP, полное исцеление)`;

      return {
        reply: { text: victoryText, buttons: journeyContinueButtons(zone, !!state.fragmentId) },
        nextState: { scene: 'journey_continue', player, zone, depth, isBossContext: !!state.fragmentId }
      };
    }
    if (state.curatorQuest) {
      return curatorQuestScreen(deps, { ...result.attacker, hp: Math.round(result.attacker.hpMax * 0.5) }, state.curatorQuest.questId, state.curatorQuest.loseNext);
    }
    return {
      reply: { text: `💥 ${result.log.join(' ')}\n\n💀 Скафандр пробит. Аварийная капсула эвакуирует тебя на станцию.`, buttons: stationButtons(deps, state.player) },
      nextState: { scene: 'station', player: { ...result.attacker, hp: Math.round(result.attacker.hpMax * 0.5) } }
    };
  }

  const enemyTurn = resolveTurn({ attacker: result.defender, defender: result.attacker, rng });
  const log = result.log.concat(enemyTurn.log).join(' ');

  if (enemyTurn.finished && enemyTurn.winner === 'attacker') {
    if (state.curatorQuest) {
      return curatorQuestScreen(deps, { ...enemyTurn.defender, hp: Math.round(enemyTurn.defender.hpMax * 0.5) }, state.curatorQuest.questId, state.curatorQuest.loseNext);
    }
    return {
      reply: { text: `💥 ${log}\n\n💀 Скафандр пробит.`, buttons: stationButtons(deps, state.player) },
      nextState: { scene: 'station', player: { ...enemyTurn.defender, hp: Math.round(enemyTurn.defender.hpMax * 0.5) } }
    };
  }

  const buttons = ['Обычная атака', ...skillButtons(enemyTurn.defender)];
  if (!result.stimUsedThisFight) buttons.push('Стим');
  return {
    reply: { text: `💥 ${log}\n\n${state.enemy.name}: ❤️ ${enemyTurn.attacker.hp}/${enemyTurn.attacker.hpMax}`, buttons },
    nextState: { scene: 'combat', player: enemyTurn.defender, enemy: enemyTurn.attacker, trainingFight: state.trainingFight, zone: state.zone, depth: state.depth, fragmentId: state.fragmentId, stimUsedThisFight: result.stimUsedThisFight, curatorQuest: state.curatorQuest }
  };
}

module.exports = {
  step, freshPlayer, equippedSkillIds, addToInventory, sellInventory, hubMessage, stationButtons, contractsBoard,
  FACTIONS, FACTION_KIT, CURATORS, MAX_EQUIPPED_SKILLS, HUB_BUTTONS, ZONE_BUTTONS, MIN_LEVEL_FOR_ZONE
};
