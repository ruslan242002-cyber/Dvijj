'use strict';

const { BESTIARY } = require('../engine/bestiary.js');

const TOTAL_TROPHIES = Object.keys(BESTIARY).length;

const TROPHY_MILESTONES = [
  { count: 3, title: 'Начинающий охотник' },
  { count: 7, title: 'Опытный охотник' },
  { count: 12, title: 'Мастер охоты' },
  { count: TOTAL_TROPHIES, title: 'Легенда Периферии' },
];

function recordKill(player, bestiaryId) {
  if (!bestiaryId || !BESTIARY[bestiaryId]) return { isNew: false, player };
  player.bestiaryTrophies = player.bestiaryTrophies || [];
  if (player.bestiaryTrophies.includes(bestiaryId)) return { isNew: false, player };
  player.bestiaryTrophies.push(bestiaryId);
  return { isNew: true, player, trophyName: BESTIARY[bestiaryId].name };
}

function currentTitle(player) {
  const count = (player.bestiaryTrophies || []).length;
  let title = null;
  for (const milestone of TROPHY_MILESTONES) {
    if (count >= milestone.count) title = milestone.title;
  }
  return title;
}

function trophyProgressText(player) {
  const collected = player.bestiaryTrophies || [];
  const title = currentTitle(player);
  const summary = `🏆 Трофеи: ${collected.length}/${TOTAL_TROPHIES}${title ? ` — «${title}»` : ''}`;
  const lines = Object.values(BESTIARY).map(
    (m) => `${collected.includes(m.id) ? '🏆' : '❔'} ${m.name}`
  );
  return { summary, lines };
}

module.exports = { TOTAL_TROPHIES, TROPHY_MILESTONES, recordKill, currentTitle, trophyProgressText };
