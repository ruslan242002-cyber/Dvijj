/**
 * Набор из 8 навыков — представительная выборка формул из дизайн-документа
 * (аналоги Плазменного шара, Вытягивания анимы, Живого жара и т.д.),
 * переименованные под сеттинг "Периферии". Формулы принимают "attacker"
 * (объект Fighter) и возвращают базовое число до крита и брони.
 */
'use strict';

const SKILLS = {
  plasma_bolt: {
    id: 'plasma_bolt', name: 'Плазменный залп', station: 'Арсенал', cd: 3,
    usesFocus: true, damaging: true,
    formula: (a) => a.stats.firepower * 0.7 + a.stats.mind * 0.5 + a.stats.reaction * 0.3,
    applyDot: { type: 'dot', amount: 12, turnsLeft: 3 }
  },
  anima_drain: {
    id: 'anima_drain', name: 'Вытягивание анимы', station: 'Вуаль', cd: 3,
    usesFocus: true, damaging: true, pure: true, lifestealPct: 0.25,
    formula: (a) => a.stats.reaction * 0.7 + a.stats.endurance * 0.5 + a.stats.power * 0.6
  },
  living_heat: {
    id: 'living_heat', name: 'Живой жар', station: 'Терминус', cd: 3,
    usesFocus: true, damaging: true, pure: true, selfHealPct: 0.15,
    formula: (a) => a.hpMax * 0.12
  },
  overload: {
    id: 'overload', name: 'Перегрузка реактора', station: 'Арсенал', cd: 3,
    usesFocus: true, damaging: true,
    formula: (a) => a.stats.power * 1.3 + a.stats.endurance * 0.9
  },
  corrosion: {
    id: 'corrosion', name: 'Коррозийный заряд', station: 'Вуаль', cd: 3,
    usesFocus: true, damaging: true,
    formula: (a) => a.stats.reaction * 0.85
    // доп. эффект «-33% экранирования цели» применяется отдельно в вызывающем коде при желании
  },
  heal_field: {
    id: 'heal_field', name: 'Полевое исцеление', station: 'Приют', cd: 3,
    usesFocus: true, damaging: false, selfHealPct: 0.35,
    formula: () => 0
  },
  monowire: {
    id: 'monowire', name: 'Мононить', station: 'Арсенал', cd: 2,
    usesFocus: true, damaging: true,
    formula: (a) => a.stats.reaction * 1.1 + a.stats.endurance * 0.75
    // навык игнорирует часть экранирования — см. shieldPierce в вызывающем коде
    , shieldPierce: 0.33
  },
  ritual_mark: {
    id: 'ritual_mark', name: 'Ритуальная метка', station: 'Вуаль', cd: 3,
    usesFocus: true, damaging: true, pure: true,
    formula: (a) => a.stats.endurance * 0.6 + a.stats.power * 0.6 + a.stats.reaction * 0.4
  }
};

/** Стим-пакеты — аналог инъекторов из части VII дизайн-документа */
const STIMS = {
  field_stim: { id: 'field_stim', name: 'Полевой стим-пакет', healPct: 0.25, healFlat: 60 },
  nano_regen: { id: 'nano_regen', name: 'Нанопакет регенерации', applyDot: { type: 'hot', amount: 18, turnsLeft: 4 } },
  aim_chip: { id: 'aim_chip', name: 'Прицельный чип', focusMod: 0.15 },
  targeting_stab: { id: 'targeting_stab', name: 'Стабилизатор наводки', accuracyMod: 0.15 },
  emergency_stim: { id: 'emergency_stim', name: 'Аварийный стим', healPct: 0.40, healFlat: 210, applyDot: { type: 'hot', amount: 18, turnsLeft: 4 } },
  exo_frame: { id: 'exo_frame', name: 'Экзо-каркас', hpMultiplier: 1.5 },
  shield_field: { id: 'shield_field', name: 'Защитное поле', incomingDmgMod: 0.75 },
  overclock: { id: 'overclock', name: 'Оверклок реактора', incomingDmgMod: 1.25, outgoingDmgMod: 1.25 }
};

module.exports = { SKILLS, STIMS };
