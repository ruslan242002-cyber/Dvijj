'use strict';

/**
 * Кантина: доска квестов станции + арка куратора (запускается через
 * curatorQuestScreen из scenes/quests/curator.js), плюс сцена контрактов.
 */

const { availableQuests, describeObjective, progressText, objectiveMet, consumeObjective } = require('../../quests-data.js');
const { getDailyContracts, checkContractProgress, claimContractRewards, maybeUnlockRareContract, getReputationTitle, } = require('../../../contracts/contracts-engine.js');
const { getFactionReputation } = require('../../../engine/reputation.js');
const { checkAchievements } = require('../../../lib/achievements.js');
const { MIN_BET, MAX_BET, playDice } = require('../../../lib/gambling.js');
const { getArcForFaction, getNextAvailableQuest } = require('../../../storylines/curator-arcs.js');
const { getNpcLine } = require('../../../city/npc-roster.js');
const { DISTRICTS } = require('../../../city/districts-data.js');
const { discoverHypothesis } = require('../../../lore/trakt-mythos.js');
const { grantXp } = require('../../../engine/leveling.js');
const { applyDerivedStats } = require('../../../engine/derived-stats.js');
const { useAbyssTech } = require('../../../lib/abyss-corruption.js');
const { maybeSpeak } = require('../../../lib/fifth-voice.js');
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
  const title = getReputationTitle(getFactionReputation(player, player.faction));
  const anyClaimable = player.contracts.list.some((c) => c.completed && !player.contracts.claimed.includes(c.id));
  return {
    reply: {
      text: `📋 КОНТРАКТЫ КУРАТОРА\n⭐ Репутация: ${getFactionReputation(player, player.faction)} (${title})\n\n${lines.join('\n')}`,
      buttons: anyClaimable ? ['Забрать награды', '⬅️ Назад'] : ['⬅️ Назад']
    },
    nextState: { scene: 'contracts', player }
  };
}

/** Атмосфера бара по фракциям — у каждого своё лицо, не просто «БАР» с
 * одинаковым текстом везде. Терминус пока без образа — не было
 * референса, оставлен нейтральным до появления материала. */
const BAR_FLAVOR = {
  'Приют': { name: 'ПОСЛЕДНИЙ ГЛОТОК', intro: '«Не важно, кто ты. Важно, что ты закажешь». Пилоты, торговцы, контрабандисты — здесь не задают лишних вопросов, а хороший напиток дороже громкого имени.' },
  'Вуаль': { name: 'ГОРИЗОНТ', intro: 'Место встречи умов — учёные, инженеры и авантюристы обмениваются идеями за бокалом. Нейтральная территория, под защитой протоколов Вуали.' },
  'Арсенал': { name: 'БАР АРСЕНАЛА', intro: '«Мы не просто пьём — мы становимся сильнее». Крепкие напитки, армрестлинг на ставки, оружие оставить на входе.' },
};

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
      reply: { text: `🍸 БАР\n\n${greeting ? `${greeting}\n\n` : ''}Куратору сейчас нечего тебе предложить.`, buttons: ['⬅️ Назад'], imageKey: imageForCurator(player.faction) },
      nextState: { scene: 'loc_cantina', player }
    };
  }
  const lines = quests.map((q, i) => `${i + 1}. «${q.title}» — ${describeObjective(q.objective)} (${progressText(player, q.objective)})`);
  if (arcQuest) lines.push(`✨ Куратор ${CURATORS[player.faction] || ''} хочет поговорить лично: «${arcQuest.name}»`);
  const shardCount = (player.bestiaryItems || []).filter((id) => id === 'oskolok_bezdny').length;
  const abyssButtons = shardCount > 0 ? ['🌑 Осколок Бездны'] : [];
  const diceButtons = BAR_FLAVOR[player.faction] ? ['🎲 Кости'] : [];
  const buttons = [...quests.map((q) => q.title), ...(arcQuest ? [`💬 ${arcQuest.name}`] : []), ...abyssButtons, ...diceButtons, '⬅️ Назад'];
  const barHeader = BAR_FLAVOR[player.faction] || { name: 'БАР', intro: '' };
  return {
    reply: { text: `🍸 ${barHeader.name}${barHeader.intro ? `\n${barHeader.intro}` : ''}\n\n${greeting ? `${greeting}\n\n` : ''}Доступные задания куратора:\n${lines.join('\n')}`, buttons, imageKey: imageForCurator(player.faction) },
    nextState: { scene: 'loc_cantina', player }
  };
}

