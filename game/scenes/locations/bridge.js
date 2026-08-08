'use strict';

/**
 * Мостик станции: вход в Мифологию Тракта (фрагменты, гипотезы) и
 * диалоговый квест "Гипотезы Шёпота" (renderQuestText/quest-engine.js).
 */

const {
  TRAKT_FRAGMENTS, HYPOTHESIS_INFO, getFragmentStatus, collectFragment,
  describeCondition, conditionProgress, getActiveHypothesis, setHypothesis,
  discoverHypothesis, getEnding,
} = require('../../../lore/trakt-mythos.js');
const { getCurrentAct } = require('../../../lore/trakt-acts.js');
const { createQuestState, advanceQuest, completeQuest, renderQuestText } = require('../../../quests/quest-engine.js');
const { SHYOPOT_HYPOTHESES_QUEST } = require('../../../quests/narrative/shyopot-hypotheses.js');
const { imageForLocation } = require('../../location-images.js');
const { imageForCurator } = require('../../curator-images.js');
const { hubMessage, stationButtons, FACTIONS, CITY_UNLOCK_LEVEL, MIN_LEVEL_TO_JOIN_FACTION, canJoinFaction, switchFaction } = require('../common.js');
const { MENTOR_CLASSES, mentorLevel, classStageForFaction, chooseMentorClass } = require('../../../engine/mentor-classes.js');
const { applyDerivedStats } = require('../../../engine/derived-stats.js');
const { SCENES } = require('../ids.js');
const {
  PASSIVE_SKILLS, passiveSlotsFor, canEquipPassive, equipPassive, unequipPassive, learnPassive, knowsPassive, SLOTS_PER_LEVEL_MILESTONE, MAX_PASSIVE_SLOTS,
} = require('../../../engine/passive-skills.js');

function stepShyopotQuest(playerIn, input) {
  const player = { ...playerIn };
  player.questStates = { ...(player.questStates || {}) };
  let qs = player.questStates.shyopot_hypotheses;
  const needsFreshStart = !qs || qs.completed;

  if (needsFreshStart) {
    qs = createQuestState('shyopot_hypotheses');
    player.questStates.shyopot_hypotheses = qs;
  } else if (input) {
    const rendered = renderQuestText(SHYOPOT_HYPOTHESES_QUEST, qs, { player });
    const choice = rendered.choices.find((c) => c.label === input);
    if (choice) {
      advanceQuest(qs, choice.next, choice.choiceId || null, choice.flags || {});
      if (choice.next === 'end' && choice.choiceId) {
        setHypothesis(player, choice.choiceId);
        if (qs.flags.heard_catastrophe) discoverHypothesis(player, 'CATASTROPHE');
        if (qs.flags.heard_infection) discoverHypothesis(player, 'INFECTION');
        if (qs.flags.heard_evolution) discoverHypothesis(player, 'EVOLUTION');
        if (qs.flags.heard_betrayal) discoverHypothesis(player, 'BETRAYAL');
      }
    }
  }

  const rendered = renderQuestText(SHYOPOT_HYPOTHESES_QUEST, qs, { player });
  if (rendered.isTerminal && !qs.completed) {
    completeQuest(qs, {});
    player.completedQuests = player.completedQuests || [];
    if (!player.completedQuests.includes('shyopot_hypotheses')) player.completedQuests.push('shyopot_hypotheses');
  }
  const buttons = rendered.isTerminal ? ['⬅️ Назад'] : rendered.choices.map((c) => c.label);
  return { reply: { text: rendered.text, buttons, imageKey: imageForCurator('Терминус') }, nextState: { scene: 'quest_shyopot', player } };
}

/** Экран пассивных умений — три категории: неизученные чипы (в трюме,
 * ждут применения), изученные-но-не-экипированные (можно поставить в
 * слот), экипированные (можно снять). Слоты — see engine/passive-skills.js
 * (сейчас 3, растёт до 10, механизм расширения ещё не решён). */
