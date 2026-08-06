'use strict';
const { maxTierForLevel } = require('./tier-bands.js');
const { pickResourceForTheme, pickEnemyNameForTheme } = require('../lib/named-locations.js');
const { generatePack } = require('./pack-combat.js');

const RESOURCES = ['Сплавы', 'Изотопы', 'Полимеры', 'Биомасса', 'Реголит'];
const ENEMY_NAMES = {
  blue: ['Дрейф-обломок', 'Слабый резонанс', 'Отбившийся зонд', 'Ржавый автомат', 'Эхо-помеха'],
  yellow: ['Отголосок-падальщик', 'Резонансный хищник', 'Сбойный дрон', 'Тракт-паразит', 'Радиационный рой'],
  red: ['Глубинный Отголосок', 'Тракт-порождение', 'Искажённый страж', 'Голос из разлома', 'Пожиратель сигналов'],
};

// 6 новых типов событий (cache/resonance_pedestal/terminal_hack/
// echo_playback/reaction_hazard/corrupted_ai) добавлены к уже
// существующим пяти — не заменяют их, просто расширяют пул.
const ZONE_WEIGHTS = {
  blue: { find: 15, ambush: 36, anomaly: 8, distress: 8, node: 17, cache: 5, resonance_pedestal: 3, terminal_hack: 3, echo_playback: 2, reaction_hazard: 2, corrupted_ai: 1 },
  yellow: { find: 10, ambush: 44, anomaly: 11, distress: 7, node: 13, cache: 5, resonance_pedestal: 3, terminal_hack: 3, echo_playback: 2, reaction_hazard: 2, corrupted_ai: 1 },
  red: { find: 6, ambush: 52, anomaly: 12, distress: 4, node: 9, cache: 5, resonance_pedestal: 4, terminal_hack: 3, echo_playback: 2, reaction_hazard: 2, corrupted_ai: 1 },
};

function weightedPick(weights, rng) {
  const entries = Object.entries(weights);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let roll = rng() * total;
  for (const [key, w] of entries) { if (roll < w) return key; roll -= w; }
  return entries[entries.length - 1][0];
}

function tierForZone(zone, rng, playerLevel = 1) {
  const ranges = { blue: [1, 2], yellow: [2, 4], red: [4, 7] };
  const [zoneMin, zoneMax] = ranges[zone] || [1, 3];
  const levelCap = maxTierForLevel(playerLevel);
  // Уровень персонажа — жёсткий потолок сверху; зона по-прежнему задаёт
  // "естественный" разброс тиров внутри того, что вообще доступно на этом
  // уровне. Не даёт зелёному игроку заскочить за один удачный ролл сразу
  // на Т6 просто потому, что он зашёл в красную зону.
  const min = Math.min(zoneMin, levelCap);
  const max = Math.min(zoneMax, levelCap);
  return min + Math.floor(rng() * (max - min + 1));
}

// ⚠️ ТЕСТОВЫЙ РЕЖИМ — временный множитель наград ×500 (кредиты и
// количество ресурсов), чтобы не фармить вручную при тестировании.
// ОБЯЗАТЕЛЬНО выставить false / убрать перед реальным релизом — это
// единственная точка, которую нужно тронуть, чтобы вернуть всё к норме,
// т.к. rollLoot() используется и боем (combat.js), и находками при
// вылазке (exploration.js: find/node/cache) — патч здесь покрывает всё
// разом.
const TESTING_MODE = true;
const TESTING_LOOT_MULTIPLIER = 500;

function rollLoot(zone, rng = Math.random, playerLevel = 1, theme = null) {
  const resource = theme ? pickResourceForTheme(RESOURCES, theme, rng) : RESOURCES[Math.floor(rng() * RESOURCES.length)];
  const tier = tierForZone(zone, rng, playerLevel);
  let qty = 1 + Math.floor(rng() * 4);
  let credits = Math.round((10 + rng() * 40) * tier);
  if (TESTING_MODE) { qty *= TESTING_LOOT_MULTIPLIER; credits *= TESTING_LOOT_MULTIPLIER; }
  return { resource, tier, qty, credits };
}

