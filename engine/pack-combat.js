'use strict';

/**
 * БОЙ 1 ПРОТИВ НЕСКОЛЬКИХ СЛАБЫХ — не последовательный "добей одного,
 * потом следующего" (это было бы гарантированной победой без реального
 * давления), а настоящее окружение: игрок выбирает ОДНУ цель за ход,
 * но контратакуют ВСЕ ещё живые члены стаи разом, каждый раунд, пока
 * стая не выбита целиком.
 */

const { resolveTurn } = require('./combat-engine.js');

/** Стая слабее одиночного врага того же уровня ПО ОТДЕЛЬНОСТИ — иначе
 * "толпа" била бы как несколько полноценных противников разом, что для
 * "слабых монстров" не подходит по смыслу задачи. */
function generatePack(zone, rng, generateEnemyFn, playerLevel, count = 3) {
  const pack = [];
  for (let i = 0; i < count; i++) {
    const enemy = generateEnemyFn(zone, rng, playerLevel);
    enemy.hp = Math.max(1, Math.round(enemy.hp * 0.5));
    enemy.hpMax = enemy.hp;
    enemy.name = `${enemy.name} (${i + 1}/${count})`;
    pack.push(enemy);
  }
  return pack;
}

/** Один полный раунд: игрок бьёт ОДНУ выбранную цель, затем контратакуют
 * все ещё живые члены стаи по очереди (после хода игрока — раунд именно
 * такой, не одновременный, но урон стаи не откладывается "на потом"). */
function resolvePackRound(playerFighter, pack, targetIndex, skill, rng) {
  const log = [];
  const target = pack[targetIndex];
  if (!target || target.hp <= 0) {
    return { log: ['Цель уже мертва — выбери другую.'], playerFighter, pack, playerDefeated: false, packDefeated: pack.every((p) => p.hp <= 0) };
  }

  const playerTurn = resolveTurn({ attacker: playerFighter, defender: target, skill, rng });
  log.push(...playerTurn.log);
  let updatedPlayer = playerTurn.attacker;
  const updatedPack = pack.map((p, i) => (i === targetIndex ? playerTurn.defender : p));

  for (let i = 0; i < updatedPack.length; i++) {
    if (updatedPack[i].hp <= 0 || updatedPlayer.hp <= 0) continue;
    const counterTurn = resolveTurn({ attacker: updatedPack[i], defender: updatedPlayer, rng });
    log.push(...counterTurn.log);
    updatedPlayer = counterTurn.defender;
    updatedPack[i] = counterTurn.attacker;
  }

  return {
    log,
    playerFighter: updatedPlayer,
    pack: updatedPack,
    playerDefeated: updatedPlayer.hp <= 0,
    packDefeated: updatedPack.every((p) => p.hp <= 0),
  };
}

function packStatusText(pack) {
  return pack.map((p) => `${p.hp > 0 ? '👾' : '💀'} ${p.name}: ${Math.max(0, p.hp)}/${p.hpMax}`).join('\n');
}

module.exports = { generatePack, resolvePackRound, packStatusText };
