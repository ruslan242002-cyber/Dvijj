'use strict';

/**
 * Главный хаб станции: районы вместо плоского списка кнопок (см.
 * DISTRICT_GROUPS в common.js), плюс resolveStationAction — общая логика
 * конкретной кнопки (Мостик/Отсек/Кантина/Биржа/...), используемая и из
 * 'station' напрямую, и из district_hub.
 */

const { workshopScreen } = require('./locations/workshop.js');
const { bridgeScreen } = require('./locations/bridge.js');
const { addFactionReputation } = require('../../engine/reputation.js');
const { checkDailyLogin } = require('../../lib/daily-streak.js');
const { DISTRICTS } = require('../../city/districts-data.js');
const { rollStationEvent } = require('../../city/station-events.js');
const { imageForLocation } = require('../location-images.js');
const { marketHub } = require('./market.js');
const { pvpHub } = require('./pvp.js');
const { housingHub } = require('./housing.js');
const { cantinaBoard, contractsBoard } = require('./locations/cantina.js');
const { repairDiscount, tankUpgradeDiscount, importMarkup, TANK_UPGRADE_CREDITS, TOOL_COSTS } = require('./locations/repair.js');
const { SHIP_SYSTEMS, SYSTEM_NAMES, freshShipSystems, shipSystemsText, repairSystem, repairCostForSystem } = require('../../engine/ship-systems.js');
const { findSkin, skinsAvailableFor, ownedSkins, purchaseSkin, equipSkin } = require('../../engine/ship-skins.js');
const { guildHub } = require('./guild.js');
const {
  hubMessage, statusText, stationButtons, startJourney, districtGroupsFor, FACTIONS, CITY_UNLOCK_LEVEL, currentStation, stationArrivalCard, deconFee, addToInventory,
} = require('./common.js');
const { travelScreen } = require('./travel.js');
const { zoneForDistance } = require('../../engine/travel.js');
const { SCENES } = require('./ids.js');

