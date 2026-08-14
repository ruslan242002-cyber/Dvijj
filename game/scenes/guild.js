'use strict';

const {
  GuildError, createGuild, joinGuild, leaveGuild, transferLeadership, kickMember,
  donateCredits, donateResource, withdrawResource, getGuildUpgradeLevel, purchaseGuildUpgrade,
} = require('../../guilds/guild-engine.js');
const { GUILD_LIMITS, GUILD_ROLES } = require('../../guilds/guild-data.js');
const { levelDef, nextUpgradeCost, activeGuildBonuses } = require('../../guilds/guild-levels.js');
const {
  GuildProjectError, startProject, contributeResource: contributeProjectResource,
  contributeCredits: contributeProjectCredits, tryCompleteProject,
} = require('../../guilds/guild-projects.js');
const { PROJECTS, findProject } = require('../../guilds/guild-project-data.js');
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
  MAX_LEVEL_REACHED: 'Гильдия уже достигла максимального уровня.',
  LEVEL_MISMATCH: 'Кто-то уже купил апгрейд буквально только что — обнови экран и попробуй снова.',
  PROJECT_NOT_FOUND: 'Проект не найден.',
  ALREADY_ACTIVE: 'Этот проект уже запущен.',
  RESOURCE_NOT_NEEDED: 'Этот ресурс не нужен для проекта.',
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

  const upgradeLevel = await deps.guildStore?.getGuildUpgradeLevel(player.guildId);
  const currentBonus = activeGuildBonuses(upgradeLevel);
  const bonusLine = upgradeLevel > 0
    ? `\n\n🏗️ Уровень гильдии: ${upgradeLevel} (${levelDef(upgradeLevel)?.name || ''})\nБонусы: −${currentBonus.marketDiscountPct}% комиссия биржи, +${currentBonus.explorationYieldPct}% добыча, +${currentBonus.worldBossDamagePct}% урон по боссу`
    : '\n\n🏗️ Уровень гильдии: 0 — апгрейдов ещё нет.';

  const buttons = ['💳 Пожертвовать кредиты', '📦 Пожертвовать ресурс', '🗂️ Проекты гильдии'];
  if (role === GUILD_ROLES.LEADER || role === GUILD_ROLES.OFFICER) {
    buttons.push('📤 Забрать ресурс', '🏗️ Апгрейд гильдии');
  }
  buttons.push('🚪 Выйти из гильдии', '⬅️ Назад');

  return {
    reply: {
      text: `${prefixText}🏰 ${guild.name}\n\n👤 Твоя роль: ${ROLE_LABEL[role] || 'Участник'}\n👥 Участников: ${memberCount}/${GUILD_LIMITS.MAX_MEMBERS}\n💳 Банк: ${bankCredits}\n📦 Ресурсы банка: ${resourcesLine}${bonusLine}`,
      buttons,
    },
    nextState: { scene: SCENES.GUILD_HUB, player }
  };
}

async function guildUpgradeScreen(deps, player, playerId, prefixText = '') {
  const guildId = player.guildId;
  const currentLevel = await deps.guildStore.getGuildUpgradeLevel(guildId);
  const cost = nextUpgradeCost(currentLevel);

  if (!cost) {
    return {
      reply: { text: `${prefixText}🏗️ Гильдия уже на максимальном уровне.`, buttons: ['⬅️ Назад'] },
      nextState: { scene: SCENES.GUILD_HUB, player }
    };
  }

  const bankResources = await deps.guildStore.getGuildBankResources(guildId);
  const costLines = cost.map((need) => {
    const have = bankResources.find((r) => r.resource === need.resource && r.tier === need.tier)?.qty || 0;
    const enough = have >= need.qty;
    return `${enough ? '✅' : '❌'} ${need.resource} T${need.tier}: ${have}/${need.qty}`;
  });
  const nextDef = levelDef(currentLevel + 1);
  const affordable = costLines.every((line) => line.startsWith('✅'));

  const buttons = affordable ? ['💳 Купить апгрейд', '⬅️ Назад'] : ['⬅️ Назад'];
  return {
    reply: {
      text: `${prefixText}🏗️ Следующий уровень: «${nextDef.name}»\n${nextDef.description}\n\nНужно в банке:\n${costLines.join('\n')}`,
      buttons,
    },
    nextState: { scene: SCENES.GUILD_UPGRADE, player }
  };
}

/** Список проектов гильдии — статус каждого (не запущен / активен-с-
 * прогрессом / завершён), кнопка на каждый ведёт в детали. */
