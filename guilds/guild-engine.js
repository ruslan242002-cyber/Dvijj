'use strict';

const { GUILD_LIMITS, GUILD_ROLES, GUILD_ERRORS } = require('./guild-data.js');
const { nextUpgradeCost, levelDef } = require('./guild-levels.js');
const { logWorldEvent } = require('../lib/world-feed.js');
const { logEconomyEvent, EVENT_TYPES } = require('../lib/economy-audit.js');
const { notifyGuildMembers } = require('../lib/notifications.js');

/**
 * ДВИЖОК ГИЛЬДИЙ — архитектурно повторяет market-engine.js: любое действие,
 * которое трогает состояние гильдии (не самого текущего игрока), идёт
 * через deps.store атомарной операцией, потому что остальные участники
 * гильдии почти наверняка не в памяти вызывающего кода прямо сейчас.
 * Изменения самого текущего игрока (списание кредитов на донат/создание,
 * player.guildId) — обычной мутацией player, как и везде в игре.
 */
class GuildError extends Error {
  constructor(code) { super(code); this.name = 'GuildError'; this.code = code; }
}

function generateGuildId() {
  return `gld_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function assertValidName(name) {
  const trimmed = (name || '').trim();
  if (trimmed.length < GUILD_LIMITS.MIN_NAME_LENGTH || trimmed.length > GUILD_LIMITS.MAX_NAME_LENGTH) {
    throw new GuildError(GUILD_ERRORS.NAME_INVALID);
  }
  return trimmed;
}

/** Создать гильдию. Списывает CREATE_COST_CREDITS с игрока-основателя
 *  (обычная мутация player — деньги его). Уникальность имени и запись
 *  гильдии — атомарно в сторе (store.createGuildAtomic), чтобы два игрока
 *  не смогли одновременно застолбить одно и то же имя. */
async function createGuild(deps, player, name) {
  const { store } = deps;
  if (player.guildId) throw new GuildError(GUILD_ERRORS.ALREADY_IN_GUILD);
  const cleanName = assertValidName(name);
  if ((player.credits || 0) < GUILD_LIMITS.CREATE_COST_CREDITS) throw new GuildError(GUILD_ERRORS.INSUFFICIENT_CREDITS);
  const guild = {
    id: generateGuildId(),
    name: cleanName,
    founderId: player.id,
    faction: player.faction,
    bank: { credits: 0, resources: [] },
    createdAt: Date.now(),
  };
  let result;
  try {
    result = await store.createGuildAtomic(guild, player.id, GUILD_ROLES.LEADER);
  } catch (err) {
    throw new GuildError(err.message === 'NAME_TAKEN' ? GUILD_ERRORS.NAME_TAKEN : err.message);
  }
  player.credits -= GUILD_LIMITS.CREATE_COST_CREDITS;
  player.guildId = guild.id;
  return { player, guild: result.guild };
}

/** Вступить в существующую гильдию. Атомарно добавляет игрока в set
 *  участников (проверка лимита MAX_MEMBERS происходит в самом сторе,
 *  внутри той же атомарной операции — иначе гонка "последнее место"). */
async function joinGuild(deps, player, guildId) {
  const { store } = deps;
  if (player.guildId) throw new GuildError(GUILD_ERRORS.ALREADY_IN_GUILD);
  const guild = await store.getGuild(guildId);
  if (!guild) throw new GuildError(GUILD_ERRORS.GUILD_NOT_FOUND);
  try {
    await store.addGuildMemberAtomic(guildId, player.id, GUILD_ROLES.MEMBER, GUILD_LIMITS.MAX_MEMBERS);
  } catch (err) {
    throw new GuildError(err.message === 'GUILD_FULL' ? GUILD_ERRORS.GUILD_FULL : err.message);
  }
  player.guildId = guildId;
  return { player, guild };
}

/** Выйти из гильдии. Лидер не может просто выйти, если в гильдии есть
 *  кто-то ещё — сначала должен передать лидерство (transferLeadership),
 *  иначе гильдия осиротеет без возможности что-либо в ней поменять. */
async function leaveGuild(deps, player) {
  const { store } = deps;
  if (!player.guildId) throw new GuildError(GUILD_ERRORS.NOT_IN_GUILD);
  const role = await store.getGuildMemberRole(player.guildId, player.id);
  if (role === GUILD_ROLES.LEADER) {
    const memberCount = await store.getGuildMemberCount(player.guildId);
    if (memberCount > 1) throw new GuildError(GUILD_ERRORS.LEADER_MUST_TRANSFER);
  }
  await store.removeGuildMemberAtomic(player.guildId, player.id);
  const guildId = player.guildId;
  player.guildId = null;
  return { player, guildId };
}

/** Передать лидерство другому участнику (тоже в гильдии). Только текущий
 *  лидер может это сделать. */
async function transferLeadership(deps, player, targetPlayerId) {
  const { store } = deps;
  if (!player.guildId) throw new GuildError(GUILD_ERRORS.NOT_IN_GUILD);
  const role = await store.getGuildMemberRole(player.guildId, player.id);
  if (role !== GUILD_ROLES.LEADER) throw new GuildError(GUILD_ERRORS.NOT_LEADER);
  await store.setGuildMemberRole(player.guildId, targetPlayerId, GUILD_ROLES.LEADER);
  await store.setGuildMemberRole(player.guildId, player.id, GUILD_ROLES.OFFICER);
  return { success: true };
}

/** Исключить участника — офицер или лидер могут кикать обычных
 *  участников; кикнуть себя нельзя (для этого leaveGuild). */
async function kickMember(deps, player, targetPlayerId) {
  const { store } = deps;
  if (targetPlayerId === player.id) throw new GuildError(GUILD_ERRORS.CANNOT_KICK_SELF);
  const role = await store.getGuildMemberRole(player.guildId, player.id);
  if (role !== GUILD_ROLES.LEADER && role !== GUILD_ROLES.OFFICER) throw new GuildError(GUILD_ERRORS.NOT_OFFICER_OR_LEADER);
  await store.removeGuildMemberAtomic(player.guildId, targetPlayerId);
  return { success: true };
}

/** Пожертвовать кредиты в банк гильдии. Списание у игрока — обычной
 *  мутацией (его деньги), зачисление в банк — атомарно в сторе (банк не
 *  принадлежит никому в памяти прямо сейчас). */
async function donateCredits(deps, player, amount) {
  const { store } = deps;
  if (!player.guildId) throw new GuildError(GUILD_ERRORS.NOT_IN_GUILD);
  if (amount < GUILD_LIMITS.DONATION_MIN || (player.credits || 0) < amount) throw new GuildError(GUILD_ERRORS.INSUFFICIENT_CREDITS);
  player.credits -= amount;
  await store.addToGuildBankAtomic(player.guildId, amount);
  logEconomyEvent(deps, { type: EVENT_TYPES.GUILD_DONATE, playerId: player.id, credits: -amount }).catch(() => {});
  return { player };
}

/** Пожертвовать РЕСУРСЫ в банк гильдии — гильдия существует в первую
 *  очередь ради совместного крафта, для которого нужны именно ресурсы, не
 *  только кредиты. Снятие из инвентаря — обычная мутация игрока (это его
 *  стак), запись в общий банк — атомарная операция в сторе (тот же
 *  паттерн, что кредиты). */
async function donateResource(deps, player, resource, tier, qty) {
  const { store } = deps;
  if (!player.guildId) throw new GuildError(GUILD_ERRORS.NOT_IN_GUILD);
  const stack = (player.inventory || []).find((i) => i.resource === resource && i.tier === tier);
  if (!stack || stack.qty < qty) throw new GuildError('INSUFFICIENT_RESOURCES');
  stack.qty -= qty;
  player.inventory = player.inventory.filter((i) => i.qty > 0);
  await store.addToGuildBankResourceAtomic(player.guildId, resource, tier, qty);
  logEconomyEvent(deps, { type: EVENT_TYPES.GUILD_DONATE, playerId: player.id, resource, tier, qty: -qty }).catch(() => {});
  return { player };
}

/** Забрать ресурсы из банка гильдии — только офицер/лидер (простая
 *  защита от того, что любой рядовой участник вынесет весь банк). */
async function withdrawResource(deps, player, resource, tier, qty) {
  const { store } = deps;
  if (!player.guildId) throw new GuildError(GUILD_ERRORS.NOT_IN_GUILD);
  const role = await store.getGuildMemberRole(player.guildId, player.id);
  if (role !== GUILD_ROLES.LEADER && role !== GUILD_ROLES.OFFICER) throw new GuildError(GUILD_ERRORS.NOT_OFFICER_OR_LEADER);
  const withdrawn = await store.withdrawFromGuildBankResourceAtomic(player.guildId, resource, tier, qty);
  if (!withdrawn) throw new GuildError('INSUFFICIENT_RESOURCES');
  player.inventory = player.inventory || [];
  const stack = player.inventory.find((i) => i.resource === resource && i.tier === tier);
  if (stack) stack.qty += qty;
  else player.inventory.push({ resource, tier, qty });
  logEconomyEvent(deps, { type: EVENT_TYPES.GUILD_WITHDRAW, playerId: player.id, resource, tier, qty }).catch(() => {});
  return { player };
}

/** Текущий уровень гильд-апгрейда (0, если ещё не куплен ни один). */
async function getGuildUpgradeLevel(deps, guildId) {
  const { store } = deps;
  return store.getGuildUpgradeLevel(guildId);
}

/**
 * Купить следующий уровень гильд-апгрейда (guild-levels.js) за ресурсы
 * банка. Только офицер/лидер — тот же принцип доступа, что и у
 * withdrawResource. Списание ресурсов + повышение уровня — одна
 * атомарная Lua-операция в сторе (store.purchaseGuildUpgradeAtomic),
 * иначе два офицера могли бы одновременно купить один и тот же уровень
 * дважды или увести банк в минус.
 */
async function purchaseGuildUpgrade(deps, player) {
  const { store } = deps;
  if (!player.guildId) throw new GuildError(GUILD_ERRORS.NOT_IN_GUILD);
  const role = await store.getGuildMemberRole(player.guildId, player.id);
  if (role !== GUILD_ROLES.LEADER && role !== GUILD_ROLES.OFFICER) throw new GuildError(GUILD_ERRORS.NOT_OFFICER_OR_LEADER);

  const currentLevel = await store.getGuildUpgradeLevel(player.guildId);
  const cost = nextUpgradeCost(currentLevel);
  if (!cost) throw new GuildError('MAX_LEVEL_REACHED');

  const result = await store.purchaseGuildUpgradeAtomic(player.guildId, cost, currentLevel, currentLevel + 1);
  if (!result.success) {
    throw new GuildError(result.reason === 'LEVEL_MISMATCH' ? 'LEVEL_MISMATCH' : 'INSUFFICIENT_RESOURCES');
  }
  const newLevel = currentLevel + 1;
  const purchasedLevelDef = levelDef(newLevel);
  for (const need of cost) {
    logEconomyEvent(deps, { type: EVENT_TYPES.GUILD_UPGRADE_SPEND, playerId: player.id, resource: need.resource, tier: need.tier, qty: -need.qty, note: `guild_level_${newLevel}` }).catch(() => {});
  }

  // Лента мира — рост гильдии видно всем, не только участникам (см.
  // lib/world-feed.js). Fire-and-forget, не блокирует ответ игроку и не
  // может сорвать уже совершённую покупку, если запись в ленту упадёт.
  const guild = await store.getGuild(player.guildId).catch(() => null);
  if (guild) {
    logWorldEvent(deps, { type: 'guild_upgrade', text: `Гильдия «${guild.name}» достигла уровня «${purchasedLevelDef.name}».` }).catch(() => {});
    const memberIds = await store.getGuildMemberIds(player.guildId).catch(() => []);
    notifyGuildMembers(deps, memberIds, `🏗️ Твоя гильдия «${guild.name}» достигла уровня «${purchasedLevelDef.name}»! Новый бонус уже действует.`, player.id).catch(() => {});
  }

  return { newLevel, levelDef: purchasedLevelDef };
}

module.exports = {
  GuildError, createGuild, joinGuild, leaveGuild, transferLeadership, kickMember,
  donateCredits, donateResource, withdrawResource,
  getGuildUpgradeLevel, purchaseGuildUpgrade,
};
