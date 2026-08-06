'use strict';
/**
* ПЕРЕБАЛАНС УМЕНИЙ — было по 4 у Арсенала/Вуали и по 2 у Терминуса/
* Приюта (реальный подсчёт по станциям в старом файле), плюс Приют и
* Терминус единственные держали гибриды урон+лечение, а два "боевых"
* клана — чистый урон в четырёх вариантах. Теперь у каждой станции РОВНО
* 3 умения, открывающихся по уровню персонажа (1 / 15 / 30 — не по
* репутации фракции, как было раньше через requiresRank):
*
* Приют — ЧИСТАЯ поддержка, три умения, НИ ОДНО не наносит урона.
* Терминус — урон + периодический эффект + пробитие брони (дисциплина).
* Арсенал — чистая грубая огневая мощь, без спецэффектов вообще.
* Вуаль — урон + разрушение/пробитие брони цели (РЭБ, инженерия).
*
* ОПИСАНИЯ (description) — добавлено по запросу пользователя: короткий
* игровой текст на каждое умение и стим для UI (карточка умения перед
* выбором в бою/на экипировке). Чисто текстовое поле, механику не трогает.
*
* КРИТ ПО УМЕНИЮ (critModifier) — добавлено по разбору доп. улучшений:
* некоторые умения логично критуют чаще/реже своей природы (например
* "Фазовый рывок"-подобные резкие удары — чаще; лечение — не критует
* вообще, у него нет критов по формуле). critModifier — множитель к
* базовому critChance() из combat-engine.js, 1 = как обычная атака,
* применяется в useSkill() (см. патч combat-engine.js ниже по проекту).
*/
const SKILLS = {
// ── Приют: чистая поддержка ──
heal_field: {
id: 'heal_field', name: 'Нанитовое исцеление', station: 'Приют', unlockLevel: 1,
description: 'Рой ремонтных наносборок затягивает раны прямо в бою. Не наносит урона — чистое самолечение на 35% максимального HP.',
cd: 3, usesFocus: true, damaging: false, selfHealPct: 0.35,
formula: () => 0,
},
field_repair: {
id: 'field_repair', name: 'Полевой ремонт', station: 'Приют', unlockLevel: 15,
description: 'Быстрая заплатка на скафандр и рану под ним. Меньше "Нанитового исцеления", зато перезаряжается вдвое быстрее — на случай, если урон идёт волнами.',
cd: 2, usesFocus: true, damaging: false, selfHealPct: 0.20,
formula: () => 0,
},
oath_of_priyut: {
id: 'oath_of_priyut', name: 'Клятва куратора', station: 'Приют', unlockLevel: 30,
description: 'То, чему учит Ирис Вейл своих: раненый не значит проигравший. Мощнейшее самолечение станции — 55% HP разом, ценой самой долгой перезарядки.',
cd: 4, usesFocus: true, damaging: false, selfHealPct: 0.55,
formula: () => 0,
},
// ── Терминус: урон + периодический эффект + дисциплина (пробитие) ──
living_heat: {
id: 'living_heat', name: 'Растворение в помехах', station: 'Терминус', unlockLevel: 1,
description: 'Термальный удар, замаскированный под фоновый шум сектора — бьёт мимо щитов, потому что щиты его попросту не замечают.',
cd: 3, usesFocus: true, damaging: true, pure: true,
formula: (a) => a.hpMax * 0.14,
},
monowire: {
id: 'monowire', name: 'Мононить', station: 'Терминус', unlockLevel: 15,
description: 'Нить тоньше волоса, режущая на молекулярном уровне. Частично игнорирует экранирование цели — броня почти не помогает от неё.',
cd: 2, usesFocus: true, damaging: true, shieldPierce: 0.33,
critModifier: 1.15,
formula: (a) => a.stats.reaction * 1.1 + a.stats.endurance * 0.75,
},
voice_from_shadow: {
id: 'voice_from_shadow', name: 'Голос из тени', station: 'Терминус', unlockLevel: 30,
description: 'То, что слышит Шёпот, когда никто не смотрит — обращено против врага. Пробивает мимо щитов и оставляет цель гореть периодическим уроном ещё 3 хода.',
cd: 4, usesFocus: true, damaging: true, pure: true,
formula: (a) => a.stats.reaction * 1.3 + a.stats.mind * 0.8,
applyDot: { type: 'dot', amount: 15, turnsLeft: 3 },
},
// ── Арсенал: чистая грубая огневая мощь, без спецэффектов ──
plasma_bolt: {
id: 'plasma_bolt', name: 'Плазменный залп', station: 'Арсенал', unlockLevel: 1,
description: 'Базовый удар школы Арсенала: сгусток плазмы, прожигающий обшивку и оставляющий цель тлеть. Просто, надёжно, всегда под рукой.',
cd: 3, usesFocus: true, damaging: true,
formula: (a) => a.stats.firepower * 0.7 + a.stats.mind * 0.5 + a.stats.reaction * 0.3,
applyDot: { type: 'dot', amount: 12, turnsLeft: 3 },
},
overload: {
id: 'overload', name: 'Перегрузка реактора', station: 'Арсенал', unlockLevel: 15,
description: 'Форсирование собственного реактора сверх нормы ради одного разрушительного залпа. Никаких спецэффектов — только грубая сила, помноженная на выносливость стрелка.',
cd: 3, usesFocus: true, damaging: true,
formula: (a) => a.stats.power * 1.3 + a.stats.endurance * 0.9,
},
absolute_volley: {
id: 'absolute_volley', name: 'Абсолютный залп', station: 'Арсенал', unlockLevel: 30,
description: 'Всё, что есть у Арсенала, в одном ударе — вершина философии станции "результат важнее эффектов". Самый большой чистый урон в игре из одного умения.',
cd: 4, usesFocus: true, damaging: true,
critModifier: 1.1,
formula: (a) => a.stats.firepower * 1.8 + a.stats.power * 1.2,
},
// ── Вуаль: урон + разрушение/пробитие брони цели ──
corrosion: {
id: 'corrosion', name: 'Вирус-инъекция', station: 'Вуаль', unlockLevel: 1,
description: 'Наноядовитый инжект разъедает экранирование цели изнутри — не столько урон здесь и сейчас, сколько подготовка почвы для следующих ударов.',
cd: 3, usesFocus: true, damaging: true, shieldShred: 6,
formula: (a) => a.stats.reaction * 0.85,
},
ritual_mark: {
id: 'ritual_mark', name: 'Метка Тракта', station: 'Вуаль', unlockLevel: 15,
description: 'Странная техника, позаимствованная из наблюдений за Отголосками — метит цель искажением, которое само по себе тянет из неё жизнь ещё 2 хода.',
cd: 3, usesFocus: true, damaging: true, pure: true,
formula: (a) => a.stats.endurance * 0.6 + a.stats.power * 0.6 + a.stats.reaction * 0.4,
applyDot: { type: 'dot', amount: 8, turnsLeft: 2 },
},
steel_discipline: {
id: 'steel_discipline', name: 'Стальная дисциплина', station: 'Вуаль', unlockLevel: 30,
description: 'Вершина инженерной школы Вуали: удар, который одновременно пробивает половину брони цели и разрушает то, что осталось. После этого умения защита противника практически перестаёт существовать.',
cd: 4, usesFocus: true, damaging: true, shieldPierce: 0.5, shieldShred: 10,
formula: (a) => a.stats.power * 1.0 + a.stats.reaction * 1.0,
},
// ── Кузница: разрушение среды/поля боя (не прямой урон-фокус, а тлеющий
// индустриальный ад — обжигает броню изнутри, добивает долго и грязно) ──
molten_discharge: {
id: 'molten_discharge', name: 'Плавильный выброс', station: 'Кузница', unlockLevel: 1,
description: 'Выброс расплава прямо из промышленного контура станции. Обжигает броню и снижает экранирование цели — грязная, но эффективная индустриальная тактика.',
cd: 3, usesFocus: true, damaging: true, shieldShred: 8,
formula: (a) => a.stats.power * 0.8 + a.stats.endurance * 0.5,
},
conveyor_collapse: {
id: 'conveyor_collapse', name: 'Обвал конвейера', station: 'Кузница', unlockLevel: 15,
description: 'Управляемый обвал тяжёлой производственной секции прямо на цель. Медленно, тяжело, но останавливает почти всё.',
cd: 4, usesFocus: true, damaging: true,
formula: (a) => a.stats.power * 1.5 + a.stats.endurance * 0.7,
},
melting_point: {
id: 'melting_point', name: 'Точка плавления', station: 'Кузница', unlockLevel: 30,
description: 'Финал школы Кузницы — цель доводится до температуры, на которой сдаётся даже броня. Пробивает мимо щитов и продолжает жечь ещё 4 хода после удара.',
cd: 4, usesFocus: true, damaging: true, pure: true,
formula: (a) => a.stats.power * 0.9 + a.stats.endurance * 0.6,
applyDot: { type: 'dot', amount: 18, turnsLeft: 4 },
},
};
const STIMS = {
field_stim: { id: 'field_stim', name: 'Полевой стим-пакет', description: 'Базовый медицинский инжект — быстро закрывает часть раны прямо в бою. Универсальный, дешёвый, всегда доступен.', healPct: 0.25, healFlat: 60 },
nano_regen: { id: 'nano_regen', name: 'Нанопакет регенерации', description: 'Не разовое лечение, а рой наносборок, затягивающих рану постепенно на протяжении нескольких ходов. Лучше для затяжного боя, чем для критического момента.', applyDot: { type: 'hot', amount: 18, turnsLeft: 4 } },
aim_chip: { id: 'aim_chip', name: 'Прицельный чип', description: 'Временно повышает фокус — умения начинают попадать заметно чаще. Полезен перед серией сильных ударов, которые нельзя позволить себе промахнуть.', focusMod: 0.15 },
targeting_stab: { id: 'targeting_stab', name: 'Стабилизатор наводки', description: 'Гасит дрожь руки и наводки при обычных атаках — точность растёт, но не влияет на умения (для этого есть Прицельный чип).', accuracyMod: 0.15 },
emergency_stim: { id: 'emergency_stim', name: 'Аварийный стим', description: 'Экстренный протокол на грани передозировки: закрывает почти половину HP разом и продолжает лечить ещё несколько ходов. Дорогой, редкий, спасает жизнь в буквальном смысле.', healPct: 0.40, healFlat: 210, applyDot: { type: 'hot', amount: 18, turnsLeft: 4 } },
exo_frame: { id: 'exo_frame', name: 'Экзо-каркас', description: 'Внешний силовой каркас увеличивает запас прочности организма на 50% на весь бой. Не лечит — увеличивает сам предел того, сколько можно выдержать.', hpMultiplier: 1.5 },
shield_field: { id: 'shield_field', name: 'Защитное поле', description: 'Временный энергетический барьер снижает весь входящий урон на четверть. Хорош перед боем с противником, у которого явно сильные удары.', incomingDmgMod: 0.75 },
overclock: { id: 'overclock', name: 'Оверклок реактора', description: 'Рискованный форсаж: собственный урон растёт на четверть, но и получаемый — тоже. Не для затяжного боя, а для того, чтобы закончить его быстрее противника.', incomingDmgMod: 1.25, outgoingDmgMod: 1.25 },
};
function unlockedSkillsForPlayer(faction, level) {
return Object.values(SKILLS)
.filter((s) => s.station === faction && level >= s.unlockLevel)
.sort((a, b) => a.unlockLevel - b.unlockLevel);
}
module.exports = { SKILLS, STIMS, unlockedSkillsForPlayer };
