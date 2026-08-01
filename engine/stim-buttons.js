'use strict';

const { STIMS } = require('./skills-data');

/** Кнопки стимов для боевого меню — тот же паттерн, что skillButtons(). */
function stimButtons() {
  return Object.values(STIMS).map((s) => s.name);
}

function stimIdByName(name) {
  return Object.values(STIMS).find((s) => s.name === name)?.id || null;
}

module.exports = { stimButtons, stimIdByName };
