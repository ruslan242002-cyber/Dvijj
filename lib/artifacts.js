'use strict';

/**
 * АРТЕФАКТЫ — находятся только через ПОИСК внутри аномалий (не падают
 * с боя/крафта/жилы), отдельная, самая редкая категория предметов.
 * Один выделенный слот (не 4 как у модулей, не 2 как у снаряжения) —
 * артефакт это штучная, редкая находка, не то, что стакается.
 */

const ARTIFACT_POOL = [
  {
    id: 'echo_shard',
    name: 'Осколок Отголоска',
    blurb: 'Тонкий кристалл, внутри которого что-то тихо повторяет одно и то же слово на языке, которого никто не узнаёт.',
    stat: 'mind',
    bonus: 6,
  },
  {
    id: 'frozen_pulse',
    name: 'Застывший пульс',
    blurb: 'Кусок металла, который бьётся, как сердце — редко, но безошибочно, в такт с чем-то очень далёким.',
    stat: 'endurance',
    bonus: 6,
  },
  {
    id: 'null_compass',
    name: 'Нулевой компас',
    blurb: 'Стрелка всегда указывает не туда — но именно "не туда" почему-то всегда безопаснее, чем "туда".',
    stat: 'reaction',
    bonus: 6,
  },
  {
    id: 'traktor_seed',
    name: 'Семя Тракта',
    blurb: 'Выглядит органическим, ведёт себя как техника — растёт медленно, но растёт, даже в кармане скафандра.',
    stat: 'power',
    bonus: 6,
  },
  {
    id: 'memory_thorn',
    name: 'Шип памяти',
    blurb: 'Прикосновение к нему возвращает обрывок чужого воспоминания — не твоего, но почему-то знакомого.',
    stat: 'firepower',
    bonus: 8,
  },
  {
    id: 'silent_bell',
    name: 'Немой колокол',
    blurb: 'Звонит беззвучно — но каждый, кто рядом, на миг чувствует, будто услышал что-то важное.',
    stat: 'shielding',
    bonus: 8,
  },
];

const MAX_ARTIFACT_SLOTS = 1; // одна штучная находка за раз, не стак

function findArtifact(idOrArtifact) {
  if (idOrArtifact && typeof idOrArtifact === 'object') return idOrArtifact.id ? findArtifact(idOrArtifact.id) : null;
  return ARTIFACT_POOL.find((a) => a.id === idOrArtifact) || null;
}

function pickRandomArtifact(rng = Math.random) {
  return ARTIFACT_POOL[Math.floor(rng() * ARTIFACT_POOL.length)];
}

function equipArtifact(player, artifactId) {
  const artifact = findArtifact(artifactId);
  if (!artifact) return { ok: false, reason: 'UNKNOWN_ARTIFACT' };
  if (!(player.artifacts || []).includes(artifact.id)) return { ok: false, reason: 'NOT_OWNED' };
  player.equippedArtifact = artifact.id; // один слот — просто перезаписывается
  return { ok: true };
}

function unequipArtifact(player) {
  player.equippedArtifact = null;
  return { ok: true };
}

/** Суммарный бонус от экипированного артефакта — тот же формат, что и
 * aggregateModuleEffects/aggregateGearEffects, чтобы завести в тот же
 * пайплайн в engine/derived-stats.js без лишней возни. */
function aggregateArtifactEffects(player) {
  const bonuses = {};
  const artifact = findArtifact(player.equippedArtifact);
  if (artifact) bonuses[artifact.stat] = (bonuses[artifact.stat] || 0) + artifact.bonus;
  return bonuses;
}

module.exports = {
  ARTIFACT_POOL, MAX_ARTIFACT_SLOTS,
  findArtifact, pickRandomArtifact, equipArtifact, unequipArtifact, aggregateArtifactEffects,
};