async function resolveStationAction(input, state, deps, rng, playerId) {
  if (input === '📊 Статус') {
    return { reply: { text: statusText(state.player), buttons: stationButtons(deps, state.player) }, nextState: { scene: 'station', player: state.player } };
  }
  if (input === 'Профиль') {
    const link = typeof deps.getProfileLink === 'function' ? deps.getProfileLink() : null;
    if (!link) return { reply: { text: 'Терминал профиля сейчас недоступен, попробуйте позже.', buttons: stationButtons(deps, state.player) }, nextState: { scene: 'station', player: state.player } };
    return { reply: { text: 'Личный терминал профиля готов:', buttons: [{ label: 'Открыть профиль', url: link }, '📊 Статус', 'Сброс'] }, nextState: { scene: 'station', player: state.player } };
  }
  if (input === 'Мостик') {
    return bridgeScreen(state.player);
  }
  if (input === 'Отсек') {
    const p = state.player;
    const items = (p.inventory || []).map((i) => `${i.resource} T${i.tier} ×${i.qty}`).join(', ');
    const missingHp = Math.max(0, p.ship.hpMax - p.ship.hp);
    const repairCost = Math.round(missingHp * 3 * (1 - repairDiscount(currentStation(p))) * (1 + importMarkup(currentStation(p))));
    const missingFuel = Math.max(0, p.ship.fuelMax - p.ship.fuel);
    const fuelCost = Math.round(missingFuel * 2 * (1 + importMarkup(currentStation(p))));
    const tankCost = Math.round(TANK_UPGRADE_CREDITS * (1 - tankUpgradeDiscount(currentStation(p))));
    const shipLine = missingHp > 0
      ? `\n\n🚀 Корпус: ❤️ ${p.ship.hp}/${p.ship.hpMax} — ремонт обойдётся в 💳${repairCost}${repairDiscount(currentStation(p)) ? ' (со скидкой Арсенала)' : ' (3 кредита за HP)'}.`
      : `\n\n🚀 Корпус: ❤️ ${p.ship.hp}/${p.ship.hpMax} — в полном порядке.`;
    const fuelLine = currentStation(p) === 'Вуаль'
      ? `\n⛽ Топливо: ${p.ship.fuel}/${p.ship.fuelMax} — при стыковке заправляется бесплатно и без лимита (привилегия Вуали).`
      : (missingFuel > 0
        ? `\n⛽ Топливо: ${p.ship.fuel}/${p.ship.fuelMax} — заправка обойдётся в 💳${fuelCost} (2 кредита за ед., но при стыковке заправляется само).`
        : `\n⛽ Топливо: ${p.ship.fuel}/${p.ship.fuelMax} — баки полны.`);
    const tankLine = `\n🛢️ Расширение бака: +20 к ёмкости за Сплавы T2 ×15 и 💳${tankCost}${tankUpgradeDiscount(currentStation(p)) ? ' (со скидкой Кузницы)' : ''}.`;

    p.ship.systems = p.ship.systems || freshShipSystems();
    const damagedSystems = SHIP_SYSTEMS.filter((sys) => p.ship.systems[sys] < 100);
    const systemsLine = `\n\n⚙️ Узлы корабля:\n${shipSystemsText(p.ship)}`;

    const ownedTools = p.tools || [];
    const toolLines = Object.entries(TOOL_COSTS)
      .map(([id, cost]) => `\n🔩 ${cost.name}: ${ownedTools.includes(id) ? 'уже есть' : `${cost.resource} T${cost.tier} ×${cost.qty} + 💳${cost.credits}`}`)
      .join('');

    const mySkins = ownedSkins(p);
    const equippedSkinId = p.ship.equippedSkin || 'skin_default';
    const availableSkins = skinsAvailableFor(p);
    const skinsLine = `\n\n🎨 Окраска корабля (${findSkin(equippedSkinId)?.name || 'Стандартный корпус'}):\n${availableSkins.map((s) => `${mySkins.includes(s.id) ? (s.id === equippedSkinId ? '✅' : '◻️') : '🔒'} ${s.name}${s.cost ? ` — 💳${s.cost}` : ''}`).join('\n')}`;

    const buttons = [];
    if (items) buttons.push('🧹 Продать лишнее', '💰 Продать всё');
    if (missingHp > 0) buttons.push(`🔧 Ремонт (💳${repairCost})`);
    if (missingFuel > 0 && currentStation(p) !== 'Вуаль') buttons.push(`⛽ Заправка (💳${fuelCost})`);
    buttons.push('🛢️ Расширить бак');
    for (const sys of damagedSystems) {
      buttons.push(`⚙️ Чинить: ${SYSTEM_NAMES[sys]}`);
    }
    for (const s of availableSkins) {
      if (mySkins.includes(s.id)) {
        if (s.id !== equippedSkinId) buttons.push(`🎨 Надеть: ${s.name}`);
      } else {
        buttons.push(`💳 Купить окраску: ${s.name}`);
      }
    }
    for (const [id, cost] of Object.entries(TOOL_COSTS)) {
      if (!ownedTools.includes(id)) buttons.push(`Купить: ${cost.name}`);
    }
    buttons.push('⬅️ Назад');
    return {
      reply: { text: `🔧 РЕМОНТНЫЙ ОТСЕК\n\n${items ? `В трюме: ${items}` : 'Трюм пуст.'}${shipLine}${fuelLine}${systemsLine}${tankLine}${skinsLine}${toolLines}`, buttons, imageKey: imageForLocation('repair', currentStation(p)) },
      nextState: { scene: 'loc_repair', player: state.player }
    };
  }
  if (input === 'Декон-камера') {
    const p = state.player;
    const fee = deconFee(currentStation(p));
    const feeLabel = fee === 0 ? '☢️ Снять облучение (бесплатно)' : `☢️ Снять облучение (💳${fee})`;
    return {
      reply: { text: `☢️ ДЕКОН-КАМЕРА\n\nТекущее облучение: ${p.radiation || 0}%${p.radiation ? `\nСтоимость очистки: ${fee === 0 ? 'бесплатно' : `💳${fee}`}` : ''}`, buttons: p.radiation ? [feeLabel, '⬅️ Назад'] : ['⬅️ Назад'], imageKey: imageForLocation('decon', currentStation(p)) },
      nextState: { scene: 'loc_decon', player: state.player }
    };
  }
  if (input === 'Бар') {
    if (state.player.visitingStation) {
      return { reply: { text: `Куратор ${state.player.visitingStation} не станет говорить с чужаком. Чтобы попасть в бар, нужно вступить во фракцию (Мостик → Станция приписки).`, buttons: stationButtons(deps, state.player) }, nextState: { scene: 'station', player: state.player } };
    }
    return cantinaBoard(state.player);
  }
  if (input === 'Контракты') {
    if (state.player.visitingStation) {
      return { reply: { text: 'Доска контрактов доступна только участникам фракции.', buttons: stationButtons(deps, state.player) }, nextState: { scene: 'station', player: state.player } };
    }
    return contractsBoard({ ...state.player });
  }
  if (input === '🏠 Домой') {
    const player = { ...state.player, visitingStation: null };
    return { reply: { text: hubMessage(player), buttons: stationButtons(deps, player), imageKey: imageForLocation('station', currentStation(player)) }, nextState: { scene: 'station', player } };
  }
  if (input === 'Гильдия') {
    return guildHub(deps, state.player, playerId);
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
    return workshopScreen(state.player);
  }
  if (input === 'Архив теней') {
    return { reply: { text: 'Скрытные вылазки временно доступны только через полёт — набери «Полёт» на хабе и выбери скрытную высадку там, когда доберёшься до планеты.', buttons: stationButtons(deps, state.player) }, nextState: { scene: 'station', player: state.player } };
  }
  if (input === 'Врата Тракта') {
    const others = FACTIONS.filter((f) => f !== state.player.faction);
    const level = state.player.level || 1;
    const unlocked = others.filter((f) => level >= (CITY_UNLOCK_LEVEL[f] || 0));
    const locked = others.filter((f) => level < (CITY_UNLOCK_LEVEL[f] || 0));
    const lockedNote = locked.length
      ? `\n\nЕщё закрыто: ${locked.map((f) => `${f} (ур. ${CITY_UNLOCK_LEVEL[f]})`).join(', ')}.`
      : '';
    return { reply: { text: `🌀 ВРАТА ТРАКТА\n\nКуда проложить курс?${lockedNote}`, buttons: [...unlocked, '⬅️ Назад'], imageKey: imageForLocation('gates', currentStation(state.player)) }, nextState: { scene: 'loc_gates', player: state.player } };
  }
  if (input === 'Исследовать') {
    return { reply: { text: 'Разведка теперь начинается с полёта — набери «Полёт» на хабе, долети до планеты и высадись там.', buttons: stationButtons(deps, state.player) }, nextState: { scene: 'station', player: state.player } };
  }
  if (input === 'Полёт') {
    return travelScreen(state.player, 0, '🚀 Врата открываются — курс в открытый космос.\n\n');
  }
  if (input === 'Терраса памяти') {
    const player = { ...state.player, flags: { ...(state.player.flags || {}) } };
    const firstVisit = !player.flags.visited_memory_terrace;
    player.flags.visited_memory_terrace = true;
    const bonusNote = firstVisit ? '\n\n💳 +50 кредитов — за то, что нашёл(нашла) дорогу сюда.' : '';
    if (firstVisit) player.credits = (player.credits || 0) + 50;
    return {
      reply: { text: `🪟 ТЕРРАСА ПАМЯТИ\n\nТа самая смотровая палуба, где всё началось. Новички задерживаются здесь дольше остальных — кто-то ищет ответы во внешнем Тракте, кто-то просто привыкает к тишине после капсулы. Ветераны заходят реже, но заходят.${bonusNote}`, buttons: stationButtons(deps, player) },
      nextState: { scene: 'station', player }
    };
  }
  if (input === 'Мастерская новичка') {
    const player = { ...state.player };
    const firstVisit = !(player.flags || {}).visited_novice_workshop;
    player.flags = { ...(player.flags || {}), visited_novice_workshop: true };
    if (firstVisit) {
      addToInventory(player, 'Сплавы', 1, 10);
      return {
        reply: { text: '🛠️ МАСТЕРСКАЯ НОВИЧКА\n\nЗдесь учат работать руками без риска спалить последние ресурсы в минус — инструктор стоит рядом на первых порах. Тебе выдают стартовый набор материалов на пробу.\n\n📦 +10 Сплавы T1.', buttons: stationButtons(deps, player) },
        nextState: { scene: 'station', player }
      };
    }
    return {
      reply: { text: '🛠️ МАСТЕРСКАЯ НОВИЧКА\n\nИнструктор кивает — ты уже был(а) здесь. Дальше сам(а), с настоящим риском, как у всех.', buttons: stationButtons(deps, player) },
      nextState: { scene: 'station', player }
    };
  }
  if (input === 'Барак ожидания') {
    return {
      reply: { text: '🛌 БАРАК ОЖИДАНИЯ\n\nРяды коек для тех, кто ещё не выбрал станцию — или выбрал, но не спешит туда переезжать. Здесь тихо обмениваются слухами о том, как оно там, у соседей. Хорошее место, чтобы никуда не торопиться.', buttons: stationButtons(deps, state.player) },
      nextState: { scene: 'station', player: state.player }
    };
  }
  if (input === '⛏️ Жила') {
    if (!deps.veinStore) {
      return { reply: { text: '⛏️ Система жил сейчас недоступна.', buttons: stationButtons(deps, state.player) }, nextState: { scene: 'station', player: state.player } };
    }
    const vein = await deps.veinStore.getActiveVein();
    if (!vein) {
      return { reply: { text: '⛏️ Активной жилы сейчас нет. Как только она появится — тебе придёт уведомление, где бы ты ни был(а).', buttons: stationButtons(deps, state.player) }, nextState: { scene: 'station', player: state.player } };
    }
    const zone = zoneForDistance(vein.distance);
    const zoneName = { blue: 'патрулируемая', yellow: 'спорная', red: 'открытый космос' }[zone] || zone;
    return {
      reply: { text: `⛏️ ЖИЛА ОБНАРУЖЕНА\n\nТ${vein.tier} · ${vein.resource}\nПрочность: ${Math.round((vein.durability / vein.durabilityMax) * 100)}%\nМестоположение: дистанция ${vein.distance} (${zoneName})\n\nНабери «Полёт» и долети до этой дистанции — на месте появится возможность пристыковаться.`, buttons: stationButtons(deps, state.player) },
      nextState: { scene: 'station', player: state.player }
    };
  }
  return null;
}

