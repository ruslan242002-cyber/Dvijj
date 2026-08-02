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
    failDamagePercent: 10,
    passText: 'Ты улавливаешь верную частоту и проходишь узел без единой царапины.',
    failText: 'Частоты сливаются в шум — резонанс задевает тебя, пусть и не сильно.',
  },
  gravity_trap: {
    name: 'Гравитационная ловушка',
    intro: 'Пол уходит из-под ног волнами — ложная гравитация Тракта пытается утянуть тебя вглубь трещины.',
    stat: 'endurance',
    threshold: 20,
    failDamagePercent: 20,
    passText: 'Ты держишь равновесие через всю ловушку, хотя ноги дрожат.',
    failText: 'Ловушка побеждает — тебя швыряет о стену, ощутимо приложив.',
  },
  echo_maze: {
    name: 'Эхо-лабиринт',
    intro: 'Пространство вокруг двоится — три одинаковых прохода, и только эхо шагов подскажет, какой настоящий.',
    stat: 'reaction',
    threshold: 22,
    failDamagePercent: 30,
    passText: 'Слушая эхо, ты безошибочно выбираешь настоящий проход.',
    failText: 'Эхо путает тебя — ты выходишь не там, где рассчитывал(а), с серьёзными ушибами.',
  },
};

const PUZZLE_IDS = Object.keys(ANOMALY_PUZZLES);

function pickAnomalyPuzzle(rng = Math.random) {
  const id = PUZZLE_IDS[Math.floor(rng() * PUZZLE_IDS.length)];
  return { id, ...ANOMALY_PUZZLES[id] };
}

/** Разрешает попытку — детерминированный чек стата (без доп. броска
 * рандома поверх: сам факт, прокачан стат или нет, уже достаточно
 * весомое решение игрока при распределении очков). При провале —
 * реальный урон по HP (10/20/30% максимума, свой для каждого типа
 * ловушки), при успехе — ловушка пройдена чисто, без урона. */
function resolvePuzzleAttempt(puzzle, player) {
  const statValue = (player.stats && player.stats[puzzle.stat]) || 0;
  const passed = statValue >= puzzle.threshold;
  const hpDamage = passed ? 0 : Math.round((player.hpMax || 220) * (puzzle.failDamagePercent / 100));
  return {
    passed,
    text: passed ? puzzle.passText : puzzle.failText,
    hpDamage,
  };
}

module.exports = { ANOMALY_PUZZLES, PUZZLE_IDS, pickAnomalyPuzzle, resolvePuzzleAttempt };
