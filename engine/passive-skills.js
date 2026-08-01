'use strict';

/**
 * ПАССИВНЫЕ НАВЫКИ — 30 штук, 10 категорий по 3 ступени (I/II/III). В
 * отличие от активных умений (engine/skills-data.js/ship-skills.js), это
 * не действия в бою — это постоянные множители/бонусы, влияющие на темп
 * прогресса: сколько опыта капает, сколько лута падает, насколько дорого
 * обходится облучение/топливо, и так далее. Каждая категория цепляется
 * за УЖЕ существующий реальный механизм — это не декоративные циферки:
 *
 *   xp_gain          -> множитель к XP от боя (engine/leveling.js: grantXp)
 *   loot_find        -> множитель к количеству находок (exploration/trip-cargo)
 *   credit_gain      -> множитель к кредитам с боя/находок
 *   radiation_resist -> снижение прироста облучения (аномалии)
 *   regeneration     -> пассивное восстановление HP при возврате на станцию
 *   focus            -> прибавка к фокусу (крит/сила умений) поверх derived-stats
 *   evasion          -> прибавка к уворoту поверх derived-stats
 *   precision        -> прибавка к меткости поверх derived-stats
 *   fuel_efficiency  -> снижение расхода топлива за шаг (engine/travel.js)
 *   cooldown_mastery -> дополнительное сокращение перезарядки умений
 *
 * Хранится как player.passiveSkills = ['xp_gain_2', 'fuel_efficiency_1', ...]
 * — плоский список id открытых пассивок (открываются за очки/уровни/
 * репутацию — сам механизм открытия отдельным решением, здесь только
 * каталог и агрегатор эффекта).
 */

function tier(id, name, category, rank, value, description) {
  return { id, name, category, rank, value, description };
}

const PASSIVE_SKILLS = {
  xp_gain_1: tier('xp_gain_1', 'Быстрое обучение I', 'xp_gain', 1, 0.05, '+5% к опыту за победы'),
  xp_gain_2: tier('xp_gain_2', 'Быстрое обучение II', 'xp_gain', 2, 0.10, '+10% к опыту за победы'),
  xp_gain_3: tier('xp_gain_3', 'Быстрое обучение III', 'xp_gain', 3, 0.15, '+15% к опыту за победы'),

  loot_find_1: tier('loot_find_1', 'Удачливая находка I', 'loot_find', 1, 0.08, '+8% к количеству находок'),
  loot_find_2: tier('loot_find_2', 'Удачливая находка II', 'loot_find', 2, 0.16, '+16% к количеству находок'),
  loot_find_3: tier('loot_find_3', 'Удачливая находка III', 'loot_find', 3, 0.25, '+25% к количеству находок'),

  credit_gain_1: tier('credit_gain_1', 'Деловая хватка I', 'credit_gain', 1, 0.05, '+5% к кредитам с находок и боёв'),
  credit_gain_2: tier('credit_gain_2', 'Деловая хватка II', 'credit_gain', 2, 0.10, '+10% к кредитам с находок и боёв'),
  credit_gain_3: tier('credit_gain_3', 'Деловая хватка III', 'credit_gain', 3, 0.18, '+18% к кредитам с находок и боёв'),

  radiation_resist_1: tier('radiation_resist_1', 'Радиационная стойкость I', 'radiation_resist', 1, 0.10, '-10% к приросту облучения'),
  radiation_resist_2: tier('radiation_resist_2', 'Радиационная стойкость II', 'radiation_resist', 2, 0.20, '-20% к приросту облучения'),
  radiation_resist_3: tier('radiation_resist_3', 'Радиационная стойкость III', 'radiation_resist', 3, 0.35, '-35% к приросту облучения'),

  regeneration_1: tier('regeneration_1', 'Регенерация I', 'regeneration', 1, 15, '+15% HP при возврате на станцию'),
  regeneration_2: tier('regeneration_2', 'Регенерация II', 'regeneration', 2, 30, '+30% HP при возврате на станцию'),
  regeneration_3: tier('regeneration_3', 'Регенерация III', 'regeneration', 3, 50, '+50% HP при возврате на станцию'),

  focus_1: tier('focus_1', 'Хладнокровие I', 'focus', 1, 0.02, '+2% к фокусу'),
  focus_2: tier('focus_2', 'Хладнокровие II', 'focus', 2, 0.04, '+4% к фокусу'),
  focus_3: tier('focus_3', 'Хладнокровие III', 'focus', 3, 0.06, '+6% к фокусу'),

  evasion_1: tier('evasion_1', 'Манёвренность I', 'evasion', 1, 0.02, '+2% к уворoту'),
  evasion_2: tier('evasion_2', 'Манёвренность II', 'evasion', 2, 0.04, '+4% к уворoту'),
  evasion_3: tier('evasion_3', 'Манёвренность III', 'evasion', 3, 0.06, '+6% к уворoту'),

  precision_1: tier('precision_1', 'Меткость I', 'precision', 1, 0.02, '+2% к меткости'),
  precision_2: tier('precision_2', 'Меткость II', 'precision', 2, 0.04, '+4% к меткости'),
  precision_3: tier('precision_3', 'Меткость III', 'precision', 3, 0.06, '+6% к меткости'),

  fuel_efficiency_1: tier('fuel_efficiency_1', 'Экономия топлива I', 'fuel_efficiency', 1, 1, '-1 топливо за шаг полёта'),
  fuel_efficiency_2: tier('fuel_efficiency_2', 'Экономия топлива II', 'fuel_efficiency', 2, 2, '-2 топливо за шаг полёта'),
  fuel_efficiency_3: tier('fuel_efficiency_3', 'Экономия топлива III', 'fuel_efficiency', 3, 3, '-3 топливо за шаг полёта'),

  cooldown_mastery_1: tier('cooldown_mastery_1', 'Скорость восстановления I', 'cooldown_mastery', 1, 0.05, '+5% к сокращению перезарядки умений'),
  cooldown_mastery_2: tier('cooldown_mastery_2', 'Скорость восстановления II', 'cooldown_mastery', 2, 0.10, '+10% к сокращению перезарядки умений'),
  cooldown_mastery_3: tier('cooldown_mastery_3', 'Скорость восстановления III', 'cooldown_mastery', 3, 0.15, '+15% к сокращению перезарядки умений'),
};