function passiveScreen(player, prefixText = '') {
  const known = player.knownPassives || [];
  const equipped = player.equippedPassives || [];
  const chips = player.passiveChips || [];
  const slots = passiveSlotsFor(player);

  const lines = [];
  const buttons = [];

  if (chips.length) {
    lines.push('🧬 Найденные чипы (не изучены):');
    for (const id of chips) {
      const skill = PASSIVE_SKILLS[id];
      if (!skill) continue;
      lines.push(`  ${skill.name} — ${skill.description}`);
      buttons.push(`Изучить: ${skill.name}`);
    }
    lines.push('');
  }

  if (known.length) {
    const nextMilestoneLevel = slots < MAX_PASSIVE_SLOTS ? (Math.floor((player.level || 1) / SLOTS_PER_LEVEL_MILESTONE) + 1) * SLOTS_PER_LEVEL_MILESTONE : null;
    const slotGrowthNote = nextMilestoneLevel ? ` (следующий слот на ${nextMilestoneLevel} уровне)` : ' (максимум)';
    lines.push(`⚙️ Изучено (слотов занято ${equipped.length}/${slots}${slotGrowthNote}):`);
    for (const id of known) {
      const skill = PASSIVE_SKILLS[id];
      if (!skill) continue;
      const isEquipped = equipped.includes(id);
      lines.push(`  ${isEquipped ? '✅' : '◻️'} ${skill.name} — ${skill.description}`);
      buttons.push(isEquipped ? `Снять: ${skill.name}` : `Экипировать: ${skill.name}`);
    }
  }

  if (!chips.length && !known.length) {
    lines.push('Пока ничего — пассивки находятся редкими нейрочипами на вылазках и в дальнем космосе.');
  }

  buttons.push('⬅️ Назад');
  return {
    reply: { text: `${prefixText}🧬 ПАССИВНЫЕ УМЕНИЯ\n\n${lines.join('\n')}`, buttons },
    nextState: { scene: 'passive_management', player }
  };
}

/** Единая точка правды для главного экрана Мостика — раньше текст/кнопки
 * дублировались в двух местах (после Мифологии и после Пассивок) и уже
 * дважды расходились из-за этого в прошлом. Один источник теперь. */
function bridgeScreen(player, prefixText = '') {
  return {
    reply: { text: `${prefixText}🎛️ МОСТИК\n\nЗдесь решают судьбу станции.`, buttons: ['Мифология Тракта', 'Пассивки', 'Станция приписки', 'Класс-наставник', '⬅️ Назад'], imageKey: imageForLocation('bridge', player.faction) },
    nextState: { scene: 'loc_bridge', player }
  };
}

/** Класс-наставник — можно учиться у ЛЮБОГО куратора, не только своего
 * (доказав ему доверие репутацией/квестами его арки), поэтому показывает
 * все 5 школ разом, а не только родную. */
function mentorClassScreen(player, prefixText = '') {
  const lines = FACTIONS.map((faction) => {
    const cls = MENTOR_CLASSES[faction];
    const level = mentorLevel(player, faction);
    const stage = classStageForFaction(player, faction);
    const isCurrent = player.mentorClass === cls.id;
    const currentStageData = cls.stages[stage - 1];
    return `${isCurrent ? '✅' : '◻️'} ${cls.name} — ${cls.role} (${cls.curator})\nУровень наставника: ${level} · Ступень ${stage}/5: «${currentStageData.name}»\n${currentStageData.description}`;
  });
  return {
    reply: { text: `${prefixText}🎓 КЛАСС-НАСТАВНИК\n\nУровень наставника = репутация с фракцией + пройденные квесты его арки. 5 ступеней, каждая — свой именной баф, 5-я — крупная специализация. Смена класса свободна.\n\n${lines.join('\n\n')}`, buttons: [...FACTIONS.map((f) => `Выбрать: ${MENTOR_CLASSES[f].name}`), '⬅️ Назад'] },
    nextState: { scene: SCENES.MENTOR_CLASS, player }
  };
}

/** Смена станции приписки — с 30 уровня. Показывает текущую фракцию и,
 * если уровень позволяет, кнопки перехода в любую ДРУГУЮ уже открытую
 * (по CITY_UNLOCK_LEVEL) станцию. */
