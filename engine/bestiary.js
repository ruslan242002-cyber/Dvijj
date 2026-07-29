/**
 * ПЕРИФЕРИЯ — бестиарий именных существ: у части врагов из уже
 * существующего ростера (engine/exploration-engine.js) есть отдельная,
 * фиксированная вручную (не от tier) таблица редкой добычи поверх
 * обычного rollLoot().
 *
 * Что поменял при переносе из присланного архива:
 *
 *  1. Присланный вариант предполагал, что генератор врага заранее кладёт
 *     enemy.bestiaryId = 'graviarch' и т.п. — но exploration-engine.js
 *     сейчас ничего такого не делает, и без этого поля вся система была
 *     бы мертва. Вместо правки generateEnemy() (рискованно трогать
 *     хорошо протестированный код без необходимости) добавил обратный
 *     поиск getBestiaryIdByName(enemy.name) — раз имена монстров и так
 *     совпадают 1-в-1 с ENEMY_NAMES, привязка по имени работает
 *     надёжно и не требует ни одной правки в exploration-engine.js.
 *
 *  2. Из 9 монстров присланного архива для 9 нашёлся прямой аналог по
 *     имени в уже существующем ростере (Гравиарх, Игольник, Разломник,
 *     Пылевой Падальщик, Нулевой жнец, Скиталец-щелкун, Пульсарид,
 *     Пустотный пожиратель, Пожиратель сигналов) — они просто получили
 *     таблицу добычи. Хроножнец в ростере отсутствовал — добавил его
 *     (и все 10 монстров из второго сообщения) в
 *     engine/exploration-engine.js, иначе их таблицы добычи никогда
 *     не имели бы шанса сработать — мёртвый контент, как и в прошлые разы.
 */
'use strict';

