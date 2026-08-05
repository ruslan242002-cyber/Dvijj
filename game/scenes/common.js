'use strict';

/**
 * ОБЩИЕ ДАННЫЕ И ХЕЛПЕРЫ, используемые больше чем одним модулем сцен.
 * Вынесено из router.js как часть рефакторинга на отдельные сцены
 * (game/scenes/*.js) — раньше всё это жило в одном файле на 1500+ строк.
 */

const { xpToNext } = require('../../engine/leveling.js');
const { explorationStatusCard } = require('../../lib/status-card.js');
const { SKILLS } = require('../../engine/skills-data.js');
const { getDailyContracts, getReputationTitle } = require('../../contracts/contracts-engine.js');
const { getDistrictAtmosphere } = require('../../city/city-engine.js');
const { DISTRICTS } = require('../../city/districts-data.js');
const { rollStationEvent } = require('../../city/station-events.js');
const { trophyProgressText } = require('../../lib/trophies.js');
const { stormStatusText, isStormActive, STORM_REWARD_MULTIPLIER } = require('../../lib/world-storm.js');

const DANGER_LABEL = { low: 'низкая', medium: 'средняя', high: 'высокая' };

/**
 * Карточка станции при заходе на хаб — картинка (см. imageForLocation
 * ('station', faction) в hub.js) + описание в духе "Вы находитесь на
 * станции: X", плюс редкое случайное событие станции (station-events.js)
 * простым текстом внизу, если повезло сработать.
 *
 * Возвращает { text, reward } — reward нужно применить к игроку в hub.js
 * (эта функция сама player не мутирует, только читает).
 */
function stationArrivalCard(player, rng = Math.random) {
  const district = DISTRICTS[player.faction];
  const curator = CURATORS[player.faction] || 'куратор станции';
  const atmosphere = getDistrictAtmosphere(player.faction);
  const dangerLabel = district ? (DANGER_LABEL[district.danger] || district.danger) : '—';

  let text = `📍 Вы находитесь на станции: ${player.faction}\nКуратор: ${curator}\nОпасность станции: ${dangerLabel}`;
  if (district) text += `\n\n${district.description}`;
  if (atmosphere) text += `\n\n${atmosphere.time}`;
  if (isStormActive()) text += `\n\n${stormStatusText()}`;

  const event = district ? rollStationEvent(district.events, rng) : null;
  if (event) text += `\n\n${event.text}`;

  return { text, reward: event?.reward || null };
}

const FACTIONS = ['Приют', 'Терминус', 'Арсенал', 'Вуаль', 'Кузница'];

/** Расписание открытия городов по уровню — старт только в Приюте,
 * остальные открываются постепенно (не смена фракции, а доступ на
 * посещение/торговлю/квесты через Врата Тракта). */
const CITY_UNLOCK_LEVEL = {
  'Арсенал': 5,
  'Вуаль': 10,
  'Терминус': 15,
  'Кузница': 20,
};

const { unlockedSkillsForPlayer } = require('../../engine/skills-data.js');
const { freshShip } = require('../../engine/ship.js');

const FACTION_KIT = {
  'Приют':    { statBias: { mind: 6, endurance: 4 } },
  'Терминус': { statBias: { endurance: 8, power: 2 } },
  'Арсенал':  { statBias: { power: 6, firepowerBonus: 4 } },
  'Вуаль':    { statBias: { mind: 6, reaction: 4 } },
  'Кузница':  { statBias: { endurance: 6, power: 6 } }
};

const MAX_EQUIPPED_SKILLS = 3;
const RESET_COMMAND = 'Сброс';

const HUB_BUTTONS = ['Исследовать', 'Мостик', 'Отсек', 'Декон-камера', 'Бар', 'Контракты', 'Биржа', 'Дуэль', 'Жильё', 'Врата Тракта', '📊 Статус', 'Профиль', 'Сброс'];
const ZONE_BUTTONS = ['Патрулируемый', 'Спорный', 'Открытый космос', 'К другим станциям', '⬅️ Назад'];
const ZONE_BY_LABEL = { 'Патрулируемый': 'blue', 'Спорный': 'yellow', 'Открытый космос': 'red' };
const ZONE_LABEL = { blue: 'Патрулируемый сектор', yellow: 'Спорный сектор', red: 'Открытый космос' };
const MIN_LEVEL_FOR_ZONE = { blue: 1, yellow: 3, red: 7 };

const CURATORS = { 'Приют': 'Ирис Вейл', 'Терминус': 'Шёпот', 'Арсенал': 'Рен Окса', 'Вуаль': 'Дрого Кейн', 'Кузница': 'Марта Ковач' };

