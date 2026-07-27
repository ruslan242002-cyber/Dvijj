/**
 * Исследование сектора: бросок случайного события + генерация лута.
 * Веса событий зависят от зоны (синяя/жёлтая/красная), как в части III
 * и XI.5 дизайн-документа "Периферия".
 */
'use strict';

const RESOURCES = ['Сплавы', 'Изотопы', 'Полимеры', 'Биомасса', 'Реголит'];

// Именной пул отголосков по зонам — просто добавляйте новые строки сюда,
// когда захотите больше разнообразия. Ни один "куб" в конструкторе бота
// трогать не нужно — сервер сам решает, кто попадётся и с какими статами.
const ENEMY_NAMES = {
  blue: ['Дрейф-обломок', 'Слабый резонанс', 'Отбившийся зонд', 'Ржавый автомат', 'Эхо-помеха'],
  yellow: ['Отголосок-падальщик', 'Резонансный хищник', 'Сбойный дрон', 'Тракт-паразит', 'Радиационный рой'],
  red: ['Глубинный Отголосок', 'Тракт-порождение', 'Искажённый страж', 'Голос из разлома', 'Пожиратель сигналов']
};

// веса событий по зонам: находка, отголосок(бой), аномалия, сигнал бедствия, залежь
const ZONE_WEIGHTS = {
  blue:   { find: 45, ambush: 5,  anomaly: 10, distress: 15, node: 25 },
  yellow: { find: 30, ambush: 30, anomaly: 15, distress: 10, node: 15 },
  red:    { find: 20, ambush: 45, anomaly: 20, distress: 5,  node: 10 }
};

function weightedPick(weights, rng) {
  const entries = Object.entries(weights);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let roll = rng() * total;
  for (const [key, w] of entries) {
    if (roll < w) return key;
    roll -= w;
  }
  return entries[entries.length - 1][0];
}

function tierForZone(zone, rng) {
  // синяя зона — в основном тир I-II, жёлтая — II-IV, красная — IV-VI+
  const ranges = { blue: [1, 2], yellow: [2, 4], red: [4, 7] };
  const [min, max] = ranges[zone] || [1, 3];
  return min + Math.floor(rng() * (max - min + 1));
}

function rollLoot(zone, rng = Math.random) {
  const resource = RESOURCES[Math.floor(rng() * RESOURCES.length)];
  const tier = tierForZone(zone, rng);
  const qty = 1 + Math.floor(rng() * 4);
  const credits = Math.round((10 + rng() * 40) * tier);
  return { resource, tier, qty, credits };
}

/**
 * Полноценный враг, готовый к бою прямо из /api/turn — с именем и всеми
 * полями, которые понимает combat-engine. SaleBot просто сохраняет
 * весь этот объект в переменную state.enemy как есть, ничего не достраивая.
 */
function generateEnemy(zone, rng = Math.random) {
  const names = ENEMY_NAMES[zone] || ENEMY_NAMES.blue;
  const name = names[Math.floor(rng() * names.length)];
  const dangerMult = { blue: 0.6, yellow: 1, red: 1.8 }[zone] || 1;
  const tier = tierForZone(zone, rng);
  const hp = Math.round((80 + rng() * 120) * dangerMult * (1 + tier * 0.1));

  const base = 12 + tier * 4;
  return {
    name,
    hp, hpMax: hp,
    stats: {
      power: Math.round(base * (0.8 + rng() * 0.4)),
      mind: Math.round(base * (0.8 + rng() * 0.4)),
      reaction: Math.round(base * (0.8 + rng() * 0.4)),
      endurance: Math.round(base * (0.8 + rng() * 0.4)),
      firepower: Math.round(base * 1.2 * (0.8 + rng() * 0.4)),
      shielding: Math.min(60, Math.round(base * 0.6))
    },
    luck: Math.round(5 + tier * 1.5),
    accuracy: 0.68 + Math.min(tier, 5) * 0.02,
    dodge: 0.06 + Math.min(tier, 5) * 0.015,
    focus: 0.6 + Math.min(tier, 5) * 0.02,
    periodic: []
  };
}

function rollEvent(zone, rng = Math.random) {
  const weights = ZONE_WEIGHTS[zone] || ZONE_WEIGHTS.blue;
  const type = weightedPick(weights, rng);

  switch (type) {
    case 'find': {
      const loot = rollLoot(zone, rng);
      return { type, loot, text: `Внутри: ${loot.qty}× ${loot.resource} ${toRoman(loot.tier)}, ${loot.credits} кредитов.` };
    }
    case 'ambush': {
      const enemy = generateEnemy(zone, rng);
      return { type, enemy, text: `${enemy.name} · HP: ${enemy.hp} · Тип угрозы: боевой` };
    }
    case 'anomaly':
      return { type, radiationGain: 5 + Math.floor(rng() * 10), text: 'Дотронуться до фрагмента можно, но неясно, что он сделает с облучением.' };
    case 'distress':
      return { type, reward: { credits: Math.round(50 + rng() * 100), reputation: 1 }, text: 'Спасти его — риск времени, но станция наградит за гуманитарный рейс.' };
    case 'node': {
      const loot = rollLoot(zone, rng);
      const charges = 1 + Math.floor(rng() * 7);
      return { type, resource: loot.resource, tier: loot.tier, charges, text: `Заряды жилы: ${charges}/7` };
    }
    default:
      return { type: 'find', loot: rollLoot(zone, rng), text: 'Пустая находка.' };
  }
}

function toRoman(n) {
  const map = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
  return map[n] || String(n);
}

module.exports = { rollEvent, rollLoot, generateEnemy, RESOURCES, ZONE_WEIGHTS, toRoman };
