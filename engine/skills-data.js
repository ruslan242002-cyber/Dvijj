/**
 * Набор из 8 навыков — представительная выборка формул из дизайн-документа,
 * переименованные под сеттинг "Периферии". Формулы принимают "attacker"
 * (объект Fighter) и возвращают базовое число до крита и брони.
 *
 * description — короткая флейвор-строка, показывается на сайте-профиле
 * при выборе экипированных умений.
 * shieldPierce — навык игнорирует указанную долю экранирования цели НА
 * ЭТОТ УДАР (не накапливается, не остаётся после боя).
 * shieldShred — навык СНИЖАЕТ экранирование цели на фиксированное число
 * пунктов НАВСЕГДА до конца боя (настоящая коррозия, а не разовый укол).
 */
'use strict';

const SKILLS = {
  plasma_bolt: {
    id: 'plasma_bolt', name: 'Плазменный залп', station: 'Арсенал', cd: 3,
    description: 'Сгусток плазмы, дожигающий цель ещё три хода после попадания.',
    usesFocus: true, damaging: true,
    formula: (a) => a.stats.firepower * 0.7 + a.stats.mind * 0.5 + a.stats.reaction * 0.3,
    applyDot: { type: 'dot', amount: 12, turnsLeft: 3 }
  },
  anima_drain: {
    id: 'anima_drain', name: 'Психонический разрыв', station: 'Вуаль', cd: 3,
    description: 'Чистый урон психоникой Вуали, четверть которого возвращается тебе как HP.',
    usesFocus: true, damaging: true, pure: true, lifestealPct: 0.25,
    formula: (a) => a.stats.reaction * 0.7 + a.stats.endurance * 0.5 + a.stats.power * 0.6
  },
  living_heat: {
    id: 'living_heat', name: 'Полевой ремонт', station: 'Терминус', cd: 3,
    description: 'Одновременно чистый урон по врагу и заметное самоисцеление — фирменный приём Терминуса.',
    usesFocus: true, damaging: true, pure: true, selfHealPct: 0.15,
    formula: (a) => a.hpMax * 0.12
  },
  overload: {
    id: 'overload', name: 'Перегрузка реактора', station: 'Арсенал', cd: 3,
    description: 'Один мощный удар на пределе возможностей скафандра — без побочных эффектов, просто много урона.',
    usesFocus: true, damaging: true,
    formula: (a) => a.stats.power * 1.3 + a.stats.endurance * 0.9
  },
  corrosion: {
    id: 'corrosion', name: 'Коррозийный заряд', station: 'Вуаль', cd: 3,
    description: 'Разъедает экранирование цели навсегда до конца боя — каждое попадание после этого бьёт больнее.',
    usesFocus: true, damaging: true, shieldShred: 6,
    formula: (a) => a.stats.reaction * 0.85
  },
  heal_field: {
    id: 'heal_field', name: 'Нанитовое исцеление', station: 'Приют', cd: 3,
    description: 'Рой ремонтных нанитов восстанавливает больше трети максимального HP. Урона не наносит.',
    usesFocus: true, damaging: false, selfHealPct: 0.35,
    formula: () => 0
  },
  monowire: {
    id: 'monowire', name: 'Мононить', station: 'Арсенал', cd: 2,
    description: 'Нить в молекулу толщиной проходит сквозь треть экранирования цели на этот удар.',
    usesFocus: true, damaging: true, shieldPierce: 0.33,
    formula: (a) => a.stats.reaction * 1.1 + a.stats.endurance * 0.75
  },
  ritual_mark: {
    id: 'ritual_mark', name: 'Метка Тракта', station: 'Вуаль', cd: 3,
    description: 'Чистый урон, оставляющий на цели резонансную метку — ещё пара тиков урона после удара.',
    usesFocus: true, damaging: true, pure: true,
    formula: (a) => a.stats.endurance * 0.6 + a.stats.power * 0.6 + a.stats.reaction * 0.4,
    applyDot: { type: 'dot', amount: 8, turnsLeft: 2 }
  }
};

/** Стим-пакеты — аналог инъекторов из части VII дизайн-документа */
const STIMS = {
  field_stim: { id: 'field_stim', name: 'Полевой стим-пакет', description: 'Базовое лечение — быстро и без побочных эффектов.', healPct: 0.25, healFlat: 60 },
  nano_regen: { id: 'nano_regen', name: 'Нанопакет регенерации', description: 'Не лечит сразу, но даёт заметный реген на несколько ходов.', applyDot: { type: 'hot', amount: 18, turnsLeft: 4 } },
  aim_chip: { id: 'aim_chip', name: 'Прицельный чип', description: 'Повышает шанс попадания умений в этом бою.', focusMod: 0.15 },
  targeting_stab: { id: 'targeting_stab', name: 'Стабилизатор наводки', description: 'Повышает точность обычных атак в этом бою.', accuracyMod: 0.15 },
  emergency_stim: { id: 'emergency_stim', name: 'Аварийный стим', description: 'Крупное разовое лечение плюс реген следом — тяжёлая артиллерия медотсека.', healPct: 0.40, healFlat: 210, applyDot: { type: 'hot', amount: 18, turnsLeft: 4 } },
  exo_frame: { id: 'exo_frame', name: 'Экзо-каркас', description: 'Разово увеличивает максимальный запас HP на 50% вместе с текущим.', hpMultiplier: 1.5 },
  shield_field: { id: 'shield_field', name: 'Защитное поле', description: 'Снижает весь входящий урон на четверть до конца боя.', incomingDmgMod: 0.75 },
  overclock: { id: 'overclock', name: 'Оверклок реактора', description: 'Обоюдоострый бонус: больше урона наносишь, но и получаешь больше.', incomingDmgMod: 1.25, outgoingDmgMod: 1.25 }
};

module.exports = { SKILLS, STIMS };
