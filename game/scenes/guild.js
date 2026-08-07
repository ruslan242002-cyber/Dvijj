'use strict';

const {
  GuildError, createGuild, joinGuild, leaveGuild, transferLeadership, kickMember,
  donateCredits, donateResource, withdrawResource,
} = require('../../guilds/guild-engine.js');
const { GUILD_LIMITS, GUILD_ROLES } = require('../../guilds/guild-data.js');
const { hubMessage, stationButtons } = require('./common.js');
const { checkAchievements } = require('../../lib/achievements.js');
const { imageForLocation } = require('../location-images.js');
const { SCENES } = require('./ids.js');

const ROLE_LABEL = { [GUILD_ROLES.LEADER]: 'Лидер', [GUILD_ROLES.OFFICER]: 'Офицер', [GUILD_ROLES.MEMBER]: 'Участник' };

const GUILD_ERROR_TEXT = {
  NAME_TAKEN: 'Это имя уже занято другой гильдией.',
  NAME_INVALID: `Имя должно быть от ${GUILD_LIMITS.MIN_NAME_LENGTH} до ${GUILD_LIMITS.MAX_NAME_LENGTH} символов.`,
  ALREADY_IN_GUILD: 'Ты уже состоишь в гильдии.',
  NOT_IN_GUILD: 'Ты не состоишь в гильдии.',
  GUILD_NOT_FOUND: 'Гильдия с таким именем не найдена.',
  GUILD_FULL: `В гильдии уже максимум участников (${GUILD_LIMITS.MAX_MEMBERS}).`,
  INSUFFICIENT_CREDITS: 'Не хватает кредитов.',
  NOT_LEADER: 'Только лидер может это сделать.',
  NOT_OFFICER_OR_LEADER: 'Нужна должность офицера или лидера.',
  CANNOT_KICK_SELF: 'Себя нельзя исключить — используй «Выйти из гильдии».',
  LEADER_MUST_TRANSFER: 'Сначала передай лидерство кому-то другому — гильдия не может остаться без лидера.',
  INSUFFICIENT_RESOURCES: 'Недостаточно ресурсов.',
};

async function guildHub(deps, player, playerId, prefixText = '') {
  if (playerId && player.id !== playerId) player = { ...player, id: playerId };

  if (!deps.guildStore?.getGuild) {
    return {
      reply: { text: `${prefixText}🏰 ГИЛЬДИИ\n\nСистема гильдий пока не подключена к общему хранилищу — загляни позже.`, buttons: stationButtons(deps, player), imageKey: imageForLocation('station', player.faction) },
      nextState: { scene: 'station', player }
    };
  }

  if (!player.guildId) {
    return {
      reply: { text: `${prefixText}🏰 ГИЛЬДИИ\n\nТы не состоишь ни в одной гильдии.\n\n💳 Создание: ${GUILD_LIMITS.CREATE_COST_CREDITS} кредитов. Вступление — бесплатно, если знаешь точное название.`, buttons: ['➕ Создать гильдию', '🔑 Вступить по имени', '⬅️ Назад'] },
      nextState: { scene: SCENES.GUILD_HUB, player }
    };
  }

  const guild = await deps.guildStore?.getGuild(player.guildId);
  if (!guild) {
    const cleanPlayer = { ...player, guildId: null };
    return guildHub(deps, cleanPlayer, playerId, 'Похоже, твоя гильдия больше не существует.\n\n');
  }
  const role = await deps.guildStore?.getGuildMemberRole(player.guildId, playerId);
  const memberCount = await deps.guildStore?.getGuildMemberCount(player.guildId);
  const bankCredits = await deps.guildStore?.getGuildBankCredits(player.guildId);
  const bankResources = await deps.guildStore?.getGuildBankResources(player.guildId);
  const resourcesLine = bankResources.length ? bankResources.map((r) => `${r.resource} T${r.tier} ×${r.qty}`).join(', ') : 'пусто';

  const buttons = ['💳 Пожертвовать кредиты', '📦 Пожертвовать ресурс'];
  if (role === GUILD_ROLES.LEADER || role === GUILD_ROLES.OFFICER) buttons.push('📤 Забрать ресурс');
  buttons.push('🚪 Выйти из гильдии', '⬅️ Назад');

  return {
    reply: {
      text: `${prefixText}🏰 ${guild.name}\n\n👤 Твоя роль: ${ROLE_LABEL[role] || 'Участник'}\n👥 Участников: ${memberCount}/${GUILD_LIMITS.MAX_MEMBERS}\n💳 Банк: ${bankCredits}\n📦 Ресурсы банка: ${resourcesLine}`,
      buttons,
    },
    nextState: { scene: SCENES.GUILD_HUB, player }
  };
}