function factionTransferScreen(player, prefixText = '') {
  const level = player.level || 1;
  if (level < MIN_LEVEL_TO_JOIN_FACTION) {
    return {
      reply: { text: `${prefixText}🎖️ СТАНЦИЯ ПРИПИСКИ\n\nСейчас: «${player.faction}».\n\nВступить в другую фракцию можно с ${MIN_LEVEL_TO_JOIN_FACTION} уровня — рано.`, buttons: ['⬅️ Назад'] },
      nextState: { scene: SCENES.FACTION_TRANSFER, player }
    };
  }
  const options = FACTIONS.filter((f) => f !== player.faction && level >= (CITY_UNLOCK_LEVEL[f] || 0));
  const buttons = [...options.map((f) => `Вступить: ${f}`), '⬅️ Назад'];
  const optionsNote = options.length ? '' : '\n\nПока нет ни одной другой открытой станции для перехода.';
  return {
    reply: { text: `${prefixText}🎖️ СТАНЦИЯ ПРИПИСКИ\n\nСейчас: «${player.faction}».${optionsNote}`, buttons },
    nextState: { scene: SCENES.FACTION_TRANSFER, player }
  };
}

function mythosScreen(player, prefixText = '') {
  const act = getCurrentAct(player);
  const statuses = getFragmentStatus(player);
  const hyp = getActiveHypothesis(player);
  // Защита: если в реальном lore/trakt-mythos.js нет describeCondition/
  // conditionProgress (или они называются иначе) — не роняем экран
  // мифологии, а показываем нейтральный текст вместо конкретного условия.
  const describe = typeof describeCondition === 'function' ? describeCondition : () => 'условие ещё не описано';
  const progress = typeof conditionProgress === 'function' ? conditionProgress : () => '';
  const lines = statuses.map((f) => {
    const icon = f.collected ? '✅' : f.unlocked ? '🔓' : '🔒';
    let extra = '';
    if (!f.collected) extra = f.unlocked ? ' — готов к сбору!' : ` — ${describe(f.unlockCondition)} (${progress(player, f.unlockCondition)})`;
    const label = f.shortName || f.name || f.id || 'фрагмент';
    return `${icon} ${label}${extra}`;
  });
  const collectible = statuses.filter((f) => f.unlocked && !f.collected);
  const buttons = [...collectible.map((f) => `Собрать: ${f.shortName || f.name || f.id}`), 'Гипотезы', '⬅️ Назад'];
  // Защита: если HYPOTHESIS_INFO не содержит ключ hyp (другое название поля
  // или другой набор гипотез в реальном trakt-mythos.js) — раньше это было
  // необработанное исключение (undefined.name), которое молча ронялo весь
  // экран мифологии сразу после выбора гипотезы, и следующее нажатие любой
  // кнопки выглядело как "зависание". Теперь — нейтральный текст вместо краша.
  const hypInfo = hyp && HYPOTHESIS_INFO ? HYPOTHESIS_INFO[hyp] : null;
  const hypLine = hyp ? `Твоя гипотеза: ${hypInfo?.name || hyp}` : 'Гипотеза ещё не выбрана.';
  return {
    reply: { text: `${prefixText}📜 МИФОЛОГИЯ ТРАКТА\n\n${act.name}\n\n${hypLine}\n\n${lines.join('\n')}`, buttons },
    nextState: { scene: 'lore_mythos', player }
  };
}

