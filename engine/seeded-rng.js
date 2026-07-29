/**
 * Детерминированный ГПСЧ (mulberry32) — нужен только для тестов и
 * симуляции баланса. В бою на проде используйте Math.random по умолчанию.
 */
'use strict';

function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Позволяет задать точную последовательность значений (0..1) для юнит-тестов */
function scriptedRng(values) {
  let i = 0;
  return () => (i < values.length ? values[i++] : values[values.length - 1]);
}

module.exports = { makeRng, scriptedRng };