async function handleGuild(state, input, rng, deps, playerId) {
  if (playerId && state.player.id !== playerId) state = { ...state, player: { ...state.player, id: playerId } };

  if (state.scene === SCENES.GUILD_CREATE_NAME) {
    if (input === '⬅️ Назад') return guildHub(deps, state.player, playerId);
    try {
      const player = { ...state.player };
      const { guild } = await createGuild({ store: deps.guildStore }, player, input);
      player.guildFounded = true;
      const newAchievements = checkAchievements(player);
      const achievementsNote = newAchievements.length ? `\n\n${newAchievements.map((a) => `🏆 Достижение: «${a.title}»`).join('\n')}` : '';
      return guildHub(deps, player, playerId, `Гильдия «${guild.name}» основана!${achievementsNote}\n\n`);
    } catch (err) {
      const text = err instanceof GuildError ? (GUILD_ERROR_TEXT[err.code] || err.code) : 'Не получилось создать гильдию.';
      return { reply: { text, buttons: ['⬅️ Назад'] }, nextState: { scene: SCENES.GUILD_CREATE_NAME, player: state.player } };
    }
  }

  if (state.scene === SCENES.GUILD_JOIN_NAME) {
    if (input === '⬅️ Назад') return guildHub(deps, state.player, playerId);
    try {
      const guildId = await deps.guildStore?.getGuildIdByName(input.trim());
      if (!guildId) throw new GuildError('GUILD_NOT_FOUND');
      const player = { ...state.player };
      const { guild } = await joinGuild({ store: deps.guildStore }, player, guildId);
      return guildHub(deps, player, playerId, `Ты вступил(а) в «${guild.name}».\n\n`);
    } catch (err) {
      const text = err instanceof GuildError ? (GUILD_ERROR_TEXT[err.code] || err.code) : 'Не получилось вступить.';
      return { reply: { text, buttons: ['⬅️ Назад'] }, nextState: { scene: SCENES.GUILD_JOIN_NAME, player: state.player } };
    }
  }

  if (state.scene === SCENES.GUILD_HUB) {
    if (input === '⬅️ Назад') {
      return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player), imageKey: imageForLocation('station', state.player.faction) }, nextState: { scene: 'station', player: state.player } };
    }
    if (input === '➕ Создать гильдию') {
      return { reply: { text: `Название гильдии (${GUILD_LIMITS.MIN_NAME_LENGTH}-${GUILD_LIMITS.MAX_NAME_LENGTH} символов) — просто напиши его:`, buttons: ['⬅️ Назад'] }, nextState: { scene: SCENES.GUILD_CREATE_NAME, player: state.player } };
    }
    if (input === '🔑 Вступить по имени') {
      return { reply: { text: 'Точное название гильдии, в которую хочешь вступить:', buttons: ['⬅️ Назад'] }, nextState: { scene: SCENES.GUILD_JOIN_NAME, player: state.player } };
    }
    if (input === '🚪 Выйти из гильдии') {
      try {
        const player = { ...state.player };
        await leaveGuild({ store: deps.guildStore }, player);
        return guildHub(deps, player, playerId, 'Ты покинул(а) гильдию.\n\n');
      } catch (err) {
        const text = err instanceof GuildError ? (GUILD_ERROR_TEXT[err.code] || err.code) : 'Не получилось выйти.';
        return guildHub(deps, state.player, playerId, `${text}\n\n`);
      }
    }
    if (input === '💳 Пожертвовать кредиты') {
      return { reply: { text: 'Сколько кредитов пожертвовать? Напиши число:', buttons: ['⬅️ Назад'] }, nextState: { scene: SCENES.GUILD_DONATE_CREDITS, player: state.player } };
    }
    if (input === '📦 Пожертвовать ресурс') {
      const owned = (state.player.inventory || []).filter((i) => i.qty > 0);
      if (!owned.length) return guildHub(deps, state.player, playerId, 'В трюме пусто — нечего жертвовать.\n\n');
      const buttons = owned.map((i) => `${i.resource} T${i.tier} ×${i.qty}`);
      buttons.push('⬅️ Назад');
      return { reply: { text: 'Что пожертвовать целиком (весь стак)?', buttons }, nextState: { scene: SCENES.GUILD_DONATE_RESOURCE, player: state.player } };
    }
    if (input === '📤 Забрать ресурс') {
      const bankResources = await deps.guildStore?.getGuildBankResources(state.player.guildId);
      if (!bankResources.length) return guildHub(deps, state.player, playerId, 'Банк ресурсов пуст.\n\n');
      const buttons = bankResources.map((r) => `${r.resource} T${r.tier} ×${r.qty}`);
      buttons.push('⬅️ Назад');
      return { reply: { text: 'Что забрать целиком?', buttons }, nextState: { scene: SCENES.GUILD_WITHDRAW_RESOURCE, player: state.player } };
    }
    return guildHub(deps, state.player, playerId);
  }

  if (state.scene === SCENES.GUILD_DONATE_CREDITS) {
    if (input === '⬅️ Назад') return guildHub(deps, state.player, playerId);
    const amount = parseInt(input, 10);
    if (!Number.isFinite(amount) || amount <= 0) {
      return { reply: { text: 'Введи положительное число.', buttons: ['⬅️ Назад'] }, nextState: state };
    }
    try {
      const player = { ...state.player };
      await donateCredits({ store: deps.guildStore }, player, amount);
      return guildHub(deps, player, playerId, `Пожертвовано 💳${amount} в банк гильдии.\n\n`);
    } catch (err) {
      const text = err instanceof GuildError ? (GUILD_ERROR_TEXT[err.code] || err.code) : 'Не получилось пожертвовать.';
      return { reply: { text, buttons: ['⬅️ Назад'] }, nextState: state };
    }
  }

  if (state.scene === SCENES.GUILD_DONATE_RESOURCE) {
    if (input === '⬅️ Назад') return guildHub(deps, state.player, playerId);
    const match = /^(.+) T(\d+) ×(\d+)$/.exec(input);
    if (!match) return { reply: { text: 'Выбери ресурс кнопкой ниже.', buttons: (state.player.inventory || []).map((i) => `${i.resource} T${i.tier} ×${i.qty}`).concat('⬅️ Назад') }, nextState: state };
    const [, resource, tier, qty] = match;
    try {
      const player = { ...state.player };
      await donateResource({ store: deps.guildStore }, player, resource, Number(tier), Number(qty));
      return guildHub(deps, player, playerId, `Пожертвовано ${qty}× ${resource} T${tier}.\n\n`);
    } catch (err) {
      const text = err instanceof GuildError ? (GUILD_ERROR_TEXT[err.code] || err.code) : 'Не получилось пожертвовать.';
      return guildHub(deps, state.player, playerId, `${text}\n\n`);
    }
  }

  if (state.scene === SCENES.GUILD_WITHDRAW_RESOURCE) {
    if (input === '⬅️ Назад') return guildHub(deps, state.player, playerId);
    const match = /^(.+) T(\d+) ×(\d+)$/.exec(input);
    if (!match) return guildHub(deps, state.player, playerId);
    const [, resource, tier, qty] = match;
    try {
      const player = { ...state.player };
      await withdrawResource({ store: deps.guildStore }, player, resource, Number(tier), Number(qty));
      return guildHub(deps, player, playerId, `Забрано ${qty}× ${resource} T${tier} из банка.\n\n`);
    } catch (err) {
      const text = err instanceof GuildError ? (GUILD_ERROR_TEXT[err.code] || err.code) : 'Не получилось забрать.';
      return guildHub(deps, state.player, playerId, `${text}\n\n`);
    }
  }

  return null;
}

module.exports = { guildHub, handleGuild };
