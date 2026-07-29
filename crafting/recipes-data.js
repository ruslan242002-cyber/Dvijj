/**
 * РЕЦЕПТЫ МАСТЕРСКОЙ — превращают уже существующие ресурсы из трюма
 * в постоянные модули характеристик. Никакого нового типа предметов не
 * вводится: вход — обычные {resource, tier, qty} из player.inventory,
 * выход — постоянная прибавка к player.stats.
 */
'use strict';

const RECIPES = [
  {
    id: 'module_firepower',
    name: 'Модуль огневой мощи',
    inputs: [
      { resource: 'Изотопы', tier: 2, qty: 5 },
      { resource: 'Сплавы', tier: 2, qty: 3 }
    ],
    statBonus: { stat: 'firepower', amount: 2 }
  },
  {
    id: 'module_shielding',
    name: 'Модуль экранирования',
    inputs: [
      { resource: 'Сплавы', tier: 2, qty: 5 },
      { resource: 'Полимеры', tier: 2, qty: 3 }
    ],
    statBonus: { stat: 'shielding', amount: 2 }
  },
  {
    id: 'module_reaction',
    name: 'Модуль реакции',
    inputs: [
      { resource: 'Реголит', tier: 2, qty: 5 },
      { resource: 'Биомасса', tier: 2, qty: 3 }
    ],
    statBonus: { stat: 'reaction', amount: 2 }
  },
  {
    id: 'module_power_advanced',
    name: 'Продвинутый модуль мощи',
    inputs: [
      { resource: 'Изотопы', tier: 3, qty: 4 },
      { resource: 'Реголит', tier: 3, qty: 2 }
    ],
    statBonus: { stat: 'power', amount: 3 }
  }
];

module.exports = { RECIPES };
