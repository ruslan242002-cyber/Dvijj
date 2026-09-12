'use strict';
const { SHIP_SKILL_BY_FACTION } = require('./ship-skills.js');
const { systemEffects, freshShipSystems, applySystemDamage } = require('./ship-systems.js');

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
    armor: 20,
    firepower: 30,
    fuel: 100, fuelMax: 100,
    level: 1,
    equippedSkills: starterSkill ? [starterSkill] : [],
    systems: freshShipSystems(),
  };
}

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
 * engine/combat-engine.js) — без этого пришлось бы писать ВТОРОЙ боевой
 * движок только для кораблей. armor корабля становится shielding бойца,
 * firepower — firepower; power/mind/reaction/endurance у корабля нет как
 * отдельных понятий, так что все четыре берутся как та же огневая мощь/
 * броня.
 */
function shipToFighter(ship, name, bestiaryId = null, player = null) {
  const effects = systemEffects(ship);
  // ⚠️ Бонусы от корабельного снаряжения (engine/ship-equipment.js) —
  // ДОБАВЛЯЮТСЯ поверх базовых ship.firepower/ship.armor, не заменяют
  // их. Если player не передан или ничего не экипировано — бонус 0,
  // поведение полностью прежнее (обратная совместимость).
  const equipBonus = player
    ? require('./ship-equipment.js').aggregateShipEquipmentEffects(player)
    : { firepowerBonus: 0, armorBonus: 0 };
  const effectiveFirepower = Math.round((ship.firepower + equipBonus.firepowerBonus) * effects.firepowerMult);
  const effectiveArmor = Math.round((ship.armor + equipBonus.armorBonus) * effects.shieldingMult);
  return {
    name,
    hp: ship.hp,
    hpMax: ship.hpMax,
    stats: {
      power: effectiveFirepower,
      mind: effectiveFirepower,
      reaction: effectiveArmor,
      endurance: effectiveArmor,
      firepower: effectiveFirepower,
      shielding: effectiveArmor,
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
 * напрямую, а возвращает НОВЫЕ через spread). */
function applyFighterResultToShip(ship, fighterAfterCombat, rng = null) {
  const tookDamage = fighterAfterCombat.hp < ship.hp;
  ship.hp = Math.max(0, Math.round(fighterAfterCombat.hp));
  if (tookDamage && rng) {
    applySystemDamage(ship, rng);
  }
  return ship;
}

module.exports = { freshShip, shipLevelUp, refuel, refuelFull, shipToFighter, applyFighterResultToShip };
