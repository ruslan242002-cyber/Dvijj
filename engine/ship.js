'use strict';

/**
 * КОРАБЛЬ — отдельная от персонажа боевая сущность. Персонаж (player.stats/
 * player.hp) дерётся ногами на планетах; корабль (player.ship) дерётся в
 * космосе — случайные встречи на маршруте и PvP между кораблями. Разный
 * HP-пул, разная броня, разное развитие — ровно так же, как в EVE твой
 * персонаж (скиллы, обучение) отдельно от корабля, который можно потерять
 * и заменить, не потеряв самого себя.
 */

function freshShip() {
  return {
    hp: 300, hpMax: 300,
    armor: 20,       // плоское снижение входящего урона — аналог shielding у персонажа
    firepower: 30,   // базовый урон корабля в бою
    fuel: 100, fuelMax: 100,
    level: 1,
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

module.exports = { freshShip, shipLevelUp, refuel, refuelFull };