function generateEnemy(zone, rng = Math.random, playerLevel = null, theme = null) {
  const names = ENEMY_NAMES[zone] || ENEMY_NAMES.blue;
  const name = pickEnemyNameForTheme(names, theme, rng);
  const dangerMult = { blue: 0.6, yellow: 1, red: 1.8 }[zone] || 1;
  let tier = tierForZone(zone, rng);
  if (playerLevel) tier = Math.max(1, Math.min(tier, maxTierForLevel(playerLevel)));
  // Штраф за занижение тира ("фарм трупов" высоким уровнем в лёгкой зоне)
  // уже целиком закрыт engine/leveling.js: xpForKill() — отдельный
  // множитель здесь был бы избыточным двойным наказанием за то же самое.
  const hp = Math.round((80 + rng() * 120) * dangerMult * (1 + tier * 0.1));
  const base = 12 + tier * 4;
  return {
    name, tier, hp, hpMax: hp,
    stats: {
      power: Math.round(base * (0.8 + rng() * 0.4)),
      mind: Math.round(base * (0.8 + rng() * 0.4)),
      reaction: Math.round(base * (0.8 + rng() * 0.4)),
      endurance: Math.round(base * (0.8 + rng() * 0.4)),
      firepower: Math.round(base * 1.2 * (0.8 + rng() * 0.4)),
      shielding: Math.min(60, Math.round(base * 0.6)),
    },
    luck: Math.round(5 + tier * 1.5),
    accuracy: 0.68 + Math.min(tier, 5) * 0.02,
    dodge: 0.06 + Math.min(tier, 5) * 0.015,
    focus: 0.6 + Math.min(tier, 5) * 0.02,
    periodic: [],
  };
}

/**
 * СОБЫТИЯ В ПУТИ — раньше полёт между событиями был просто задержкой
 * (клики "Продолжить путь" без выбора). Теперь на каждом шаге пути есть
 * 20% шанс мини-события "обломки на курсе" с реальным выбором: облететь
 * (дольше, безопасно), протиснуться (быстрее, риск повреждения),
 * просканировать (награда). Вызывать из travel.js на каждом шаге ПЕРЕД
 * обычным rollEvent, если rollPathEvent() вернул не null.
 */
const PATH_EVENT_CHANCE = 0.2;
function rollPathEvent(rng = Math.random) {
  if (rng() >= PATH_EVENT_CHANCE) return null;
  return {
    type: 'path_obstacle',
    text: 'Обломки на курсе. Что делать?',
    choices: ['fly_around', 'squeeze_through', 'scan'],
  };
}

/** Резолвит выбор игрока на path_obstacle. squeeze_through — риск урона
 * кораблю/скафандру (не боевой урон, отдельная мелкая трата HP), scan —
 * награда ресурсом без риска, fly_around — просто теряет доп. время. */
function resolvePathEvent(choice, rng = Math.random, playerLevel = 1) {
  if (choice === 'fly_around') return { outcome: 'delay', text: 'Обходишь стороной — путь чуть дольше, зато чисто.' };
  if (choice === 'squeeze_through') {
    const damaged = rng() < 0.35;
    return damaged
      ? { outcome: 'damaged', dmg: 5 + Math.floor(rng() * 10), text: 'Протискиваешься между обломками — задел борт.' }
      : { outcome: 'clean', text: 'Протискиваешься между обломками без единой царапины.' };
  }
  if (choice === 'scan') {
    const loot = rollLoot('blue', rng, playerLevel);
    return { outcome: 'scanned', loot, text: `Скан находит кое-что полезное: ${loot.qty}x ${loot.resource} T${loot.tier}.` };
  }
  return { outcome: 'delay', text: 'Обходишь стороной.' };
}

/**
 * СОСТОЯНИЯ ЗАЛЕЖИ (node) — надстройка над уже существующей системой
 * тиров/весов лута, не отдельная параллельная механика. Стабильная
 * (60%) — без изменений. Нестабильная (30%) — +50% к зарядам, но риск
 * при добыче (резолвится в сцене эксплуатации). Охраняемая (10%) —
 * перед лутом бой с generateEnemy() того же тира/зоны.
 */
const NODE_STATE_WEIGHTS = { stable: 60, unstable: 30, guarded: 10 };
function rollNodeState(rng = Math.random) {
  return weightedPick(NODE_STATE_WEIGHTS, rng);
}

