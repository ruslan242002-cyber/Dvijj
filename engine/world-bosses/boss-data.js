'use strict';

/**
 * АДАПТЕР К РЕАЛЬНЫМ 11 БОССАМ (engine/world-bosses/boss-data.js) —
 * тот файл описывает боссов в форме, нужной новой фазовой системе
 * (boss-phase-engine.js/group-encounter.js): hp, groupSizeExpected как
 * строка, loot без прямой валюты кредитов/опыта.
 *
 * Этот файл — findBoss() в форме, которую УЖЕ ожидает существующий
 * bosses/boss-engine.js (написан раньше, до появления реальных боссов,
 * под единственную тестовую заглушку test_colossus): hpPool,
 * minParticipants как число, reward.credits/reward.xp.
 *
 * Ничего не дублирует — просто переупаковка при экспорте, источник
 * данных один (engine/world-bosses/boss-data.js).
 *
 * ПРОВЕРЬ: credits/xp награда — моя оценка (hp × коэффициент), у боссов
 * в карточках была только уникальная лут-валюта, не прямая. Подставил
 * credits ≈ hp×0.3, xp ≈ hp×0.15 — грубо соответствует целевой
 * экономике ~1000-2000 ценности/час на активного игрока, поправь если
 * ощущается разбалансированным.
 */
const { BOSSES: REAL_BOSSES } = require('../engine/world-bosses/boss-data.js');

function parseMinParticipants(groupSizeExpected) {
  const m = /^(\d+)/.exec(groupSizeExpected || '1');
  return m ? Number(m[1]) : 1;
}

const BOSSES = {};
for (const [id, boss] of Object.entries(REAL_BOSSES)) {
  BOSSES[id] = {
    id,
    name: boss.name,
    lore: boss.subtitle,
    location: boss.location,
    faction: boss.faction,
    threatLevel: boss.threatLevel,
    hpPool: boss.hp,
    hp: boss.hp,
    hpMax: boss.hp,
    stats: boss.stats,
    luck: boss.luck,
    accuracy: boss.accuracy,
    dodge: boss.dodge,
    focus: boss.focus,
    resistances: boss.resistances,
    minParticipants: parseMinParticipants(boss.groupSizeExpected),
    soloViable: boss.soloViable,
    // respawn.hours===null (3 босса) — расписания нет вообще, появление
    // должно триггериться отдельным игровым событием, не таймером; здесь
    // подставляем условно большое окно, чтобы остальной код (который
    // читает respawnMinHours/MaxHours как числа) не падал — реального
    // авто-респавна для этих 3 не будет, пока не подключено событие.
    respawnMinHours: boss.respawn.hours ?? 999999,
    respawnMaxHours: boss.respawn.hours ?? 999999,
    respawnWindow: boss.respawn.window || null,
    reward: {
      credits: Math.round(boss.hp * 0.3),
      xp: Math.round(boss.hp * 0.15),
    },
    loot: boss.loot,
    skills: boss.skills,
    aggression: boss.aggression || 'hostile',
  };
}

function findBoss(bossId) {
  return BOSSES[bossId] || null;
}

function allBossIds() {
  return Object.keys(BOSSES);
}

module.exports = { BOSSES, findBoss, allBossIds };
