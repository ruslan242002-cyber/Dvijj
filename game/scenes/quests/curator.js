'use strict';/**
* Диалоговые квесты арок кураторов (storylines/curator-arcs.js) —
* интерпретирует stage-объекты (text/choices/isCombat/winNext/loseNext/
* reward/terminal) напрямую, не через quests/quest-engine.js (тот рассчитан
* на более простой формат без боя/наград, см. shyopot-hypotheses.js).
*/
const { getArcForFaction } = require('../../../storylines/curator-arcs.js');
const { imageForEnemy } = require('../../enemy-images.js');
const { imageForCurator } = require('../../curator-images.js');
const { hubMessage, stationButtons } = require('../common.js');
const { addFactionReputation } = require('../../../engine/reputation.js');
const { SCENES } = require('../ids.js');
function renderCuratorStage(player, questId, stageId) {
const arc = getArcForFaction(player.faction);
const quest = arc?.quests.find((q) => q.id === questId);
if (!quest || !quest.stages[stageId]) return null;
return { arc, quest, stage: quest.stages[stageId] };
}
function curatorQuestScreen(deps, player, questId, stageId) {
const found = renderCuratorStage(player, questId, stageId);
if (!found) {
return { reply: { text: hubMessage(player), buttons: stationButtons(deps, player) }, nextState: { scene: 'station', player } };
}
const { stage } = found;
const text = (stage.text || '').replace(/\$\{playerName\}/g, player.name || '');
if (stage.isCombat) {
return {
reply: { text, buttons: [' Атаковать', 'Отступить'], imageKey: imageForEnemy(stage.enemy.name) },
nextState: { scene: 'pre_combat', player, enemy: { ...stage.enemy, periodic: [] }, curatorQuest: { questId, winNext: stage.winNext, loseNext: stage.loseNext } }
};
}
if (stage.terminal) {
const nextPlayer = { ...player };
const rewardLines = [];
if (stage.reward) {
if (stage.reward.reputation) { addFactionReputation(nextPlayer, nextPlayer.faction, stage.reward.reputation); rewardLines.push(` ${stage.reward.reputation > 0 ? '+' : ''}${stage.reward.reputation} репутации`); }
if (stage.reward.credits) { nextPlayer.credits = (nextPlayer.credits || 0) + stage.reward.credits; rewardLines.push(` +${stage.reward.credits} кредитов`); }
if (stage.reward.statPoints) { nextPlayer.statPoints = (nextPlayer.statPoints || 0) + stage.reward.statPoints; rewardLines.push(` +${stage.reward.statPoints} очков параметров`); }
}
nextPlayer.completedQuests = [...(nextPlayer.completedQuests || [])];
if (!nextPlayer.completedQuests.includes(questId)) nextPlayer.completedQuests.push(questId);
const fullText = rewardLines.length ? `${text}\n\n${rewardLines.join('\n')}` : text;
return { reply: { text: fullText, buttons: [' Назад'], imageKey: imageForCurator(player.faction) }, nextState: { scene: 'station', player: nextPlayer } };}
return {
reply: { text, buttons: (stage.choices || []).map((c) => c.label), imageKey: imageForCurator(player.faction) },
nextState: { scene: 'curator_quest', player, questId, stageId }
};
}
function handleCuratorQuest(state, input, rng, deps) {
const found = renderCuratorStage(state.player, state.questId, state.stageId);
if (!found) {
return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player) }, nextState: { scene: SCENES.STATION, player: state.player } };
}
const choice = (found.stage.choices || []).find((c) => c.label === input);
if (!choice) {
return { reply: { text: found.stage.text, buttons: found.stage.choices.map((c) => c.label), imageKey: imageForCurator(state.player.faction) }, nextState: state };
}
const nextPlayer = { ...state.player };
if (choice.flags) {
nextPlayer.flags = { ...(nextPlayer.flags || {}), ...choice.flags };
}
return curatorQuestScreen(deps, nextPlayer, state.questId, choice.next);
}
module.exports = { renderCuratorStage, curatorQuestScreen, handleCuratorQuest };
game/scenes/start.js
'use strict';
/**
* Онбординг: приветствие -> позывной -> станция -> тренировочный бой ->
* доклад куратору -> первая продажа хлама -> открытие Врат Тракта.
*/
const { CURATORS, freshPlayer, trainerDrone, sellInventory, addToInventory, stationButtons } = require('./common.js');
const { imageForCurator } = require('../curator-images.js');
const { SCENES } = require('./ids.js');
function handleStart(state, input, rng, deps) {
switch (state.scene) {
case SCENES.START: {
return {
reply: { text: ' ПЕРИФЕРИЯ\n\nТы не должен был очнуться. Спасательная капсула шла на автопилоте три века — с того дня, как Тракт разорвался и выбросил тысячи ковчегов на край известного космоса.\n\nНо что-то разбудило тебя именно сейчас. Не авария. Не таймер. Слабый сигнал — идущий не из капсулы и не со станции, к которой ты пристыковался.\n\nРазберёшься позже. Как тебя записать в журнал станции?', buttons: [] },nextState: { scene: 'ask_name' }
};
}
case SCENES.ASK_NAME: {
if (!input) return { reply: { text: 'Нужен хоть какой-то позывной.', buttons: [] }, nextState: state };
const player = freshPlayer(input, 'Приют');
const curator = CURATORS['Приют'] || 'куратор станции';
const wakeText = `Позывной принят, ${input}.\n\n` +
`Медтехник кивает и уводит тебя дальше по коридору — «стандартная адаптация», как она это называет. Заканчивается коридор смотровой палубой с окнами на внешний Тракт.\n\n` +
`Здесь просыпаются все — Приют первым принимает потерявших память, задолго до того, как кто-то решает, куда двигаться дальше. Остальные станции подождут: доберёшься, когда будешь готов(а).\n\n` +
`Куратор ${curator} встречает новичков лично: «Тракт стёр тебе память, но не стёр рефлексы. Проверим?»`;
return {
reply: { text: wakeText, buttons: [' Атаковать'] },
nextState: { scene: 'pre_combat', player, enemy: trainerDrone(), trainingFight: true }
};
}
case SCENES.ASK_FACTION: {
// Больше не используется в обычном потоке онбординга (выбора
// фракции больше нет — все стартуют в Приюте, см. ASK_NAME выше).
// Оставлено на случай, если где-то в состоянии игрока всё ещё
// всплывёт этот сценарий — не должно происходить, но лучше мягкий
// фолбэк, чем краш.
const player = freshPlayer(state.name || 'Пилот', 'Приют');
return {
reply: { text: `Добро пожаловать в Приют, ${player.name}.`, buttons: [' Атаковать'] },
nextState: { scene: 'pre_combat', player, enemy: trainerDrone(), trainingFight: true }
};
}
case SCENES.QUEST_REPORT: {
const player = { ...state.player, statPoints: (state.player.statPoints || 0) + 1 };
const curator = CURATORS[player.faction] || '';
return {
reply: {
text: `Куратор ${curator}: «Неплохо для начала. Держи премию за инициативу — одно очко параметров сверху». Прежде чем отпустить тебя в космос, пройдёмся по станции — тут всё, что понадобится.`,
buttons: ['Идём'],
imageKey: imageForCurator(player.faction)
},
nextState: { scene: 'quest_shop', player }
};
}
case SCENES.QUEST_SHOP: {
if (!state.player.inventory || state.player.inventory.length === 0) {
const player = { ...state.player };