function rollEvent(zone, rng = Math.random, playerLevel = null, weightsOverride = null, theme = null) {
  const weights = weightsOverride || ZONE_WEIGHTS[zone] || ZONE_WEIGHTS.blue;
  const type = weightedPick(weights, rng);
  switch (type) {
    case 'find': {
      const loot = rollLoot(zone, rng, playerLevel, theme);
      return { type, loot, text: `Внутри: ${loot.qty}x ${loot.resource} T${loot.tier}, ${loot.credits} кредитов.` };
    }
    case 'ambush': {
      // В патрулируемой зоне (слабые монстры) часть засад приходит стаей
      // 2-3 разом — не одиночный противник, реальное давление числом, а
      // не гарантированная последовательная зачистка.
      if (zone === 'blue' && rng() < 0.25) {
        const packSize = 2 + Math.floor(rng() * 2); // 2-3
        const pack = generatePack(zone, rng, generateEnemy, playerLevel, packSize);
        return { type: 'pack_ambush', pack, text: `Стая (${packSize}): ${pack.map((p) => p.name).join(', ')}` };
      }
      const enemy = generateEnemy(zone, rng, playerLevel, theme);
      return { type, enemy, text: `${enemy.name} · HP: ${enemy.hp}` };
    }
    case 'anomaly':
      // Головоломки аномалий (lib/anomaly-puzzles.js) + поиск артефакта —
      // отдельная, уже более развитая система, чем простой radiationGain.
      // rollEvent тут просто отдаёт тип, вся реальная логика — в
      // game/scenes/exploration.js через pickAnomalyPuzzle().
      return { type, radiationGain: 5 + Math.floor(rng() * 10), text: 'Дотронуться до фрагмента можно, но неясно, что он сделает с облучением.' };
    case 'distress': {
      // 30% шанс, что сигнал бедствия — ловушка (засада). "Просканировать"
      // требует mind > 25 у игрока — эта проверка в сцене, здесь только
      // генерируем факт ловушки и потенциального врага на этот случай.
      const isTrap = rng() < 0.3;
      const reward = { credits: Math.round(50 + rng() * 100), reputation: 1 };
      const ambushEnemy = isTrap ? generateEnemy(zone, rng, playerLevel, theme) : null;
      return {
        type, isTrap, reward, ambushEnemy,
        text: 'Сигнал бедствия. Ответить, проигнорировать или просканировать издали?',
      };
    }
    case 'node': {
      const loot = rollLoot(zone, rng, playerLevel, theme);
      let charges = 1 + Math.floor(rng() * 7);
      const nodeState = rollNodeState(rng);
      if (nodeState === 'unstable') charges = Math.round(charges * 1.5);
      const guardEnemy = nodeState === 'guarded' ? generateEnemy(zone, rng, playerLevel, theme) : null;
      return {
        type, resource: loot.resource, tier: loot.tier, charges, nodeState, guardEnemy,
        text: nodeState === 'guarded'
          ? `Залежь охраняется: ${guardEnemy.name}. Придётся драться за доступ.`
          : nodeState === 'unstable'
          ? `Нестабильная залежь — заряды: ${charges}/${Math.round(7 * 1.5)}. Есть риск при добыче.`
          : `Заряды жилы: ${charges}/7`,
      };
    }
    case 'cache':
      return rollCacheEvent(zone, rng, playerLevel, theme);
    case 'resonance_pedestal':
      return rollResonancePedestal();
    case 'terminal_hack':
      return rollTerminalHack();
    case 'echo_playback':
      return rollEchoPlayback();
    case 'reaction_hazard':
      return rollReactionHazard();
    case 'corrupted_ai':
      return rollCorruptedAi();
    default:
      return { type: 'find', loot: rollLoot(zone, rng, playerLevel, theme), text: 'Пустая находка.' };
  }
}

/**
 * НОВЫЕ ИНТЕРАКТИВНЫЕ СОБЫТИЯ — все с реальным выбором/риском, не
 * просто текст-и-награда. rollEvent() выше собирает их в общий пул
 * через тот же switch, что и старые типы.
 */
const CACHE_FLAVOR = [
  'Проржавевший грузовой контейнер, вскрытый чьими-то давними руками — но не до конца.',
  'Тайник в обшивке, замаскированный под обычную панель. Кто-то не хотел, чтобы это нашли случайно.',
  'Полуразрушенный склад — судя по маркировке, довоенный, судя по запаху — нет.',
  'Связка герметичных капсул, вмёрзших в породу. На одной из них ещё виден логотип станции, которой больше нет.',
];
function rollCacheEvent(zone, rng, playerLevel, theme) {
  const itemCount = 2 + Math.floor(rng() * 3); // 2-4
  const items = [];
  for (let i = 0; i < itemCount; i++) {
    items.push(rollLoot(zone, rng, playerLevel, theme));
  }
  const flavor = CACHE_FLAVOR[Math.floor(rng() * CACHE_FLAVOR.length)];
  return { type: 'cache', items, text: flavor };
}

