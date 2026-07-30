'use strict';

/**
 * Главный хаб станции: районы вместо плоского списка кнопок (см.
 * DISTRICT_GROUPS в common.js), плюс resolveStationAction — общая логика
 * конкретной кнопки (Мостик/Отсек/Кантина/Биржа/...), используемая и из
 * 'station' напрямую, и из district_hub.
 */

const { RECIPES, hasResourcesFor, describeRecipe } = require('../../crafting/crafting-engine.js');
const { DISTRICTS } = require('../../city/districts-data.js');
const { rollStationEvent } = require('../../city/station-events.js');
const { imageForLocation } = require('../location-images.js');
const { marketHub } = require('./market.js');
const { pvpHub } = require('./pvp.js');
const { housingHub } = require('./housing.js');
const { cantinaBoard, contractsBoard } = require('./locations/cantina.js');
const {
  hubMessage, statusText, stationButtons, startJourney, districtGroupsFor, ZONE_BUTTONS,
} = require('./common.js');
const { SCENES } = require('./ids.js');

function resolveStationAction(input, state, deps, rng, playerId) {
  if (input === 'Статус') {
    return { reply: { text: statusText(state.player), buttons: stationButtons(deps, state.player) }, nextState: { scene: 'station', player: state.player } };
  }
  if (input === 'Профиль') {
    const link = typeof deps.getProfileLink === 'function' ? deps.getProfileLink() : null;
    if (!link) return { reply: { text: 'Терминал профиля сейчас недоступен, попробуйте позже.', buttons: stationButtons(deps, state.player) }, nextState: { scene: 'station', player: state.player } };
    return { reply: { text: 'Личный терминал профиля готов:', buttons: [{ label: 'Открыть профиль', url: link }, 'Исследовать', 'Статус', 'Сброс'] }, nextState: { scene: 'station', player: state.player } };
  }
  if (input === 'Мостик') {
    return { reply: { text: '🎛️ МОСТИК\n\nЗдесь решают судьбу станции. Смена позывного и станции приписки — скоро.', buttons: ['Мифология Тракта', 'Назад'], imageKey: imageForLocation('bridge', state.player.faction) }, nextState: { scene: 'loc_bridge', player: state.player } };
  }
  if (input === 'Отсек') {
    const p = state.player;
    const items = (p.inventory || []).map((i) => `${i.resource} T${i.tier} ×${i.qty}`).join(', ');
    return {
      reply: { text: `🔧 РЕМОНТНЫЙ ОТСЕК\n\n${items ? `В трюме: ${items}` : 'Трюм пуст.'}`, buttons: items ? ['Продать всё', 'Назад'] : ['Назад'], imageKey: imageForLocation('repair', p.faction) },
      nextState: { scene: 'loc_repair', player: state.player }
    };
  }
  if (input === 'Декон-камера') {
    const p = state.player;
    const isFree = p.faction === 'Вуаль';
    const feeLabel = isFree ? 'Снять облучение (бесплатно)' : 'Снять облучение (💳300)';
    return {
      reply: { text: `☢️ ДЕКОН-КАМЕРА\n\nТекущее облучение: ${p.radiation || 0}%${p.radiation ? `\nСтоимость очистки: ${isFree ? 'бесплатно' : '💳300'}` : ''}`, buttons: p.radiation ? [feeLabel, 'Назад'] : ['Назад'], imageKey: imageForLocation('decon', p.faction) },
      nextState: { scene: 'loc_decon', player: state.player }
    };
  }
  if (input === 'Кантина') {
    const board = cantinaBoard(state.player);
    board.reply.imageKey = imageForLocation('cantina', state.player.faction);
    return board;
  }
  if (input === 'Контракты') {
    return contractsBoard({ ...state.player });
  }
  if (input === 'Биржа') {
    return marketHub(deps, state.player, playerId);
  }
  if (input === 'Дуэль') {
    return pvpHub(deps, state.player, playerId);
  }
  if (input === 'Жильё') {
    return housingHub(deps, state.player);
  }
  if (input === 'Мастерская') {
    if (state.player.faction !== 'Вуаль') {
      return { reply: { text: 'Мастерская есть только у Вуали — здесь пока не доступна.', buttons: stationButtons(deps, state.player) }, nextState: { scene: 'station', player: state.player } };
    }
    const lines = RECIPES.map((r, i) => `${i + 1}. ${describeRecipe(r)}${hasResourcesFor(state.player, r) ? ' ✅' : ''}`);
    return {
      reply: { text: `🔧 МАСТЕРСКАЯ\n\nВуаль первой из станций открыла настоящую мастерскую — превращай находки в постоянные модули.\n\n${lines.join('\n')}`, buttons: [...RECIPES.map((r) => r.name), 'Назад'] },
      nextState: { scene: 'workshop', player: state.player }
    };
  }
  if (input === 'Архив теней') {
    if (state.player.faction !== 'Терминус') {
      return { reply: { text: 'Архив теней есть только у Терминуса — здесь пока не доступен.', buttons: stationButtons(deps, state.player) }, nextState: { scene: 'station', player: state.player } };
    }
    return {
      reply: { text: '🕶️ АРХИВ ТЕНЕЙ\n\nСкрытная вылазка — шанс нарваться на засаду заметно ниже обычного, но и находки скромнее: аккуратность стоит времени.', buttons: ['Уйти в тень', 'Назад'] },
      nextState: { scene: 'stealth_explore', player: state.player }
    };
  }
  if (input === 'Врата Тракта') {
    return { reply: { text: '🌀 ВРАТА ТРАКТА\n\nВыбери, куда прыгнуть:', buttons: ZONE_BUTTONS, imageKey: imageForLocation('gates', state.player.faction) }, nextState: { scene: 'loc_gates', player: state.player } };
  }
  if (input === 'Исследовать') {
    return startJourney(state.player, 'explore', { zone: state.player.zone || 'blue', depth: 0 }, rng);
  }
  return null;
}