async function guildProjectsListScreen(deps, player, playerId, prefixText = '') {
  const guildId = player.guildId;
  const lines = [];
  for (const project of PROJECTS) {
    const progress = await deps.guildStore.getGuildProject(guildId, project.id);
    let statusIcon = '⬜';
    if (progress?.status === 'completed') statusIcon = '✅';
    else if (progress?.status === 'active') statusIcon = '🔵';
    lines.push(`${statusIcon} ${project.name}`);
  }
  const buttons = PROJECTS.map((p) => p.name).concat('⬅️ Назад');
  return {
    reply: { text: `${prefixText}🗂️ ПРОЕКТЫ ГИЛЬДИИ\n\n${lines.join('\n')}\n\n⬜ не запущен · 🔵 в процессе · ✅ завершён`, buttons },
    nextState: { scene: SCENES.GUILD_PROJECTS_LIST, player }
  };
}

/** Детали одного проекта — требования vs прогресс, кнопки под текущее
 * состояние (запустить / внести / попробовать завершить). */
async function guildProjectDetailScreen(deps, player, playerId, projectId, prefixText = '') {
  const project = findProject(projectId);
  if (!project) return guildProjectsListScreen(deps, player, playerId, 'Проект не найден.\n\n');
  const progress = await deps.guildStore.getGuildProject(player.guildId, projectId);

  if (!progress) {
    return {
      reply: {
        text: `${prefixText}🗂️ ${project.name}\n${project.description}\n\nЭффект: ${project.effectDescription}\n\nНужно: 💳${project.requirements.credits} + ${project.requirements.resources.map((r) => `${r.resource} T${r.tier} ×${r.qty}`).join(', ')}\n\nПроект ещё не запущен.`,
        buttons: ['🚀 Запустить проект', '⬅️ Назад'],
      },
      nextState: { scene: SCENES.GUILD_PROJECT_DETAIL, player, projectId }
    };
  }

  if (progress.status === 'completed') {
    return {
      reply: { text: `${prefixText}✅ ${project.name} — завершён.\n${project.effectDescription}`, buttons: ['⬅️ Назад'] },
      nextState: { scene: SCENES.GUILD_PROJECT_DETAIL, player, projectId }
    };
  }

  const creditsLine = `💳 ${progress.creditsContributed}/${project.requirements.credits}`;
  const resourceLines = project.requirements.resources.map((need) => {
    const have = progress.resourcesContributed.find((r) => r.resource === need.resource && r.tier === need.tier)?.qty || 0;
    return `${have >= need.qty ? '✅' : '◻️'} ${need.resource} T${need.tier}: ${have}/${need.qty}`;
  });
  const creditsOk = progress.creditsContributed >= project.requirements.credits;
  const resourcesOk = project.requirements.resources.every((need) => {
    const have = progress.resourcesContributed.find((r) => r.resource === need.resource && r.tier === need.tier)?.qty || 0;
    return have >= need.qty;
  });

  const buttons = ['💳 Внести кредиты', '📦 Внести ресурс'];
  if (creditsOk && resourcesOk) buttons.push('🏁 Завершить проект');
  buttons.push('⬅️ Назад');

  return {
    reply: {
      text: `${prefixText}🗂️ ${project.name}\n${project.description}\n\n${creditsLine}\n${resourceLines.join('\n')}`,
      buttons,
    },
    nextState: { scene: SCENES.GUILD_PROJECT_DETAIL, player, projectId }
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
    if (input === '🏗️ Апгрейд гильдии') {
      return guildUpgradeScreen(deps, state.player, playerId);
    }
    if (input === '🗂️ Проекты гильдии') {
      return guildProjectsListScreen(deps, state.player, playerId);
    }
    return guildHub(deps, state.player, playerId);
  }

  if (state.scene === SCENES.GUILD_UPGRADE) {
    if (input === '⬅️ Назад') return guildHub(deps, state.player, playerId);
    if (input === '💳 Купить апгрейд') {
      try {
        const player = { ...state.player };
        const result = await purchaseGuildUpgrade({ store: deps.guildStore, redis: deps.redis, vk: deps.vk }, player);
        return guildHub(deps, player, playerId, `🏗️ Гильдия достигла уровня «${result.levelDef.name}»!\n${result.levelDef.description}\n\n`);
      } catch (err) {
        const text = err instanceof GuildError ? (GUILD_ERROR_TEXT[err.code] || err.code) : 'Не получилось купить апгрейд.';
        return guildUpgradeScreen(deps, state.player, playerId, `${text}\n\n`);
      }
    }
    return guildUpgradeScreen(deps, state.player, playerId);
  }

  if (state.scene === SCENES.GUILD_PROJECTS_LIST) {
    if (input === '⬅️ Назад') return guildHub(deps, state.player, playerId);
    const project = PROJECTS.find((p) => p.name === input);
    if (project) return guildProjectDetailScreen(deps, state.player, playerId, project.id);
    return guildProjectsListScreen(deps, state.player, playerId);
  }

  if (state.scene === SCENES.GUILD_PROJECT_DETAIL) {
    if (input === '⬅️ Назад') return guildProjectsListScreen(deps, state.player, playerId);
    if (input === '🚀 Запустить проект') {
      try {
        const player = { ...state.player };
        await startProject({ store: deps.guildStore }, player, state.projectId);
        return guildProjectDetailScreen(deps, player, playerId, state.projectId, 'Проект запущен!\n\n');
      } catch (err) {
        const text = err instanceof GuildProjectError ? (GUILD_ERROR_TEXT[err.code] || err.code) : 'Не получилось запустить проект.';
        return guildProjectDetailScreen(deps, state.player, playerId, state.projectId, `${text}\n\n`);
      }
    }
    if (input === '💳 Внести кредиты') {
      return { reply: { text: 'Сколько кредитов внести? Напиши число:', buttons: ['⬅️ Назад'] }, nextState: { scene: SCENES.GUILD_PROJECT_DONATE_CREDITS, player: state.player, projectId: state.projectId } };
    }
    if (input === '📦 Внести ресурс') {
      const owned = (state.player.inventory || []).filter((i) => i.qty > 0);
      if (!owned.length) return guildProjectDetailScreen(deps, state.player, playerId, state.projectId, 'В трюме пусто — нечего вносить.\n\n');
      const buttons = owned.map((i) => `${i.resource} T${i.tier} ×${i.qty}`).concat('⬅️ Назад');
      return { reply: { text: 'Что внести целиком (весь стак)?', buttons }, nextState: { scene: SCENES.GUILD_PROJECT_DONATE_RESOURCE, player: state.player, projectId: state.projectId } };
    }
    if (input === '🏁 Завершить проект') {
      try {
        const player = { ...state.player };
        const result = await tryCompleteProject({ store: deps.guildStore, redis: deps.redis, vk: deps.vk }, player, state.projectId);
        if (result.complete) {
          return guildProjectsListScreen(deps, player, playerId, `🏁 Проект «${result.project.name}» завершён! ${result.project.effectDescription}\n\n`);
        }
        return guildProjectDetailScreen(deps, player, playerId, state.projectId, 'Требования ещё не выполнены.\n\n');
      } catch (err) {
        const text = err instanceof GuildProjectError ? (GUILD_ERROR_TEXT[err.code] || err.code) : 'Не получилось завершить проект.';
        return guildProjectDetailScreen(deps, state.player, playerId, state.projectId, `${text}\n\n`);
      }
    }
    return guildProjectDetailScreen(deps, state.player, playerId, state.projectId);
  }

  if (state.scene === SCENES.GUILD_PROJECT_DONATE_CREDITS) {
    if (input === '⬅️ Назад') return guildProjectDetailScreen(deps, state.player, playerId, state.projectId);
    const amount = parseInt(input, 10);
    if (!Number.isFinite(amount) || amount <= 0) {
      return { reply: { text: 'Введи положительное число.', buttons: ['⬅️ Назад'] }, nextState: state };
    }
    try {
      const player = { ...state.player };
      await contributeProjectCredits({ store: deps.guildStore }, player, state.projectId, amount);
      return guildProjectDetailScreen(deps, player, playerId, state.projectId, `Внесено 💳${amount}.\n\n`);
    } catch (err) {
      const text = err instanceof GuildProjectError ? (GUILD_ERROR_TEXT[err.code] || err.code) : 'Не получилось внести.';
      return { reply: { text, buttons: ['⬅️ Назад'] }, nextState: state };
    }
  }

  if (state.scene === SCENES.GUILD_PROJECT_DONATE_RESOURCE) {
    if (input === '⬅️ Назад') return guildProjectDetailScreen(deps, state.player, playerId, state.projectId);
    const match = /^(.+) T(\d+) ×(\d+)$/.exec(input);
    if (!match) return { reply: { text: 'Выбери ресурс кнопкой ниже.', buttons: (state.player.inventory || []).map((i) => `${i.resource} T${i.tier} ×${i.qty}`).concat('⬅️ Назад') }, nextState: state };
    const [, resource, tier, qty] = match;
    try {
      const player = { ...state.player };
      await contributeProjectResource({ store: deps.guildStore }, player, state.projectId, resource, Number(tier), Number(qty));
      return guildProjectDetailScreen(deps, player, playerId, state.projectId, `Внесено ${qty}× ${resource} T${tier}.\n\n`);
    } catch (err) {
      const text = err instanceof GuildProjectError ? (GUILD_ERROR_TEXT[err.code] || err.code) : 'Не получилось внести.';
      return guildProjectDetailScreen(deps, state.player, playerId, state.projectId, `${text}\n\n`);
    }
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
