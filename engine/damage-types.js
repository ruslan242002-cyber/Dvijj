'use strict';

/**
 * ТИПЫ УРОНА — под будущих боссов с сопротивлениями (огонь/яд/кинетика/
 * ЭМИ/психо — присланы заранее). Раньше в игре был один общий "урон
 * против брони" без деления на типы вообще. Сейчас деление вводится, но
 * ПОЛНОСТЬЮ обратно совместимо: у монстра/босса нет resistances — урон
 * идёт как раньше, без изменений. Сопротивление появляется только там,
 * где его явно задали.
 *
 * Сопоставление skillId/abilityId → тип урона хранится ЗДЕСЬ отдельно,
 * а не как новое поле в каждом из 15 умений персонажа и 24 способностей
 * бестиария — правка одного централизованного файла безопаснее, чем
 * ручная правка 39 существующих объектов по отдельности.
 */
const DAMAGE_TYPES = {
  KINETIC: 'kinetic',   // Кинетический — базовый физический урон, большинство оружия и обычных атак
  FIRE: 'fire',         // Огненный — плазма, взрывы, промышленный жар (Арсенал/Кузница)
  POISON: 'poison',     // Ядовитый — нейротоксины, кислота, биооружие
  EMP: 'emp',           // ЭМИ — электроника, глушение, перегрузка систем (Вуаль)
  PSIONIC: 'psionic',   // Псионический — искажения Тракта, разум, фазовые эффекты
};

const DAMAGE_TYPE_LABELS = {
  kinetic: 'Кинетический', fire: 'Огненный', poison: 'Ядовитый', emp: 'ЭМИ', psionic: 'Псионический',
};

/** Умения персонажа — по одному на боевое умение (лечащие/чисто
 * поддерживающие типа не имеют, damageType для них не запрашивается). */
const SKILL_DAMAGE_TYPES = {
  living_heat: DAMAGE_TYPES.FIRE,        // Растворение в помехах — термальный удар
  monowire: DAMAGE_TYPES.KINETIC,        // Мононить — режет физически
  voice_from_shadow: DAMAGE_TYPES.PSIONIC, // Голос из тени — то, что слышит Шёпот
  plasma_bolt: DAMAGE_TYPES.FIRE,        // Плазменный залп
  overload: DAMAGE_TYPES.EMP,            // Перегрузка реактора
  absolute_volley: DAMAGE_TYPES.KINETIC, // Абсолютный залп — грубая сила
  corrosion: DAMAGE_TYPES.POISON,        // Вирус-инъекция
  ritual_mark: DAMAGE_TYPES.PSIONIC,     // Метка Тракта
  steel_discipline: DAMAGE_TYPES.KINETIC, // Стальная дисциплина — пробивает физически
  molten_discharge: DAMAGE_TYPES.FIRE,   // Плавильный выброс
  conveyor_collapse: DAMAGE_TYPES.KINETIC, // Обвал конвейера — раздавливает
  melting_point: DAMAGE_TYPES.FIRE,      // Точка плавления
};

/** Способности именных монстров бестиария. */
const ABILITY_DAMAGE_TYPES = {
  scrap_zhuk: DAMAGE_TYPES.KINETIC,          // Роевой укус
  pylevoy_padalschik: DAMAGE_TYPES.POISON,   // Едкая слюна
  skitalets_schelkun: DAMAGE_TYPES.KINETIC,  // Зов роя
  igolnik: DAMAGE_TYPES.POISON,              // Нейротоксичная игла
  hitin_tkach: DAMAGE_TYPES.KINETIC,         // Хитиновые тенета
  signalniy_kleshch: DAMAGE_TYPES.EMP,       // Взлом сенсоров
  trakt_plakalschitsa: DAMAGE_TYPES.PSIONIC, // Обманный крик
  razlomnik: DAMAGE_TYPES.PSIONIC,           // Фазовый рывок
  hronozhnets: DAMAGE_TYPES.PSIONIC,         // Искажение времени
  graviarh: DAMAGE_TYPES.KINETIC,            // Гравитационная хватка
  pulsarid: DAMAGE_TYPES.EMP,                // Импульсный разряд
  pustotniy_pozhiratel: DAMAGE_TYPES.PSIONIC, // Поглощение материи
  kuratorskiy_strazh: DAMAGE_TYPES.EMP,      // Протокол подавления
  nulevoy_zhnets: DAMAGE_TYPES.PSIONIC,      // Абсолютный сбор
  trakt_eho_matka: DAMAGE_TYPES.PSIONIC,     // Эхо-резонанс
  impulsniy_strannik: DAMAGE_TYPES.KINETIC,  // Скачок сближения
  ekzo_parser: DAMAGE_TYPES.EMP,             // Аналитический контрудар
  pozhiratel_signalov: DAMAGE_TYPES.EMP,     // Глушение
  oskolok_trakta: DAMAGE_TYPES.PSIONIC,      // Искажение формы
  rezonant: DAMAGE_TYPES.PSIONIC,            // Резонансный всплеск
  pustotnik: DAMAGE_TYPES.PSIONIC,           // Притяжение бездны
  plazmoid_tkach: DAMAGE_TYPES.FIRE,         // Плазменная нить
  shipastiy_svyaznik: DAMAGE_TYPES.POISON,   // Нервный разряд
  bezmolvniy_zhnets: DAMAGE_TYPES.KINETIC,   // Безмолвный удар
};

function damageTypeForSkill(skillId) {
  return SKILL_DAMAGE_TYPES[skillId] || DAMAGE_TYPES.KINETIC;
}
function damageTypeForAbility(abilityId) {
  return ABILITY_DAMAGE_TYPES[abilityId] || DAMAGE_TYPES.KINETIC;
}

/** Множитель урона от сопротивления цели этому типу. defender.resistances
 * — необязательное поле ({fire: 0.5, poison: 0.3, ...}), значения от -0.5
 * (уязвимость, +50% урона) до 0.9 (90% снижение, никогда не полный
 * иммунитет — оставляет хоть какой-то урон всегда возможным). Монстры
 * без поля resistances получают множитель 1 — полностью обратная
 * совместимость с уже написанным бестиарием. */
function resistanceMultiplier(defender, damageType) {
  const resist = (defender?.resistances || {})[damageType];
  if (resist == null) return 1;
  return 1 - Math.min(0.9, Math.max(-0.5, resist));
}

module.exports = {
  DAMAGE_TYPES, DAMAGE_TYPE_LABELS, SKILL_DAMAGE_TYPES, ABILITY_DAMAGE_TYPES,
  damageTypeForSkill, damageTypeForAbility, resistanceMultiplier,
};
