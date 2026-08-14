/**
 * engine/enemy-skills/creature-skills.js
 *
 * Именные способности для 30 "обычных" мобов (11 уникальных боссов с
 * протоколами — отдельно, см. /world-bosses/).
 *
 * amount у dot/hot и т.п. масштабируется от self.tier (как и вся остальная
 * генерация урона в generateEnemy) — тир 1 моб не должен наносить тот же
 * дебафф, что и тир 6 в красной зоне под тем же именем.
 *
 * trigger:
 *   'always'      — доступен на каждом ходу (с учётом cooldown)
 *   'hpBelow:X'   — доступен только когда self.hp / self.hpMax < X
 *
 * ПРОВЕРЬ: список монстров/их zone-привязки взяты из присланных материалов
 * как есть — сверь имена и принадлежность зоне с твоим реальным лором
 * перед вводом в игру, я не сверял против bestiary.js (файла у меня нет).
 */
'use strict';
const P = require('./skill-primitives.js');

const t = (self) => self.tier || 1;

const BESTIARY_SKILLS = {
  incubation_node: { // Инкубационный узел
    name: 'Инкубационный узел', zone: 'red',
    skills: [
      { id: 'reality_bite', name: 'Укус искажения', cooldown: 2, trigger: 'always',
        run: (self, tgt) => P.dot(tgt, { kind: 'distortion', amount: 6 + t(self), turns: 3 }) },
      { id: 'defense_ward', name: 'Защитный контур', cooldown: 5, trigger: 'hpBelow:0.5',
        run: (self) => P.shield(self, { percent: 0.3, turns: 3, label: 'Защитный контур' }) },
    ],
  },
  dust_eater_scout: { // Пылеед-Разведчик
    name: 'Пылеед-Разведчик', zone: 'blue',
    skills: [
      { id: 'burrow_ambush', name: 'Бросок из-под песка', cooldown: 3, trigger: 'always',
        run: (self) => P.nextHitBonus(self, { mult: 1.3, label: 'Бросок из-под песка' }) },
    ],
  },
  market_shadow_cutthroat: { // Теневой Головорез Рынка
    name: 'Теневой головорез рынка', zone: 'yellow',
    skills: [
      { id: 'call_reinforcements', name: 'Вызов подкрепления', cooldown: 6, trigger: 'hpBelow:0.5',
        run: (self) => P.nextHitBonus(self, { mult: 1.3, label: 'Подкрепление на подходе' }) },
      { id: 'poisoned_blade', name: 'Отравленный клинок', cooldown: 3, trigger: 'always',
        run: (self, tgt) => P.dot(tgt, { kind: 'bio', amount: 5 + t(self), turns: 3 }) },
    ],
  },
  devastator_mk7: { // Опустошитель МК-7
    name: 'Опустошитель МК-7', zone: 'red',
    skills: [
      { id: 'missile_barrage', name: 'Ракетный залп', cooldown: 3, trigger: 'always',
        run: (self, tgt) => P.dot(tgt, { kind: 'kinetic', amount: 8 + t(self) * 2, turns: 2 }) },
      { id: 'plasma_cutter', name: 'Плазменный резак', cooldown: 4, trigger: 'always',
        run: (self) => P.nextHitBonus(self, { mult: 1.4, label: 'Плазменный резак' }) },
    ],
  },
  perimeter_render: { // Рватель Периметра
    name: 'Рватель Периметра', zone: 'red',
    skills: [
      { id: 'space_distort', name: 'Искажение пространства', cooldown: 4, trigger: 'always',
        run: (self, tgt) => P.statmod(tgt, { stat: 'dodge', mult: 0.5, turns: 2, label: 'Искажение пространства' }) },
      { id: 'bioenergy_surge', name: 'Всплеск биоэнергии', cooldown: 5, trigger: 'hpBelow:0.5',
        run: (self) => P.hot(self, { amount: 6 + t(self) * 2, turns: 3 }) },
    ],
  },
  berth_listener: { // Причальный Слушатель
    name: 'Причальный Слушатель', zone: 'yellow',
    skills: [
      { id: 'echo_call', name: 'Голос из эха', cooldown: 4, trigger: 'always',
        run: (self, tgt) => P.statmod(tgt, { stat: 'accuracy', mult: 0.6, turns: 2, label: 'Голос из эха' }) },
      { id: 'resonance_pulse', name: 'Резонансный импульс', cooldown: 3, trigger: 'always',
        run: (self, tgt) => P.dot(tgt, { kind: 'sonic', amount: 5 + t(self), turns: 2 }) },
    ],
  },
  arsenal_scrap_crab: { // Мусорщик-Краб Арсенала
    name: 'Мусорщик-Краб Арсенала', zone: 'blue',
    skills: [
      { id: 'explosive_module', name: 'Взрывной модуль', cooldown: 99, trigger: 'hpBelow:0.2',
        run: (self, tgt) => P.selfDestruct(self, tgt, { percentOfOwnerMaxHp: 0.25, label: 'Взрывной модуль' }) },
      { id: 'cutting_claws', name: 'Режущие клешни', cooldown: 2, trigger: 'always',
        run: (self, tgt) => P.dot(tgt, { kind: 'bleed', amount: 4 + t(self), turns: 2 }) },
    ],
  },
  arsenal_rusty_dummy: { // Ржавый Манекен Арсенала
    name: 'Ржавый Манекен Арсенала', zone: 'yellow',
    skills: [
      { id: 'precise_fire', name: 'Точный огонь', cooldown: 2, trigger: 'always',
        run: (self) => P.nextHitBonus(self, { mult: 1.25, label: 'Точный огонь' }) },
      { id: 'combat_protocol', name: 'Боевой протокол', cooldown: 99, trigger: 'hpBelow:0.5',
        run: (self) => P.statmod(self, { stat: 'reaction', mult: 1.3, turns: 3, label: 'Боевой протокол' }) },
      { id: 'reinforced_armor', name: 'Усиленная броня', cooldown: 99, trigger: 'hpBelow:0.3',
        run: (self) => P.shield(self, { percent: 0.15, turns: 3, label: 'Усиленная броня' }) },
      // "Сенсоры движения" — детекция, не боевой эффект, в комбат-цикле не участвует.
    ],
  },
  resonant_entity: { // Резонант
    name: 'Резонант', zone: 'blue',
    skills: [
      { id: 'signal_disruption', name: 'Срыв сигнала', cooldown: 3, trigger: 'always',
        run: (self, tgt) => P.statmod(tgt, { stat: 'accuracy', mult: 0.7, turns: 2, label: 'Срыв сигнала' }) },
    ],
  },
  crystal_rupturer: { // Кристаллический Разрывник
    name: 'Кристаллический Разрывник', zone: 'red',
    skills: [
      { id: 'phase_strike', name: 'Фазовый удар', cooldown: 3, trigger: 'always',
        run: (self) => P.nextHitBonus(self, { mult: 1.4, label: 'Фазовый удар' }) },
      { id: 'rupture_field', name: 'Поле разрыва', cooldown: 4, trigger: 'always',
        run: (self, tgt) => P.dot(tgt, { kind: 'corrosive', amount: 7 + t(self) * 2, turns: 2 }) },
    ],
  },
  burrower_render: { // Буресос-Разрыватель
    name: 'Буресос-Разрыватель', zone: 'red',
    skills: [
      { id: 'seismic_slam', name: 'Сейсмический удар', cooldown: 3, trigger: 'always',
        run: (self, tgt) => P.dot(tgt, { kind: 'kinetic', amount: 9 + t(self) * 2, turns: 2 }) },
      { id: 'tremor_disorient', name: 'Дезориентация толчком', cooldown: 4, trigger: 'always',
        run: (self, tgt) => P.statmod(tgt, { stat: 'dodge', mult: 0.5, turns: 2, label: 'Дезориентация толчком' }) },
    ],
  },
  squat_mimoid: { // Сквот-Мимоид
    name: 'Сквот-Мимоид', zone: 'blue',
    skills: [
      { id: 'mimicry_flee', name: 'Мимикрия под обломки', cooldown: 4, trigger: 'hpBelow:0.4',
        run: (self) => P.statmod(self, { stat: 'dodge', mult: 1.5, turns: 2, label: 'Мимикрия под обломки' }) },
    ],
  },
  joint_burser: { // Бурсер Стыков
    name: 'Бурсер Стыков', zone: 'red',
    skills: [
      { id: 'burst_node', name: 'Пульсирующий нарыв', cooldown: 4, trigger: 'always',
        run: (self, tgt) => P.dot(tgt, { kind: 'structural', amount: 6 + t(self), turns: 3 }) },
      { id: 'wall_retreat', name: 'Уход в стены', cooldown: 5, trigger: 'hpBelow:0.4',
        run: (self) => P.shield(self, { percent: 0.4, turns: 2, label: 'Уход в стены' }) },
    ],
  },
  shadow_wailer: { // Теневой Плачун
    name: 'Теневой Плачун', zone: 'red',
    skills: [
      { id: 'terror_scream', name: 'Крик ужаса', cooldown: 4, trigger: 'always',
        run: (self, tgt) => P.statmod(tgt, { stat: 'focus', mult: 0.5, turns: 2, label: 'Крик ужаса' }) },
      { id: 'shadow_strike', name: 'Удар из тени', cooldown: 3, trigger: 'always',
        run: (self) => P.nextHitBonus(self, { mult: 1.5, label: 'Удар из тени' }) },
    ],
  },
  tanvir_ashwalker: { // Пеплоход Танвира
    name: 'Пеплоход Танвира', zone: 'yellow',
    skills: [
      { id: 'ash_bite', name: 'Пепельный укус', cooldown: 2, trigger: 'always',
        run: (self, tgt) => P.dot(tgt, { kind: 'burn', amount: 5 + t(self), turns: 3 }) },
      { id: 'territorial_rage', name: 'Территориальная ярость', cooldown: 99, trigger: 'hpBelow:0.3',
        run: (self) => P.nextHitBonus(self, { mult: 1.3, label: 'Территориальная ярость' }) },
    ],
  },
  synapse_render: { // Разрыватель Синапсов
    name: 'Разрыватель Синапсов', zone: 'red',
    skills: [
      { id: 'synapse_tear', name: 'Разрыв синапсов', cooldown: 4, trigger: 'always',
        run: (self, tgt) => P.disable(tgt, { turns: 1, label: 'Разрыв синапсов' }) },
      { id: 'psycholimatic_blast', name: 'Психолиматический взрыв', cooldown: 3, trigger: 'always',
        run: (self, tgt) => P.dot(tgt, { kind: 'psionic', amount: 9 + t(self) * 2, turns: 2 }) },
      { id: 'synaptic_disintegration', name: 'Синаптическая дезинтеграция', cooldown: 5, trigger: 'hpBelow:0.3',
        run: (self) => P.nextHitBonus(self, { mult: 1.6, label: 'Синаптическая дезинтеграция' }) },
    ],
  },
  anchor_sucker: { // Якорный Присос
    name: 'Якорный Присос', zone: 'yellow',
    skills: [
      { id: 'paralyzing_grip', name: 'Парализующая хватка', cooldown: 4, trigger: 'always',
        run: (self, tgt) => P.disable(tgt, { turns: 1, label: 'Парализующая хватка' }) },
      { id: 'drain_energy', name: 'Высасывание энергии', cooldown: 3, trigger: 'always',
        run: (self, tgt) => P.dot(tgt, { kind: 'drain', amount: 5 + t(self), turns: 2 }) },
    ],
  },
  plasmoid_weaver: { // Плазмоид-Ткач
    name: 'Плазмоид-ткач', zone: 'yellow',
    skills: [
      { id: 'energy_snare', name: 'Энергетическая ловушка', cooldown: 4, trigger: 'always',
        run: (self, tgt) => P.statmod(tgt, { stat: 'dodge', mult: 0.6, turns: 2, label: 'Энергетическая ловушка' }) },
      { id: 'plasma_orb', name: 'Плазменная сфера', cooldown: 3, trigger: 'always',
        run: (self, tgt) => P.dot(tgt, { kind: 'energy', amount: 6 + t(self), turns: 2 }) },
    ],
  },
  shadow_range_unit: { // Теневой Полигонник
    name: 'Теневой Полигонник', zone: 'red',
    skills: [
      { id: 'turret_fire', name: 'Пулемётная турель', cooldown: 2, trigger: 'always',
        run: (self, tgt) => P.dot(tgt, { kind: 'kinetic', amount: 5 + t(self), turns: 2 }) },
      { id: 'missile_volley', name: 'Микроракетный залп', cooldown: 4, trigger: 'always',
        run: (self) => P.nextHitBonus(self, { mult: 1.3, label: 'Микроракетный залп' }) },
      { id: 'smoke_screen', name: 'Дымовая завеса', cooldown: 5, trigger: 'hpBelow:0.5',
        run: (self) => P.statmod(self, { stat: 'dodge', mult: 1.4, turns: 2, label: 'Дымовая завеса' }) },
      { id: 'self_destruct', name: 'Самодеструкция', cooldown: 99, trigger: 'hpBelow:0.15',
        run: (self, tgt) => P.selfDestruct(self, tgt, { percentOfOwnerMaxHp: 0.35, label: 'Самодеструкция' }) },
    ],
  },
  void_sentinel: { // Пустотный Страж
    name: 'Пустотный Страж', zone: 'red',
    skills: [
      { id: 'distortion_field', name: 'Поле искажения', cooldown: 3, trigger: 'always',
        run: (self, tgt) => P.dot(tgt, { kind: 'distortion', amount: 7 + t(self) * 2, turns: 2 }) },
      { id: 'void_grasp', name: 'Хватка пустоты', cooldown: 5, trigger: 'hpBelow:0.5',
        run: (self, tgt) => P.disable(tgt, { turns: 1, label: 'Хватка пустоты' }) },
    ],
  },
  void_whisper: { // Шёпот Пустоты
    name: 'Шёпот Пустоты', zone: 'blue',
    skills: [
      { id: 'acoustic_pulse', name: 'Акустический импульс', cooldown: 3, trigger: 'always',
        run: (self, tgt) => P.dot(tgt, { kind: 'sonic', amount: 4 + t(self), turns: 2 }) },
      { id: 'echo_disorient', name: 'Эхо-дезориентация', cooldown: 4, trigger: 'always',
        run: (self, tgt) => P.statmod(tgt, { stat: 'accuracy', mult: 0.7, turns: 2, label: 'Эхо-дезориентация' }) },
    ],
  },
  sandgulper_scorcher: { // Пескоглот-Выжигатель
    name: 'Пескоглот-Выжигатель', zone: 'red',
    skills: [
      { id: 'thermal_rush', name: 'Термальный рывок', cooldown: 3, trigger: 'always',
        run: (self, tgt) => P.dot(tgt, { kind: 'burn', amount: 10 + t(self) * 2, turns: 2 }) },
      { id: 'molten_spit', name: 'Выжигающий плевок', cooldown: 3, trigger: 'always',
        run: (self) => P.nextHitBonus(self, { mult: 1.5, label: 'Выжигающий плевок' }) },
      { id: 'magnetic_field', name: 'Магнитное поле', cooldown: 5, trigger: 'always',
        run: (self, tgt) => P.statmod(tgt, { stat: 'accuracy', mult: 0.5, turns: 2, label: 'Магнитное поле' }) },
    ],
  },
  voidling: { // Пустотник
    name: 'Пустотник', zone: 'blue',
    skills: [
      { id: 'void_pulse', name: 'Импульс пустоты', cooldown: 3, trigger: 'always',
        run: (self, tgt) => P.dot(tgt, { kind: 'void', amount: 4 + t(self), turns: 2 }) },
    ],
  },
  silent_harvester: { // Безмолвный Жнец
    name: 'Безмолвный жнец', zone: 'red',
    skills: [
      { id: 'mind_pressure', name: 'Давление на сознание', cooldown: 4, trigger: 'always',
        run: (self, tgt) => P.statmod(tgt, { stat: 'focus', mult: 0.6, turns: 2, label: 'Давление на сознание' }) },
      { id: 'signal_harvest', name: 'Сбор сигналов', cooldown: 3, trigger: 'always',
        run: (self, tgt) => P.dot(tgt, { kind: 'drain', amount: 6 + t(self), turns: 2 }) },
    ],
  },
  arsenal_thrower_clicker: { // Метатель-Щелкун Арсенала
    name: 'Метатель-Щелкун Арсенала', zone: 'blue',
    skills: [
      { id: 'dash_strike', name: 'Рывок', cooldown: 2, trigger: 'always',
        run: (self) => P.nextHitBonus(self, { mult: 1.2, label: 'Рывок' }) },
      { id: 'throwing_volley', name: 'Метательный залп', cooldown: 3, trigger: 'always',
        run: (self, tgt) => P.dot(tgt, { kind: 'bleed', amount: 4 + t(self), turns: 2 }) },
      { id: 'pack_sync', name: 'Синхронизация стаи', cooldown: 5, trigger: 'hpBelow:0.6',
        run: (self) => P.statmod(self, { stat: 'reaction', mult: 1.2, turns: 3, label: 'Синхронизация стаи' }) },
    ],
  },
  sand_clicker: { // Песчаный Щелкун
    name: 'Песчаный Щелкун', zone: 'blue',
    skills: [
      { id: 'startled_bite', name: 'Испуганный укус', cooldown: 3, trigger: 'always',
        run: (self, tgt) => P.dot(tgt, { kind: 'bio', amount: 3 + t(self), turns: 2 }) },
    ],
  },
  border_crawler: { // Граничный Ползун
    name: 'Граничный Ползун', zone: 'blue',
    skills: [
      { id: 'alert_retreat', name: 'Тревожный отход', cooldown: 4, trigger: 'hpBelow:0.4',
        run: (self) => P.statmod(self, { stat: 'dodge', mult: 1.4, turns: 2, label: 'Тревожный отход' }) },
    ],
  },
  sand_swivel: { // Песчаный Вертлюг
    name: 'Песчаный Вертлюг', zone: 'yellow',
    skills: [
      { id: 'tail_shockwave', name: 'Хвостовая волна', cooldown: 3, trigger: 'always',
        run: (self, tgt) => P.dot(tgt, { kind: 'kinetic', amount: 5 + t(self), turns: 2 }) },
      { id: 'vibration_sense', name: 'Вибрационное чутьё', cooldown: 4, trigger: 'always',
        run: (self) => P.nextHitBonus(self, { mult: 1.2, label: 'Вибрационное чутьё' }) },
    ],
  },
  spiny_linker: { // Шипастый Связник
    name: 'Шипастый связник', zone: 'yellow',
    skills: [
      { id: 'emp_pulse', name: 'ЭМИ-импульс', cooldown: 4, trigger: 'always',
        run: (self, tgt) => P.statmod(tgt, { stat: 'accuracy', mult: 0.6, turns: 2, label: 'ЭМИ-импульс' }) },
      { id: 'relay_burst', name: 'Ретрансляционный разряд', cooldown: 3, trigger: 'always',
        run: (self, tgt) => P.dot(tgt, { kind: 'energy', amount: 5 + t(self), turns: 2 }) },
    ],
  },
  shard_shepherd: { // Осколочный Пастырь
    name: 'Осколочный Пастырь', zone: 'yellow',
    skills: [
      { id: 'resonance_trap', name: 'Резонансная ловушка', cooldown: 3, trigger: 'always',
        run: (self, tgt) => P.dot(tgt, { kind: 'energy', amount: 5 + t(self), turns: 2 }) },
      { id: 'swarm_coordination', name: 'Координация роя', cooldown: 5, trigger: 'hpBelow:0.5',
        run: (self) => P.statmod(self, { stat: 'reaction', mult: 1.15, turns: 3, label: 'Координация роя' }) },
    ],
  },
};

let _byName = null;
function getSkillsForEnemy(enemyName) {
  if (!_byName) {
    _byName = {};
    for (const [id, def] of Object.entries(BESTIARY_SKILLS)) _byName[def.name] = { id, ...def };
  }
  const entry = _byName[enemyName];
  return entry ? entry.skills : [];
}

module.exports = { BESTIARY_SKILLS, getSkillsForEnemy };
