'use strict';

/**
 * ПЕРЕБАЛАНС УМЕНИЙ — было по 4 у Арсенала/Вуали и по 2 у Терминуса/
 * Приюта (реальный подсчёт по станциям в старом файле), плюс Приют и
 * Терминус единственные держали гибриды урон+лечение, а два "боевых"
 * клана — чистый урон в четырёх вариантах. Теперь у каждой станции РОВНО
 * 3 умения, открывающихся по уровню персонажа (1 / 15 / 30 — не по
 * репутации фракции, как было раньше через requiresRank):
 *
 *   Приют    — ЧИСТАЯ поддержка, три умения, НИ ОДНО не наносит урона.
 *              Компенсируется тем, что "Обычная атака" всегда доступна —
 *              Приют не беззащитен, он просто не полагается на умения
 *              ради урона, а полагается на них ради выживания.
 *   Терминус — урон + периодический эффект + пробитие брони (дисциплина).
 *   Арсенал  — чистая грубая огневая мощь, без спецэффектов вообще.
 *   Вуаль    — урон + разрушение/пробитие брони цели (РЭБ, инженерия).
 *
 * Ни у кого, кроме Приюта, нет лечения — единственная поддержка-фракция
 * теперь ОДНА, а не "у двоих есть немного лечения, у остальных нет".
 */

const SKILLS = {
  // ── Приют: чистая поддержка ──
  heal_field: {
    id: 'heal_field', name: 'Нанитовое исцеление', station: 'Приют', unlockLevel: 1,
    cd: 3, usesFocus: true, damaging: false, selfHealPct: 0.35,
    formula: () => 0,
  },
  field_repair: {
    id: 'field_repair', name: 'Полевой ремонт', station: 'Приют', unlockLevel: 15,
    cd: 2, usesFocus: true, damaging: false, selfHealPct: 0.20,
    formula: () => 0,
  },
  oath_of_priyut: {
    id: 'oath_of_priyut', name: 'Клятва куратора', station: 'Приют', unlockLevel: 30,
    cd: 4, usesFocus: true, damaging: false, selfHealPct: 0.55,
    formula: () => 0,
  },

  // ── Терминус: урон + периодический эффект + дисциплина (пробитие) ──
  living_heat: {
    id: 'living_heat', name: 'Растворение в помехах', station: 'Терминус', unlockLevel: 1,
    cd: 3, usesFocus: true, damaging: true, pure: true,
    formula: (a) => a.hpMax * 0.14,
  },
  monowire: {
    id: 'monowire', name: 'Мононить', station: 'Терминус', unlockLevel: 15,
    cd: 2, usesFocus: true, damaging: true, shieldPierce: 0.33,
    formula: (a) => a.stats.reaction * 1.1 + a.stats.endurance * 0.75,
  },
  voice_from_shadow: {
    id: 'voice_from_shadow', name: 'Голос из тени', station: 'Терминус', unlockLevel: 30,
    cd: 4, usesFocus: true, damaging: true, pure: true,
    formula: (a) => a.stats.reaction * 1.3 + a.stats.mind * 0.8,
    applyDot: { type: 'dot', amount: 15, turnsLeft: 3 },
  },

  // ── Арсенал: чистая грубая огневая мощь, без спецэффектов ──
  plasma_bolt: {
    id: 'plasma_bolt', name: 'Плазменный залп', station: 'Арсенал', unlockLevel: 1,
    cd: 3, usesFocus: true, damaging: true,
    formula: (a) => a.stats.firepower * 0.7 + a.stats.mind * 0.5 + a.stats.reaction * 0.3,
    applyDot: { type: 'dot', amount: 12, turnsLeft: 3 },
  },
  overload: {
    id: 'overload', name: 'Перегрузка реактора', station: 'Арсенал', unlockLevel: 15,
    cd: 3, usesFocus: true, damaging: true,
    formula: (a) => a.stats.power * 1.3 + a.stats.endurance * 0.9,
  },
  absolute_volley: {
    id: 'absolute_volley', name: 'Абсолютный залп', station: 'Арсенал', unlockLevel: 30,
    cd: 4, usesFocus: true, damaging: true,
    formula: (a) => a.stats.firepower * 1.8 + a.stats.power * 1.2,
  },

  // ── Вуаль: урон + разрушение/пробитие брони цели ──
  corrosion: {
    id: 'corrosion', name: 'Вирус-инъекция', station: 'Вуаль', unlockLevel: 1,
    cd: 3, usesFocus: true, damaging: true, shieldShred: 6,
    formula: (a) => a.stats.reaction * 0.85,
  },
  ritual_mark: {
    id: 'ritual_mark', name: 'Метка Тракта', station: 'Вуаль', unlockLevel: 15,
    cd: 3, usesFocus: true, damaging: true, pure: true,
    formula: (a) => a.stats.endurance * 0.6 + a.stats.power * 0.6 + a.stats.reaction * 0.4,
    applyDot: { type: 'dot', amount: 8, turnsLeft: 2 },
  },
  steel_discipline: {
    id: 'steel_discipline', name: 'Стальная дисциплина', station: 'Вуаль', unlockLevel: 30,
    cd: 4, usesFocus: true, damaging: true, shieldPierce: 0.5, shieldShred: 10,
    formula: (a) => a.stats.power * 1.0 + a.stats.reaction * 1.0,
  },
};

const STIMS = {
  field_stim: { id: 'field_stim', name: 'Полевой стим-пакет', healPct: 0.25, healFlat: 60 },
  nano_regen: { id: 'nano_regen', name: 'Нанопакет регенерации', applyDot: { type: 'hot', amount: 18, turnsLeft: 4 } },
  aim_chip: { id: 'aim_chip', name: 'Прицельный чип', focusMod: 0.15 },
  targeting_stab: { id: 'targeting_stab', name: 'Стабилизатор наводки', accuracyMod: 0.15 },
  emergency_stim: { id: 'emergency_stim', name: 'Аварийный стим', healPct: 0.40, healFlat: 210, applyDot: { type: 'hot', amount: 18, turnsLeft: 4 } },
  exo_frame: { id: 'exo_frame', name: 'Экзо-каркас', hpMultiplier: 1.5 },
  shield_field: { id: 'shield_field', name: 'Защитное поле', incomingDmgMod: 0.75 },
  overclock: { id: 'overclock', name: 'Оверклок реактора', incomingDmgMod: 1.25, outgoingDmgMod: 1.25 },
};

function unlockedSkillsForPlayer(faction, level) {
  return Object.values(SKILLS)
    .filter((s) => s.station === faction && level >= s.unlockLevel)
    .sort((a, b) => a.unlockLevel - b.unlockLevel);
}

module.exports = { SKILLS, STIMS, unlockedSkillsForPlayer };
