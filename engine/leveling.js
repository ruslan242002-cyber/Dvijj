'use strict';
const { applyDerivedStats } = require('./derived-stats.js');
const { shipLevelUp } = require('./ship.js');
const { maxTierForLevel } = require('./tier-bands.js');
const { maybeSpeak, levelTriggerFor } = require('../lib/fifth-voice.js');

// Раньше: 50 + (level-1)*25 — линейно, до 100 уровня набегало бы всего
// ~124 000 опыта суммарно, пара недель активной игры. Теперь — растущая
// квадратично кривая: 30 уровень ≈ 40K опыта, 60 ≈ 260K, 100 ≈ 1.1М.
// Это и есть та самая растяжка ради увеличения времени в игре — набор
// одного уровня в начале почти не изменился (83 против 75), разница
// нарастает с прогрессом, а не бьёт по новичкам сразу.
/**
 * КРИВАЯ ОПЫТА — переработана по прямому запросу: 1-20 уровень остаются
 * быстрыми (~40 убийств Т1 на уровень), а к 50 и 100 уровню суммарно
 * нужно ~1М и ~2.5М опыта соответственно.
 *
 * ВАЖНО (честно, не скрываю): точно попасть в ОБЕ цифры одновременно,
 * сохраняя быстрый старт И то, что каждый уровень строго дороже
 * предыдущего — математически невозможно (доказано численно при
 * настройке: чтобы добрать 1М к 50 уровню, цена уровня должна выйти на
 * ~33 тыс. XP уже к 50-му, но тогда 50 уровней от 50 до 100 при той же
 * цене уже сами по себе дают ~1.65М, что превышает бюджет в 1.5М,
 * оставшийся до цели в 2.5М). Разрешил это кривой, которая быстро
 * выходит на плато около ~34 тыс. XP/уровень после 20-го и дальше НЕ
 * УБЫВАЕТ, но и не растёт неограниченно — даёт 847к к 50 уровню (85% от
 * цели) и 2.55М к 100-му (практически точно в цель).
 */
function xpToNext(level) {
  if (level <= 20) return Math.round(80 + 45 * level);
  return Math.round(970 + 33000 * (1 - Math.exp(-(level - 20) / 5)));
}
/**
 * XP ЗА УБИЙСТВО — раньше росло линейно с тиром (+10/тир), что при старой
 * пологой кривой опыта работало, но после растяжения xpToNext (см. выше)
 * давало дикий разброс: 3 убийства на уровень в начале игры против почти
 * 700 убийств на уровень в эндгейме. Теперь база растёт степенно вместе
 * с тем, как растёт сама кривая xpToNext — темп прокачки убийствами
 * остаётся примерно одинаковым на любом уровне игры.
 *
 * "В зависимости от уровня" — не только тир врага, а ещё и собственный
 * уровень игрока: если фармить тир, который давно перерос (больше чем на
 * 20 уровней ниже собственного), опыт снижается (до предела -90%) — иначе
 * можно бесконечно набивать низкий тир ради простоты вместо честного роста.
 */
/**
 * XP ЗА УБИЙСТВО — привязано напрямую к тому, сколько опыта реально нужно
 * на следующий уровень (xpToNext), поделённому на целевое число убийств
 * за уровень — не к абстрактному тиру врага. При новой насыщающейся
 * кривой (см. xpToNext выше) чисто тировая формула была бы бессмысленна:
 * убийство Т1 на 5 уровне и на 25 уровне должно давать совершенно разный
 * опыт, хотя формально тир один и тот же — цена уровня выросла в 250 раз
 * за это время, а не тир врага.
 *
 * Целевой темп — ~40 убийств на уровень в начале игры (как и просили),
 * чуть меньше на середине и в эндгейме (там уже вступают умения/групповые
 * бои/жила — чистый гринд одиночных мобов не единственный источник опыта).
 */