/** Резонансный постамент — один "Дотронуться", исход непредсказуем
 * заранее (в отличие от аномалии с явными вариантами). Таблица
 * исходов взвешена, но игрок её не видит до нажатия. */
const PEDESTAL_OUTCOMES = [
  { weight: 25, type: 'vision', text: 'Постамент отзывается вспышкой — на миг перед глазами проносится образ, которого здесь не должно быть.' },
  { weight: 20, type: 'radiation', text: 'Резонанс отдаётся в теле неприятным жаром. Датчик облучения тревожно пискнул.' },
  { weight: 20, type: 'resource', text: 'Поверхность постамента открывается, как ларец — внутри что-то есть.' },
  { weight: 20, type: 'nothing', text: 'Ничего не происходит. Постамент остывает под рукой так же внезапно, как ожил.' },
  { weight: 15, type: 'reputation', text: 'Символы на постаменте на миг складываются в нечто похожее на координаты. Стоит доложить куратору.' },
];
function rollResonancePedestal() {
  return { type: 'resonance_pedestal', text: 'Артефакт с шёпотом Тракта, вырезанным незнакомыми символами на поверхности. Что-то тянет коснуться его.', choices: ['touch'] };
}
function resolveResonancePedestal(rng = Math.random, playerLevel = 1) {
  const total = PEDESTAL_OUTCOMES.reduce((s, o) => s + o.weight, 0);
  let roll = rng() * total;
  let picked = PEDESTAL_OUTCOMES[PEDESTAL_OUTCOMES.length - 1];
  for (const o of PEDESTAL_OUTCOMES) { if (roll < o.weight) { picked = o; break; } roll -= o.weight; }
  if (picked.type === 'vision') return { ...picked, xp: 15 };
  if (picked.type === 'radiation') return { ...picked, radiationGain: 8 + Math.floor(rng() * 12) };
  if (picked.type === 'resource') return { ...picked, loot: rollLoot('red', rng, playerLevel) };
  if (picked.type === 'reputation') return { ...picked, reputationGain: 8 };
  return picked;
}

/** Сигнал из тишины — терминал станции с кодовым замком. Взлом зависит
 * от mind игрока, не от рандома напрямую (порог, не шанс). */
function rollTerminalHack() {
  return { type: 'terminal_hack', text: 'Заброшенный терминал станции, ещё держащий заряд. Экран блокировки мигает — можно попробовать взломать.', choices: ['hack', 'leave'] };
}
function resolveTerminalHack(choice, player, rng = Math.random, playerLevel = 1) {
  if (choice === 'leave') return { outcome: 'left', text: 'Решаешь не рисковать со взломом.' };
  const mind = player?.stats?.mind || 0;
  const threshold = 20;
  if (mind < threshold) return { outcome: 'fail_low_mind', text: `Не хватает подготовки для взлома (нужно mind ${threshold}+). Терминал блокируется намертво.` };
  const success = rng() < 0.65 + Math.min(0.25, (mind - threshold) * 0.01);
  if (success) return { outcome: 'success', loot: rollLoot('yellow', rng, playerLevel), xp: 20, text: 'Взлом проходит чисто — терминал выдаёт архивные данные и что-то материальное вместе с ними.' };
  return { outcome: 'fail_alarm', enemy: generateEnemy('yellow', rng, playerLevel), text: 'Взлом срывается — терминал включает тревогу. Что-то реагирует на шум.' };
}

/** Эхо-передача — обрывок голосовой записи. Дольше слушаешь — больше
 * награда, но и выше риск, что запись привлечёт внимание Отголосков. */
function rollEchoPlayback() {
  return { type: 'echo_playback', text: 'Обрывок голосовой записи довоенной эпохи, зацикленный и потрескивающий. Слушать дальше — рискованно, но там явно есть что дослушать.', choices: ['listen_short', 'listen_full', 'skip'] };
}
function resolveEchoPlayback(choice, rng = Math.random, playerLevel = 1) {
  if (choice === 'skip') return { outcome: 'skipped', text: 'Проходишь мимо, не дослушав.' };
  if (choice === 'listen_short') {
    return { outcome: 'short', xp: 10, text: 'Слушаешь недолго — обрывок фразы, ничего важного, зато безопасно.' };
  }
  const ambushed = rng() < 0.35;
  if (ambushed) return { outcome: 'ambushed', enemy: generateEnemy('red', rng, playerLevel), text: 'Запись обрывается на полуслове — что-то услышало её вместе с тобой.' };
  return { outcome: 'full', loot: rollLoot('red', rng, playerLevel), xp: 25, text: 'Запись доигрывает до конца. То, что в ней сказано, стоило риска.' };
}

