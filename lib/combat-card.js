'use strict';

/**
 * Карточка боя в стиле Атраксиса: HP-бар (■/□) с дельтой урона в скобках,
 * плюс статы боя иконками. У нас нет "крита"/"уклонения в стиле Атраксиса"
 * один-в-один — статы другие (accuracy/dodge/focus/firepower/shielding),
 * так что иконки подобраны под то, что реально есть в combat-engine.js:
 *   ⚔️ огневая мощь (firepower) — базовый урон атаки
 *   🛡️ экранирование (shielding) — плоское поглощение урона
 *   🎯 точность (accuracy, %)
 *   🌀 уклонение (dodge, %)
 *   ✨ фокус (focus, %) — шанс критического/усиленного действия
 *
 * prevHp (если передан) — HP на прошлый ход, для дельты вида "(-42)"/"(+15)".
 */

const { progressBar } = require('./status-card.js');

function combatStatusCard(fighter, { icon = '❤️', prevHp = null } = {}) {
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

  return (
    `${icon} ${fighter.name}: ${hp}/${hpMax}\n${bar}${delta}\n` +
    `⚔️${firepower}  🛡️${shielding}  🎯${accuracy}%  🌀${dodge}%  ✨${focus}%`
  );
}

/** Полная карточка на оба участника боя — то, что дописывается к тексту
 * реплики в combat/pre_combat сцене. */
function combatFullCard(player, enemy, { prevPlayerHp = null, prevEnemyHp = null } = {}) {
  return (
    combatStatusCard(enemy, { icon: '👾', prevHp: prevEnemyHp }) +
    '\n\n' +
    combatStatusCard(player, { icon: '❤️', prevHp: prevPlayerHp })
  );
}

/** То же самое, но для боя со стаей (game/scenes/exploration.js:
 * pack_pre_combat/pack_combat) — карточка на каждого живого члена стаи
 * плюс игрока, тот же самый визуальный формат, что и в бою 1 на 1, не
 * отдельная более бедная система. Мёртвые члены стаи показываются
 * коротко (без полной статы-строки — там уже нечего показывать). */
function combatPackCard(player, pack, { prevPlayerHp = null, prevPackHp = [] } = {}) {
  const packCards = pack
    .map((p, i) => (p.hp > 0 ? combatStatusCard(p, { icon: '👾', prevHp: prevPackHp[i] }) : `💀 ${p.name}: 0/${p.hpMax}`))
    .join('\n\n');
  return `${packCards}\n\n${combatStatusCard(player, { icon: '❤️', prevHp: prevPlayerHp })}`;
}

module.exports = { combatStatusCard, combatFullCard, combatPackCard };
