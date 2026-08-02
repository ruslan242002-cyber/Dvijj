'use strict';

/**
 * ГОЛОВОЛОМКИ АНОМАЛИЙ — раньше "аномалия" всегда была одним и тем же:
 * получи облучение, выбери доложить/утаить. Теперь при встрече с
 * аномалией выпадает один из трёх РАЗНЫХ типов препятствия, каждый
 * завязан на свой стат — не косметическая перекраска одного и того же
 * чека, а разное ощущение при каждой встрече.
 */

const ANOMALY_PUZZLES = {
  resonance_node: {
    name: 'Резонансный узел',
    intro: 'Порода вокруг гудит на нескольких частотах разом — одна ведёт в безопасный карман, остальные усиливают резонанс.',
    stat: 'mind',
    threshold: 25,
    passText: 'Ты улавливаешь верную частоту и проходишь узел, почти не задев резонанс.',
    failText: 'Частоты сливаются в шум — приходится выбирать наугад, и это стоило дороже, чем хотелось бы.',
  },
  gravity_trap: {
    name: 'Гравитационная ловушка',
    intro: 'Пол уходит из-под ног волнами — ложная гравитация Тракта пытается утянуть тебя вглубь трещины.',
    stat: 'endurance',
    threshold: 20,
    passText: 'Ты держишь равновесие через всю ловушку, хотя ноги дрожат.',
    failText: 'Ловушка на миг побеждает — падение, удар, но ты выбираешься.',
  },
  echo_maze: {
    name: 'Эхо-лабиринт',
    intro: 'Пространство вокруг двоится — три одинаковых прохода, и только эхо шагов подскажет, какой настоящий.',
    stat: 'reaction',
    threshold: 22,
    passText: 'Слушая эхо, ты безошибочно выбираешь настоящий проход.',
    failText: 'Эхо путает тебя — выходишь не там, где рассчитывал(а), помятым и злым.',
  },
};

const PUZZLE_IDS = Object.keys(ANOMALY_PUZZLES);

function pickAnomalyPuzzle(rng = Math.random) {
  const id = PUZZLE_IDS[Math.floor(rng() * PUZZLE_IDS.length)];
  return { id, ...ANOMALY_PUZZLES[id] };
}

/** Разрешает попытку — детерминированный чек стата (без доп. броска
 * рандома поверх: сам факт, прокачан стат или нет, уже достаточно
 * весомое решение игрока при распределении очков). Возвращает
 * { passed, text, radiationMultiplier } — множитель применяется к
 * обычному радиационному урону события. */
function resolvePuzzleAttempt(puzzle, player) {
  const statValue = (player.stats && player.stats[puzzle.stat]) || 0;
  const passed = statValue >= puzzle.threshold;
  return {
    passed,
    text: passed ? puzzle.passText : puzzle.failText,
    radiationMultiplier: passed ? 0.3 : 1,
  };
}

module.exports = { ANOMALY_PUZZLES, PUZZLE_IDS, pickAnomalyPuzzle, resolvePuzzleAttempt };
