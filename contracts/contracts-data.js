/**
 * Пул ежедневных контрактов куратора + шкала репутации.
 *
 * ВАЖНО: убрал из исходного пула типы 'tower' (Башня Тракта) и 'use_stim'
 * (использование стим-пакета) — этих систем в игре пока физически нет
 * (нет мини-игры "башня", и стимы нигде не применяются игроком в бою),
 * так что такие контракты никогда бы не засчитались. Вместо них —
 * дополнительные варианты kill/explore на других зонах, чтобы пул
 * оставался разнообразным, но полностью выполнимым уже сейчас.
 * Когда система стимов или башня появятся — тип легко добавить обратно,
 * достаточно дописать запись сюда и добавить обработку в contracts-engine.js.
 */
'use strict';

const CONTRACT_POOL = [
  { id: 'c_kill_red', text: 'Уничтожить 3 Отголоска в открытом космосе', type: 'kill', zone: 'red', target: 3, reward: { credits: 200, reputation: 15 } },
  { id: 'c_kill_yellow', text: 'Уничтожить 5 Отголосков в спорном секторе', type: 'kill', zone: 'yellow', target: 5, reward: { credits: 150, reputation: 12 } },
  { id: 'c_loot_iso', text: 'Найти 15 Изотопов', type: 'loot', resource: 'Изотопы', target: 15, reward: { credits: 150, reputation: 10 } },
  { id: 'c_loot_splavy', text: 'Найти 10 Сплавов', type: 'loot', resource: 'Сплавы', target: 10, reward: { credits: 120, reputation: 8 } },
  { id: 'c_explore_yellow', text: 'Исследовать спорный сектор 5 раз', type: 'explore', zone: 'yellow', target: 5, reward: { credits: 180, reputation: 15 } },
  { id: 'c_explore_red', text: 'Исследовать открытый космос 3 раза', type: 'explore', zone: 'red', target: 3, reward: { credits: 220, reputation: 18 } }
];

const REPUTATION_TIERS = {
  0: 'Незнакомец',
  50: 'Доверенное лицо',
  150: 'Агент станции',
  300: 'Правая рука куратора',
  500: 'Легенда Тракта'
};

module.exports = { CONTRACT_POOL, REPUTATION_TIERS };
