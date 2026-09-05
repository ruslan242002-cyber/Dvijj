'use strict';

/**
 * ⚠️ ИСТОРИЯ БАГА ЗАЦИКЛИВАНИЯ (найден по скриншоту переписки в ВК —
 * "Слабый сигнал бедствия" повторялся бесконечно даже после
 * "Проигнорировать"). Причина: моя первая версия использовала
 * придуманное поле choice.result и event.flag, которые game/scenes/
 * exploration.js не читал — реальный интерфейс на тот момент был ТОЛЬКО
 * choice.combat / choice.loot / choice.consequence / choice.reputation /
 * choice.xp. С тех пор в exploration.js ДОБАВЛЕНА прямая поддержка
 * choice.credits и choice.flag/choice.eventFlag тоже (простая, разовая
 * пометка на player.flags без записи в consequence-engine.js) — новые
 * события ниже ей пользуются напрямую, где не нужен полноценный
 * consequence. Старые события (stranded_signal и т.д.) оставлены как
 * есть — через consequence, трогать без необходимости незачем.
 */
const { getFragmentStatus } = require('../lore/trakt-mythos.js');
const { getArcForFaction, getNextAvailableQuest } = require('../storylines/curator-arcs.js');

const EVENT_TEMPLATES = {
  'curator_message': {
    zones: ['blue', 'yellow'],
    weight: 15,
    condition: (player) => {
      const arc = getArcForFaction(player.faction);
      const nextQuest = arc ? getNextAvailableQuest(player, arc) : null;
      return !!nextQuest && !player.flags?.curator_message_seen;
    },
    generate: (player) => {
      const arc = getArcForFaction(player.faction);
      const quest = getNextAvailableQuest(player, arc);
      return {
        type: 'story',
        text: `Личное сообщение от куратора ${arc.curator}:\n\n«${quest.name} — дело срочное. Загляни, как будет минута».`,
        choices: [
          { text: 'Понятно', consequence: 'curator_message_seen' },
        ],
      };
    },
  },
  'stranded_signal': {
    zones: ['blue'],
    weight: 30,
    condition: (player) => !player.flags?.saved_stranded && !player.flags?.ignored_stranded,
    generate: () => ({
      type: 'choice',
      text: 'Слабый сигнал бедствия. Частный канал, не станционный. Кто-то застрял.',
      choices: [
        { text: 'Ответить на сигнал', consequence: 'stranded_rescued' },
        { text: 'Проигнорировать', consequence: 'stranded_ignored' },
      ],
    }),
  },
  'anomaly_whisper': {
    zones: ['yellow'],
    weight: 20,
    condition: (player) => !!player.flags?.touched_abyss && !player.flags?.anomaly_whisper_seen,
    generate: (player) => ({
      type: 'combat_choice',
      text: `Ты слышишь их снова. Но теперь — ближе. Яснее.\n\n«${player.name || 'Пилот'}... ты уже наш».`,
      choices: [
        { text: '«Я слушаю»', consequence: 'echo_allied' },
        { text: 'Атаковать', combat: { zoneOverride: 'yellow' } },
        { text: 'Бежать', consequence: 'anomaly_whisper_seen_flee' },
      ],
    }),
  },
  'fragment_guardian': {
    zones: ['red'],
    weight: 100,
    condition: (player) => getFragmentStatus(player).some((f) => f.unlocked && !f.collected),
    generate: (player, rng) => {
      const candidates = getFragmentStatus(player).filter((f) => f.unlocked && !f.collected);
      const target = candidates[Math.floor(rng() * candidates.length)];
      return {
        type: 'boss',
        text: `Сканер взрывается сигналами. Это место — не просто опасно. Оно охраняется.\n\n${target.name} где-то рядом, и что-то определённо не хочет отдавать его без боя.`,
        fragmentId: target.id,
        combat: { tier: 7 + Math.floor(rng() * 3), guardianName: target.guardian },
      };
    },
  },
  'truth_ruin': {
    zones: ['red'],
    weight: 10,
    condition: (player) => (player.lore && player.lore.hypothesis) === 'BETRAYAL' && !player.flags?.truth_ruin_seen,
    generate: () => ({
      type: 'choice',
      text: 'Руины станции, которой не должно быть в реестре. Пятая станция? «Нейтралитет». Уничтоженная так давно, что о ней не осталось даже слухов — только эти руины.',
      choices: [
        { text: 'Осмотреться', consequence: 'betrayal_confirmed', loot: { resource: 'Сплавы', tier: 2, qty: 5 } },
      ],
    }),
  },

  // ───────── Ниже — 5 новых ambient-событий, без жёсткого гейта по
  // флагу (могут повторяться — это фоновые встречи в космосе, не
  // разовые сюжетные события, см. периферия_programmer_handoff.txt:
  // "Ambient events: сигналы, обломки, помехи..."). Используют прямой
  // интерфейс choice.credits/choice.flag (добавлен позже в
  // exploration.js) там, где не нужна полноценная запись в
  // consequence-engine.js.

  'abandoned_beacon': {
    zones: ['blue', 'yellow'],
    weight: 18,
    generate: () => ({
      type: 'choice',
      text: 'Старый навигационный маяк, давно выведенный из реестра. Мигает по инерции — то ли ещё жив, то ли просто не может умереть.',
      choices: [
        { text: 'Отключить', xp: 8 },
        { text: 'Изучить', xp: 20, loot: { resource: 'Изотопы', tier: 1, qty: 3 }, discovery: 'old_shipping_lane' },
        { text: 'Восстановить', xp: 10, reputation: 5 },
      ],
    }),
  },

  'unknown_ship_trail': {
    zones: ['yellow', 'red'],
    weight: 15,
    generate: () => ({
      type: 'combat_choice',
      text: 'Тепловой след — кто-то прошёл здесь совсем недавно, курс не станционный. Ещё можно нагнать.',
      choices: [
        { text: 'Преследовать', combat: {} },
        { text: 'Записать координаты', xp: 10, discovery: 'ship_trail_coordinates' },
        { text: 'Потерять след' },
      ],
    }),
  },

  'pirate_trail': {
    zones: ['yellow', 'red'],
    weight: 15,
    generate: () => ({
      type: 'combat_choice',
      text: 'Обломки груза, характерные следы захвата — здесь недавно поработали пираты. Судя по всему, их корабль ещё в секторе.',
      choices: [
        { text: 'Засада', combat: {} },
        { text: 'Избежать', xp: 5 },
        { text: 'Сообщить фракции', reputation: 8, discovery: 'pirate_intel' },
      ],
    }),
  },

  'ancient_signal': {
    zones: ['red'],
    weight: 12,
    generate: () => ({
      type: 'combat_choice',
      text: 'Сигнал старше любой станции в реестре. Формат неизвестен, но упрямо повторяется — как будто ждёт именно ответа, не просто приёма.',
      choices: [
        { text: 'Расшифровать', xp: 25, discovery: 'hidden_frequency' },
        { text: 'Записать', xp: 10, flag: 'ancient_signal_recorded' },
        { text: 'Ответить', combat: {} },
      ],
    }),
  },

  'damaged_drone': {
    zones: ['blue', 'yellow'],
    weight: 18,
    generate: () => ({
      type: 'choice',
      text: 'Дрейфующий разведдрон, корпус пробит, но ядро ещё держит слабый заряд.',
      choices: [
        { text: 'Починить', xp: 15, loot: { resource: 'Сплавы', tier: 1, qty: 5 } },
        { text: 'Разобрать', loot: { resource: 'Полимеры', tier: 1, qty: 8 } },
        { text: 'Проследить маршрут', xp: 10, discovery: 'drone_relay_location' },
      ],
    }),
  },

  // ───────── ВТОРЫЕ ШАГИ ЦЕПОЧЕК — открываются не по зоне/весу, а по
  // флагу с ПРЕДЫДУЩЕГО полёта. Условие ловит именно "флаг уже стоит, а
  // цепочка ещё не завершена" — иначе шаг 2 повторялся бы на каждой
  // вылазке (та же логика, что уберегла stranded_signal от зацикливания).

  'ship_trail_location': {
    zones: ['yellow', 'red'],
    weight: 35, // высокий — раз цепочка начата, шаг 2 не должен теряться среди случайных встреч
    condition: (player) => !!player.flags?.ship_trail_recorded && !player.flags?.ship_trail_resolved,
    generate: () => ({
      type: 'combat_choice',
      text: 'Координаты, которые ты записал в прошлый раз, ведут сюда. Корабль стоит с погашенными огнями — сломан или прячется. На связь не выходит.',
      choices: [
        { text: 'Помочь скрыться', consequence: 'ship_trail_helped_escape' },
        { text: 'Сообщить координаты фракции', consequence: 'ship_trail_reported' },
        { text: 'Атаковать и забрать груз', combat: {} },
      ],
    }),
  },

  'drone_origin_found': {
    zones: ['blue', 'yellow'],
    weight: 35,
    condition: (player) => !!player.flags?.drone_route_tracked && !player.flags?.drone_origin_resolved,
    generate: () => ({
      type: 'choice',
      text: 'Маршрут дрона ведёт к скрытой ретрансляционной вышке — не станционной, не фракционной. Кто-то тайно картографирует весь сектор.',
      choices: [
        { text: 'Оставить как есть, никому не говорить', consequence: 'drone_origin_kept_secret' },
        { text: 'Опубликовать координаты открыто', consequence: 'drone_origin_published' },
      ],
    }),
  },

  'pirate_base_located': {
    zones: ['yellow', 'red'],
    weight: 35,
    condition: (player) => !!player.flags?.pirate_report_filed && !player.flags?.pirate_base_resolved,
    generate: () => ({
      type: 'combat_choice',
      text: 'Фракция передала разведданные — судя по перехваченным сигналам, база того самого пиратского экипажа совсем рядом, замаскирована под обычный астероид.',
      choices: [
        { text: 'Атаковать базу самостоятельно', combat: {} },
        { text: 'Навести облаву фракции', consequence: 'pirate_base_raided' },
        { text: 'Оставить в покое', consequence: 'pirate_base_ignored' },
      ],
    }),
  },

  // K2 «К-17» — periferia_five_voices_character_arcs_v2.txt раздел 7.
  // Второй шаг арки Крана, но НЕ диалог с ним — случайная встреча в
  // открытом космосе, гейтится тем, что первый разговор с Краном
  // (kran_01) уже состоялся. Кран выходит на связь сам, без похода к нему.
  'k17_distress_signal': {
    zones: ['blue', 'yellow', 'red'],
    weight: 20,
    condition: (player) => !!player.flags?.kran_01_complete && !player.flags?.k17_resolved,
    generate: () => ({
      type: 'combat_choice',
      text: '📡 Слабый аварийный сигнал.\n\nПозывной: K-17.\n\nПо внутренней связи резко встревает голос Крана: «Не отвечай».',
      choices: [
        { text: 'Ответить', consequence: 'k17_answered', discovery: 'k17_signal_trace' },
        { text: 'Записать частоту', xp: 15, discovery: 'k17_signal_trace', flag: 'k17_resolved' },
        { text: 'Игнорировать', flag: 'k17_resolved' },
      ],
    }),
  },
};

