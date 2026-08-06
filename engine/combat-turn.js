'use strict';
const { resolveTurn } = require('./combat-engine');
const { STIMS } = require('./skills-data');
/**
* Резолвит один ход игрока против врага, включая опциональный стим —
* ровно один раз за бой. router.js должен звать ЭТУ функцию из
* case 'combat' вместо голого resolveTurn(), передавая
* state.stimUsedThisFight из текущей сцены боя, и state.zone — для
* зональных модификаторов боя (см. engine/combat-engine.js).
*
* Возвращает { ...результат resolveTurn, stimUsedThisFight } — это
* поле нужно сохранить в nextState боя, чтобы кнопка "Стим" пропала
* до конца боя, как только он использован.
*
* Если stimId передан, но стим уже использован в этом бою — стим
* молча игнорируется (ход всё равно проходит как обычная атака/навык),
* а не отклоняется с ошибкой: защита от гонки двойного нажатия важнее
* строгости здесь.
*/
function resolvePlayerTurn({ player, enemy, skill, stimId, stimUsedThisFight, zone, rng = Math.random }) {
const stim = !stimUsedThisFight && stimId ? STIMS[stimId] : null;
const result = resolveTurn({ attacker: player, defender: enemy, skill, stim, zone, rng });
return {
...result,
stimUsedThisFight: stimUsedThisFight || !!stim,
};
}
module.exports = { resolvePlayerTurn, attemptFlee, FLEE_BASE_CHANCE };

/**
* ОТСТУПЛЕНИЕ ИЗ 1v1 — по разбору доп. улучшений: сейчас в обычном бою
* нет способа выйти, если игрок явно проигрывает (эвакуация есть только
* из вылазки целиком, engine/evacuation.js, это другое — эвакуация
* прерывает всю вылазку, не текущий конкретный бой). attemptFlee() даёт
* шанс сбежать ИЗ БОЯ без урона себе, основанный на reaction обеих
* сторон — быстрый боец убегает от медленного чаще. Если побег не удался,
* ход не тратится впустую: враг всё равно бьёт (одна попытка = один ход).
*/
const FLEE_BASE_CHANCE = 0.5;
function fleeChance(player, enemy) {
const playerReaction = player.stats?.reaction ?? 10;
const enemyReaction = enemy.stats?.reaction ?? 10;
// Разница в reaction сдвигает базовый шанс — быстрый персонаж убегает
// от медленного врага чаще 50%, и наоборот.
const delta = (playerReaction - enemyReaction) * 0.01;
return Math.max(0.1, Math.min(0.9, FLEE_BASE_CHANCE + delta));
}
function attemptFlee({ player, enemy, rng = Math.random }) {
const chance = fleeChance(player, enemy);
const escaped = rng() < chance;
if (escaped) {
return { escaped: true, log: ['Удаётся оторваться и выйти из боя без потерь.'] };
}
// Побег не удался — враг получает свободный ход (та же resolveTurn,
// но attacker/defender развёрнуты, без skill/stim у игрока на этот ход).
const { resolveTurn } = require('./combat-engine');
const result = resolveTurn({ attacker: enemy, defender: player, rng });
return { escaped: false, log: ['Не удаётся оторваться — враг этим пользуется.', ...result.log], result };
}
