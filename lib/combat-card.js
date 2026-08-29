'use strict';

/**
 * Карточка боя: HP-бар (■/□) с дельтой урона в скобках, плюс статы боя
 * иконками — firepower/shielding/accuracy/dodge/focus (то, что реально
 * есть в combat-engine.js).
 *
 * ⚠️ ПРОВЕРЬ: иконки (icon по умолчанию, статов) вырезаны разрывом
 * страницы в PDF — восстановлены разумными эмодзи, логика/расчёты целы.
 *
 * prevHp (если передан) — HP на прошлый ход, для дельты вида "(-42)"/"(+15)".
 */
const { progressBar, renderCard } = require('./status-card.js');

function fighterStatusLines(fighter, { icon = '⚔️', prevHp = null } = {}) {
  const hp = Math.round(fighter.hp);
  const hpMax = Math.round(fighter.hpMax);
  const bar = progressBar(hp, hpMax);
  let delta = '';
  if (prevHp !== null && prevHp !== undefined) {
    const diff = Math.round(fighter.hp - prevHp);
    delta = ` (${diff > 0 ? '+' : ''}${diff})`;
  }
  const accuracy = Math.round((fighter.accuracy || 0) * 100);
  const dodge = Math.round((fighter.dodge || 0) * 100);
  const focus = Math.round((fighter.focus || 0) * 100);
  const firepower = Math.round(fighter.stats?.firepower ?? 0);
  const shielding = Math.round(fighter.stats?.shielding ?? 0);

  return [
    `${icon} ${fighter.name}: ${hp}/${hpMax}`,
    `${bar}${delta}`,
    `🔫${firepower} 🛡️${shielding} 🎯${accuracy}% 💨${dodge}% 🧠${focus}%`,
  ];
}

function combatStatusCard(fighter, opts = {}) {
  return fighterStatusLines(fighter, opts).join('\n');
}

/** Полная карточка на оба участника боя — то, что дописывается к тексту
 * реплики в combat/pre_combat сцене. Один общий блок на бой, не два
 * отдельных — по референсу единой карточки-контракта в стиле терминала. */
function combatFullCard(player, enemy, { prevPlayerHp = null, prevEnemyHp = null } = {}) {
  return renderCard('БОЙ', [
    ...fighterStatusLines(enemy, { icon: '👹', prevHp: prevEnemyHp }),
    '',
    ...fighterStatusLines(player, { icon: '🧑‍🚀', prevHp: prevPlayerHp }),
  ]);
}

module.exports = { combatStatusCard, combatFullCard };