/** Взвешенно выбирает и генерирует одно подходящее событие для зоны,
 * либо null, если ни один шаблон сейчас не подходит.
 *
 * worldState — общее состояние мира (deps.worldStateStore, см.
 * choices/consequence-engine.js:worldChange). Пока читается только для
 * unknown_ship_trail (демонстрация первой настоящей обратной связи "мир
 * помнит" — раньше worldChange только ЗАПИСЫВАЛСЯ цепочками, но ничего
 * его не читало обратно). Необязательный параметр — если не передан,
 * ведёт себя как раньше. */
function generateEvent(player, zone, rng = Math.random, worldState = {}) {
  const candidates = Object.values(EVENT_TEMPLATES).filter((t) => {
    if (!t.zones.includes(zone)) return false;
    if (t.condition && !t.condition(player)) return false;
    return true;
  });
  if (candidates.length === 0) return null;

  const weightFor = (template) => {
    if (template === EVENT_TEMPLATES.unknown_ship_trail && worldState.defectorNetworkActivity === 'growing') {
      // Сеть беглецов активнее — таких следов на пути объективно больше.
      return template.weight * 2;
    }
    if (template === EVENT_TEMPLATES.damaged_drone && worldState.droneNetworkStatus === 'exposed') {
      // Координаты сети опубликованы — о дронах теперь знают больше
      // народу, натыкаются на них чаще (не потому что их физически
      // больше, а потому что искать стали целенаправленно).
      return template.weight * 1.6;
    }
    if (template === EVENT_TEMPLATES.pirate_trail && worldState.piracyThreatLevel === 'reduced') {
      // Базу раздавили — но не все пираты сразу исчезают, просто их
      // объективно меньше остаётся на путях.
      return template.weight * 0.5;
    }
    return template.weight;
  };

  const totalWeight = candidates.reduce((sum, t) => sum + weightFor(t), 0);
  let roll = rng() * totalWeight;
  for (const template of candidates) {
    roll -= weightFor(template);
    if (roll <= 0) return template.generate(player, rng);
  }
  return candidates[candidates.length - 1].generate(player, rng);
}

module.exports = { EVENT_TEMPLATES, generateEvent };