function stationDefaultView(deps, player, rng) {
  const card = stationArrivalCard(player, rng);
  let nextPlayer = player;
  if (card.reward) {
    nextPlayer = { ...player };
    if (card.reward.credits) nextPlayer.credits = (nextPlayer.credits || 0) + card.reward.credits;
    if (card.reward.reputation) addFactionReputation(nextPlayer, nextPlayer.faction, card.reward.reputation);
  }
  nextPlayer = { ...nextPlayer };
  const loginResult = checkDailyLogin(nextPlayer);
  let dailyNote = '';
  if (loginResult.rewarded) {
    const resourceNote = loginResult.reward.resource ? ` + ${loginResult.reward.resource.qty}× ${loginResult.reward.resource.resource} T${loginResult.reward.resource.tier}` : '';
    dailyNote = `🗓️ Серия входов: ${loginResult.streak} д. подряд — 💳+${loginResult.reward.credits}${resourceNote}.\n\n`;
  }
  return {
    reply: { text: `${dailyNote}${card.text}`, buttons: stationButtons(deps, nextPlayer), imageKey: imageForLocation('station', currentStation(nextPlayer)) },
    nextState: { scene: 'station', player: nextPlayer }
  };
}

async function handleHub(state, input, rng, deps, playerId) {
  switch (state.scene) {
    case SCENES.STATION: {
      const direct = await resolveStationAction(input, state, deps, rng, playerId);
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
          if (stationEvent.reward.reputation) addFactionReputation(player, player.faction, stationEvent.reward.reputation);
        }

        // Группа из одной кнопки (Медблок, В глубь, Дуэль, Координатор,
        // Покинуть) — не тратим отдельный экран "выбери, что внутри",
        // сразу выполняем единственное действие.
        if (group.buttons.length === 1) {
          const direct = await resolveStationAction(group.buttons[0], { ...state, player }, deps, rng, playerId);
          if (direct && prefix) {
            return { ...direct, reply: { ...direct.reply, text: `${prefix}${direct.reply.text}` } };
          }
          return direct;
        }

        return {
          reply: { text: `${prefix}📍 ${group.label}`, buttons: [...group.buttons, '⬅️ Назад'] },
          nextState: { scene: 'district_hub', player, groupLabel: group.label }
        };
      }
      return stationDefaultView(deps, state.player, rng);
    }

    case SCENES.DISTRICT_HUB: {
      if (input === '⬅️ Назад') {
        return stationDefaultView(deps, state.player, rng);
      }
      const direct = await resolveStationAction(input, state, deps, rng, playerId);
      if (direct) return direct;

      const groups = districtGroupsFor(state.player);
      const group = groups.find((g) => g.label === state.groupLabel) || groups[0];
      return { reply: { text: `📍 ${state.groupLabel}`, buttons: [...group.buttons, '⬅️ Назад'] }, nextState: state };
    }

    default:
      return null;
  }
}

module.exports = { handleHub, resolveStationAction };
