'use strict';

/**
 * ГИЛЬДИИ — единственная реально отсутствующая часть "общего мира" (биржа,
 * PvP-дуэли и групповые боссы жилы уже были построены и подключены).
 * Архитектура сознательно копирует уже проверенный паттерн market/ —
 * это НЕ player-owned сущность (гильдия существует, даже когда все её
 * участники оффлайн), поэтому банк гильдии не может жить внутри чьего-то
 * player-объекта, только в отдельных атомарных ключах Redis — см.
 * guilds/guild-store-upstash.js.
 */
const GUILD_LIMITS = {
  MAX_MEMBERS: 20,
  MAX_NAME_LENGTH: 24,
  MIN_NAME_LENGTH: 3,
  CREATE_COST_CREDITS: 500, // сток из экономики — без этого гильдии бесплатно штампуются
  DONATION_MIN: 1,
};

const GUILD_ROLES = {
  LEADER: 'leader',
  OFFICER: 'officer',
  MEMBER: 'member',
};

const GUILD_ERRORS = {
  NAME_TAKEN: 'NAME_TAKEN',
  NAME_INVALID: 'NAME_INVALID',
  ALREADY_IN_GUILD: 'ALREADY_IN_GUILD',
  NOT_IN_GUILD: 'NOT_IN_GUILD',
  GUILD_NOT_FOUND: 'GUILD_NOT_FOUND',
  GUILD_FULL: 'GUILD_FULL',
  INSUFFICIENT_CREDITS: 'INSUFFICIENT_CREDITS',
  NOT_LEADER: 'NOT_LEADER',
  NOT_OFFICER_OR_LEADER: 'NOT_OFFICER_OR_LEADER',
  CANNOT_KICK_SELF: 'CANNOT_KICK_SELF',
  LEADER_MUST_TRANSFER: 'LEADER_MUST_TRANSFER', // лидер не может просто выйти, пока в гильдии есть кто-то ещё
};

module.exports = { GUILD_LIMITS, GUILD_ROLES, GUILD_ERRORS };
