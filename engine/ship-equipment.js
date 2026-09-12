'use strict';

/**
 * КОРАБЕЛЬНОЕ СНАРЯЖЕНИЕ — по periferia_weapons_armor_TZ.txt, MVP-объём
 * (раздел 51, "не строить всё сразу"): 3 оружия / 3 боеприпаса /
 * 2 брони / 1 EMP / 1 сенсор.
 *
 * ⚠️ ГЛАВНОЕ ОТЛИЧИЕ ОТ ПРИМЕРОВ ДОКУМЕНТА: документ предлагает СВОИ 6
 * типов урона (KINETIC/ENERGY/THERMAL/EXPLOSIVE/EMP/RADIATION) — но
 * "существующие контракты важнее примеров этого документа" (раздел 1,
 * прямая цитата). В игре УЖЕ есть своя 5-типовая система
 * (engine/damage-types.js: kinetic/fire/poison/emp/psionic), используемая
 * в 39+ существующих способностях монстров/боссов. Используем ЕЁ, не
 * вводим вторую параллельную систему типов урона.
 *
 * ОТДЕЛЬНАЯ система от game/scenes/locations/workshop.js
 * (engine/gear-engine.js) — та про личное снаряжение ИГРОКА (оружие/
 * броня персонажа, влияют на player.stats), эта — про снаряжение
 * КОРАБЛЯ (влияет на ship.firepower/ship.armor, используемые в
 * SHIP_COMBAT через engine/ship.js:shipToFighter). Разные слои, не
 * смешивать.
 */
const { DAMAGE_TYPES } = require('./damage-types.js');

const SHIP_WEAPONS = {
  railgun_mk1: {
    id: 'railgun_mk1',
    name: 'Рельсотрон МК1',
    damageType: DAMAGE_TYPES.KINETIC,
    firepowerBonus: 15,
    ammoType: 'kinetic_rounds',
    energyCost: 4,
    credits: 1200,
    materials: [{ resource: 'Сплавы', tier: 2, qty: 15 }],
    description: 'Классика — надёжный разгонный рельсотрон, бьёт кинетикой. Хорош против корпуса, посредственен против щитов.',
  },
  plasma_cannon: {
    id: 'plasma_cannon',
    name: 'Плазменная пушка',
    damageType: DAMAGE_TYPES.FIRE,
    firepowerBonus: 22,
    ammoType: 'plasma_charges',
    energyCost: 8,
    credits: 2200,
    materials: [{ resource: 'Изотопы', tier: 2, qty: 10 }],
    description: 'Выше урон, выше энергозатраты. Огненный тип — эффективна против целей без термостойкости.',
  },
  toxin_emitter: {
    id: 'toxin_emitter',
    name: 'Биотоксичный излучатель',
    damageType: DAMAGE_TYPES.POISON,
    firepowerBonus: 10,
    ammoType: 'toxin_capsules',
    energyCost: 5,
    credits: 1800,
    materials: [{ resource: 'Полимеры', tier: 2, qty: 12 }],
    description: 'Меньше прямого урона, зато с подходящими капсулами накладывает стойкий яд — урон со временем важнее разового залпа.',
  },
};

// Боеприпасы — расходуются по выстрелу (см. consumeShipAmmo ниже),
// каждый заточен ИМЕННО под своё оружие (совпадение ammoType), но
// физически можно возить с собой любые — просто бонус сработает
// только если тип совпал с экипированным оружием.
const SHIP_AMMO = {
  kinetic_rounds: {
    id: 'kinetic_rounds',
    name: 'Кинетические снаряды',
    matchesWeapon: 'railgun_mk1',
    bonusFirepowerPct: 0.10,
    credits: 8,
    resource: { resource: 'Сплавы', tier: 1, qty: 1 },
  },
  plasma_charges: {
    id: 'plasma_charges',
    name: 'Плазменные заряды',
    matchesWeapon: 'plasma_cannon',
    bonusFirepowerPct: 0.15,
    credits: 14,
    resource: { resource: 'Изотопы', tier: 1, qty: 1 },
  },
  toxin_capsules: {
    id: 'toxin_capsules',
    name: 'Токсичные капсулы',
    matchesWeapon: 'toxin_emitter',
    bonusFirepowerPct: 0.08,
    appliesPoisonStack: true,
    credits: 10,
    resource: { resource: 'Полимеры', tier: 1, qty: 1 },
  },
};

