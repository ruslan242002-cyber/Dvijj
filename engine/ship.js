'use strict';

const { SHIP_SKILL_BY_FACTION } = require('./ship-skills.js');

/**
 * КОРАБЛЬ — отдельная от персонажа боевая сущность. Персонаж (player.stats/
 * player.hp) дерётся ногами на планетах; корабль (player.ship) дерётся в
 * космосе — случайные встречи на маршруте и PvP между кораблями. Разный
 * HP-пул, разная броня, разное развитие — ровно так же, как в EVE твой
 * персонаж (скиллы, обучение) отдельно от корабля, который можно потерять
 * и заменить, не потеряв самого себя.
 */

function freshShip(faction) {
  const starterSkill = SHIP_SKILL_BY_FACTION[faction];
  return {
    hp: 300, hpMax: 300,
    armor: 20,       // плоское снижение входящего урона — аналог shielding у персонажа
    firepower: 30,   // базовый урон корабля в бою
    fuel: 100, fuelMax: 100,
    level: 1,
    equippedSkills: starterSkill ? [starterSkill] : [],
  };
}

/** Прокачка корабля — сейчас привязана к решению вызывающего кода (когда
 * именно давать левел-ап кораблю: за каждый N-й уровень персонажа, за
 * отдельный опыт корабля, за кредиты у корабела — не фиксирую здесь,
 * это отдельный разговор). Сама механика прокачки — вот она. */
function shipLevelUp(ship) {
  ship.level += 1;
  ship.hpMax += 30;
  ship.hp = ship.hpMax;
  ship.armor += 3;
  ship.firepower += 4;
  ship.fuelMax += 10;
  return ship;
}

function refuel(ship, amount) {
  ship.fuel = Math.min(ship.fuelMax, ship.fuel + amount);
  return ship;
}

function refuelFull(ship) {
  ship.fuel = ship.fuelMax;
  return ship;
}

/**
 * Превращает корабль в объект формы "Fighter" (то, что реально понимает
 * engine/combat-engine.js: name/hp/hpMax/stats{power,mind,reaction,
 * endurance,firepower,shielding}/luck/accuracy/dodge/focus/periodic) — без
 * этого пришлось бы писать ВТОРОЙ боевой движок только для кораблей.
 * armor корабля становится shielding бойца, firepower — firepower;
 * power/mind/reaction/endurance у корабля нет как отдельных понятий, так
 * что все четыре берутся как та же огневая мощь/броня — этого достаточно,
 * потому что модули корабля (engine/ship-skills.js) сами не используют
 * все 4 стата так разнообразно, как личные умения персонажа.
 */
function shipToFighter(ship, name, bestiaryId = null) {
  return {
    name,
    hp: ship.hp,
    hpMax: ship.hpMax,
    stats: {
      power: ship.firepower,
      mind: ship.firepower,
      reaction: ship.armor,
      endurance: ship.armor,
      firepower: ship.firepower,
      shielding: ship.armor,
    },
    luck: 5,
    accuracy: 0.75,
    dodge: 0.08,
    focus: 0.7,
    periodic: [],
    bestiaryId,
    equippedShipSkills: ship.equippedSkills || [],
  };
}

/** Обратное преобразование — после боя переносит итоговые hp обратно в
 * сам объект корабля (combat-engine.js не мутирует переданные объекты
 * напрямую, а возвращает НОВЫЕ через spread — см. заметку про это же в
 * game/scenes/combat.js при подключении дельты HP). */
function applyFighterResultToShip(ship, fighterAfterCombat) {
  ship.hp = Math.max(0, Math.round(fighterAfterCombat.hp));
  return ship;
}

module.exports = { freshShip, shipLevelUp, refuel, refuelFull, shipToFighter, applyFighterResultToShip };
