/**
 * Пул ежедневных контрактов куратора + шкала репутации.
 *
 * ИСТОРИЯ: раньше отсюда убрали типы 'tower' (Башня Тракта) и 'use_stim'
 * (использование стим-пакета), потому что этих систем не было — не было
 * мини-игры "башня", и стимы нигде не применялись игроком в бою.
 * 'use_stim' теперь возвращён: стимы реально работают в бою (кнопка
 * "Стим" в pre_combat/combat, engine/combat-turn.js). 'tower' по-прежнему
 * не возвращён — башни как механики всё ещё нет физически.
 *
 * РЕДКОСТЬ — поле `rarity`: common/rare/legendary. 3 common генерируются
 * как раньше (pickContracts в contracts-engine.js), rare открывается
 * ПОСЛЕ выполнения всех 3 common за день (maybeUnlockRareContract).
 * Legendary — редкий отдельный ролл, не завязан на цепочку ("кто первый").
 *
 * NPC-КОНТРАКТЫ — привязаны к конкретным существующим NPC (уже были в
 * лоре арки Шёпота: city/npc-roster.js), не абстрактный "от куратора":
 * Оружейник Тарк (Арсенал) — компоненты боссов. Разведчица Ния (Арсенал) —
 * разведка секторов. Механик Брок (Терминус) — сдача ресурсов на ремонт.
 * Осведомитель Кес (Вуаль) — контракт типа 'info'.
 */
'use strict';

const CONTRACT_POOL = [
  { id: 'c_kill_red', rarity: 'common', text: 'Уничтожить 3 Отголоска в открытом космосе', type: 'kill', zone: 'red', target: 3, reward: { credits: 200, reputation: 15 } },
  { id: 'c_kill_yellow', rarity: 'common', text: 'Уничтожить 5 Отголосков в спорном секторе', type: 'kill', zone: 'yellow', target: 5, reward: { credits: 150, reputation: 12 } },
  { id: 'c_loot_iso', rarity: 'common', text: 'Найти 15 Изотопов', type: 'loot', resource: 'Изотопы', target: 15, reward: { credits: 150, reputation: 10 } },
  { id: 'c_loot_splavy', rarity: 'common', text: 'Найти 10 Сплавов', type: 'loot', resource: 'Сплавы', target: 10, reward: { credits: 120, reputation: 8 } },
  { id: 'c_explore_yellow', rarity: 'common', text: 'Исследовать спорный сектор 5 раз', type: 'explore', zone: 'yellow', target: 5, reward: { credits: 180, reputation: 15 } },
  { id: 'c_explore_red', rarity: 'common', text: 'Исследовать открытый космос 3 раза', type: 'explore', zone: 'red', target: 3, reward: { credits: 220, reputation: 18 } },
  { id: 'c_use_stim', rarity: 'common', text: 'Применить стим в бою 2 раза', type: 'use_stim', target: 2, reward: { credits: 140, reputation: 10 } },

  // ── Редкие (открываются после выполнения всех 3 common за день) ──
  { id: 'r_kill_named', rarity: 'rare', text: 'Победить именного монстра (Гравиарх, Пульсарид или сильнее)', type: 'kill_named', target: 1, reward: { credits: 450, reputation: 35 } },
  { id: 'r_deep_explore', rarity: 'rare', text: 'Исследовать открытый космос 6 раз подряд без возврата на станцию', type: 'explore_streak', zone: 'red', target: 6, reward: { credits: 500, reputation: 40 } },
  { id: 'r_loot_rare', rarity: 'rare', text: 'Сдать 5 ресурсов тира 4+', type: 'loot_tier', minTier: 4, target: 5, reward: { credits: 480, reputation: 38 } },

  // ── Легендарные (редкий отдельный ролл, гонка "кто первый") ──
  { id: 'l_shard_traktu', rarity: 'legendary', text: 'Первым найти «Осколок Тракта» в открытом космосе', type: 'legendary_find', target: 1, reward: { credits: 1000, reputation: 80 } },

  // ── NPC-контракты (привязаны к конкретным именным NPC) ──
  { id: 'npc_tark_plates', rarity: 'common', npc: 'oruzheynik_tark', text: 'Тарк: «Мне нужны пластины Гравиарха. Не спрашивай зачем.»', type: 'kill_named', targetName: 'Гравиарх', target: 1, reward: { credits: 260, reputation: 14 } },
  { id: 'npc_niya_scan', rarity: 'common', npc: 'razvedchica_niya', text: 'Ния: «Пройди спорный сектор ещё раз — мне нужны свежие данные для карты.»', type: 'explore', zone: 'yellow', target: 4, reward: { credits: 170, reputation: 12 } },
  { id: 'npc_brok_repair', rarity: 'common', npc: 'mehanik_brok', text: 'Брок: «Тащи Сплавы и Полимеры — латка обшивки сама себя не сделает.»', type: 'loot_multi', resources: [{ resource: 'Сплавы', target: 6 }, { resource: 'Полимеры', target: 4 }], reward: { credits: 190, reputation: 12 } },
  { id: 'npc_kes_rumor', rarity: 'common', npc: 'osvedomitel_kes', text: 'Кес: «Узнай, что происходит в спорном секторе, и вернись с информацией — не с трупами.»', type: 'info', zone: 'yellow', target: 3, reward: { credits: 150, reputation: 16 } },
];

const REPUTATION_TIERS = {
  0: 'Незнакомец',
  50: 'Доверенное лицо',
  150: 'Агент станции',
  300: 'Правая рука куратора',
  500: 'Легенда Тракта',
};

module.exports = { CONTRACT_POOL, REPUTATION_TIERS };
