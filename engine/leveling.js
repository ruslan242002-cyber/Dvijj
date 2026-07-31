'use strict';
const { applyDerivedStats } = require('./derived-stats.js');

function xpToNext(level) { return 50 + (level - 1) * 25; }
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