function handleHub(state, input, rng, deps, playerId) {
  switch (state.scene) {
    case SCENES.STATION: {
      const direct = resolveStationAction(input, state, deps, rng, playerId);
      if (direct) return direct;

      const groups = districtGroupsFor(state.player);
      const group = groups.find((g) => g.label === input);
      if (group) {
        const stationEvent = rollStationEvent((DISTRICTS[state.player.faction] || {}).events, rng);
        const prefix = stationEvent ? `${stationEvent.text}\n\n` : '';
        let player = state.player;
        if (stationEvent?.reward) {
          player = { ...player };
          if (stationEvent.reward.credits) player.credits = (player.credits || 0) + stationEvent.reward.credits;
          if (stationEvent.reward.reputation) player.reputation = (player.reputation || 0) + stationEvent.reward.reputation;
        }
        return {
          reply: { text: `${prefix}📍 ${group.label}`, buttons: [...group.buttons, 'Назад'] },
          nextState: { scene: 'district_hub', player, groupLabel: group.label }
        };
      }
      return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player), imageKey: imageForLocation('station', state.player.faction) }, nextState: state };
    }

    case SCENES.DISTRICT_HUB: {
      if (input === 'Назад') {
        return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player), imageKey: imageForLocation('station', state.player.faction) }, nextState: { scene: 'station', player: state.player } };
      }
      const direct = resolveStationAction(input, state, deps, rng, playerId);
      if (direct) return direct;

      const groups = districtGroupsFor(state.player);
      const group = groups.find((g) => g.label === state.groupLabel) || groups[0];
      return { reply: { text: `📍 ${state.groupLabel}`, buttons: [...group.buttons, 'Назад'] }, nextState: state };
    }

    default:
      return null;
  }
}

module.exports = { handleHub, resolveStationAction };
