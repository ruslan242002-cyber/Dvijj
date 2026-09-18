'use strict';

/**
 * АРТЕФАКТЫ — находятся только через ПОИСК внутри аномалий (не падают
 * с боя/крафта/жилы), отдельная, самая редкая категория предметов.
 * Один выделенный слот (не 4 как у модулей, не 2 как у снаряжения).
 */
const ARTIFACT_POOL = [
  { id: 'echo_shard', name: 'Осколок Отголоска', blurb: 'Тонкий кристалл, внутри которого что-то тихо повторяет одно и то же слово на языке, которого нет.', stat: 'mind', bonus: 6 },
  { id: 'frozen_pulse', name: 'Застывший пульс', blurb: 'Кусок металла, который бьётся, как сердце — редко, но безошибочно, в такт с чем-то очень далёким.', stat: 'endurance', bonus: 6 },
  { id: 'null_compass', name: 'Нулевой компас', blurb: 'Стрелка всегда указывает не туда — но именно "не туда" почему-то всегда безопаснее.', stat: 'reaction', bonus: 6 },
  { id: 'traktor_seed', name: 'Семя Тракта', blurb: 'Выглядит органическим, ведёт себя как техника — растёт медленно, но растёт, даже в вакууме.', stat: 'power', bonus: 6 },
  { id: 'memory_thorn', name: 'Шип памяти', blurb: 'Прикосновение к нему возвращает обрывок чужого воспоминания — не твоего, но почему-то знакомого.', stat: 'firepower', bonus: 8 },
  { id: 'silent_bell', name: 'Немой колокол', blurb: 'Звонит беззвучно — но каждый, кто рядом, на миг чувствует, будто услышал что-то важное.', stat: 'shielding', bonus: 8 },
];

const MAX_ARTIFACT_SLOTS = 1;

// ⚠️ ОТДЕЛЬНЫЙ пул — квестовые артефакты (по прямому запросу
// пользователя: "уникальные предметы за квест, не сильно влияющие на
// игру"). НЕ участвуют в pickRandomArtifact() — попадают к игроку
// ТОЛЬКО через конкретный квест, не через случайный поиск аномалий.
// Тот же небольшой масштаб бонуса (6-8), что и у обычных артефактов —
// не выбиваются из баланса, просто памятные вещи с лёгким эффектом.
const QUEST_ARTIFACT_POOL = [
  { id: 'darens_jacket_worn', name: 'Куртка Дарена', blurb: 'Потрёпанная лётная куртка с чужими инициалами на подкладке — та самая, что нашла Мара на скрытой станции. Носить её — как носить чьё-то незаконченное ожидание.', stat: 'endurance', bonus: 7 },
  { id: 'committee_badge', name: 'Удостоверение агента Комитета', blurb: 'Найдено у поверженного наблюдателя за мастерской Крана — ничего не подтверждает официально, но однозначно доказывает, что слежка была настоящей.', stat: 'reaction', bonus: 6 },
];

function findArtifact(idOrArtifact) {
  if (idOrArtifact && typeof idOrArtifact === 'object') return idOrArtifact.id ? idOrArtifact : null;
  return ARTIFACT_POOL.find((a) => a.id === idOrArtifact) || QUEST_ARTIFACT_POOL.find((a) => a.id === idOrArtifact) || null;
}

/** Выдать конкретный квестовый артефакт (не случайный) — используется
 * из choice.questArtifact в npc-arcs.js. Не дублирует, если уже есть. */
function grantQuestArtifact(player, artifactId) {
  const artifact = QUEST_ARTIFACT_POOL.find((a) => a.id === artifactId);
  if (!artifact) return { ok: false, reason: 'UNKNOWN_QUEST_ARTIFACT' };
  player.artifacts = player.artifacts || [];
  if (!player.artifacts.includes(artifactId)) player.artifacts.push(artifactId);
  return { ok: true, artifact };
}

function pickRandomArtifact(rng = Math.random) {
  return ARTIFACT_POOL[Math.floor(rng() * ARTIFACT_POOL.length)];
}

function equipArtifact(player, artifactId) {
  const artifact = findArtifact(artifactId);
  if (!artifact) return { ok: false, reason: 'UNKNOWN_ARTIFACT' };
  if (!(player.artifacts || []).includes(artifact.id)) return { ok: false, reason: 'NOT_OWNED' };
  player.equippedArtifact = artifact.id;
  return { ok: true };
}

function unequipArtifact(player) {
  player.equippedArtifact = null;
  return { ok: true };
}

/** Суммарный бонус от экипированного артефакта — тот же формат, что и
 * aggregateModuleEffects/aggregateGearEffects. */
function aggregateArtifactEffects(player) {
  const bonuses = {};
  const artifact = findArtifact(player.equippedArtifact);
  if (artifact) bonuses[artifact.stat] = (bonuses[artifact.stat] || 0) + artifact.bonus;
  return bonuses;
}

module.exports = {
  ARTIFACT_POOL, QUEST_ARTIFACT_POOL, MAX_ARTIFACT_SLOTS,
  findArtifact, pickRandomArtifact, equipArtifact, unequipArtifact, aggregateArtifactEffects, grantQuestArtifact,
};
