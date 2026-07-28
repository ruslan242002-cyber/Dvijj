'use strict';

const CONTRACT_POOL = [
  { id: 'c_kill_red', text: 'Уничтожить 3 Отголоска в красной зоне', type: 'kill', zone: 'red', target: 3, reward: { credits: 200, reputation: 15 } },
  { id: 'c_loot_iso', text: 'Найти 15 Изотопов', type: 'loot', resource: 'Изотопы', target: 15, reward: { credits: 150, reputation: 10 } },
  { id: 'c_win_tower', text: 'Пройти 3 этажа Башни Тракта', type: 'tower', target: 3, reward: { credits: 300, reputation: 25 } },
  { id: 'c_use_stims', text: 'Использовать 5 стим-пакетов', type: 'use_stim', target: 5, reward: { credits: 100, reputation: 10 } },
  { id: 'c_explore_yellow', text: 'Исследовать жёлтую зону 5 раз', type: 'explore', zone: 'yellow', target: 5, reward: { credits: 180, reputation: 15 } }
];

const REPUTATION_TIERS = {
  0: 'Незнакомец',
  50: 'Доверенное лицо',
  150: 'Агент станции',
  300: 'Правый рук куратора',
  500: 'Легенда Тракта'
};

module.exports = { CONTRACT_POOL, REPUTATION_TIERS };