/** Внутри одной категории эффект НЕ складывается по всем изученным
 * ступеням — берётся только высшая изученная (иначе I+II+III давало бы
 * тройной эффект за одну и ту же категорию). Складываются между собой
 * только РАЗНЫЕ категории. */
function aggregatePassiveEffects(unlockedIds = []) {
  const bestByCategory = {};
  for (const id of unlockedIds) {
    const skill = PASSIVE_SKILLS[id];
    if (!skill) continue;
    const current = bestByCategory[skill.category];
    if (!current || skill.rank > current.rank) bestByCategory[skill.category] = skill;
  }

  const effects = {
    xpMultiplier: 1,
    lootMultiplier: 1,
    creditMultiplier: 1,
    radiationReduction: 0,
    regenerationPct: 0,
    focusBonus: 0,
    evasionBonus: 0,
    precisionBonus: 0,
    fuelDiscount: 0,
    cooldownReductionBonus: 0,
  };

  for (const skill of Object.values(bestByCategory)) {
    switch (skill.category) {
      case 'xp_gain': effects.xpMultiplier += skill.value; break;
      case 'loot_find': effects.lootMultiplier += skill.value; break;
      case 'credit_gain': effects.creditMultiplier += skill.value; break;
      case 'radiation_resist': effects.radiationReduction += skill.value; break;
      case 'regeneration': effects.regenerationPct += skill.value / 100; break;
      case 'focus': effects.focusBonus += skill.value; break;
      case 'evasion': effects.evasionBonus += skill.value; break;
      case 'precision': effects.precisionBonus += skill.value; break;
      case 'fuel_efficiency': effects.fuelDiscount += skill.value; break;
      case 'cooldown_mastery': effects.cooldownReductionBonus += skill.value; break;
      default: break;
    }
  }

  return effects;
}

/**
 * СЛОТЫ ПОД ПАССИВКИ — сколько пассивок можно держать активными
 * одновременно. Начинаем с 3, потолок — 10. Как именно слоты открываются
 * сверх стартовых трёх (за уровень? за очки? за репутацию?) — решение
 * отдельное, пока не принято; здесь только сама механика лимита и
 * экипировки, готовая к любому будущему способу их выдавать.
 */