const BESTIARY = {
  graviarch: {
    name: 'Гравиарх', threatLevel: 'B',
    loot: [
      { id: 'gravi_crystal', name: 'Грави-кристалл', chance: 8 },
      { id: 'gravi_gland_fragment', name: 'Фрагмент грави-железы', chance: 6 },
      { id: 'exoarmor_plates', name: 'Пластины экзопанциря', chance: 5 },
      { id: 'gravi_venom', name: 'Гравитационный яд', chance: 3 },
      { id: 'graviarch_meat', name: 'Мясо гравиарха', chance: 1 }
    ]
  },
  needler: {
    name: 'Игольник', threatLevel: 'C',
    loot: [
      { id: 'crystal_needle', name: 'Кристаллическая игла', chance: 9 },
      { id: 'toxic_sac', name: 'Токсичный мешочек', chance: 7 },
      { id: 'neurotoxin', name: 'Нейротоксин', chance: 4 },
      { id: 'chitin_fragment', name: 'Фрагмент хитинового покрова', chance: 6 }
    ]
  },
  riftbreaker: {
    name: 'Разломник', threatLevel: 'D',
    loot: [
      { id: 'rift_fang', name: 'Разломный клык', chance: 10 },
      { id: 'stable_fragment', name: 'Стабильный фрагмент', chance: 6 },
      { id: 'riftbreaker_flesh', name: 'Плоть разломника', chance: 5 },
      { id: 'adaptive_module', name: 'Адаптивный нейромодуль', chance: 2 }
    ]
  },
  dust_scavenger: {
    name: 'Пылевой Падальщик', threatLevel: 'E',
    loot: [
      { id: 'chitin_plates', name: 'Хитиновые пластины', chance: 10 },
      { id: 'bio_waste', name: 'Биомусор', chance: 10 },
      { id: 'techscrap', name: 'Технолом', chance: 8 }
    ]
  },
  chronoreaper: {
    name: 'Хроножнец', threatLevel: 'D',
    loot: [
      { id: 'chrono_core', name: 'Хроноядро', chance: 3 },
      { id: 'reality_fragment', name: 'Фрагменты реальности', chance: 5 },
      { id: 'quantum_resonator', name: 'Квантовый резонатор', chance: 1 }
    ]
  },
  zero_reaper: {
    name: 'Нулевой жнец', threatLevel: 'S',
    loot: [
      { id: 'energy_core', name: 'Энергоядро', chance: 2 },
      { id: 'nichron_alloy', name: 'Сплав «Нихрон»', chance: 1 }
    ]
  },
  wanderer_clicker: {
    name: 'Скиталец-щелкун', threatLevel: 'C',
    loot: [
      { id: 'biomass', name: 'Биомасса', chance: 10 },
      { id: 'chitin', name: 'Хитин', chance: 9 },
      { id: 'clicker_glands', name: 'Железы щелкуна', chance: 5 }
    ]
  },
  pulsarid: {
    name: 'Пульсарид', threatLevel: 'B',
    loot: [
      { id: 'chitin', name: 'Хитин', chance: 8 },
      { id: 'pulsarid_glands', name: 'Железы пульсарида', chance: 5 },
      { id: 'neural_node', name: 'Нейронный узел', chance: 3 }
    ]
  },
  void_eater: {
    name: 'Пустотный пожиратель', threatLevel: 'A',
    loot: [
      { id: 'dark_energy', name: 'Тёмная энергия', chance: 4 },
      { id: 'bioplasma', name: 'Биоплазма', chance: 3 },
      { id: 'distortion_fragment', name: 'Фрагменты искажения', chance: 1 }
    ]
  },

  // ── Добавлены вторым сообщением ──
  scrap_beetle: {
    name: 'Скрап-жук', threatLevel: 'E',
    loot: [
      { id: 'alloy_debris', name: 'Обломки сплава', chance: 10 },
      { id: 'organic_glue', name: 'Органический клей', chance: 8 },
      { id: 'sensor_eye', name: 'Сенсорный глаз', chance: 3 }
    ]
  },
  signal_tick: {
    name: 'Сигнальный клещ', threatLevel: 'D',
    loot: [
      { id: 'relay_claw', name: 'Ретранслятор-клешня', chance: 7 },
      { id: 'charged_shell', name: 'Заряженный панцирь', chance: 5 },
      { id: 'stolen_logchip', name: 'Украденный лог-чип', chance: 2 }
    ]
  },
  tract_weeper: {
    name: 'Тракт-плакальщица', threatLevel: 'D',
    loot: [
      { id: 'vocal_membrane', name: 'Голосовая мембрана', chance: 9 },
      { id: 'fake_beacon', name: 'Фальшивый маяк', chance: 6 },
      { id: 'resonant_gland', name: 'Резонансная железа', chance: 3 }
    ]
  },
  chitin_weaver: {
    name: 'Хитин-ткач', threatLevel: 'C',
    loot: [
      { id: 'chitin_thread', name: 'Хитиновая нить', chance: 10 },
      { id: 'build_resin', name: 'Строительная смола', chance: 7 },
      { id: 'woven_carapace', name: 'Плетёный панцирь', chance: 4 }
    ]
  },
  pulse_wanderer: {
    name: 'Импульсный странник', threatLevel: 'C',
    loot: [
      { id: 'charged_core', name: 'Заряженный сердечник', chance: 8 },
      { id: 'conductive_scale', name: 'Проводящая чешуя', chance: 6 },
      { id: 'pulse_crystal', name: 'Импульсный кристалл', chance: 2 }
    ]
  },
  exo_parser: {
    name: 'Экзо-парсер', threatLevel: 'B',
    loot: [
      { id: 'parser_module', name: 'Парсер-модуль', chance: 7 },
      { id: 'synth_muscle', name: 'Синтетическая мышца', chance: 5 },
      { id: 'stolen_blueprint', name: 'Украденный чертёж навыка', chance: 2 }
    ]
  },
  curator_sentinel: {
    name: 'Кураторский страж', threatLevel: 'B',
    loot: [
      { id: 'sentinel_board', name: 'Страж-плата', chance: 6 },
      { id: 'relic_alloy', name: 'Реликтовый сплав', chance: 4 },
      { id: 'protocol_fragment', name: 'Фрагмент протокола', chance: 1 }
    ]
  },
  echo_matriarch: {
    name: 'Тракт-эхо-матка', threatLevel: 'A',
    loot: [
      { id: 'matriarch_core', name: 'Маточное ядро', chance: 4 },
      { id: 'echo_spawn', name: 'Эхо-икра', chance: 5 },
      { id: 'growth_matrix', name: 'Редкая матрица роста', chance: 1 }
    ]
  },
  signal_eater: {
    name: 'Пожиратель сигналов', threatLevel: 'A',
    loot: [
      { id: 'jamming_organ', name: 'Глушащий орган', chance: 3 },
      { id: 'silence_fragment', name: 'Фрагмент тишины', chance: 4 },
      { id: 'absorbed_signal', name: 'Поглощённый сигнал', chance: 1 }
    ]
  },
  tract_shard: {
    name: 'Осколок Тракта', threatLevel: 'S',
    loot: [
      { id: 'tract_shard_core', name: 'Осколок Тракта', chance: 2 },
      { id: 'memory_crystal', name: 'Кристалл памяти', chance: 1 },
      { id: 'lore_finale_fragment', name: 'Лорный фрагмент финала', chance: 1 }
    ]
  }
};

let _nameIndex = null;
function getBestiaryIdByName(enemyName) {
  if (!_nameIndex) {
    _nameIndex = {};
    for (const [id, monster] of Object.entries(BESTIARY)) _nameIndex[monster.name] = id;
  }
  return _nameIndex[enemyName] || null;
}

/** Роллит добычу с побеждённого монстра. Каждый предмет — независимый бросок 0..100. */
function rollBestiaryLoot(monsterId, rng = Math.random) {
  const monster = BESTIARY[monsterId];
  if (!monster) return [];
  return monster.loot
    .filter((item) => rng() * 100 < item.chance)
    .map((item) => ({ id: item.id, name: item.name }));
}

/** Удобный вход по имени врага (как оно приходит из engine/exploration-engine.js),
 * а не по внутреннему bestiaryId — избавляет вызывающий код от необходимости
 * помнить оба идентификатора. */
function rollLootByEnemyName(enemyName, rng = Math.random) {
  const id = getBestiaryIdByName(enemyName);
  return id ? rollBestiaryLoot(id, rng) : [];
}

module.exports = { BESTIARY, rollBestiaryLoot, getBestiaryIdByName, rollLootByEnemyName };
