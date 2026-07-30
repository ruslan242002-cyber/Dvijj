'use strict';

/**
 * ОБЩИЕ ДАННЫЕ И ХЕЛПЕРЫ, используемые больше чем одним модулем сцен.
 * Вынесено из router.js как часть рефакторинга на отдельные сцены
 * (game/scenes/*.js) — раньше всё это жило в одном файле на 1500+ строк.
 */

const { xpToNext } = require('../../engine/leveling.js');
const { SKILLS } = require('../../engine/skills-data.js');
const { getDailyContracts, getReputationTitle } = require('../../contracts/contracts-engine.js');
const { getDistrictAtmosphere } = require('../../city/city-engine.js');
const { trophyProgressText } = require('../../lib/trophies.js');
const { stormStatusText, isStormActive, STORM_REWARD_MULTIPLIER } = require('../../lib/world-storm.js');

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
  const groups = (DISTRICT_GROUPS[player?.faction] || DISTRICT_GROUPS['Приют']).map((g) => g.label);
  const flatTail = ['Сброс'];
  return link
    ? [{ label: 'Открыть профиль', url: link }, ...groups, ...flatTail]
    : [...groups, 'Профиль', ...flatTail];
}

function hubMessage(player) {
  const next = xpToNext(player.level || 1);
  const curator = CURATORS[player.faction] || 'куратор станции';
  const atmosphere = getDistrictAtmosphere(player.faction);
  const atmosphereLine = atmosphere ? `\n\n${atmosphere.time}` : '';
  const stormLine = `\n\n${stormStatusText()}`;
  return `🛰️ СТАНЦИЯ «${player.faction}»\n${curator} на связи.${atmosphereLine}${stormLine}\n\n${player.name} · Ур. ${player.level || 1} (${player.xp || 0}/${next} XP)\n❤️ ${player.hp}/${player.hpMax}   💳 ${player.credits || 0}\n📍 ${ZONE_LABEL[player.zone] || 'Патрулируемый сектор'}${player.radiation ? `\n☢️ Облучение: ${player.radiation}%` : ''}${player.statPoints ? `\n✨ Нераспределённых очков: ${player.statPoints}` : ''}`;
}

function statusText(p) {
  const repLine = p.reputation ? `\n⭐ Репутация: ${p.reputation} (${getReputationTitle(p.reputation)})` : '';
  const trophyLine = `\n\n${trophyProgressText(p).summary}`;
  return hubMessage(p) + repLine + trophyLine;
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

function safeReturnChoice(text, player, zone, depth, isBossContext = false, extra = {}) {
  return {
    reply: { text, buttons: journeyContinueButtons(zone, isBossContext) },
    nextState: { scene: 'journey_continue', player, zone, depth, isBossContext, ...extra }
  };
}

/** Множитель награды за находки/сигналы, пока активен резонансный шторм —
 * см. lib/world-storm.js. Комбат-тир во время шторма НЕ трогаем (враг уже
 * сгенерирован выше по цепочке с playerLevel-капом) — шторм действует
 * только на награду, не на силу противников. */
function stormRewardMult() {
  return isStormActive() ? STORM_REWARD_MULTIPLIER : 1;
}

const DISTRICT_GROUPS = {
  'Приют': [
    { label: 'Кабинет куратора', buttons: ['Мостик', 'Статус'] },
    { label: 'Медотсек', buttons: ['Отсек', 'Декон-камера'] },
    { label: 'Жилые палубы', buttons: ['Кантина', 'Биржа', 'Жильё'] },
    { label: 'Причал', buttons: ['Врата Тракта', 'Исследовать'] },
    { label: 'Двор станции', buttons: ['Дуэль', 'Контракты'] },
  ],
  'Терминус': [
    { label: 'Штаб гарнизона', buttons: ['Мостик', 'Статус'] },
    { label: 'Ремонтный блок', buttons: ['Отсек', 'Декон-камера'] },
    { label: 'Казармы', buttons: ['Кантина', 'Биржа', 'Жильё'] },
    { label: 'Рубеж', buttons: ['Врата Тракта', 'Исследовать'] },
    { label: 'Плац', buttons: ['Дуэль', 'Контракты', 'Архив теней'] },
  ],
  'Арсенал': [
    { label: 'Командный пункт', buttons: ['Мостик', 'Статус'] },
    { label: 'Мастерские', buttons: ['Отсек', 'Декон-камера'] },
    { label: 'Склад деталей', buttons: ['Кантина', 'Биржа', 'Жильё'] },
    { label: 'Стапели', buttons: ['Врата Тракта', 'Исследовать'] },
    { label: 'Стрельбище', buttons: ['Дуэль', 'Контракты'] },
  ],
  'Вуаль': [
    { label: 'Диспетчерская', buttons: ['Мостик', 'Статус'] },
    { label: 'Сборочный цех', buttons: ['Отсек', 'Декон-камера', 'Мастерская'] },
    { label: 'Жилой модуль', buttons: ['Кантина', 'Биржа', 'Жильё'] },
    { label: 'Причал верфи', buttons: ['Врата Тракта', 'Исследовать'] },
    { label: 'Испытательный полигон', buttons: ['Дуэль', 'Контракты'] },
  ],
};

function districtGroupsFor(player) {
  return DISTRICT_GROUPS[player?.faction] || DISTRICT_GROUPS['Приют'];
}

/** Общая логика конкретной кнопки станции (Мостик/Отсек/Кантина/...) —
 * используется и из 'station' (обратная совместимость на случай прямого
 * ввода без районов), и из 'district_hub'. Возвращает null, если input
 * не распознан этой функцией — тогда вызывающая сторона решает, что
 * показать дальше (либо район, либо переспросить). */

module.exports = {
  FACTIONS, FACTION_KIT, MAX_EQUIPPED_SKILLS, RESET_COMMAND,
  ZONE_BUTTONS, ZONE_BY_LABEL, ZONE_LABEL, MIN_LEVEL_FOR_ZONE, CURATORS,
  ZONE_TRAVEL_PHRASES, STATION_TRAVEL_PHRASES, DISTRICT_GROUPS,
  trainerDrone, freshPlayer, equippedSkillIds, skillButtons, skillIdByName,
  addToInventory, sellInventory, stationButtons, hubMessage, statusText,
  startJourney, buildGuardianEnemy, journeyContinueButtons, safeReturnChoice,
  stormRewardMult, districtGroupsFor,
};
