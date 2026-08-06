'use strict';
const { addFactionReputation } = require('../engine/reputation.js');
/**
* РЕПУТАЦИЯ: раньше immediate.reputation писал в общее player.reputation
* без привязки к фракции. Теперь каждый триггер явно указывает faction —
* приписано по контексту квеста/выбора (priyut_1_missing:report — это
* Приют, echo_allied идёт против Терминуса/Шёпота, отсюда штраф именно
* Терминусу). factionReaction (было и раньше) продолжает работать как
* было — это уже был per-faction механизм, не трогаю его форму.
*/
const CONSEQUENCE_TRIGGERS = {
'priyut_1_missing:corruption': {
immediate: { flag: 'touched_abyss', maxHpPenalty: 10 },
futureEvents: ['anomaly_whisper', 'abyss_dreams'],
factionReaction: { 'Вуаль': +15, 'Приют': -5 }
},
'priyut_1_missing:report': {
immediate: { flag: 'has_evidence', factionReputation: { faction: 'Приют', amount: 20 } },
futureEvents: ['truth_hunters', 'cover_up_attempt'],
factionReaction: { 'Приют': +10, 'Терминус': +5 }
},
'echo_allied': {
immediate: { skill: 'psychic_call', factionReputation: { faction: 'Терминус', amount: -20 } },
worldChange: { echoBehavior: 'friendly_to_player' },
futureEvents: ['echo_ritual', 'collective_memory'],
locks: ['terminus_purity_quests']
},
'betrayal_confirmed': {
immediate: { flag: 'knows_truth' },
worldChange: { stationTension: 'high' },
futureEvents: ['civil_war_rumors', 'curator_assassination'],
unlocks: ['ending_exposure']
}
};
function applyConsequence(state, choiceId) {
const consequence = CONSEQUENCE_TRIGGERS[choiceId];
if (!consequence) return state;
if (consequence.immediate) {
if (consequence.immediate.flag) { state.flags = state.flags || {}; state.flags[consequence.immediate.flag] = true; }
if (consequence.immediate.factionReputation) {
const { faction, amount } = consequence.immediate.factionReputation;
addFactionReputation(state.player, faction, amount);
}
if (consequence.immediate.maxHpPenalty) { state.player.hpMax = (state.player.hpMax || 220) - consequence.immediate.maxHpPenalty; state.player.hp = Math.min(state.player.hp, state.player.hpMax); }
}
if (consequence.worldChange) { state.worldState = state.worldState || {}; Object.assign(state.worldState, consequence.worldChange); }
if (consequence.locks) { state.quests = state.quests || {}; state.quests.locked = [...(state.quests.locked || []), ...consequence.locks]; }
if (consequence.unlocks) { state.quests = state.quests || {}; state.quests.unlockedEndings = [...(state.quests.unlockedEndings || []), ...consequence.unlocks]; }
if (consequence.factionReaction) {
state.factionStanding = state.factionStanding || {};
for (const [faction, delta] of Object.entries(consequence.factionReaction)) { state.factionStanding[faction] = (state.factionStanding[faction] || 0) + delta; }
}
return state;
}
function getWorldState(state) { return state.worldState || { echoBehavior: 'hostile', stationTension: 'low', traktStatus: 'broken' }; }
function isQuestLocked(state, questId) { return (state.quests?.locked || []).includes(questId); }
module.exports = { CONSEQUENCE_TRIGGERS, applyConsequence, getWorldState, isQuestLocked };
