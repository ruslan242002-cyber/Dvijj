'use strict';

/**
 * СОБЫТИЯ КОСМОСА — отдельный пул от планетарных событий (те уже
 * существуют: engine/exploration-engine.js + бестиарий + динамические
 * события — всё это про то, что происходит НА планете, персонажем).
 * Здесь — то, что происходит В ПУТИ, кораблём.
 *
 * 10 типов событий: empty_space/hostile_ship/derelict_wreck/
 * distress_signal/asteroid_field/space_anomaly/wandering_trader/
 * patrol_greeting/gravity_anomaly/ambush_pvp.
 *
 * ⚠️ БАГ-ФИКС (найден ранее в сессии, применяю снова после восстановления
 * из PDF-архива): player.shipLevel не существует как поле — уровень
 * корабля лежит в player.ship.level. Раньше это тихо давало tier=1
 * всегда (потолок never применялся правильно).
 *
 * ambushContext здесь — старый параметр под ЛИНЕЙНУЮ систему (cellId),
 * которую заменила система Трактов (engine/tract-network.js). В новом
 * game/scenes/travel.js реальная засада проверяется ОТДЕЛЬНО, ДО вызова
 * этой функции (через lib/ambush-registry.js, nodeId-based) — сюда
 * ambushContext передаётся как null, эта ветка просто не срабатывает.
 */
const { generateHostileShip } = require('./ship-encounters.js');
const { distanceRewardMultiplier } = require('./travel.js');
const { rollTraderEncounter } = require('./trader-encounter.js');

const SPACE_EVENT_WEIGHTS = {
  empty_space: 20,
  hostile_ship: 25,
  derelict_wreck: 12,
  distress_signal: 10,
  asteroid_field: 10,
  space_anomaly: 8,
  wandering_trader: 8,
  patrol_greeting: 7,
  gravity_anomaly: 5,
};

const SPACE_RESOURCES = ['Изотопы', 'Сплавы', 'Реголит', 'Полимеры', 'Биомасса'];
const SHIP_PART_RESOURCES = ['Фрагмент брони', 'Энергоячейка', 'Навигационный чип', 'Сплав титана'];

function pickWeighted(weights, rng) {
  const total = Object.values(weights).reduce((s, w) => s + w, 0);
  let roll = rng() * total;
  for (const [key, weight] of Object.entries(weights)) {
    if (roll < weight) return key;
    roll -= weight;
  }
  return Object.keys(weights)[0];
}

function rollSpaceLoot(distance, rng, preferShipParts = false) {
  const mult = distanceRewardMultiplier(distance);
  const pool = preferShipParts ? SHIP_PART_RESOURCES : SPACE_RESOURCES;
  const resource = pool[Math.floor(rng() * pool.length)];
  const tier = 1 + Math.floor(Math.min(distance / 2, 4));
  const qty = Math.max(1, Math.round((2 + Math.floor(rng() * 3)) * mult));
  const credits = Math.round((10 + tier * 8) * mult);
  return { resource, tier, qty, credits };
}

const EMPTY_SPACE_LINES = [
  'Пустой участок пространства. Двигатели гудят ровно, приборы молчат.',
  'Ни сигналов, ни обломков — просто чёрная пустота и звёзды, слишком далёкие, чтобы что-то значить.',
  'Тишина в эфире настолько полная, что слышно собственное дыхание в шлеме.',
  'Мимо медленно проплывает облако космической пыли — красиво, но совершенно бесполезно.',
  'Сенсоры лениво чертят пустую сетку сектора. Ничего интересного, ничего опасного.',
  'Далёкая вспышка сверхновой мерцает на самом краю обзора — старый свет от давно умершей звезды.',
  'Корабль скользит через пустоту без единого толчка — редкий момент настоящего покоя в полёте.',
  'Приборная панель светится ровным зелёным — ни одной аномалии в радиусе сканирования.',
];

const PATROL_GREETING_LINES = [
  'Патрульный катер станции сверяет позывной и отворачивает — путь свободен.',
  'На связь коротко выходит диспетчер: «Курс подтверждён, чисто у вас там» — и тишина эфира снова.',
  'Дежурный дрон обводит корабль сканером, мигает зелёным маячком и уходит на свой маршрут.',
  'Знакомый силуэт патрульного бота на горизонте — издалека кивает бортовыми огнями и не приближается.',
  'Автоматический маяк станции коротко подтверждает: сектор под контролем, можно не тревожиться.',
];

const HOSTILE_SHIP_LEAD_LINES = [
  'На сканере — засветка',
  'Приборы тревожно пищат',
  'Силуэт на подходе',
  'Радар цепляет чужой контакт',
  'Из тени станции появляется',
];

const DERELICT_WRECK_LINES = [
  'Дрейфующие обломки корабля — старые, но трюм цел.',
  'Остов давно погибшего судна медленно вращается во тьме, обшивка изрешечена, но груз внутри цел.',
  'Полузатопленный в собственной пустоте корпус — судя по ржавчине, здесь никого не было годами.',
  'Разбитая капсула с грузовым отсеком, каким-то чудом не разгерметизированным.',
];

const DISTRESS_SIGNAL_LINES = [
  'Слабый сигнал бедствия на аварийной частоте. Кто-то просит о помощи.',
  'Прерывистый писк маяка SOS пробивается сквозь помехи — сигнал старый, но ещё живой.',
  'На аварийном канале — обрывок голоса, повторяющего одни и те же координаты.',
  'Автоматический аварийный передатчик крутит одну и ту же запись уже которые сутки подряд.',
];

