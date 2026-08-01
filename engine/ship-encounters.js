'use strict';

/**
 * ВРАЖЕСКИЕ КОРАБЛИ — космические встречи на маршруте (не путать с
 * бестиарием на планетах, engine/bestiary.js — те существа встречаются
 * персонажу пешком). Тир вражеского корабля растёт с дистанцией полёта
 * (engine/travel.js: distanceTierBonus) — тот же принцип, что и с
 * глубиной обычной вылазки, только применительно к дальности до планеты.
 */

const { distanceTierBonus } = require('./travel.js');
const { maxTierForLevel } = require('./tier-bands.js');

const SHIP_CLASSES = [
  { name: 'Разведчик-перехватчик', minTier: 1 },
  { name: 'Патрульный катер', minTier: 1 },
  { name: 'Корсарский фрегат', minTier: 2 },
  { name: 'Крейсер-контрабандист', minTier: 3 },
  { name: 'Штурмовой эсминец', minTier: 4 },
  { name: 'Рейдер Тракта', minTier: 5 },
  { name: 'Флагман неизвестной принадлежности', minTier: 6 },
];

function statsForShipTier(tier) {
  const base = 14 + tier * 5;
  return {
    hpMax: Math.round((90 + tier * 24)),
    armor: Math.round(base * 0.5),
    firepower: Math.round(base * 0.9),
  };
}

/**
 * Генерирует вражеский корабль для случайной встречи в космосе на данной
 * дистанции полёта. playerShipLevel зажимает потолок тира (та же логика,
 * что и generateEnemy() в exploration-engine.js для наземных встреч) —
 * иначе игрок первого уровня мог бы наткнуться на "Флагман" на первом же
 * шаге.
 */
function generateHostileShip(distance, playerShipLevel, rng = Math.random) {
  const bonus = distanceTierBonus(distance);
  let tier = 1 + bonus;
  if (playerShipLevel) tier = Math.max(1, Math.min(tier, maxTierForLevel(playerShipLevel)));

  const eligible = SHIP_CLASSES.filter((c) => c.minTier <= tier);
  const cls = eligible[eligible.length - 1] || SHIP_CLASSES[0];
  const { hpMax, armor, firepower } = statsForShipTier(tier);

  return {
    name: cls.name,
    tier,
    hp: hpMax,
    hpMax,
    stats: {
      power: firepower, mind: firepower, reaction: armor, endurance: armor,
      firepower, shielding: armor,
    },
    luck: Math.round(5 + tier * 1.2),
    accuracy: 0.65 + Math.min(tier, 5) * 0.02,
    dodge: 0.08 + Math.min(tier, 5) * 0.015,
    focus: 0.6 + Math.min(tier, 5) * 0.02,
    periodic: [],
    isHostileShip: true,
  };
}

module.exports = { SHIP_CLASSES, statsForShipTier, generateHostileShip };
