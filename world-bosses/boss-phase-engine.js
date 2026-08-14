/**
 * engine/world-bosses/boss-phase-engine.js
 *
 * Каждый босс в boss-data.js имеет skills с полем phase: 'normal' | 'rage'.
 * 'rage' — навык из явно описанной на карточке "второй фазы" (Плавка,
 * Ядро плавки, Пробуждение Бездны, Договорная печать и т.п.), доступен
 * только один раз за бой (cooldown: 99 + trigger hpBelow — сработает,
 * останется на кулдауне до конца боя).
 *
 * pickBossAction — то же самое, что pickEnemyAction из enemy-skills/enemy-ai.js,
 * но дополнительно уважает текущую фазу и кидает событие смены фазы наружу
 * (чтобы, например, разослать в VK-чат группы "Архонт входит в режим Плавки").
 */
'use strict';

/**
 * @param {object} bossDef — запись из boss-data.js
 * @param {object} bossState — { hpShared, hpMax, phase: 'normal'|'rage', cooldowns: {} }
 * hpShared — общий HP-пул боя (см. group-encounter.js), не HP одного участника.
 */
function pickBossAction(bossDef, bossState, rng = Math.random) {
  const hpFrac = bossState.hpShared / bossState.hpMax;
  const enteringRage = bossState.phase === 'normal' && hpFrac < 0.25 &&
    bossDef.skills.some((s) => s.phase === 'rage' && /^hpBelow:/.test(s.trigger));

  let phaseEvent = null;
  if (enteringRage) {
    bossState.phase = 'rage';
    phaseEvent = { type: 'phase_change', text: `${bossDef.name} переходит во вторую фазу.` };
  }

  const pool = bossDef.skills.filter((s) => {
    if (s.phase === 'rage' && bossState.phase !== 'rage') return false;
    if ((bossState.cooldowns[s.id] || 0) > 0) return false;
    if (s.trigger === 'always') return true;
    const m = /^hpBelow:([\d.]+)$/.exec(s.trigger || '');
    if (m) return hpFrac < Number(m[1]);
    return false;
  });

  if (!pool.length) return { type: 'basicAttack', phaseEvent };

  // В rage-фазе приоритет — сами rage-навыки, чтобы бой ощутимо менялся,
  // а не просто "иногда добавляется ещё один вариант в общий пул".
  const rageSkills = pool.filter((s) => s.phase === 'rage');
  const chosen = (bossState.phase === 'rage' && rageSkills.length ? rageSkills : pool);
  const skill = chosen[Math.floor(rng() * chosen.length)];
  return { type: 'skill', skill, phaseEvent };
}

function tickBossCooldowns(cooldowns) {
  const next = {};
  for (const [id, left] of Object.entries(cooldowns || {})) {
    if (left > 1) next[id] = left - 1;
  }
  return next;
}

module.exports = { pickBossAction, tickBossCooldowns };
