/**
 * Логика ежедневных контрактов. Хранится на player.contracts (не на
 * верхнем уровне state) — в этом роутере каждая сцена собирает свой
 * nextState заново, а не расширяет предыдущий целиком, поэтому надёжно
 * переживает переходы между сценами только то, что лежит внутри player.
 *
 * getDailyContracts принимает необязательный "now" (мс, как Date.now())
 * для детерминированных тестов — по умолчанию берёт реальное время.
 * Выбор контрактов дня использует тот же сидированный ГПСЧ, что и весь
 * остальной проект (engine/seeded-rng.js), а не отдельный самодельный.
 *
 * РЕДКОСТЬ И ЦЕПОЧКИ — pickContracts всегда берёт только common на
 * старте дня (3 шт., как раньше). После того как игрок выполнил ВСЕ 3
 * common за сегодня, maybeUnlockRareContract() добавляет один
 * rare-контракт в список (один раз за день). Legendary — отдельный
 * редкий шанс (10%), проверяется в тот же момент, независимо от common.
 *
 * NPC-КОНТРАКТЫ прогрессируют через те же типы (kill/loot/explore), но
 * с доп. полями (npc/targetName/resources) — checkContractProgress
 * проверяет их вместе с обычными.
 *
 * ДОБАВЛЕНО: обработка eventType === 'stim_used' для контрактов типа
 * 'use_stim' — вызывайте checkContractProgress(player, 'stim_used', {})
 * из router.js в момент, когда стим реально применился в этот ход.
 */
'use strict';

const { CONTRACT_POOL, REPUTATION_TIERS } = require('./contracts-data.js');
const { makeRng } = require('../engine/seeded-rng.js');
const { addFactionReputation, getReputationTitle: getFactionReputationTitle } = require('../engine/reputation.js');
// РЕПУТАЦИЯ: контракты — куратора домашней станции игрока, поэтому
// награда идёт в factionStanding[player.faction], а не в общее число.
// getReputationTitle ниже — реэкспорт из engine/reputation.js для
// обратной совместимости импортов в других файлах.

const DAY_MS = 24 * 60 * 60 * 1000;
const RARE_UNLOCK_CHANCE = 1; // после всех common — гарантированно один rare
const LEGENDARY_CHANCE = 0.1;

function getDaySeed(now = Date.now()) {
  return Math.floor(now / DAY_MS);
}

