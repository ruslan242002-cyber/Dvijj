'use strict';

const { getFactionReputation } = require('./reputation.js');
const { getArcForFaction } = require('../storylines/curator-arcs.js');

/**
 * КЛАССЫ-НАСТАВНИКИ — 5 РОЛЕЙ, 5 СТУПЕНЕЙ КАЖДАЯ
 * ------------------------------------------------
 * Не линейный рост одного числа, а настоящие ступени: на каждой — свой
 * именной баф, не просто "+ещё немного к тому же". Ступень 5 — крупная
 * особая способность, а не продолжение той же арифметики.
 *
 * РОЛИ (сознательно НЕ взаимозаменяемые):
 *   Целитель (Приют)    — HEALER. Групповое лечение и "второе дыхание"
 *                          на 5 ступени — без него группа не тянет
 *                          затяжной урон боссов.
 *   Инженер (Вуаль)     — ТАНК. Отражение урона и одноразовый щит на
 *                          критическом HP на 5 ступени — без него
 *                          группа не переживает крупный разовый удар.
 *   Штурмовик (Арсенал) — DPS (грубая сила). Чистый урон, НИКАКИХ
 *                          инструментов выживания вообще — осознанный
 *                          "стеклянная пушка" архетип.
 *   Аналитик (Терминус) — DPS (точность). Крит + снятие брони цели,
 *                          тоже без выживания — тот же принцип.
 *   Кузнец (Кузница)    — УТИЛИТА/КРАФТ. Экономика и качество
 *                          снаряжения, НЕ боевой sustain — усиливает
 *                          группу косвенно, не спасает её в бою.
 *
 * ИТОГ БАЛАНСА: команда из 5 Штурмовиков/Аналитиков — чистый урон без
 * лечения и без защиты от крупного удара. Против будущих боссов с
 * устойчивым уроном по времени или мощным разовым ударом такая команда
 * физически не выживает достаточно долго — ей структурно не хватает
 * Целителя и/или Инженера, не только "чуть меньше ДПС".
 *
 * Ступени открываются по уровню наставника (mentorLevel — производная
 * от репутации + пройденных квестов арки куратора, не новая система).
 */
const STAGE_THRESHOLDS = [0, 5, 10, 15, 20]; // уровень наставника, нужный для ступеней 1-5

const MENTOR_CLASSES = {
  'Приют': {
    id: 'medic', name: 'Целитель', role: 'Хилер', curator: 'Ирис Вейл',
    stages: [
      { name: 'Полевая практика', description: 'Самолечение умений и стимов усилено на 8%.', selfHealBonus: 0.08 },
      { name: 'Стабилизация', description: 'Самолечение усилено на 14%. После боя восстанавливается доп. 5% HP.', selfHealBonus: 0.14, postCombatHealPct: 0.05 },
      { name: 'Забота о ближнем', description: 'Самолечение усилено на 20%. Лечащие умения теперь частично лечат и союзника в групповом бою (30% от вылеченного).', selfHealBonus: 0.20, allyHealSharePct: 0.30 },
      { name: 'Клятва', description: 'Самолечение усилено на 26%. Доля лечения союзника — 45%.', selfHealBonus: 0.26, allyHealSharePct: 0.45 },
      { name: 'Второе дыхание', description: 'СПЕЦИАЛИЗАЦИЯ: самолечение усилено на 32%, доля лечения союзника — 60%. Раз в день, при смертельном ударе, вместо поражения восстанавливаешься с 25% HP вместо полного проигрыша боя.', selfHealBonus: 0.32, allyHealSharePct: 0.60, secondWind: true },
    ],
  },
  'Арсенал': {
    id: 'assault', name: 'Штурмовик', role: 'DPS (сила)', curator: 'Рен Окса',
    stages: [
      { name: 'Базовая подготовка', description: 'Огневая мощь +5.', firepowerBonus: 5 },
      { name: 'Прямой огонь', description: 'Огневая мощь +10.', firepowerBonus: 10 },
      { name: 'Разрушительная мощь', description: 'Огневая мощь +15. 10% шанс, что удар станет "перегруженным" (+50% урона этого удара).', firepowerBonus: 15, overchargeChance: 0.10 },
      { name: 'Ветеран войны', description: 'Огневая мощь +20. Шанс перегрузки — 16%.', firepowerBonus: 20, overchargeChance: 0.16 },
      { name: 'Абсолютное превосходство', description: 'СПЕЦИАЛИЗАЦИЯ: огневая мощь +26, шанс перегрузки — 22%. После добивания врага следующий удар гарантированно критический. Инструментов выживания у этой школы нет — только урон.', firepowerBonus: 26, overchargeChance: 0.22, guaranteedCritAfterKill: true },
    ],
  },
  'Терминус': {
    id: 'analyst', name: 'Аналитик', role: 'DPS (точность)', curator: 'Шёпот',
    stages: [
      { name: 'Первичный анализ', description: 'Шанс крита +3%.', critChanceBonus: 0.03 },
      { name: 'Слабые места', description: 'Шанс крита +6%.', critChanceBonus: 0.06 },
      { name: 'Просчёт цели', description: 'Шанс крита +9%. Крит дополнительно снижает защиту цели на 10% на 2 хода.', critChanceBonus: 0.09, critShieldShredPct: 0.10 },
      { name: 'Хладнокровие', description: 'Шанс крита +12%. Снятие защиты critом — 15%.', critChanceBonus: 0.12, critShieldShredPct: 0.15 },
      { name: 'Абсолютная точность', description: 'СПЕЦИАЛИЗАЦИЯ: шанс крита +16%, снятие защиты critом — 20%, критический урон дополнительно +25%. Инструментов выживания нет — чистая точность.', critChanceBonus: 0.16, critShieldShredPct: 0.20, critDamageBonusPct: 0.25 },
    ],
  },
  'Вуаль': {
    id: 'engineer', name: 'Инженер', role: 'Танк', curator: 'Дрого Кейн',
    stages: [
      { name: 'Базовая защита', description: 'Защита +5.', shieldingBonus: 5 },
      { name: 'Укреплённая броня', description: 'Защита +10.', shieldingBonus: 10 },
      { name: 'Отражение урона', description: 'Защита +15. 10% шанс отразить часть входящего удара обратно атакующему (30% от урона).', shieldingBonus: 15, reflectChance: 0.10, reflectPct: 0.30 },
      { name: 'Несгибаемость', description: 'Защита +20. Шанс отражения — 16%.', shieldingBonus: 20, reflectChance: 0.16, reflectPct: 0.30 },
      { name: 'Абсолютная стойкость', description: 'СПЕЦИАЛИЗАЦИЯ: защита +26, шанс отражения — 22%. Раз в бой, при падении HP ниже 20%, автоматически поглощается весь следующий удар целиком.', shieldingBonus: 26, reflectChance: 0.22, reflectPct: 0.30, emergencyAbsorb: true },
    ],
  },
  'Кузница': {
    id: 'smith', name: 'Кузнец', role: 'Утилита/крафт', curator: 'Сержант Илва',
    stages: [
      { name: 'Экономный подход', description: 'Скидка на крафт снаряжения и модулей корабля — 5%.', craftDiscount: 0.05 },
      { name: 'Знание материалов', description: 'Скидка на крафт — 10%.', craftDiscount: 0.10 },
      { name: 'Мастерство', description: 'Скидка на крафт — 15%. Скрафченное снаряжение получает +5% к своим бонусам статов.', craftDiscount: 0.15, gearStatBonusPct: 0.05 },
      { name: 'Признанный мастер', description: 'Скидка на крафт — 20%. Бонус к статам скрафченного — +8%.', craftDiscount: 0.20, gearStatBonusPct: 0.08 },
      { name: 'Легенда кузни', description: 'СПЕЦИАЛИЗАЦИЯ: скидка на крафт — 25%, бонус к статам — +12%. Раз в день можно бесплатно перековать любой свой предмет снаряжения на другой архетип той же редкости. Не боевой sustain — эта школа не спасает группу в бою, только усиливает её косвенно.', craftDiscount: 0.25, gearStatBonusPct: 0.12, freeReforge: true },
    ],
  },
};

