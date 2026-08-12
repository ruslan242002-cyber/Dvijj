'use strict';

/**
 * ЗАЩИТА ОТ TESTING_MODE В ПРОДЕ — на данный момент это единственное, что
 * отделяет x500 тест-множители (exploration-engine.js, space-events.js,
 * leveling.js) от реального релиза — банальная невнимательность (забыли
 * убрать true перед деплоем) полностью ломает экономику. Вызывать сразу
 * после объявления `const TESTING_MODE = ...` в каждом из трёх файлов —
 * если флаг true И REAL_LAUNCH=true, процесс не стартует вообще, вместо
 * того чтобы тихо раздавать x500 ресурсов в проде.
 *
 * ИЗМЕНЕНО: раньше проверялось NODE_ENV === 'production' — но на Vercel
 * это автоматическая переменная, которая стоит 'production' на ЛЮБОМ
 * основном деплое, включая тот единственный, на котором ты сам ещё
 * тестируешь x500-множители (нет отдельного staging-окружения). Из-за
 * этого защита блокировала само тестирование, не только настоящий запуск.
 *
 * Теперь — отдельная переменная REAL_LAUNCH, которую нужно выставить
 * САМОМУ и осознанно, только когда реально готов открыть игру игрокам:
 * Vercel → Settings → Environment Variables → REAL_LAUNCH = true.
 * Пока её нет (или она не 'true') — TESTING_MODE=true работает свободно,
 * сколько угодно тестируй.
 *
 * Использование (добавить одну строку после `const TESTING_MODE = true;`):
 *     require('../lib/testing-mode-guard.js').assertNotProductionTesting(
 *         TESTING_MODE, 'engine/exploration-engine.js'
 *     );
 */
function assertNotProductionTesting(flagValue, sourceLabel) {
    if (flagValue && process.env.REAL_LAUNCH === 'true') {
        throw new Error(
            `TESTING_MODE=true обнаружен при REAL_LAUNCH=true (${sourceLabel}). ` +
            `Это x500 множитель наград/опыта — процесс остановлен намеренно, ` +
            `чтобы не сломать экономику. Поставь TESTING_MODE = false перед настоящим запуском.`
        );
    }
}

module.exports = { assertNotProductionTesting };
