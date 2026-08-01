'use strict';

/**
 * Кантина: доска квестов станции + арка куратора (запускается через
 * curatorQuestScreen из scenes/quests/curator.js), плюс сцена контрактов.
 */

const { availableQuests, describeObjective, progressText, objectiveMet, consumeObjective } = require('../../quests-data.js');
const { getDailyContracts, checkContractProgress, claimContractRewards, getReputationTitle, } = require('../../../contracts/contracts-engine.js');
const { getArcForFaction, getNextAvailableQuest } = require('../../../storylines/curator-arcs.js');
const { getNpcLine } = require('../../../city/npc-roster.js');
const { DISTRICTS } = require('../../../city/districts-data.js');
const { discoverHypothesis } = require('../../../lore/trakt-mythos.js');
const { grantXp } = require('../../../engine/leveling.js');
const { imageForLocation } = require('../../location-images.js');
const { imageForCurator } = require('../../curator-images.js');
const { curatorQuestScreen } = require('../quests/curator.js');
const { hubMessage, stationButtons, CURATORS } = require('../common.js');
const { SCENES } = require('../ids.js');

function contractsBoard(player) {
  player.contracts = getDailyContracts(player);
  const lines = player.contracts.list.map((c) => {
    const status = c.completed ? '✅' : `(${c.current}/${c.target})`;
    return `${status} ${c.text} — 💳${c.reward.credits}, ⭐+${c.reward.reputation}`;
  });
  const title = getReputationTitle(player.reputation || 0);
  const anyClaimable = player.contracts.list.some((c) => c.completed && !player.contracts.claimed.includes(c.id));
  return {
    reply: {
      text: `📋 КОНТРАКТЫ КУРАТОРА\n⭐ Репутация: ${player.reputation || 0} (${title})\n\n${lines.join('\n')}`,
      buttons: anyClaimable ? ['Забрать награды', 'Назад'] : ['Назад']
    },
    nextState: { scene: 'contracts', player }
  };
}

function cantinaBoard(player) {
  const curatorId = (DISTRICTS[player.faction]?.npcs || [])[0];
  player.npcMeetings = player.npcMeetings || {};
  const meetCount = player.npcMeetings[curatorId] || 0;
  const greeting = curatorId ? getNpcLine(curatorId, meetCount) : null;
  player.npcMeetings[curatorId] = meetCount + 1;

  const quests = availableQuests(player);
  const arc = getArcForFaction(player.faction);
  const arcQuest = arc ? getNextAvailableQuest(player, arc) : null;

  if (quests.length === 0 && !arcQuest) {
    return {
      reply: { text: `🍸 БАР\n\n${greeting ? `${greeting}\n\n` : ''}Куратору сейчас нечего тебе предложить.`, buttons: ['Назад'], imageKey: imageForCurator(player.faction) },
      nextState: { scene: 'loc_cantina', player }
    };
  }
  const lines = quests.map((q, i) => `${i + 1}. «${q.title}» — ${describeObjective(q.objective)} (${progressText(player, q.objective)})`);
  if (arcQuest) lines.push(`✨ Куратор ${CURATORS[player.faction] || ''} хочет поговорить лично: «${arcQuest.name}»`);
  const buttons = [...quests.map((q) => q.title), ...(arcQuest ? [`Поговорить: ${arcQuest.name}`] : []), 'Назад'];
  return {
    reply: { text: `🍸 БАР\n\n${greeting ? `${greeting}\n\n` : ''}Доступные задания куратора:\n${lines.join('\n')}`, buttons, imageKey: imageForCurator(player.faction) },
    nextState: { scene: 'loc_cantina', player }
  };
}

function handleCantina(state, input, rng, deps) {
  switch (state.scene) {
    case SCENES.LOC_CANTINA: {
      if (input === 'Назад') {
        return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player), imageKey: imageForLocation('station', state.player.faction) }, nextState: { scene: 'station', player: state.player } };
      }
      const talkMatch = /^Поговорить: (.+)$/.exec(input);
      if (talkMatch) {
        const arc = getArcForFaction(state.player.faction);
        const arcQuest = arc ? getNextAvailableQuest(state.player, arc) : null;
        if (arcQuest && arcQuest.name === talkMatch[1]) {
          return curatorQuestScreen(deps, state.player, arcQuest.id, 'start');
        }
        return cantinaBoard(state.player);
      }
      const quest = availableQuests(state.player).find((q) => q.title === input);
      if (!quest) return cantinaBoard(state.player);

      if (!objectiveMet(state.player, quest.objective)) {
        return {
          reply: {
            text: `Ещё не готово: ${describeObjective(quest.objective)} — сейчас ${progressText(state.player, quest.objective)}. Возвращайся, когда выполнишь.`,
            buttons: ['Назад']
          },
          nextState: { scene: 'loc_cantina', player: state.player }
        };
      }

      const player = { ...state.player };
      consumeObjective(player, quest.objective);
      player.completedQuests = [...(player.completedQuests || []), quest.id];
      let rewardText = `${quest.text}\n\n✅ Выполнено! Награда:`;
      if (quest.reward.xp) {
        const { leveledUp, level } = grantXp(player, quest.reward.xp);
        rewardText += `\n✨ +${quest.reward.xp} XP`;
        if (leveledUp) rewardText += ` — новый уровень: ${level}! (+2 очка, +20 HP, полное исцеление)`;
      }
      if (quest.reward.credits) { player.credits = (player.credits || 0) + quest.reward.credits; rewardText += `\n💳 +${quest.reward.credits} кредитов`; }
      if (quest.reward.statPoints) { player.statPoints = (player.statPoints || 0) + quest.reward.statPoints; rewardText += `\n🔧 +${quest.reward.statPoints} очков параметров`; }

      // Связка "Пятый Голос" (глобальная интрига quests-data.js) с
      // Мифологией Тракта — тематически об одном и том же, теперь ещё и
      // механически: завершение quest'а подтверждает гипотезу BETRAYAL.
      if (quest.id === 'global_3') {
        discoverHypothesis(player, 'BETRAYAL');
        player.flags = player.flags || {};
        player.flags.fifth_voice_confirmed = true;
        rewardText += `\n\n🌌 Гипотеза «Предательство» подтверждена — слух о Пятом Голосе оказался не просто слухом.`;
      }

      return { reply: { text: rewardText, buttons: stationButtons(deps, state.player) }, nextState: { scene: 'station', player } };
    }

    case SCENES.CONTRACTS: {
      if (input === 'Назад') {
        return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player), imageKey: imageForLocation('station', state.player.faction) }, nextState: { scene: 'station', player: state.player } };
      }
      if (input === 'Забрать награды') {
        const player = { ...state.player };
        const claimableIds = (player.contracts?.list || [])
          .filter((c) => c.completed && !player.contracts.claimed.includes(c.id))
          .map((c) => c.id);
        let totalCredits = 0, totalRep = 0;
        for (const id of claimableIds) {
          const res = claimContractRewards(player, id);
          if (res.success) { totalCredits += res.reward.credits; totalRep += res.reward.reputation; }
        }
        const text = claimableIds.length
          ? `Получено: 💳 ${totalCredits} кредитов, ⭐ +${totalRep} репутации.`
          : 'Нечего забирать — сначала выполни хотя бы один контракт.';
        return { reply: { text, buttons: ['Назад'] }, nextState: { scene: 'contracts', player } };
      }
      return contractsBoard({ ...state.player });
    }

    default:
      return null;
  }
}

module.exports = { handleCantina, cantinaBoard, contractsBoard };
