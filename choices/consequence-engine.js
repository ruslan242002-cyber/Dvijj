'use strict';
const CONSEQUENCE_TRIGGERS = {
  'priyut_1_missing:corruption': {
    immediate: { flag: 'touched_abyss', maxHpPenalty: 10 },
    futureEvents: ['anomaly_whisper', 'abyss_dreams'],
    factionReaction: { 'Вуаль': +15, 'Приют': -5 },
  },
  'priyut_1_missing:report': {
    immediate: { reputation: 20, flag: 'has_evidence' },
    futureEvents: ['truth_hunters', 'cover_up_attempt'],
    factionReaction: { 'Приют': +10, 'Терминус': +5 },
  },
  'echo_allied': {
    immediate: { skill: 'psychic_call', reputation: -20 },
    worldChange: { echoBehavior: 'friendly_to_player' },
    futureEvents: ['echo_ritual', 'collective_memory'],
    locks: ['terminus_purity_quests'],
  },
  'betrayal_confirmed': {
    immediate: { flag: 'knows_truth' },
    worldChange: { stationTension: 'high' },
    futureEvents: ['civil_war_rumors', 'curator_assassination'],
    unlocks: ['ending_exposure'],
  },
  // Ниже — добавлены для events/dynamic-events.js (изначально в архиве
  // choices/consequence-engine.js этих записей не было — динамические
  // события ссылались на consequenceId, которых здесь не существовало,
  // из-за чего флаг никогда не выставлялся и событие крутилось заново
  // до бесконечности — реальный баг, найденный по скриншоту зацикливания).
  'stranded_rescued': {
    immediate: { flag: 'saved_stranded', credits: 100, reputation: 5 },
  },
  'stranded_ignored': {
    immediate: { flag: 'ignored_stranded' },
  },
  'curator_message_seen': {
    immediate: { flag: 'curator_message_seen' },
  },
  'anomaly_whisper_seen_flee': {
    immediate: { flag: 'anomaly_whisper_seen', flag2: 'echo_mercy' },
  },
};

function applyConsequence(state, choiceId) {
  const consequence = CONSEQUENCE_TRIGGERS[choiceId];
  if (!consequence) return state;
  if (consequence.immediate) {
    if (consequence.immediate.flag) { state.flags = state.flags || {}; state.flags[consequence.immediate.flag] = true; }
    if (consequence.immediate.flag2) { state.flags = state.flags || {}; state.flags[consequence.immediate.flag2] = true; }
    if (consequence.immediate.reputation) { state.player.reputation = (state.player.reputation || 0) + consequence.immediate.reputation; }
    if (consequence.immediate.credits) { state.player.credits = (state.player.credits || 0) + consequence.immediate.credits; }
    if (consequence.immediate.maxHpPenalty) { state.player.hpMax = (state.player.hpMax || 220) - consequence.immediate.maxHpPenalty; }
  }
  if (consequence.worldChange) { state.worldState = state.worldState || {}; Object.assign(state.worldState, consequence.worldChange); }
  if (consequence.locks) { state.quests = state.quests || {}; state.quests.locked = [...(state.quests.locked || []), ...consequence.locks]; }
  if (consequence.unlocks) { state.quests = state.quests || {}; state.quests.unlockedEndings = [...(state.quests.unlockedEndings || []), ...consequence.unlocks]; }
  if (consequence.factionReaction) {
    state.factionStanding = state.factionStanding || {};
    for (const [faction, delta] of Object.entries(consequence.factionReaction)) {
      state.factionStanding[faction] = (state.factionStanding[faction] || 0) + delta;
    }
  }
  return state;
}

function getWorldState(state) { return state.worldState || { echoBehavior: 'hostile', stationTension: 'normal' }; }
function isQuestLocked(state, questId) { return (state.quests?.locked || []).includes(questId); }

module.exports = { CONSEQUENCE_TRIGGERS, applyConsequence, getWorldState, isQuestLocked };