function handleCantina(state, input, rng, deps) {
  switch (state.scene) {
    case SCENES.LOC_CANTINA: {
      if (input === '⬅️ Назад') {
        return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player), imageKey: imageForLocation('station', state.player.faction) }, nextState: { scene: 'station', player: state.player } };
      }
      if (input === '🎲 Кости') {
        const barName = BAR_FLAVOR[state.player.faction]?.name || 'бар';
        return {
          reply: { text: `🎲 КОСТИ (${barName})\n\nСтавка от ${MIN_BET} до ${MAX_BET} кредитов. Два кубика против заведения — у кого сумма больше, тот и забирает банк. Ничья — ставка возвращается.\n\nСколько ставишь? Напиши число:`, buttons: ['⬅️ Назад'] },
          nextState: { scene: SCENES.DICE_GAME, player: state.player }
        };
      }
      if (input === '🌑 Осколок Бездны') {
        const shardIdx = (state.player.bestiaryItems || []).indexOf('oskolok_bezdny');
        if (shardIdx === -1) return cantinaBoard(state.player);
        if ((state.player.level || 1) < 60) {
          return {
            reply: { text: '🌑 Кто-то за дальним столом качает головой, глядя на осколок в твоей руке: «Рано ещё. Организм не выдержит того, что это с тобой сделает — сначала научись жить с тем, что есть» (нужен 60 уровень).', buttons: ['⬅️ Назад'] },
            nextState: { scene: 'loc_cantina', player: state.player }
          };
        }
        const player = { ...state.player, bestiaryItems: [...state.player.bestiaryItems], stats: { ...state.player.stats } };
        player.bestiaryItems.splice(shardIdx, 1);

        const statKeys = ['power', 'mind', 'reaction', 'endurance'];
        const statLabels = { power: 'Силе', mind: 'Интеллекту', reaction: 'Ловкости', endurance: 'Выносливости' };
        const boostedStat = statKeys[Math.floor(rng() * statKeys.length)];
        player.stats[boostedStat] += 3;
        applyDerivedStats(player);
        grantXp(player, 500);
        player.hp = player.hpMax;

        const isFirstAbyssTouch = !(player.abyssCorruption > 0);
        const result = useAbyssTech(player);
        if (isFirstAbyssTouch) {
          const voiceLine = maybeSpeak(player, 'abyss_first_touch');
          if (voiceLine) player.pendingVoiceMessage = player.pendingVoiceMessage ? `${player.pendingVoiceMessage}\n\n${voiceLine}` : voiceLine;
        }
        const tierNote = result.crossedTier ? `\n\n⚠️ Заражение перешло на новый порог (${result.newTier}) — максимальное HP снизилось.` : '';
        const pointNote = result.atPointOfNoReturn ? '\n\n☠️ Ты пересёк(ла) точку невозврата. Обратной дороги больше нет.' : '';

        return {
          reply: { text: `🌑 Ты активируешь осколок — на миг мир становится слишком ярким и слишком тихим одновременно. Что-то в тебе меняется навсегда.\n\n+3 к ${statLabels[boostedStat]}. +500 опыта. HP полностью восстановлено.${tierNote}${pointNote}`, buttons: stationButtons(deps, player) },
          nextState: { scene: 'station', player }
        };
      }
      const talkMatch = /^💬 (.+)$/.exec(input);
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
            buttons: ['⬅️ Назад']
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
      if (input === '⬅️ Назад') {
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
        const unlocked = maybeUnlockRareContract(player, null, rng);
        const unlockedNote = unlocked.length
          ? `\n\n🔓 Открылось новое задание (${unlocked.length > 1 ? 'редкое + легендарное' : 'редкое'}) — загляни в доску снова.`
          : '';
        const newAchievements = checkAchievements(player);
        const achievementsNote = newAchievements.length ? `\n\n${newAchievements.map((a) => `🏆 Достижение: «${a.title}»`).join('\n')}` : '';
        const text = claimableIds.length
          ? `Получено: 💳 ${totalCredits} кредитов, ⭐ +${totalRep} репутации.${unlockedNote}${achievementsNote}`
          : 'Нечего забирать — сначала выполни хотя бы один контракт.';
        return { reply: { text, buttons: ['⬅️ Назад'] }, nextState: { scene: 'contracts', player } };
      }
      return contractsBoard({ ...state.player });
    }

    case SCENES.DICE_GAME: {
      if (input === '⬅️ Назад') return cantinaBoard(state.player);
      const rawInput = input === '🎲 Ещё раз' && state.lastBet ? String(state.lastBet) : input;
      const bet = parseInt(rawInput, 10);
      if (!Number.isFinite(bet) || bet < MIN_BET || bet > MAX_BET) {
        return { reply: { text: `Ставка должна быть от ${MIN_BET} до ${MAX_BET} кредитов. Сколько ставишь?`, buttons: ['⬅️ Назад'] }, nextState: state };
      }
      if ((state.player.credits || 0) < bet) {
        return { reply: { text: `Не хватает кредитов на такую ставку (у тебя 💳${state.player.credits || 0}). Сколько ставишь?`, buttons: ['⬅️ Назад'] }, nextState: state };
      }
      const player = { ...state.player };
      const result = playDice(bet, rng);
      player.credits = (player.credits || 0) - bet + result.payout;
      const outcomeText = result.outcome === 'win'
        ? `🎲 Твои кости: ${result.playerRoll}. Заведение: ${result.houseRoll}.\n\n🏆 Выигрыш! +💳${result.payout - bet} чистыми.`
        : result.outcome === 'push'
        ? `🎲 Твои кости: ${result.playerRoll}. Заведение: ${result.houseRoll}.\n\n🤝 Ничья — ставка вернулась.`
        : `🎲 Твои кости: ${result.playerRoll}. Заведение: ${result.houseRoll}.\n\n💸 Не повезло — ставка ушла заведению.`;
      return {
        reply: { text: `${outcomeText}\n\n💳 Баланс: ${player.credits}`, buttons: ['🎲 Ещё раз', '⬅️ Назад'] },
        nextState: { scene: SCENES.DICE_GAME, player, lastBet: bet }
      };
    }

    default:
      return null;
  }
}

module.exports = { handleCantina, cantinaBoard, contractsBoard };