function handleBridge(state, input, rng, deps) {
  switch (state.scene) {
    case SCENES.LOC_BRIDGE: {
      if (input === 'Мифология Тракта') {
        return mythosScreen(state.player);
      }
      if (input === 'Пассивки') {
        return passiveScreen(state.player);
      }
      if (input === 'Станция приписки') {
        return factionTransferScreen(state.player);
      }
      if (input === 'Класс-наставник') {
        return mentorClassScreen(state.player);
      }
      return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player), imageKey: imageForLocation('station', state.player.faction) }, nextState: { scene: 'station', player: state.player } };
    }

    case SCENES.FACTION_TRANSFER: {
      if (input === '⬅️ Назад') {
        return bridgeScreen(state.player);
      }
      const match = /^Вступить: (.+)$/.exec(input);
      if (match) {
        const newFaction = match[1];
        const check = canJoinFaction(state.player, newFaction);
        if (!check.ok) {
          const reasonText = check.reason === 'LEVEL_TOO_LOW' ? `нужен ${MIN_LEVEL_TO_JOIN_FACTION} уровень.` : 'не получилось.';
          return factionTransferScreen(state.player, `Не удалось: ${reasonText}\n\n`);
        }
        const player = { ...state.player };
        switchFaction(player, newFaction);
        return {
          reply: { text: `🎖️ Ты официально вступил(а) в станцию «${newFaction}». Умения и статы пересчитаны под новую фракцию.`, buttons: stationButtons(deps, player), imageKey: imageForLocation('station', player.faction) },
          nextState: { scene: 'station', player }
        };
      }
      return factionTransferScreen(state.player);
    }

    case SCENES.MENTOR_CLASS: {
      if (input === '⬅️ Назад') {
        return bridgeScreen(state.player);
      }
      const classMatch = /^Выбрать: (.+)$/.exec(input);
      if (classMatch) {
        const targetFaction = Object.keys(MENTOR_CLASSES).find((f) => MENTOR_CLASSES[f].name === classMatch[1]);
        if (!targetFaction) return mentorClassScreen(state.player);
        const player = { ...state.player };
        chooseMentorClass(player, targetFaction);
        applyDerivedStats(player);
        return mentorClassScreen(player, `Класс сменён: ${MENTOR_CLASSES[targetFaction].name}.\n\n`);
      }
      return mentorClassScreen(state.player);
    }

    case SCENES.PASSIVE_MANAGEMENT: {
      if (input === '⬅️ Назад') {
        return bridgeScreen(state.player);
      }

      const findByName = (name) => Object.values(PASSIVE_SKILLS).find((s) => s.name === name)?.id;

      const learnMatch = /^Изучить: (.+)$/.exec(input);
      if (learnMatch) {
        const passiveId = findByName(learnMatch[1]);
        const chipIdx = (state.player.passiveChips || []).indexOf(passiveId);
        if (!passiveId || chipIdx === -1) return passiveScreen(state.player);
        const player = { ...state.player, passiveChips: [...state.player.passiveChips] };
        player.passiveChips.splice(chipIdx, 1);
        const result = learnPassive(player, passiveId);
        if (!result.ok) return passiveScreen(player, 'Чип не подошёл — уже изучено.\n\n');
        return passiveScreen(player, `Изучено: ${PASSIVE_SKILLS[passiveId].name}.\n\n`);
      }

      const equipMatch = /^Экипировать: (.+)$/.exec(input);
      if (equipMatch) {
        const passiveId = findByName(equipMatch[1]);
        if (!passiveId) return passiveScreen(state.player);
        const player = { ...state.player };
        const result = equipPassive(player, passiveId);
        if (!result.ok) {
          const reasonText = result.reason === 'NO_FREE_SLOT' ? 'нет свободных слотов — сначала сними что-то другое.' : 'не получилось.';
          return passiveScreen(state.player, `Не удалось экипировать: ${reasonText}\n\n`);
        }
        return passiveScreen(player);
      }

      const unequipMatch = /^Снять: (.+)$/.exec(input);
      if (unequipMatch) {
        const passiveId = findByName(unequipMatch[1]);
        if (!passiveId) return passiveScreen(state.player);
        const player = { ...state.player };
        unequipPassive(player, passiveId);
        return passiveScreen(player);
      }

      return passiveScreen(state.player);
    }

    case SCENES.LORE_MYTHOS: {
      if (input === '⬅️ Назад') {
        return bridgeScreen(state.player);
      }
      if (input === 'Гипотезы') {
        return stepShyopotQuest(state.player, null);
      }
      const fragMatch = /^Собрать: (.+)$/.exec(input);
      const fragment = fragMatch ? TRAKT_FRAGMENTS.find((f) => f.shortName === fragMatch[1]) : null;
      if (fragment) {
        const player = { ...state.player };
        const res = collectFragment(player, fragment.id);
        if (res.success) {
          let text = `✨ Фрагмент собран: ${fragment.name}\n\n${fragment.lore}\n\n`;
          const ending = getEnding(player);
          const totalCollected = (player.lore?.fragments || []).length;
          if (ending) {
            text += `🌌 ВСЕ ФРАГМЕНТЫ СОБРАНЫ\n\n${ending.name}\n${ending.text}\n\n`;
          } else if (totalCollected === TRAKT_FRAGMENTS.length) {
            text += `🌌 Все 7 фрагментов собраны, но твоя гипотеза ещё не ясна — загляни в «Гипотезы».\n\n`;
          }
          return mythosScreen(player, text);
        }
      }
      return mythosScreen(state.player);
    }

    case SCENES.QUEST_SHYOPOT: {
      if (input === '⬅️ Назад') {
        return mythosScreen(state.player);
      }
      return stepShyopotQuest(state.player, input);
    }

    default:
      return null;
  }
}

module.exports = { handleBridge, mythosScreen, bridgeScreen, stepShyopotQuest };