const SHIP_ARMOR = {
  standard_plating: {
    id: 'standard_plating',
    name: 'Стандартная броневая обшивка',
    armorBonus: 18,
    credits: 1000,
    materials: [{ resource: 'Сплавы', tier: 2, qty: 14 }],
    description: 'Простое, надёжное усиление корпуса — без специализации, просто больше брони.',
  },
  emp_shielded_plating: {
    id: 'emp_shielded_plating',
    name: 'ЭМИ-экранированная обшивка',
    armorBonus: 12,
    resistantTo: DAMAGE_TYPES.EMP,
    resistancePct: 0.5,
    credits: 1600,
    materials: [{ resource: 'Полимеры', tier: 2, qty: 10 }, { resource: 'Изотопы', tier: 1, qty: 5 }],
    description: 'Меньше брони, чем стандартная, зато гасит половину урона ЭМИ-типа — специализация, не универсальность.',
  },
};

const SHIP_EMP_DEVICE = {
  emp_disruptor: {
    id: 'emp_disruptor',
    name: 'Импульсный деструктор',
    damageType: DAMAGE_TYPES.EMP,
    charges: 2, // на бой, не расходуется между боями — см. resetEmpCharges
    disableDurationTurns: 2,
    credits: 2500,
    materials: [{ resource: 'Изотопы', tier: 3, qty: 8 }],
    description: 'Почти не наносит физического урона, зато на пару ходов отключает вражеские системы. Ограниченный заряд — не на каждый бой.',
  },
};

const SHIP_SENSOR = {
  long_range_scanner: {
    id: 'long_range_scanner',
    name: 'Дальний сканер',
    ambushAvoidBonusPct: 0.15,
    credits: 1400,
    materials: [{ resource: 'Полимеры', tier: 2, qty: 8 }],
    description: 'Позволяет замечать угрозы до того, как они заметят тебя — заметно снижает шанс попасть в засаду.',
  },
};

function findShipWeapon(id) { return SHIP_WEAPONS[id] || null; }
function findShipAmmo(id) { return SHIP_AMMO[id] || null; }
function findShipArmor(id) { return SHIP_ARMOR[id] || null; }

/** Патроны — РАСХОДНЫЙ запас, не единичный предмет владения (в отличие
 * от оружия/брони). player.shipAmmoStock = {ammoId: qty}. Покупка
 * добавляет N штук за раз, бой тратит по одной за выстрел
 * (consumeShipAmmo ниже) — тот же принцип, что и обычные ресурсы в
 * player.inventory, просто отдельный счётчик под этот конкретный слой. */
function buyShipAmmo(player, ammoId, qty) {
  const ammo = findShipAmmo(ammoId);
  if (!ammo) return { success: false, reason: 'Боеприпас не найден.' };
  const totalCost = ammo.credits * qty;
  if ((player.credits || 0) < totalCost) return { success: false, reason: 'Не хватает кредитов.' };

  const need = ammo.resource;
  const owned = (player.inventory || []).find((i) => i.resource === need.resource && i.tier === need.tier);
  if (!owned || owned.qty < need.qty * qty) return { success: false, reason: 'Не хватает ресурсов.' };

  player.credits -= totalCost;
  owned.qty -= need.qty * qty;
  player.shipAmmoStock = player.shipAmmoStock || {};
  player.shipAmmoStock[ammoId] = (player.shipAmmoStock[ammoId] || 0) + qty;
  return { success: true, ammo, qty };
}

/** Списывает один заряд ТЕКУЩЕГО загруженного боеприпаса — вызывается
 * ПОСЛЕ выстрела в бою (travel.js SHIP_COMBAT), не здесь. Если патроны
 * кончились — просто перестают давать бонус (aggregateShipEquipmentEffects
 * это уже учитывает), оружие само по себе продолжает стрелять. */
function consumeShipAmmo(player) {
  const ammoId = (player.shipEquipment || {}).ammo;
  if (!ammoId) return;
  player.shipAmmoStock = player.shipAmmoStock || {};
  if (player.shipAmmoStock[ammoId] > 0) {
    player.shipAmmoStock[ammoId] -= 1;
  }
}

/** Считает реальный бонус к firepower/armor от экипированного корабельного
 * снаряжения — вызывается из shipToFighter() (engine/ship.js), не
 * заменяет её, а дополняет. Возвращает {firepowerBonus, armorBonus,
 * damageType, empResistance} — damageType берётся от оружия (если
 * экипировано), иначе остаётся 'kinetic' по умолчанию (текущее
 * поведение боя не меняется, если игрок вообще не касался этой
 * системы). */
