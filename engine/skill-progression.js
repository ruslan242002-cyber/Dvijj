'use strict';

/**
 * ПРОКАЧКА НАВЫКОВ ЧЕРЕЗ ПРИМЕНЕНИЕ — система в духе The Elder Scrolls
 * (навык растёт от использования, не от абстрактных очков) и Diablo
 * (уровень навыка даёт прямую числовую прибавку к его формуле). Выбрал
 * именно эту комбинацию, а не классическое "дерево талантов": она не
 * требует отдельного экрана прокачки — навык растёт сам по себе, пока
 * им пользуешься, и это видно сразу в бою.
 *
 * Сборка (какие умения экипированы) по-прежнему фиксируется ДО боя и не
 * меняется во время него — то самое правило Атраксиса ("В бою нельзя
 * менять выбранные умения — готовь сборку заранее"), эта система его не
 * трогает, она про СИЛУ уже выбранных умений, а не про их выбор.
 *
 * player.skillProgress = { [skillId]: { level, xp } } — заводится лениво,
 * при первом использовании умения.
 */

const XP_PER_USE = 8;
const MAX_SKILL_LEVEL = 10;

function xpToNextSkillLevel(level) {
  return 20 + (level - 1) * 15;
}

function getSkillProgress(player, skillId) {
  player.skillProgress = player.skillProgress || {};
  return player.skillProgress[skillId] || { level: 1, xp: 0 };
}

/** Вызывать каждый раз, когда игрок реально применил умение в бою
 * (независимо от того, попало оно или нет — тренировка есть тренировка).
 * Возвращает { leveledUp, level } — leveledUp true, если это применение
 * подняло умение на новый уровень (можно показать "🆙 Умение выросло!"). */
function grantSkillXp(player, skillId, amount = XP_PER_USE) {
  player.skillProgress = player.skillProgress || {};
  const progress = player.skillProgress[skillId] || { level: 1, xp: 0 };

  if (progress.level >= MAX_SKILL_LEVEL) {
    player.skillProgress[skillId] = progress;
    return { leveledUp: false, level: progress.level };
  }

  progress.xp += amount;
  let leveledUp = false;
  while (progress.level < MAX_SKILL_LEVEL && progress.xp >= xpToNextSkillLevel(progress.level)) {
    progress.xp -= xpToNextSkillLevel(progress.level);
    progress.level += 1;
    leveledUp = true;
  }
  if (progress.level >= MAX_SKILL_LEVEL) progress.xp = 0;

  player.skillProgress[skillId] = progress;
  return { leveledUp, level: progress.level };
}

/** Множитель силы умения от его уровня — плоские +6% за уровень сверх
 * первого (уровень 1 = ×1.00, уровень 10 = ×1.54). Небольшой, но
 * ощутимый рост, не ломающий баланс бестиария/PvP на верхних уровнях. */
function skillPowerMultiplier(level) {
  return 1 + (level - 1) * 0.06;
}

/**
 * Оборачивает исходный skill-объект (engine/skills-data.js /
 * engine/ship-skills.js) версией с усиленной formula/applyDot согласно
 * текущему уровню игрока в этом умении — сам объект SKILLS не трогаем,
 * возвращаем НОВЫЙ объект для этого конкретного применения.
 */
function scaleSkillByProgress(skill, player) {
  const progress = getSkillProgress(player, skill.id);
  const mult = skillPowerMultiplier(progress.level);
  if (mult === 1) return skill;

  const scaled = { ...skill, formula: (a) => skill.formula(a) * mult };
  if (skill.applyDot) {
    scaled.applyDot = { ...skill.applyDot, amount: Math.round(skill.applyDot.amount * mult) };
  }
  return scaled;
}

module.exports = {
  XP_PER_USE, MAX_SKILL_LEVEL,
  xpToNextSkillLevel, getSkillProgress, grantSkillXp, skillPowerMultiplier, scaleSkillByProgress,
};
