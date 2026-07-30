'use strict';

const { getDuel, submitTurn: submitPvpTurn, winnerReward, PvpError } = require('../../pvp/pvp-engine.js');
const { findRandomOpponent } = require('../../pvp/matchmaking-engine.js');
const { SKILLS, STIMS } = require('../../engine/skills-data.js');
const { imageForLocation } = require('../location-images.js');
const { hubMessage, stationButtons, skillIdByName } = require('./common.js');
const { SCENES } = require('./ids.js');

async function pvpDuelScreen(deps, player, playerId, duelId, duelMaybe) {
  const duel = duelMaybe || await getDuel({ store: deps.pvpStore }, duelId);
  if (!duel || duel.status === 'finished') {
    return { reply: { text: 'Дуэль не найдена или уже завершена.', buttons: stationButtons(deps, player) }, nextState: { scene: 'station', player } };
  }
  const side = duel.fighterA.id === playerId ? 'A' : 'B';
  const myTurn = side === duel.turnOf;
  const me = side === 'A' ? duel.fighterA : duel.fighterB;
  const opp = side === 'A' ? duel.fighterB : duel.fighterA;

  if (!myTurn) {
    return {
      reply: { text: `⚔️ Дуэль с ${opp.name}\n\nТы: ❤️${me.hp}/${me.hpMax} — Соперник: ❤️${opp.hp}/${opp.hpMax}\n\nСейчас не твой ход — жди ответа соперника и загляни попозже.`, buttons: ['Обновить', 'Назад'] },
      nextState: { scene: 'pvp_duel', player, duelId }
    };
  }
  const buttons = ['Обычная атака', ...(me.equippedSkills || []).map((id) => SKILLS[id]?.name).filter(Boolean), 'Назад'];
  return {
    reply: { text: `⚔️ Дуэль с ${opp.name}\n\nТы: ❤️${me.hp}/${me.hpMax} — Соперник: ❤️${opp.hp}/${opp.hpMax}\n\nТвой ход:`, buttons },
    nextState: { scene: 'pvp_duel', player, duelId }
  };
}

async function pvpHub(deps, player, playerId) {
  if (!deps.pvpStore || !playerId) {
    return { reply: { text: '⚔️ PvP сейчас недоступен.', buttons: stationButtons(deps, player) }, nextState: { scene: 'station', player } };
  }
  const activeDuelId = await deps.pvpStore.getActiveDuelId(playerId);
  if (activeDuelId) return pvpDuelScreen(deps, player, playerId, activeDuelId);
  return {
    reply: { text: '⚔️ ДУЭЛЬНАЯ АРЕНА\n\nНайти случайного соперника близкой силы?', buttons: ['Искать соперника', 'Назад'] },
    nextState: { scene: 'pvp_menu', player }
  };
}

async function handlePvp(state, input, rng, deps, playerId) {
  switch (state.scene) {
    case SCENES.PVP_MENU: {
      if (input === 'Назад') {
        return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player), imageKey: imageForLocation('station', state.player.faction) }, nextState: { scene: 'station', player: state.player } };
      }
      if (input === 'Искать соперника') {
        try {
          const result = await findRandomOpponent({ store: deps.pvpStore }, { ...state.player, id: playerId });
          if (result.matched) return pvpDuelScreen(deps, state.player, playerId, result.duel.id, result.duel);
          return { reply: { text: 'Ты встал в очередь — при следующем заходе в «Дуэль» проверим, не нашёлся ли соперник.', buttons: ['Назад'] }, nextState: { scene: 'pvp_menu', player: state.player } };
        } catch (e) {
          if (e instanceof PvpError) return { reply: { text: `Не удалось: ${e.code}`, buttons: ['Назад'] }, nextState: state };
          throw e;
        }
      }
      return pvpHub(deps, state.player, playerId);
    }

    case SCENES.PVP_DUEL: {
      if (input === 'Назад') {
        return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player), imageKey: imageForLocation('station', state.player.faction) }, nextState: { scene: 'station', player: state.player } };
      }
      if (input === 'Обновить') {
        return pvpDuelScreen(deps, state.player, playerId, state.duelId);
      }
      const skillId = input === 'Обычная атака' ? null : skillIdByName(input);
      if (input !== 'Обычная атака' && !skillId) {
        return pvpDuelScreen(deps, state.player, playerId, state.duelId);
      }
      try {
        const duel = await submitPvpTurn({ store: deps.pvpStore }, playerId, state.duelId, { skillId }, SKILLS, STIMS, rng);
        if (duel.status === 'finished') {
          const mySide = duel.fighterA.id === playerId ? 'A' : 'B';
          const won = duel.winner === mySide;
          const player = { ...state.player };
          const reward = winnerReward();
          if (won) {
            player.credits = (player.credits || 0) + reward.credits;
            player.reputation = (player.reputation || 0) + reward.reputation;
          }
          return {
            reply: { text: `⚔️ Дуэль окончена. ${won ? `Победа! +${reward.credits} кредитов, +${reward.reputation} репутации.` : 'Поражение.'}`, buttons: stationButtons(deps, player) },
            nextState: { scene: 'station', player }
          };
        }
        return pvpDuelScreen(deps, state.player, playerId, state.duelId, duel);
      } catch (e) {
        if (e instanceof PvpError) return { reply: { text: `Не удалось: ${e.code}`, buttons: ['Обновить', 'Назад'] }, nextState: state };
        throw e;
      }
    }

    default:
      return null;
  }
}

module.exports = { handlePvp, pvpHub, PvpError };