/**
 * ЗНАНИЕ vs ЭКИПИРОВКА ПАССИВОК — в духе того, что вы описали из
 * Атраксиса (пассивки качаются через находимые/покупаемые книги), но не
 * копия буквально: вместо "прокачки книгами до бесконечности" у нас
 * готовые ступени I/II/III, и предмет ("Модуль обучения" — см.
 * engine/training-modules.js) СРАЗУ открывает конкретную ступень целиком,
 * а не постепенно левелит. player.knownPassives — какие пассивки вообще
 * изучены (может быть больше, чем слотов); player.equippedPassives —
 * какие из известных активны прямо сейчас (ограничено passiveSlotsFor).
 */
function knowsPassive(player, passiveId) {
  return (player.knownPassives || []).includes(passiveId);
}

/** Изучить пассивку — вызывается при использовании модуля обучения
 * (engine/training-modules.js). НЕ экипирует автоматически — изучение и
 * активация разделены, чтобы игрок сам решал, что держать в ограниченных
 * слотах. */
function learnPassive(player, passiveId) {
  if (!PASSIVE_SKILLS[passiveId]) return { ok: false, reason: 'UNKNOWN_PASSIVE' };
  if (knowsPassive(player, passiveId)) return { ok: false, reason: 'ALREADY_KNOWN' };
  player.knownPassives = [...(player.knownPassives || []), passiveId];
  return { ok: true };
}

const DEFAULT_PASSIVE_SLOTS = 3;
const MAX_PASSIVE_SLOTS = 10;

const SLOTS_PER_LEVEL_MILESTONE = 10; // +1 слот за каждые 10 уровней персонажа

/** Слоты растут с уровнем персонажа — тот же принцип "чем дальше играешь,
 * тем больше открыто", что и у умений (1/15/30). Level 1-9: 3 слота
 * (стартовые), дальше +1 за каждые 10 уровней, потолок — MAX_PASSIVE_SLOTS.
 * player.bonusPassiveSlots — задел на будущее (награда за квест/ивент),
 * складывается поверх уровневой формулы, не заменяет её. */
function passiveSlotsFor(player) {
  const level = player.level || 1;
  const levelBonus = Math.floor(level / SLOTS_PER_LEVEL_MILESTONE);
  const bonusSlots = player.bonusPassiveSlots || 0;
  return Math.min(MAX_PASSIVE_SLOTS, DEFAULT_PASSIVE_SLOTS + levelBonus + bonusSlots);
}

/** Можно ли добавить эту пассивку прямо сейчас — не хватает слота, уже
 * стоит такая же ступень/категория и т.п. Не мутирует player. */
function canEquipPassive(player, passiveId) {
  if (!PASSIVE_SKILLS[passiveId]) return { ok: false, reason: 'UNKNOWN_PASSIVE' };
  if (!knowsPassive(player, passiveId)) return { ok: false, reason: 'NOT_LEARNED' };
  const equipped = player.equippedPassives || [];
  if (equipped.includes(passiveId)) return { ok: false, reason: 'ALREADY_EQUIPPED' };
  if (equipped.length >= passiveSlotsFor(player)) return { ok: false, reason: 'NO_FREE_SLOT' };
  return { ok: true };
}

/** Мутирует player.equippedPassives — вызывающий код сам решает, откуда
 * вообще берётся passiveId (владение пассивкой — отдельный вопрос от
 * слотов экипировки). */
function equipPassive(player, passiveId) {
  const check = canEquipPassive(player, passiveId);
  if (!check.ok) return check;
  player.equippedPassives = [...(player.equippedPassives || []), passiveId];
  return { ok: true };
}

function unequipPassive(player, passiveId) {
  player.equippedPassives = (player.equippedPassives || []).filter((id) => id !== passiveId);
  return { ok: true };
}

module.exports = {
  PASSIVE_SKILLS, aggregatePassiveEffects, knowsPassive, learnPassive,
  DEFAULT_PASSIVE_SLOTS, MAX_PASSIVE_SLOTS, SLOTS_PER_LEVEL_MILESTONE, passiveSlotsFor, canEquipPassive, equipPassive, unequipPassive,
};
