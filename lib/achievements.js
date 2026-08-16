'use strict';

/**
 * ТИТУЛЫ/ДОСТИЖЕНИЯ — чисто косметика поверх уже существующих полей player
 * (killCount, visitedLocations, completedContracts и т.д.), не новая
 * система прогресса. Хранится как player.achievements: string[] (id
 * разблокированных). checkAchievements(player) вызывать после любого
 * значимого события (победа в бою, высадка, сдача контракта) — дёшево,
 * просто перебирает список условий по уже актуальным полям player.
 *
 * ВАЖНО — ПРОВЕРЬ ВЕСЬ ФАЙЛ ВНИМАТЕЛЬНЕЕ ОБЫЧНОГО: в архиве обрезаны не
 * просто хвосты строк (как в housing.js/trade-routes.js), а сами тела
 * check()-функций почти у всех 10 достижений — их пришлось восстанавливать
 * по тексту description, а не по реальному коду. Названия полей player
 * ниже — мои предположения по смыслу (killCount/visitedLocations/
 * completedContracts/loreFragments/guildRole/marketTradeCount/maxDistance/
 * survivedRedZoneDeath), не гарантированно совпадают с тем, как эти поля
 * реально называются в твоём коде. Если после подключения какое-то
 * достижение никогда не разблокируется (или разблокируется сразу всем) —
 * почти наверняка дело в неверном имени поля здесь, поправь под факт.
 */

const TOTAL_PLANETS = 12;
const TOTAL_LORE_FRAGMENTS = 7;

const ACHIEVEMENTS = [
  {
    id: 'first_named_kill',
    title: 'Первая кровь',
    description: 'Победить первого именного монстра.',
    check: (p) => (p.namedKillCount || 0) >= 1, // подтверждено из архива game/scenes/combat.js: player.namedKillCount = (player.namedKillCount||0)+1 при убийстве именного монстра
  },
  {
    id: 'ten_named_kills',
    title: 'Охотник на легенд',
    description: 'Победить 10 именных монстров.',
    check: (p) => (p.namedKillCount || 0) >= 10, // подтверждено (см. первое достижение выше)
  },
  {
    id: 'all_planets_visited',
    title: 'Странник Периферии',
    description: `Побывать на всех ${TOTAL_PLANETS} планетах.`,
    check: (p) => (p.visitedLocations || []).length >= TOTAL_PLANETS, // сверено с game/scenes/travel.js — поле подтверждено
  },
  {
    id: 'first_legendary_contract',
    title: 'Ловец Осколков',
    description: 'Выполнить легендарный контракт.',
    check: (p) => (p.completedLegendaryContracts || 0) >= 1, // сверено с contracts/contracts-engine.js — готовый счётчик, не массив
  },
  {
    id: 'level_30',
    title: 'Ветеран Периферии',
    description: 'Достичь 30 уровня.',
    check: (p) => (p.level || 0) >= 30,
  },
  {
    id: 'all_fragments',
    title: 'Хранитель Тракта',
    description: `Собрать все ${TOTAL_LORE_FRAGMENTS} фрагментов лора.`,
    check: (p) => ((p.lore && p.lore.fragments) || []).length >= TOTAL_LORE_FRAGMENTS, // сверено с lore/trakt-mythos.js — поле вложенное: player.lore.fragments, не player.loreFragments
  },
  {
    id: 'guild_founder',
    title: 'Основатель',
    description: 'Создать гильдию.',
    check: (p) => p.guildFounded === true, // подтверждено из game/scenes/guild.js — сцена сама ставит этот флаг сразу после успешного createGuild
  },
  {
    id: 'market_trader',
    title: 'Торговец Периферии',
    description: 'Совершить 20 сделок на бирже.',
    check: (p) => (p.marketTradeCount || 0) >= 20, // нигде не велось в архиве — счётчик заведён мной в game/scenes/market.js (buy+sell)
  },
  {
    id: 'deep_diver',
    title: 'Глубинный ныряльщик',
    description: 'Долететь до дистанции 20+ в открытом космосе.',
    check: (p) => (p.maxDistanceReached || 0) >= 20, // сверено с game/scenes/travel.js: поле называется maxDistanceReached, не maxDistance
  },
  {
    id: 'first_death_red',
    title: 'Выживший',
    description: 'Пережить бой в открытом космосе на красной (открытой) зоне риска.',
    check: (p) => p.survivedCloseCall === true, // подтверждено из game/scenes/combat.js
  },
];

/** Возвращает НОВЫЕ разблокированные достижения (те, что прошли check(),
 *  но ещё не в player.achievements) — мутирует player.achievements. Не
 *  мутирует ничего другого — сами условия (killCount и т.п.) должны быть
 *  уже обновлены вызывающим кодом до этого вызова. */
function checkAchievements(player) {
  player.achievements = player.achievements || [];
  const newly = [];
  for (const a of ACHIEVEMENTS) {
    if (player.achievements.includes(a.id)) continue;
    if (a.check(player)) {
      player.achievements.push(a.id);
      newly.push(a);
    }
  }
  return newly;
}

function achievementsText(player) {
  const unlocked = new Set(player.achievements || []);
  return ACHIEVEMENTS.map((a) => `${unlocked.has(a.id) ? '🏆' : '🔒'} ${a.title} — ${a.description}`).join('\n');
}

module.exports = { ACHIEVEMENTS, checkAchievements, achievementsText };
