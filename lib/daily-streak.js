'use strict';

/**
 * ЕЖЕДНЕВНАЯ СЕРИЯ ВХОДОВ — простое удержание поверх уже существующего
 * daily-seeded паттерна из contracts-engine.js (тот же DAY_MS подход, не
 * отдельный таймер). Награда растёт с длиной серии и сбрасывается, если
 * пропущен день (не просто "давно не заходил", а конкретно предыдущий
 * календарный день пуст).
 *
 * checkDailyLogin(player, now) — вызывать один раз при первом действии
 * игрока за день. Мутирует player, возвращает { rewarded, streak,
 * reward } — rewarded=false, если это не первый вход за сегодня.
 */
const DAY_MS = 24 * 60 * 60 * 1000;
function dayNumber(now) { return Math.floor(now / DAY_MS); }

const STREAK_REWARDS = [
  { day: 1, credits: 20 },
  { day: 2, credits: 30 },
  { day: 3, credits: 40, resource: { resource: 'Изотопы', tier: 1, qty: 3 } },
  { day: 4, credits: 50 },
  { day: 5, credits: 60, resource: { resource: 'Сплавы', tier: 1, qty: 3 } },
  { day: 6, credits: 80 },
  { day: 7, credits: 150, resource: { resource: 'Полимеры', tier: 2, qty: 5 } }, // неделя — крупная награда, дальше цикл повторяется
];

function rewardForStreak(streak) {
  const idx = Math.min(streak - 1, STREAK_REWARDS.length - 1);
  return STREAK_REWARDS[idx];
}

function checkDailyLogin(player, now = Date.now()) {
  const today = dayNumber(now);
  player.dailyLogin = player.dailyLogin || { lastDay: null, streak: 0 };
  if (player.dailyLogin.lastDay === today) {
    return { rewarded: false, streak: player.dailyLogin.streak };
  }
  const isConsecutive = player.dailyLogin.lastDay === today - 1;
  player.dailyLogin.streak = isConsecutive ? player.dailyLogin.streak + 1 : 1;
  player.dailyLogin.lastDay = today;
  const reward = rewardForStreak(player.dailyLogin.streak);
  player.credits = (player.credits || 0) + reward.credits;
  if (reward.resource) {
    player.inventory = player.inventory || [];
    const stack = player.inventory.find((i) => i.resource === reward.resource.resource && i.tier === reward.resource.tier);
    if (stack) stack.qty += reward.resource.qty;
    else player.inventory.push({ ...reward.resource });
  }
  return { rewarded: true, streak: player.dailyLogin.streak, reward };
}

module.exports = { checkDailyLogin, rewardForStreak, STREAK_REWARDS };