function mentorLevel(player, faction) {
  const rep = Math.max(0, getFactionReputation(player, faction));
  const arc = getArcForFaction(faction);
  const arcQuestIds = arc ? arc.quests.map((q) => q.id) : [];
  const completedArcQuests = (player.completedQuests || []).filter((id) => arcQuestIds.includes(id)).length;
  return Math.floor(rep / 20) + completedArcQuests * 3;
}

function classStageForFaction(player, faction) {
  const level = mentorLevel(player, faction);
  let stage = 1;
  for (let i = STAGE_THRESHOLDS.length - 1; i >= 0; i--) {
    if (level >= STAGE_THRESHOLDS[i]) { stage = i + 1; break; }
  }
  return stage;
}

function currentClassStage(player) {
  if (!player.mentorClass) return 0;
  return classStageForFaction(player, player.mentorClassFaction || player.faction);
}

/** Эффекты СУММИРУЮТСЯ по всем пройденным ступеням, а не берутся только
 * с текущей — иначе баф, введённый на ступени 2 (например, лечение
 * после боя), пропадал бы на ступени 3+, если её объект не повторяет
 * то же поле явно. Поля с более поздней ступени перезаписывают те же
 * поля с ранней (числа там — уже полное новое значение, не прибавка),
 * а поля, которые не переопределялись позже, остаются в силе. */
function activeClassEffects(player) {
  if (!player.mentorClass) return {};
  const faction = player.mentorClassFaction || player.faction;
  const cls = MENTOR_CLASSES[faction];
  if (!cls || cls.id !== player.mentorClass) return {};
  const stage = classStageForFaction(player, faction);
  const merged = {};
  for (let i = 0; i < stage; i++) {
    Object.assign(merged, cls.stages[i]);
  }
  return merged;
}

function chooseMentorClass(player, faction) {
  const cls = MENTOR_CLASSES[faction];
  if (!cls) return { success: false, reason: 'UNKNOWN_FACTION' };
  player.mentorClass = cls.id;
  player.mentorClassFaction = faction;
  return { success: true, class: cls };
}

/** Второе дыхание (Целитель, ступень 5) и Аварийное поглощение (Инженер,
 * ступень 5) — оба структурно одно и то же: раз за бой отменяют
 * поражение вместо стандартного 50%-HP отката. Проверяется в момент
 * поражения (game/scenes/combat.js), не заранее — "раз в бой" отслеживается
 * через state.survivalUsedThisFight, не через player (чтобы не тратился
 * вне боя случайно и сбрасывался с новым боем). Возвращает null, если
 * механика недоступна или уже использована. */
function trySurvivalMechanic(player, alreadyUsedThisFight) {
  if (alreadyUsedThisFight) return null;
  const effects = activeClassEffects(player);
  if (effects.secondWind) return { hpPct: 0.25, note: '💚 Второе дыхание — вместо поражения ты стабилизируешься на грани.' };
  if (effects.emergencyAbsorb) return { hpPct: 0.20, note: '🛡️ Аварийное поглощение — щит принимает удар на себя целиком в последний момент.' };
  return null;
}

module.exports = {
  MENTOR_CLASSES, STAGE_THRESHOLDS,
  mentorLevel, classStageForFaction, currentClassStage, activeClassEffects, chooseMentorClass, trySurvivalMechanic,
};
