/**
 * engine/world-bosses/group-encounter.js
 *
 * Общий HP-пул на несколько игроков — каждый игрок дерётся в своём
 * отдельном бою (свой resolveTurn, свои ходы), но урон вычитается из
 * ОДНОГО общего HP атомарно. Регенерация подобрана так, чтобы соло
 * реально не успевал (см. REGEN_PER_MINUTE у каждого босса ниже) —
 * цифры соотнесены с groupSizeExpected из boss-data.js.
 *
 * ОТЛИЧИЕ ОТ ПРИСЛАННОЙ ВЕРСИИ: та ожидала state/world-store.js с
 * getNode/spawnNode/takeFromNode — этого файла в проекте нет. Вместо
 * него использует deps.bossStore (bosses/boss-store-upstash.js, уже
 * есть в проекте), расширенный методами startNamedBossEncounter/
 * applyNamedBossDamageAtomic/regenNamedBossHpAtomic — тот же принцип
 * атомарности (Lua CAS), другое имя стора. Не дублирует existing
 * async-босса (test_colossus, bosses/boss-engine.js) — те методы
 * (getActiveBoss/saveBoss) отдельные ключи, отдельная система, эта
 * работает только с 11 именными боссами по их bossId.
 */
'use strict';

// Регенерация в HP/минуту простоя (без урона). Подобрано так, что один
// игрок со "средним" уроном за ход физически не успевает опустить пул
// ниже регена в одиночку — заявленный soloViable: false в boss-data.js
// подкреплён числом, а не только текстом на карточке.
const REGEN_PER_MINUTE = {
  guardian_unnamed_horizons: 140, // 4+ игрока
  ksarn_praxid: 20,               // 1-2 игрока, soloViable: true
  forge_archon: 150,
  ksarn_memorist: 150,
  echo_destroyer: 100,
  oblivion_engineer: 190,
  shadow_auctioneer: 60,
  void_keeper: 100,
  abyss_firstborn: 150,
  ksarn_echo_keeper: 60,
  vexar_chronofallen: 100,
};

const ENGAGE_WINDOW_MINUTES = 120; // если не добит за 2 часа — отступает

/**
 * Инициирует или возвращает текущий энкаунтер (если бой с этим боссом уже
 * идёт — второй игрок присоединяется к тому же hpShared, а не начинает новый).
 */
async function getOrStartEncounter(bossStore, bossId, bossDef) {
  const existing = await bossStore.getNamedBossEncounter(bossId);
  if (existing && existing.hpShared > 0) {
    return { hpShared: existing.hpShared, hpMax: bossDef.hp, startedAt: existing.startedAt, lastActionAt: existing.lastActionAt };
  }
  const created = await bossStore.startNamedBossEncounter(bossId, bossDef.hp);
  return { hpShared: created.hpShared, hpMax: bossDef.hp, startedAt: created.startedAt, lastActionAt: created.lastActionAt };
}

/** Списывает урон атомарно — возвращает реально снятое количество
 *  (0, если пул уже пуст — кто-то добил раньше). */
async function applyDamage(bossStore, bossId, amount) {
  return bossStore.applyNamedBossDamageAtomic(bossId, amount);
}

/** Регенерация — вызывать в начале каждого обращения к боссу, до
 *  applyDamage, на основе времени с последнего действия (lastActionAt
 *  берётся из getOrStartEncounter/getNamedBossEncounter). */
async function applyRegenSinceLastAction(bossStore, bossId, bossDef, lastActionAt, now = Date.now()) {
  const perMinute = REGEN_PER_MINUTE[bossId] || 60;
  const minutes = Math.max(0, (now - lastActionAt) / 60000);
  const regenAmount = Math.round(minutes * perMinute);
  if (regenAmount <= 0) return null;
  return bossStore.regenNamedBossHpAtomic(bossId, regenAmount, bossDef.hp);
}

function regenSinceLastAction(bossId, lastActionAt, now = new Date()) {
  const perMinute = REGEN_PER_MINUTE[bossId] || 60;
  const minutes = Math.max(0, (now.getTime() - lastActionAt.getTime()) / 60000);
  return Math.round(minutes * perMinute);
}

function isEngagementExpired(startedAt, now = Date.now()) {
  const minutes = (now - startedAt) / 60000;
  return minutes > ENGAGE_WINDOW_MINUTES;
}

async function clearEncounter(bossStore, bossId) {
  await bossStore.clearNamedBossEncounter(bossId);
}

module.exports = {
  REGEN_PER_MINUTE, ENGAGE_WINDOW_MINUTES,
  getOrStartEncounter, applyDamage, applyRegenSinceLastAction, regenSinceLastAction,
  isEngagementExpired, clearEncounter,
};