function pickContracts(seed, count = 3) {
  const rng = makeRng(seed);
  const commonPool = CONTRACT_POOL.filter((c) => c.rarity === 'common' && !c.npc);
  const pool = [...commonPool];
  const picked = [];
  for (let i = 0; i < count && pool.length; i++) {
    const idx = Math.floor(rng() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked.map((c) => ({ ...c, current: 0, completed: false }));
}

/** Возвращает актуальный набор контрактов на сегодня — генерирует новый,
 * если день сменился или контрактов ещё не было. НЕ мутирует player сама,
 * вызывающий код сам решает, когда присвоить результат в player.contracts. */
function getDailyContracts(player, now = Date.now()) {
  const today = getDaySeed(now);
  if (!player.contracts || player.contracts.day !== today) {
    return { day: today, list: pickContracts(today), claimed: [], rareUnlocked: false };
  }
  return player.contracts;
}

/** Вызывать после claimContractRewards() — если все common на сегодня
 * выполнены и забраны, а rare ещё не выдавался, добавляет один rare
 * (и, с шансом 10%, ещё и legendary) в player.contracts.list. Мутирует
 * player. Возвращает список добавленных id (для текста уведомления). */
function maybeUnlockRareContract(player, seed = null, rng = Math.random) {
  if (!player.contracts || player.contracts.rareUnlocked) return [];
  const commons = player.contracts.list.filter((c) => c.rarity === 'common' && !c.npc);
  const allCommonsClaimed = commons.length > 0 && commons.every((c) => player.contracts.claimed.includes(c.id));
  if (!allCommonsClaimed) return [];

  const added = [];
  const rarePool = CONTRACT_POOL.filter((c) => c.rarity === 'rare');
  if (rarePool.length && rng() < RARE_UNLOCK_CHANCE) {
    const pick = rarePool[Math.floor(rng() * rarePool.length)];
    player.contracts.list.push({ ...pick, current: 0, completed: false });
    added.push(pick.id);
  }
  const legendaryPool = CONTRACT_POOL.filter((c) => c.rarity === 'legendary');
  if (legendaryPool.length && rng() < LEGENDARY_CHANCE) {
    const pick = legendaryPool[Math.floor(rng() * legendaryPool.length)];
    player.contracts.list.push({ ...pick, current: 0, completed: false });
    added.push(pick.id);
  }
  player.contracts.rareUnlocked = true;
  return added;
}

/** Продвигает прогресс всех незавершённых контрактов игрока, у которых
 * тип+условие совпадает с произошедшим событием. Мутирует player.contracts. */
function checkContractProgress(player, eventType, details = {}) {
  if (!player.contracts) return player;

  for (const c of player.contracts.list) {
    if (c.completed) continue;

    let match = false;
    if (c.type === 'kill' && eventType === 'combat_win') {
      if (!c.zone || details.zone === c.zone) match = true;
    }
    if (c.type === 'kill_named' && eventType === 'combat_win') {
      if (details.isNamed && (!c.targetName || details.enemyName === c.targetName)) match = true;
    }
    if (c.type === 'loot' && eventType === 'loot') {
      if (details.resource === c.resource) match = true;
    }
    if (c.type === 'loot_tier' && eventType === 'loot') {
      if ((details.tier || 0) >= (c.minTier || 0)) match = true;
    }
    if (c.type === 'loot_multi' && eventType === 'loot') {
      const target = (c.resources || []).find((r) => r.resource === details.resource);
      if (target) {
        c.progressByResource = c.progressByResource || {};
        c.progressByResource[details.resource] = (c.progressByResource[details.resource] || 0) + (details.amount || 1);
        const allMet = c.resources.every((r) => (c.progressByResource[r.resource] || 0) >= r.target);
        c.current = Math.min(...c.resources.map((r) => c.progressByResource[r.resource] || 0));
        if (allMet) c.completed = true;
        continue;
      }
    }
    if (c.type === 'explore' && eventType === 'explore') {
      if (!c.zone || details.zone === c.zone) match = true;
    }
    if (c.type === 'explore_streak' && eventType === 'explore_streak') {
      if (!c.zone || details.zone === c.zone) match = true;
    }
    if (c.type === 'info' && eventType === 'info_gathered') {
      if (!c.zone || details.zone === c.zone) match = true;
    }
    if (c.type === 'legendary_find' && eventType === 'legendary_find') {
      match = true;
    }
    if (c.type === 'use_stim' && eventType === 'stim_used') {
      match = true;
    }

    if (match) {
      c.current += details.amount || 1;
      if (c.current >= c.target) c.completed = true;
    }
  }
  return player;
}

/** Забирает награду за один завершённый контракт. Мутирует player. */
function claimContractRewards(player, contractId) {
  const c = player.contracts?.list.find((x) => x.id === contractId);
  if (!c || !c.completed || player.contracts.claimed.includes(contractId)) {
    return { success: false, player };
  }
  player.contracts.claimed.push(contractId);
  addFactionReputation(player, player.faction, c.reward.reputation);
  player.credits = (player.credits || 0) + c.reward.credits;
  if (c.rarity === 'legendary') player.completedLegendaryContracts = (player.completedLegendaryContracts || 0) + 1;
  return { success: true, reward: c.reward, player };
}

module.exports = {
  getDaySeed, pickContracts, getDailyContracts, maybeUnlockRareContract, checkContractProgress,
  claimContractRewards, getReputationTitle: getFactionReputationTitle,
};