/** Ловушка-резонанс — reaction-check. Успел среагировать — награда
 * именно там, где остальные бы прошли мимо; не успел — расплата. */
function rollReactionHazard() {
  return { type: 'reaction_hazard', text: 'На вид — обычный участок пути. Но что-то в воздухе едва заметно подрагивает.', choices: ['react'] };
}
function resolveReactionHazard(player, rng = Math.random, playerLevel = 1) {
  const reaction = player?.stats?.reaction || 0;
  const chance = Math.min(0.85, 0.35 + reaction * 0.01);
  const succeeded = rng() < chance;
  if (succeeded) return { outcome: 'success', loot: rollLoot('red', rng, playerLevel), text: 'В последний миг успеваешь заметить неладное и вовремя отступить — а заодно находишь то, что здесь спрятала сама опасность.' };
  return { outcome: 'fail', dmg: 8 + Math.floor(rng() * 12), text: 'Не успеваешь среагировать — резонансный разряд задевает по касательной.' };
}

/** Спор с искажённым ИИ — чистый диалог, без боя. Выбор влияет на
 * репутацию фракции или открывает лорный флаг, не на статы напрямую. */
function rollCorruptedAi() {
  return {
    type: 'corrupted_ai',
    text: 'Голос искажённого ИИ станции звучит из динамика, вмонтированного в стену: «Ты не в списке. Но список давно никто не проверял. Что тебе нужно?»',
    choices: ['ask_about_trakt', 'ask_about_station', 'shut_down'],
  };
}
function resolveCorruptedAi(choice, player) {
  if (choice === 'ask_about_trakt') {
    return { outcome: 'lore', flag: 'heard_corrupted_ai_trakt', text: '«Тракт не разрывался. Тракт... закрывался. Разница важна, но я не помню, почему». Связь обрывается прежде, чем ИИ успевает договорить.' };
  }
  if (choice === 'ask_about_station') {
    return { outcome: 'reputation', reputationGain: 6, faction: player?.faction, text: '«Эта станция принадлежала нам всем когда-то. Расскажи своему куратору — пусть знает, что я ещё здесь». Небольшая, но искренняя благодарность.' };
  }
  return { outcome: 'shutdown', text: 'Отключаешь динамик. Голос обрывается на полуслове — может, к лучшему.' };
}

/** Резолвит выбор игрока на событии 'distress'. respond — либо награда,
 * либо (если isTrap) бой; ignore — ничего; scan требует mind > 25 у
 * игрока (проверка снаружи, здесь просто отдаёт правду при успехе). */
function resolveDistressChoice(choice, event, player) {
  if (choice === 'ignore') return { outcome: 'ignored', text: 'Оставляешь сигнал без ответа — безопаснее.' };
  if (choice === 'scan') {
    if ((player?.stats?.mind || 0) <= 25) {
      return { outcome: 'scan_failed', text: 'Не хватает данных, чтобы просканировать сигнал издали — придётся решать вслепую.' };
    }
    return event.isTrap
      ? { outcome: 'scan_trap_revealed', text: 'Скан вскрывает подделку — это ловушка. Можно спокойно проигнорировать.' }
      : { outcome: 'scan_genuine_revealed', text: 'Скан подтверждает: сигнал настоящий, там кто-то реально нуждается в помощи.' };
  }
  if (choice === 'respond') {
    return event.isTrap
      ? { outcome: 'ambush', enemy: event.ambushEnemy, text: 'Сигнал был приманкой — из-за обломков выходит противник.' }
      : { outcome: 'rewarded', reward: event.reward, text: 'Спасённый благодарит и делится тем, что у него есть.' };
  }
  return { outcome: 'ignored', text: 'Оставляешь сигнал без ответа.' };
}

module.exports = {
  rollEvent, rollLoot, generateEnemy, RESOURCES, ZONE_WEIGHTS, ENEMY_NAMES,
  rollPathEvent, resolvePathEvent,
  resolveDistressChoice,
  rollNodeState, NODE_STATE_WEIGHTS,
  rollCacheEvent, rollResonancePedestal, resolveResonancePedestal,
  rollTerminalHack, resolveTerminalHack, rollEchoPlayback, resolveEchoPlayback,
  rollReactionHazard, resolveReactionHazard, rollCorruptedAi, resolveCorruptedAi,
};
