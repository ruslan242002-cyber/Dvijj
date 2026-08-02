'use strict';
const { applyDerivedStats } = require('./derived-stats.js');
const { shipLevelUp } = require('./ship.js');
const { maybeSpeak, levelTriggerFor } = require('../lib/fifth-voice.js');

// Раньше: 50 + (level-1)*25 — линейно, до 100 уровня набегало бы всего
// ~124 000 опыта суммарно, пара недель активной игры. Теперь — растущая
// квадратично кривая: 30 уровень ≈ 40K опыта, 60 ≈ 260K, 100 ≈ 1.1М.
// Это и есть та самая растяжка ради увеличения времени в игре — набор
// одного уровня в начале почти не изменился (83 против 75), разница
// нарастает с прогрессом, а не бьёт по новичкам сразу.
function xpToNext(level) { return Math.round(60 + level * 20 + level * level * 3); }
function xpForTier(tier) { return 15 + tier * 10; }
function grantXp(player, amount) {
  player.level = player.level || 1;
  player.xp = (player.xp || 0) + Math.max(0, amount);
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
module.exports = { xpToNext, xpForTier, grantXp };
