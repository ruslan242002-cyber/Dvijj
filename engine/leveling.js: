/**
 * Система уровней и опыта. Простая линейная кривая, чтобы прогресс был
 * предсказуемым: xpToNext(1)=50, xpToNext(2)=75, xpToNext(3)=100 и т.д.
 * За уровень — +2 очка параметров и +20 к максимальному HP (полное
 * восстановление здоровья при левел-апе, как и заявлено в лорных текстах).
 */
'use strict';

function xpToNext(level) {
  return 50 + (level - 1) * 25;
}

/** Награда опытом за побеждённого врага — зависит от его тира (сложности) */
function xpForTier(tier) {
  return 15 + tier * 10;
}

/**
 * Начисляет опыт игроку, мутирует переданный объект player напрямую
 * (как и остальные хелперы в game/router.js) и обрабатывает возможные
 * несколько уровней разом за один большой прирост опыта.
 * Возвращает { player, leveledUp, levelsGained, level }.
 */
function grantXp(player, amount) {
  player.level = player.level || 1;
  player.xp = (player.xp || 0) + Math.max(0, amount);

  let levelsGained = 0;
  while (player.xp >= xpToNext(player.level)) {
    player.xp -= xpToNext(player.level);
    player.level += 1;
    player.statPoints = (player.statPoints || 0) + 2;
    player.hpMax += 20;
    player.hp = player.hpMax;
    levelsGained += 1;
  }

  return { player, leveledUp: levelsGained > 0, levelsGained, level: player.level };
}

module.exports = { xpToNext, xpForTier, grantXp };
