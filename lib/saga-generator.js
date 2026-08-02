'use strict';

/**
 * САГА-ГЕНЕРАТОР — не выдумывает историю с нуля, а собирает её из уже
 * существующих настоящих данных игрока (killCount, уровень, фракция,
 * заражение Бездной, журнал, флаги квестов). Доступен с 30 уровня — до
 * этого попросту нечего рассказывать.
 */

const SAGA_MIN_LEVEL = 30;

function canGenerateSaga(player) {
  return (player.level || 1) >= SAGA_MIN_LEVEL;
}

function chapterOrigin(player) {
  return `Глава I: Пробуждение — ${player.name} очнулся(лась) в Приюте без единого воспоминания о том, кем был(а) раньше. Тракт стёр всё, кроме имени.`;
}

function chapterFaction(player) {
  return `Глава II: Выбор — из всех голосов на Террасе памяти откликнулся один. ${player.name} выбрал(а) ${player.faction} — и с тех пор это дом.`;
}

function chapterKills(player) {
  const kills = player.killCount || 0;
  if (kills === 0) return null;
  return `Глава III: Кровавый путь — ${player.name} уничтожил(а) ${kills} угроз Периферии, прежде чем понять: они не просто враги, они — предупреждение.`;
}

function chapterAbyss(player) {
  const corruption = player.abyssCorruption || 0;
  if (corruption <= 0) return null;
  const tier = Math.floor(corruption / 25);
  const severity = tier >= 4 ? 'необратимо изменённым' : tier >= 2 ? 'заметно изменённым' : 'слегка тронутым';
  return `Глава IV: Цена силы — где-то на пути ${player.name} прикоснулся(лась) к Бездне. Организм стал ${severity}. Обратной дороги для этой части пути больше нет.`;
}

function chapterLogbook(player) {
  const entries = player.logbook || [];
  if (!entries.length) return null;
  const corrupted = entries.filter((e) => e.corrupted).length;
  if (corrupted > 0) {
    return `Глава V: Искажённая память — из ${entries.length} записей в журнале ${player.name} уже ${corrupted} читаются иначе, чем были написаны. Память подводит, или Тракт подсказывает?`;
  }
  return `Глава V: Хроника — ${entries.length} моментов, которые ${player.name} счёл(ла) достойными записи. Каждый — веха, не забытая даже Трактом.`;
}

function chapterLevel(player) {
  return `Глава VI: Сейчас — ${player.name}, уровень ${player.level || 1}, станция «${player.faction}». История продолжается.`;
}

function generateSaga(player) {
  if (!canGenerateSaga(player)) return { ok: false, reason: 'LEVEL_TOO_LOW' };
  const chapters = [chapterOrigin, chapterFaction, chapterKills, chapterAbyss, chapterLogbook, chapterLevel]
    .map((fn) => fn(player))
    .filter(Boolean);
  return { ok: true, chapters, text: chapters.join('\n\n') };
}

module.exports = { SAGA_MIN_LEVEL, canGenerateSaga, generateSaga };
