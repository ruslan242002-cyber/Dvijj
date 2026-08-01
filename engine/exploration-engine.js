'use strict';
const { maxTierForLevel } = require('./tier-bands.js');
const RESOURCES = ['Сплавы', 'Изотопы', 'Полимеры', 'Биомасса', 'Реголит'];
const ENEMY_NAMES = {
  blue: ['Дрейф-обломок', 'Слабый резонанс', 'Отбившийся зонд', 'Ржавый автомат', 'Эхо-помеха'],
  yellow: ['Отголосок-падальщик', 'Резонансный хищник', 'Сбойный дрон', 'Тракт-паразит', 'Радиационный рой'],
  red: ['Глубинный Отголосок', 'Тракт-порождение', 'Искажённый страж', 'Голос из разлома', 'Пожиратель сигналов']
};
const ZONE_WEIGHTS = {
  blue:   { find: 18, ambush: 42, anomaly: 10, distress: 10, node: 20 },
  yellow: { find: 12, ambush: 52, anomaly: 13, distress: 8,  node: 15 },
  red:    { find: 8,  ambush: 62, anomaly: 15, distress: 5,  node: 10 }
};
function weightedPick(weights, rng) {
  const entries = Object.entries(weights);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let roll = rng() * total;
  for (const [key, w] of entries) { if (roll < w) return key; roll -= w; }
  return entries[entries.length - 1][0];
}
function tierForZone(zone, rng) {
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
function generateEnemy(zone, rng = Math.random, playerLevel = null) {
  const names = ENEMY_NAMES[zone] || ENEMY_NAMES.blue;
  const name = names[Math.floor(rng() * names.length)];
  const dangerMult = { blue: 0.6, yellow: 1, red: 1.8 }[zone] || 1;
  let tier = tierForZone(zone, rng);
  if (playerLevel) tier = Math.max(1, Math.min(tier, maxTierForLevel(playerLevel)));
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
      shielding: Math.min(60, Math.round(base * 0.6))
    },
    luck: Math.round(5 + tier * 1.5),
    accuracy: 0.68 + Math.min(tier, 5) * 0.02,
    dodge: 0.06 + Math.min(tier, 5) * 0.015,
    focus: 0.6 + Math.min(tier, 5) * 0.02,
    periodic: []
  };
}
function rollEvent(zone, rng = Math.random, playerLevel = null, weightsOverride = null) {
  const weights = weightsOverride || ZONE_WEIGHTS[zone] || ZONE_WEIGHTS.blue;
  const type = weightedPick(weights, rng);
  switch (type) {
    case 'find': {
      const loot = rollLoot(zone, rng);
      return { type, loot, text: `Внутри: ${loot.qty}x ${loot.resource} T${loot.tier}, ${loot.credits} кредитов.` };
    }
    case 'ambush': {
      const enemy = generateEnemy(zone, rng, playerLevel);
      return { type, enemy, text: `${enemy.name} · HP: ${enemy.hp}` };
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
module.exports = { rollEvent, rollLoot, generateEnemy, RESOURCES, ZONE_WEIGHTS, ENEMY_NAMES };
