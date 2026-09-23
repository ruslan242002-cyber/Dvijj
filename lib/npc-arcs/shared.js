'use strict';

/**
 * ОБЩИЕ ХЕЛПЕРЫ ДЛЯ ВСЕХ 5 ФАЙЛОВ АРОК — вынесены сюда, чтобы каждый
 * character-файл (kran.js/dispatcher.js/ayrin.js/mara.js/vorn.js)
 * мог их просто require(), не дублируя.
 *
 * ⚠️ АНТИ-ВЗРЫВ РАЗВЕТВЛЕНИЙ (по прямому запросу пользователя после Q10):
 * после развилки НЕ пишем 3 полных квеста × 5 персонажей = 15 объектов.
 * Вместо этого: (1) только "ведущий" развилки каждого пути получает
 * полноценную уникальную стадию с внутренним ветвлением через intro-
 * функцию; (2) "не ведущие" получают ОДНУ компактную стадию через этот
 * хелпер — три коротких, но осмысленных реплики, не три сцены; (3) сами
 * пути НЕ расходятся дальше без надобности — просто дают разный текст
 * одной и той же структуре. Экономит объём, не срезая смысл — каждая
 * реплика по-прежнему написана отдельно и с уважением к тому, что
 * выбрал игрок, просто короче полноценной сцены с тремя choices.
 */
function planAware(reactions) {
  return (player) => {
    if (player.discoveries?.plan_public_exposure) return reactions.public;
    if (player.discoveries?.plan_direct_confrontation) return reactions.direct;
    if (player.discoveries?.plan_quiet_investigation) return reactions.quiet;
    return reactions.fallback || 'Пока ничего нового.';
  };
}

const PLAN_CONDITION = (player) =>
  !!(player.discoveries?.plan_public_exposure ||
     player.discoveries?.plan_direct_confrontation ||
     player.discoveries?.plan_quiet_investigation);

// ⚠️ ПО ПРЯМОМУ ЗАПРОСУ ПОЛЬЗОВАТЕЛЯ (средний вариант между полной
// свободой и жёсткой цепочкой "доклад всем 4 по очереди"): точка
// расследования персонажа открывается, только если игрок УЖЕ дошёл
// минимум до стадии 4 хотя бы с N ДРУГИМИ персонажами (не обязательно
// именно предыдущим по фиксированному порядку) — нельзя пройти всё на
// одном "залпом", но и нет требования строгой последовательности.
const INVESTIGATION_ENGAGEMENT_MIN = 2;
function engagedWithOthersCount(player, excludeCharPrefix) {
  const prefixes = ['kran', 'dispatcher', 'ayrin', 'mara', 'vorn'];
  return prefixes.filter((p) => p !== excludeCharPrefix && !!player.flags?.[`${p}_04_complete`]).length;
}

module.exports = { planAware, PLAN_CONDITION, INVESTIGATION_ENGAGEMENT_MIN, engagedWithOthersCount };
