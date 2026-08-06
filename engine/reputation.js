'use strict';

/**
 * РЕПУТАЦИЯ ПО ФРАКЦИЯМ — единая точка входа, чтобы не повторять
 * factionStanding[x] = (factionStanding[x]||0)+amount в шести разных
 * файлах. Заменяет старое общее player.reputation (число) на
 * player.factionStanding[faction] (объект по станциям).
 *
 * МИГРАЦИЯ: у старых сохранений есть player.reputation (число), но нет
 * ещё factionStanding[player.faction]. migrateLegacyReputation()
 * переносит его ОДИН раз в домашнюю фракцию игрока, затем помечает
 * флагом player.reputationMigrated, чтобы не переносить повторно.
 * Вызывать в начале обработки любого запроса игрока (game/router.js),
 * до любого чтения репутации.
 */
const REPUTATION_TIERS = {
  0: 'Незнакомец',
  50: 'Доверенное лицо',
  150: 'Агент станции',
  300: 'Правая рука куратора',
  500: 'Легенда Тракта',
};

function migrateLegacyReputation(player) {
  if (player.reputationMigrated) return player;
  player.factionStanding = player.factionStanding || {};
  if (player.faction && player.reputation && !player.factionStanding[player.faction]) {
    player.factionStanding[player.faction] = player.reputation;
  }
  player.reputationMigrated = true;
  return player;
}

function getFactionReputation(player, faction) {
  return (player.factionStanding || {})[faction] || 0;
}

/** Мутирует player. amount может быть отрицательным (штраф). */
function addFactionReputation(player, faction, amount) {
  player.factionStanding = player.factionStanding || {};
  player.factionStanding[faction] = (player.factionStanding[faction] || 0) + amount;
  return player;
}

function getReputationTitle(reputation = 0) {
  let title = 'Незнакомец';
  for (const [threshold, name] of Object.entries(REPUTATION_TIERS)) {
    if (reputation >= Number(threshold)) title = name;
  }
  return title;
}

module.exports = {
  REPUTATION_TIERS, migrateLegacyReputation, getFactionReputation, addFactionReputation, getReputationTitle,
};
