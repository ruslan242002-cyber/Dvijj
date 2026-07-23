/**
 * Исследование сектора: бросок случайного события + генерация лута.
 * Веса событий зависят от зоны (синяя/жёлтая/красная), как в части III
 * и XI.5 дизайн-документа "Периферия".
 */
'use strict';

const RESOURCES = ['Сплавы', 'Изотопы', 'Полимеры', 'Биомасса', 'Реголит'];

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

function rollEvent(zone, rng = Math.random) {
  const weights = ZONE_WEIGHTS[zone] || ZONE_WEIGHTS.blue;
  const type = weightedPick(weights, rng);

  switch (type) {
    case 'find': {
      const loot = rollLoot(zone, rng);
      return { type, loot, text: `Внутри: ${loot.qty}× ${loot.resource} ${toRoman(loot.tier)}, ${loot.credits} кредитов.` };
    }
    case 'ambush': {
      const dangerMult = { blue: 0.6, yellow: 1, red: 1.8 }[zone] || 1;
      const hp = Math.round((80 + rng() * 120) * dangerMult);
      return { type, enemy: { hp, hpMax: hp }, text: `HP: ${hp} · Тип угрозы: боевой` };
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

module.exports = { rollEvent, rollLoot, RESOURCES, ZONE_WEIGHTS, toRoman };