const ASTEROID_FIELD_LINES = [
  'Астероидное поле, богатое рудой — можно рискнуть и добыть, но обшивке достанется.',
  'Плотное скопление обломков медленно вращается впереди — в них явно что-то ценное, но и осколки опасны.',
  'Каменная россыпь тянется на сотни метров, местами поблёскивая металлом сквозь породу.',
  'Гравитация мелких астероидов слегка тянет корабль в сторону — придётся аккуратно маневрировать.',
];

const SPACE_ANOMALY_LINES = [
  'Искажение Тракта закручивает пространство вокруг корабля — двигатели жгут топливо впустую.',
  'Неровность в ткани Тракта на миг делает звёзды снаружи неправильными — приборы паникуют, топливо уходит.',
  'Пространство вокруг подёргивается рябью, будто кто-то толкнул саму реальность — расход топлива растёт.',
  'Короткая, но злая вспышка искажения заставляет двигатели работать вхолостую.',
];

const GRAVITY_ANOMALY_LINES = [
  'Неучтённая гравитационная линза утягивает корабль в сторону — приходится жечь топливо на компенсацию.',
  'Скрытая гравитационная яма ловит корабль врасплох — двигатели ревут, выравнивая курс.',
  'Приборы поздно замечают гравитационный карман — корабль ощутимо тянет в сторону, топливо уходит.',
];

/**
 * Главная функция ролла космического события.
 */
function rollSpaceEvent(player, distance, rng = Math.random, ambushContext = null) {
  if (ambushContext) {
    // Старая ветка под линейную систему — не срабатывает в текущем
    // game/scenes/travel.js (Тракты), передаётся null. Оставлена для
    // совместимости, если где-то ещё вызывается со старым контекстом.
    const { cellId, neighborCellIds, activeAmbushes } = ambushContext;
    try {
      const { ambushEncounterChance, pickAmbusher } = require('../lib/ambush-registry.js');
      if (typeof ambushEncounterChance === 'function') {
        const chance = ambushEncounterChance(cellId, neighborCellIds, activeAmbushes, player.id);
        if (rng() < chance) {
          const ambusher = pickAmbusher(cellId, neighborCellIds, activeAmbushes, player.id, rng);
          if (ambusher) {
            return {
              type: 'ambush_pvp',
              ambusherPlayerId: ambusher.playerId,
              text: 'Из тени астероидного поля выходит чужой корабль — засада! Кто-то ждал именно здесь.',
            };
          }
        }
      }
    } catch (e) { /* новая версия ambush-registry.js не имеет ambushEncounterChance — тихо пропускаем старую ветку */ }
  }

  const kind = pickWeighted(SPACE_EVENT_WEIGHTS, rng);
  const pick = (pool) => pool[Math.floor(rng() * pool.length)];

  switch (kind) {
    case 'empty_space':
      return { type: 'empty_space', text: pick(EMPTY_SPACE_LINES) };

    case 'hostile_ship': {
      const enemy = generateHostileShip(distance, player.ship?.level || 1, rng);
      const escortChance = Math.min(0.5, 0.15 + distance * 0.015);
      const hasEscort = rng() < escortChance;
      let escort = null;
      if (hasEscort) {
        escort = generateHostileShip(distance, player.ship?.level || 1, rng);
        escort.name = `Эскорт «${escort.name}»`;
        escort.hp = Math.round(escort.hp * 0.7);
        escort.hpMax = escort.hp;
      }
      const objectives = [
        { id: 'main', label: `Уничтожить ${enemy.name}`, done: false },
        ...(escort ? [{ id: 'escort', label: `Уничтожить ${escort.name}`, done: false }] : []),
        { id: 'no_damage', label: 'Избежать повреждений', done: true },
      ];
      return {
        type: 'hostile_ship', enemy, escort, objectives,
        text: `${pick(HOSTILE_SHIP_LEAD_LINES)} — ${enemy.name}${escort ? ` с сопровождением (${escort.name})` : ''}.`,
      };
    }

    case 'derelict_wreck': {
      const loot = rollSpaceLoot(distance, rng, true);
      return { type: 'derelict_wreck', loot, text: `${pick(DERELICT_WRECK_LINES)} Забираешь ${loot.resource} ×${loot.qty}.` };
    }

    case 'distress_signal': {
      const reward = Math.round((30 + distance * 6));
      return { type: 'distress_signal', reward: { credits: reward }, text: pick(DISTRESS_SIGNAL_LINES) };
    }

    case 'asteroid_field': {
      const loot = rollSpaceLoot(distance, rng);
      const hullRisk = 0.25;
      return { type: 'asteroid_field', loot, hullRisk, text: pick(ASTEROID_FIELD_LINES) };
    }

    case 'space_anomaly': {
      const fuelDrain = Math.round(6 + distance * 1.5);
      return { type: 'space_anomaly', fuelDrain, text: `${pick(SPACE_ANOMALY_LINES)} (-${fuelDrain} топлива)` };
    }

    case 'wandering_trader': {
      const enc = rollTraderEncounter('space', player, rng);
      return { type: 'wandering_trader', ...enc };
    }

    case 'patrol_greeting':
      return { type: 'patrol_greeting', text: pick(PATROL_GREETING_LINES) };

    case 'gravity_anomaly': {
      const fuelDrain = Math.round(10 + distance * 2);
      return { type: 'gravity_anomaly', fuelDrain, text: `${pick(GRAVITY_ANOMALY_LINES)} (-${fuelDrain} топлива)` };
    }

    default:
      return { type: 'empty_space', text: pick(EMPTY_SPACE_LINES) };
  }
}

module.exports = { SPACE_EVENT_WEIGHTS, rollSpaceEvent, rollSpaceLoot };