const ZONE_TRAVEL_PHRASES = {
  blue: [
    'Патрульный дрон станции лениво сканирует твой позывной и отворачивается — путь свободен.',
    'Знакомый гул генераторов станции затихает за спиной.',
    'Курс проложен, приборы спокойны — сектор патрулируемый.',
    'Мимо проплывает разметочный буй — граница патрулируемой зоны, всё как обычно.',
    'Скафандр чуть скрипит на стыках — привычный звук, ничего тревожного.',
    'Диспетчер станции коротко подтверждает курс и переключается на следующего.',
    'Здесь спокойно настолько, что мысли сами уходят куда-то в сторону.',
    'Знакомые созвездия за иллюминатором — этот участок ты уже видел(а) не раз.',
  ],
  yellow: [
    'Датчик радиации тихо щёлкает — пока в пределах нормы, но чаще, чем час назад.',
    'Обрывок чужих переговоров на общей частоте — сектор явно оспаривается.',
    'Обломки чужого корабля проплывают мимо — здесь недавно был бой.',
    'Приборы дважды теряют и находят сигнал станции — связь здесь уже не такая надёжная.',
    'На периферии сканера — что-то похожее на брошенный маяк, отключённый и молчаливый.',
    'Воздух в кабине как будто гуще — или просто нервы, сложно сказать наверняка.',
    'Чей-то незнакомый позывной мелькает в эфире и пропадает, не дождавшись ответа.',
    'Разметка сектора здесь старая, местами выцветшая — граница спорной территории.',
  ],
  red: [
    'Здесь эхо Тракта не в приборах — оно в голове.',
    'Связь со станцией слабеет с каждой секундой.',
    'Приборы фиксируют резонанс, для которого нет описания в базе.',
    'Тишина здесь неправильная — слишком плотная, будто сам космос затаил дыхание.',
    'На периферии зрения что-то движется — оборачиваешься, и там пусто.',
    'Датчики то и дело сходят с ума, показывая невозможные значения и тут же сбрасываясь.',
    'Свет далёких звёзд здесь как будто чуть тусклее обычного.',
    'Ощущение, что за тобой наблюдают, не проходит с самого входа в сектор.',
  ]
};
const STATION_TRAVEL_PHRASES = [
  'Тракт прокладывает курс между станциями — недолго, но не мгновенно.',
  'Обломки давно потерянных ковчегов мелькают за бортом.',
  'Резонанс Тракта на секунду искажает показания приборов — обычное дело для прыжка.',
  'Станция назначения уже видна вдалеке — почти на месте.',
  'Корабль мягко потряхивает на границе течений Тракта — пассажиры бы такое не одобрили.',
  'Автопилот коротко мигает индикатором коррекции курса и снова затихает.',
  'За бортом проносится вереница чужих маячков — оживлённый межстанционный коридор.',
  'Двигатели гудят ровнее обычного — редкий спокойный перелёт.'
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
  const starterSkills = unlockedSkillsForPlayer(faction, 1).map((s) => s.id);
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
    tripCargo: [],
    ship: freshShip(faction),
    equippedPassives: [],
    knownPassives: [],
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

const DECON_BASE_FEE = 300;
/** Единая точка правды для цены декон-камеры — используется и при
 * построении кнопки (hub.js), и при самом списании (locations/decon.js).
 * Раньше это было в двух местах порознь и один раз уже разошлось
 * (кнопка показывала цену, обработчик её не сверял). Приют — бесплатно
 * всегда (фракционный перк), Вуаль — скидка 50%, остальные — полная цена. */
function deconFee(faction) {
  if (faction === 'Приют') return 0;
  if (faction === 'Вуаль') return Math.round(DECON_BASE_FEE * 0.5);
  return DECON_BASE_FEE;
}

function equippedSkillIds(player) {
  if (player.equippedSkills && player.equippedSkills.length) return player.equippedSkills;
  return unlockedSkillsForPlayer(player.faction, player.level || 1).map((s) => s.id);
}
function skillButtons(player, cooldowns = {}) {
  return equippedSkillIds(player)
    .filter((id) => !(cooldowns[id] > 0))
    .map((id) => SKILLS[id]?.name)
    .filter(Boolean);
}
function skillCooldownNote(player, cooldowns = {}) {
  const onCd = equippedSkillIds(player)
    .filter((id) => cooldowns[id] > 0)
    .map((id) => `⏳ ${SKILLS[id]?.name}: ещё ${cooldowns[id]} х.`);
  return onCd.length ? onCd.join('\n') : '';
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
  const groups = (DISTRICT_GROUPS[player?.faction] || DISTRICT_GROUPS['Приют']).map((g) => {
    if (g.label === 'Контракты') return { label: 'Контракты', color: 'positive' };
    if (g.label === 'Полёт') return { label: 'Полёт', color: 'negative' };
    return g.label;
  });
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
    reply: { text: `${text}\n\n${explorationStatusCard(player)}`, buttons: journeyContinueButtons(zone, isBossContext) },
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
    { label: 'Штаб', buttons: ['Мостик', '📊 Статус'] },
    { label: 'Отсек', buttons: ['Отсек', 'Мастерская'] },
    { label: 'Декон-камера', buttons: ['Декон-камера'] },
    { label: 'Палубы', buttons: ['Бар', 'Биржа', 'Жильё'] },
    { label: 'Терраса памяти', buttons: ['Терраса памяти'] },
    { label: 'Мастерская новичка', buttons: ['Мастерская новичка'] },
    { label: 'Барак ожидания', buttons: ['Барак ожидания'] },
    { label: 'Дуэль', buttons: ['Дуэль'] },
    { label: 'Контракты', buttons: ['Контракты'] },
    { label: 'Полёт', buttons: ['Полёт'] },
    { label: 'Врата Тракта', buttons: ['Врата Тракта'] },
    { label: '⛏️ Жила', buttons: ['⛏️ Жила'] },
  ],
  'Терминус': [
    { label: 'Гарнизон', buttons: ['Мостик', '📊 Статус'] },
    { label: 'Отсек', buttons: ['Отсек', 'Мастерская'] },
    { label: 'Декон-камера', buttons: ['Декон-камера'] },
    { label: 'Казармы', buttons: ['Бар', 'Биржа', 'Жильё'] },
    { label: 'Рубеж', buttons: ['Архив теней'] },
    { label: 'Дуэль', buttons: ['Дуэль'] },
    { label: 'Контракты', buttons: ['Контракты'] },
    { label: 'Полёт', buttons: ['Полёт'] },
    { label: 'Врата Тракта', buttons: ['Врата Тракта'] },
    { label: '⛏️ Жила', buttons: ['⛏️ Жила'] },
  ],
  'Арсенал': [
    { label: 'Штаб', buttons: ['Мостик', '📊 Статус'] },
    { label: 'Отсек', buttons: ['Отсек', 'Мастерская'] },
    { label: 'Декон-камера', buttons: ['Декон-камера'] },
    { label: 'Склад', buttons: ['Бар', 'Биржа', 'Жильё'] },
    { label: 'Дуэль', buttons: ['Дуэль'] },
    { label: 'Контракты', buttons: ['Контракты'] },
    { label: 'Полёт', buttons: ['Полёт'] },
    { label: 'Врата Тракта', buttons: ['Врата Тракта'] },
    { label: '⛏️ Жила', buttons: ['⛏️ Жила'] },
  ],
  'Вуаль': [
    { label: 'Штаб', buttons: ['Мостик', '📊 Статус'] },
    { label: 'Цех', buttons: ['Отсек', 'Мастерская'] },
    { label: 'Декон-камера', buttons: ['Декон-камера'] },
    { label: 'Модуль', buttons: ['Бар', 'Биржа', 'Жильё'] },
    { label: 'Дуэль', buttons: ['Дуэль'] },
    { label: 'Контракты', buttons: ['Контракты'] },
    { label: 'Полёт', buttons: ['Полёт'] },
    { label: 'Врата Тракта', buttons: ['Врата Тракта'] },
    { label: '⛏️ Жила', buttons: ['⛏️ Жила'] },
  ],
  'Кузница': [
    { label: 'Плавильня', buttons: ['Мостик', '📊 Статус'] },
    { label: 'Отсек', buttons: ['Отсек', 'Мастерская'] },
    { label: 'Декон-камера', buttons: ['Декон-камера'] },
    { label: 'Слобода', buttons: ['Бар', 'Биржа', 'Жильё'] },
    { label: 'Дуэль', buttons: ['Дуэль'] },
    { label: 'Контракты', buttons: ['Контракты'] },
    { label: 'Полёт', buttons: ['Полёт'] },
    { label: 'Врата Тракта', buttons: ['Врата Тракта'] },
    { label: '⛏️ Жила', buttons: ['⛏️ Жила'] },
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
  FACTIONS, FACTION_KIT, CITY_UNLOCK_LEVEL, MAX_EQUIPPED_SKILLS, RESET_COMMAND,
  ZONE_BUTTONS, ZONE_BY_LABEL, ZONE_LABEL, MIN_LEVEL_FOR_ZONE, CURATORS,
  ZONE_TRAVEL_PHRASES, STATION_TRAVEL_PHRASES, DISTRICT_GROUPS,
  trainerDrone, freshPlayer, equippedSkillIds, skillButtons, skillIdByName, skillCooldownNote,
  addToInventory, sellInventory, stationButtons, hubMessage, statusText,
  startJourney, buildGuardianEnemy, journeyContinueButtons, safeReturnChoice,
  stormRewardMult, districtGroupsFor, stationArrivalCard, deconFee,
};