function targetKillsPerLevel(level) {
  if (level <= 20) return 40;
  if (level <= 50) return 35;
  return 28;
}

function xpForKill(enemyTier, playerLevel) {
  const lvl = playerLevel || 1;
  const baseXp = Math.max(1, Math.round(xpToNext(lvl) / targetKillsPerLevel(lvl)));
  // Штраф за фарм заниженного тира — сравниваем с максимально доступным
  // на этом уровне тиром (engine/tier-bands.js), не даёт эффективно
  // обходить кривую, добивая всегда самый лёгкий доступный тир.
  const maxTier = maxTierForLevel(lvl);
  const tierGap = Math.max(0, maxTier - (enemyTier || 1));
  const tierPenalty = tierGap > 0 ? Math.max(0.2, 1 - tierGap * 0.25) : 1;
  return Math.max(1, Math.round(baseXp * tierPenalty));
}
// ⚠️ ТЕСТОВЫЙ МНОЖИТЕЛЬ ОПЫТА — тот же принцип, что и TESTING_LOOT_MULTIPLIER
// в engine/exploration-engine.js/space-events.js. Один выбор здесь
// покрывает СРАЗУ все источники опыта (бой, вылазки, квесты, контракты),
// потому что все они в итоге проходят через эту функцию. Не забыть
// выключить (TESTING_MODE = false) после тестирования.
const TESTING_MODE = true;
require('../lib/testing-mode-guard.js').assertNotProductionTesting(TESTING_MODE, 'leveling.js');
const TESTING_XP_MULTIPLIER = 500;

function grantXp(player, amount) {
  player.level = player.level || 1;
  const grantedAmount = TESTING_MODE ? amount * TESTING_XP_MULTIPLIER : amount;
  player.xp = (player.xp || 0) + Math.max(0, grantedAmount);
  let levelsGained = 0;
  while (player.xp >= xpToNext(player.level)) {
    player.xp -= xpToNext(player.level);
    player.level += 1;
    player.statPoints = (player.statPoints || 0) + 2;
    levelsGained += 1;
  }
  if (levelsGained > 0) {
    // HP теперь растёт от Выносливости (см. engine/derived-stats.js), а не
    // фиксированным +20 за уровень — но и сам левел-ап всё ещё лечит
    // полностью, это привычное и приятное ощущение "левел-ап = передышка".
    applyDerivedStats(player);
    player.hp = player.hpMax;

    // Корабль растёт вместе с персонажем — 1 уровень корабля за 1 уровень
    // персонажа. Без этого shipLevelUp() существовал бы, но никогда не
    // вызывался нигде в игре: корабль навсегда оставался бы 1 уровня, а
    // жёлтая/красная зоны (требуют 4/8 уровень корабля — engine/travel.js:
    // ZONE_DISTANCE_BANDS) были бы физически недостижимы НАВСЕГДА, что и
    // объясняло путаницу с "пропавшим порталом".
    if (player.ship) {
      for (let i = 0; i < levelsGained; i++) shipLevelUp(player.ship);
    }

    // Пятый Голос — звучит на уровнях 8/15/22/30 (см. lib/fifth-voice.js).
    // grantXp — чистая функция без доступа к тексту ответа, поэтому не
    // строит реплику сама, а копит её на игроке; вызывающая сцена сама
    // решает, дописать ли pendingVoiceMessage к своему тексту и очистить поле.
    for (const lvl of [8, 15, 22, 30]) {
      if (player.level >= lvl && (player.level - levelsGained) < lvl) {
        const line = maybeSpeak(player, levelTriggerFor(lvl));
        if (line) player.pendingVoiceMessage = player.pendingVoiceMessage ? `${player.pendingVoiceMessage}\n\n${line}` : line;
      }
    }
  }
  return { player, leveledUp: levelsGained > 0, levelsGained, level: player.level };
}
module.exports = { xpToNext, xpForKill, targetKillsPerLevel, grantXp };
