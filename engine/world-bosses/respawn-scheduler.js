/**
 * engine/world-bosses/respawn-scheduler.js
 *
 * 9 из 11 боссов — простой таймер от момента смерти (respawn.hours).
 * 2 босса (Ксарнский Праксид, Эхо Хранитель Ксарн) дополнительно привязаны
 * к суточному окну ("известное время появления" на карточке) — таймер
 * может истечь, но если это происходит вне окна, спавн откладывается до
 * ближайшего начала окна, а не игнорирует его (иначе "известное время
 * появления" с карточки — мёртвая lore-деталь, а не механика).
 *
 * respawn.hours === null (3 босса: Хранитель Безымянных Горизонтов,
 * Ксарнский Меморист, Перворождённая Бездны) — расписания нет вообще,
 * это намеренно: карточки говорят "возрождение: неизвестно". Такие боссы
 * не респавнятся по таймеру — их появление триггерится игровым событием
 * (сюжетным или редким случайным), которое добавляется отдельно; здесь
 * только заглушка nextSpawnAt: null, чтобы остальной код не падал.
 */
'use strict';

function nextWindowStart(fromDate, window) {
  const d = new Date(fromDate);
  d.setMinutes(0, 0, 0);
  const h = d.getHours();
  if (h < window.startHour) {
    d.setHours(window.startHour);
    return d;
  }
  if (h >= window.startHour && h < window.endHour) {
    return new Date(fromDate); // уже внутри окна
  }
  // окно на сегодня прошло — переносим на завтра
  d.setDate(d.getDate() + 1);
  d.setHours(window.startHour);
  return d;
}

/**
 * @param {object} bossDef — запись из boss-data.js (поле respawn)
 * @param {Date} deathTime — момент, когда боссу засчитали смерть/поражение группой
 * @returns {Date | null}
 */
function computeNextSpawn(bossDef, deathTime) {
  const { respawn } = bossDef;
  if (respawn.hours == null) return null; // "неизвестно" — по таймеру не спавнится
  const timerElapsed = new Date(deathTime.getTime() + respawn.hours * 3600 * 1000);
  if (!respawn.window) return timerElapsed;
  return nextWindowStart(timerElapsed, respawn.window);
}

/** Удобно для UI: "следующее появление — сегодня 15:00 (пик активности)". */
function describeSpawn(bossDef, nextSpawnAt) {
  if (!nextSpawnAt) return 'Появление непредсказуемо.';
  const { window } = bossDef.respawn;
  const timeStr = nextSpawnAt.toISOString().slice(11, 16);
  if (window) {
    return `Ожидается около ${timeStr} (пик активности — ${String(window.peakHour).padStart(2, '0')}:00).`;
  }
  return `Ожидается: ${nextSpawnAt.toISOString().slice(0, 16).replace('T', ' ')}.`;
}

module.exports = { computeNextSpawn, describeSpawn, nextWindowStart };
