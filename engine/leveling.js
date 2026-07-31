'use strict';
const { applyDerivedStats } = require('./derived-stats.js');

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
  }
  return { player, leveledUp: levelsGained > 0, levelsGained, level: player.level };
}
module.exports = { xpToNext, xpForTier, grantXp };
