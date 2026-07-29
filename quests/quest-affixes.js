'use strict';

const QUEST_AFFIXES = {
  swarm: {
    id: 'swarm', name: 'Рой',
    description: 'Целей на 50% больше, но каждая слабее.',
    appliesTo: ['kill'], countMultiplier: 1.5, rewardMultiplier: 1.1,
  },
  irradiated_loop: {
    id: 'irradiated_loop', name: 'Заражённый контур',
    description: 'Квест ощутимо поднимает облучение, зато награда за него выше.',
    appliesTo: ['explore', 'fetch'], radiationBonus: 15, rewardMultiplier: 1.3,
  },
  trakt_shadow: {
    id: 'trakt_shadow', name: 'Тень Тракта',
    description: 'Ещё больше облучения, но заметно выше шанс редкой находки.',
    appliesTo: ['explore'], radiationBonus: 25, rareChanceBonus: 0.15,
  },
  rift: {
    id: 'rift', name: 'Разлом',
    description: 'Доступен только группе, награда делится, но базовая ценность лута выше.',
    appliesTo: ['kill', 'explore'], requiresGroup: true, rewardMultiplier: 1.6,
  },
  resonance_surge: {
    id: 'resonance_surge', name: 'Резонансный всплеск',
    description: 'Двойной опыт, но случайные события на локации срабатывают вдвое чаще.',
    appliesTo: ['kill', 'fetch', 'explore'], xpMultiplier: 2, eventChanceMultiplier: 2,
  },
  stealth: {
    id: 'stealth', name: 'Скрытность',
    description: 'Полная награда — только если квест пройден без единого боя.',
    appliesTo: ['fetch', 'explore'], noCombatBonus: true, rewardMultiplier: 1.4,
  },
};

function applyAffix(baseQuest, affixId) {
  const affix = QUEST_AFFIXES[affixId];
  if (!affix) return baseQuest;
  if (!affix.appliesTo.includes(baseQuest.type)) return baseQuest;

  const quest = { ...baseQuest, affixId, reward: { ...baseQuest.reward } };

  if (affix.countMultiplier && quest.count) quest.count = Math.round(quest.count * affix.countMultiplier);
  if (affix.rewardMultiplier && quest.reward.credits) quest.reward.credits = Math.round(quest.reward.credits * affix.rewardMultiplier);
  if (affix.xpMultiplier && quest.reward.xp) quest.reward.xp = Math.round(quest.reward.xp * affix.xpMultiplier);
  if (affix.radiationBonus) quest.radiationBonus = affix.radiationBonus;
  if (affix.rareChanceBonus) quest.rareChanceBonus = affix.rareChanceBonus;
  if (affix.requiresGroup) quest.requiresGroup = true;
  if (affix.noCombatBonus) quest.noCombatBonus = true;

  return quest;
}

function rollAffixFor(questType, rng = Math.random) {
  const candidates = Object.values(QUEST_AFFIXES).filter((a) => a.appliesTo.includes(questType));
  if (candidates.length === 0) return null;
  if (rng() < 0.5) return null;
  return candidates[Math.floor(rng() * candidates.length)];
}

module.exports = { QUEST_AFFIXES, applyAffix, rollAffixFor };