function aggregateShipEquipmentEffects(player) {
  const eq = player.shipEquipment || {};
  let firepowerBonus = 0;
  let armorBonus = 0;
  let damageType = DAMAGE_TYPES.KINETIC;
  let empResistancePct = 0;

  const weapon = eq.weapon ? findShipWeapon(eq.weapon) : null;
  if (weapon) {
    firepowerBonus += weapon.firepowerBonus;
    damageType = weapon.damageType;

    const ammo = eq.ammo ? findShipAmmo(eq.ammo) : null;
    const ammoInStock = ammo && (player.shipAmmoStock || {})[eq.ammo] > 0;
    if (ammo && ammoInStock && ammo.matchesWeapon === weapon.id) {
      firepowerBonus = Math.round(firepowerBonus * (1 + ammo.bonusFirepowerPct));
    }
  }

  const armor = eq.armor ? findShipArmor(eq.armor) : null;
  if (armor) {
    armorBonus += armor.armorBonus;
    if (armor.resistantTo === DAMAGE_TYPES.EMP) empResistancePct = armor.resistancePct;
  }

  return { firepowerBonus, armorBonus, damageType, empResistancePct };
}

/** Экипировать предмет корабельного снаряжения — владение проверяется
 * (player.shipEquipmentOwned), сам факт владения устроен так же, как
 * player.gear в личной экипировке (engine/gear-engine.js), не
 * повторяем эту логику заново, просто параллельная структура под
 * другой слой. */
function equipShipItem(player, slot, itemId) {
  if (slot === 'ammo') {
    // Патроны выбираются, а не "экипируются по владению" — реальная
    // проверка запаса происходит в aggregateShipEquipmentEffects/бою,
    // не здесь. Можно выбрать тип, даже если сейчас 0 штук — просто
    // бонус не сработает, пока не купишь.
    if (!findShipAmmo(itemId)) return { ok: false, reason: 'UNKNOWN_AMMO' };
    player.shipEquipment = player.shipEquipment || {};
    player.shipEquipment.ammo = itemId;
    return { ok: true };
  }

  player.shipEquipmentOwned = player.shipEquipmentOwned || [];
  if (!player.shipEquipmentOwned.includes(itemId)) return { ok: false, reason: 'NOT_OWNED' };
  player.shipEquipment = player.shipEquipment || {};
  player.shipEquipment[slot] = itemId;
  return { ok: true };
}

function unequipShipItem(player, slot) {
  player.shipEquipment = player.shipEquipment || {};
  delete player.shipEquipment[slot];
  return { ok: true };
}

const ALL_SHIP_ITEMS = { ...SHIP_WEAPONS, ...SHIP_ARMOR, ...SHIP_EMP_DEVICE, ...SHIP_SENSOR };

function findAnyShipItem(id) { return ALL_SHIP_ITEMS[id] || null; }

function canAffordShipItem(player, itemId) {
  const item = findAnyShipItem(itemId);
  if (!item) return false;
  if ((player.credits || 0) < item.credits) return false;
  for (const m of item.materials || []) {
    const owned = (player.inventory || []).find((i) => i.resource === m.resource && i.tier === m.tier);
    if (!owned || owned.qty < m.qty) return false;
  }
  return true;
}

function craftShipItem(player, itemId) {
  const item = findAnyShipItem(itemId);
  if (!item) return { success: false, reason: 'Предмет не найден.' };
  player.shipEquipmentOwned = player.shipEquipmentOwned || [];
  if (player.shipEquipmentOwned.includes(itemId)) return { success: false, reason: 'Уже есть.' };
  if (!canAffordShipItem(player, itemId)) return { success: false, reason: 'Не хватает материалов или кредитов.' };

  player.credits -= item.credits;
  for (const m of item.materials || []) {
    const owned = player.inventory.find((i) => i.resource === m.resource && i.tier === m.tier);
    owned.qty -= m.qty;
  }
  player.shipEquipmentOwned.push(itemId);
  return { success: true, item };
}

module.exports = {
  SHIP_WEAPONS, SHIP_AMMO, SHIP_ARMOR, SHIP_EMP_DEVICE, SHIP_SENSOR,
  findShipWeapon, findShipAmmo, findShipArmor, findAnyShipItem,
  aggregateShipEquipmentEffects, equipShipItem, unequipShipItem,
  canAffordShipItem, craftShipItem, buyShipAmmo, consumeShipAmmo,
};
