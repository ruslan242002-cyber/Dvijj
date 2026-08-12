'use strict';

/**
 * ЗАЩИТА ОТ TESTING_MODE В ПРОДЕ — на данный момент это единственное, что
 * отделяет x500 тест-множители (exploration-engine.js, space-events.js,
 * leveling.js) от реального релиза — банальная невнимательность (забыли
 * убрать true перед деплоем) полностью ломает экономику. Вызывать сразу
 * после объявления `const TESTING_MODE = ...` в каждом из трёх файлов —
 * если флаг true И NODE_ENV=production, процесс не стартует вообще, вместо
 * того чтобы тихо раздавать x500 ресурсов в проде.
 *
 * Использование (добавить одну строку после `const TESTING_MODE = true;`):
 *     require('../lib/testing-mode-guard.js').assertNotProductionTesting(
 *         TESTING_MODE, 'engine/exploration-engine.js'
 *     );
 */
function assertNotProductionTesting(flagValue, sourceLabel) {
    if (flagValue && process.env.NODE_ENV === 'production') {
        throw new Error(
            `TESTING_MODE=true обнаружен в проде (${sourceLabel}). ` +
            `Это x500 множитель наград/опыта — процесс остановлен намеренно, ` +
            `чтобы не сломать экономику. Поставь TESTING_MODE = false перед деплоем.`
        );
    }
}

module.exports = { assertNotProductionTesting };
