'use strict';

/**
 * ОБЩЕМИРОВАЯ ЖИЛА РЕСУРСА — стержень системы. Здесь только чистая логика
 * (никакого стора/уведомлений/сцен — это отдельный, куда более объёмный
 * слой интеграции, см. заметку в конце файла).
 *
 * ИНСТРУМЕНТ ДОБЫЧИ (по вашему запросу "придумай логику, связанную с
 * нашей игрой"):
 *   Т1-Т2 — добываются как обычно, без инструмента (уже так в игре).
 *   Т3-Т4 — нужен «Резонансный бур»: обычное сверло на такой руде
 *     вызывает отклик Тракта прямо в породе (та же природа, что и
 *     аномалии) — бур гасит резонанс перед тем, как порода успевает
 *     "ответить". Без него — либо совсем не добыть, либо с реальным
 *     риском поймать локальную аномалию прямо у себя в трюме.
 *   Т5-Т6 — нужен «Аннигилятор жилы»: редкий, дорогой инструмент,
 *     собирается только с промышленной базой Кузницы (единственная
 *     станция, которая производит сырьё в промышленных масштабах и
 *     потому единственная, кто умеет делать оборудование для настолько
 *     нестабильной руды). Это не фракционный замок — купить/скрафтить
 *     может кто угодно, просто Кузница — единственный реальный источник.
 */

const RESONANCE_DRILL = 'resonance_drill';
const VEIN_ANNIHILATOR = 'vein_annihilator';

function requiredTool(tier) {
  if (tier <= 2) return null;
  if (tier <= 4) return RESONANCE_DRILL;
  return VEIN_ANNIHILATOR;
}

function canMineTier(player, tier) {
  const tool = requiredTool(tier);
  if (!tool) return true;
  return (player.tools || []).includes(tool);
}

// ── Сама жила ──

function generateVeinId() {
  return `vein_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const VEIN_RESOURCES_BY_TIER = {
  3: 'Сплавы', 4: 'Реголит', 5: 'Изотопы', 6: 'Биомасса',
};

/**
 * Прочность жилы масштабируется тиром — выше тир, крепче порода. Итоговая
 * прочность ТАКЖЕ немного растёт от того, сколько игроков сейчас в сети
 * (см. заметку в задаче: "нужно находиться онлайн") — реализовано как
 * онлайн-множитель, передаваемый снаружи (сам движок онлайн не считает).
 */
function createVein(tier, onlinePlayersCount = 1, rng = Math.random) {
  const base = 500 + tier * 300;
  const onlineMult = 1 + Math.min(onlinePlayersCount, 40) * 0.02; // мягкий рост, не взрывной
  const durabilityMax = Math.round(base * onlineMult);
  return {
    id: generateVeinId(),
    tier,
    resource: VEIN_RESOURCES_BY_TIER[tier] || 'Сплавы',
    durabilityMax,
    durability: durabilityMax,
    participants: {},   // playerId -> { level, damageDealt, inCombat }
    bossesSpawned: false,
    bosses: [],          // { id, hp, hpMax, alive, assignedTeam }
    createdAt: Date.now(),
  };
}

function durabilityPercent(vein) {
  return Math.round((vein.durability / vein.durabilityMax) * 100);
}

/** Урон по жиле от одного цикла добычи — зависит от уровня добывающего.
 * Не добывается, пока игрок в бою (это уже enforced вызывающим кодом —
 * движок просто не вызывается в этот момент, здесь проверять нечего). */
function miningDamage(playerLevel) {
  return 8 + Math.floor((playerLevel || 1) / 5);
}

function applyMining(vein, playerId, playerLevel) {
  const dmg = miningDamage(playerLevel);
  vein.durability = Math.max(0, vein.durability - dmg);
  vein.participants[playerId] = vein.participants[playerId] || { level: playerLevel, damageDealt: 0 };
  vein.participants[playerId].damageDealt += dmg;
  vein.participants[playerId].level = playerLevel;
  return dmg;
}

// ── Боссы на 20% ──

const BOSS_TRIGGER_PERCENT = 20;
const PLAYERS_PER_BOSS = 4;

function shouldSpawnBosses(vein) {
  return !vein.bossesSpawned && durabilityPercent(vein) <= BOSS_TRIGGER_PERCENT;
}

/** Один босс на каждые 4 участника (округление вверх — 5 игроков это уже
 * 2 босса, не 1.25). */
function bossCountForParticipants(participantCount) {
  return Math.max(1, Math.ceil(participantCount / PLAYERS_PER_BOSS));
}

/**
 * HP босса — намеренно с большим запасом: одиночке не одолеть, вдвоём —
 * тяжело до предела, вчетвером (полная группа на одного босса) — реально,
 * но не легко. Масштабируется и тиром жилы, и числом участников (чтобы
 * при избытке игроков на одного босса он не оказался слишком лёгким).
 */
function bossHpFor(veinTier, participantsPerThisBoss) {
  return Math.round(1400 * veinTier * Math.max(1, participantsPerThisBoss / PLAYERS_PER_BOSS));
}

/** Боевые статы босса — масштабируются тиром жилы, намеренно тяжёлые
 * (одиночке не одолеть, вдвоём — на пределе, см. bossHpFor). Полноценная
 * форма Fighter (не только hp/hpMax) — иначе combat-engine.js падает при
 * первой же попытке атаковать. */
function bossStatsFor(veinTier) {
  const base = 30 + veinTier * 12;
  return { power: base, mind: base, reaction: base * 0.8, endurance: base, firepower: base * 1.1, shielding: Math.round(base * 0.5) };
}

function spawnBosses(vein, participantCount) {
  const count = bossCountForParticipants(participantCount);
  const perBoss = Math.ceil(participantCount / count);
  vein.bossesSpawned = true;
  vein.bosses = Array.from({ length: count }, (_, i) => {
    const hp = bossHpFor(vein.tier, perBoss);
    return {
      id: `${vein.id}_boss_${i + 1}`,
      name: `Страж жилы ${i + 1}`,
      hp, hpMax: hp,
      stats: bossStatsFor(vein.tier),
      luck: 10, accuracy: 0.8, dodge: 0.06, focus: 0.75, periodic: [],
      alive: true,
    };
  });
  return vein.bosses;
}

function aliveBosses(vein) {
  return vein.bosses.filter((b) => b.alive);
}

function allBossesDead(vein) {
  return vein.bosses.length > 0 && vein.bosses.every((b) => !b.alive);
}

/**
 * Команда, убившая "своего" босса, пока жив хотя бы один другой — не
 * простаивает, а идёт помогать на оставшегося (по условию задачи). Эта
 * функция просто говорит, какого босса атаковать дальше — движок сам
 * ничего не переселяет, это решение сцены/UI.
 */
function nextBossToJoin(vein) {
  const alive = aliveBosses(vein);
  if (!alive.length) return null;
  return alive.reduce((best, b) => (b.hp > best.hp ? b : best), alive[0]);
}

// ── Награда ──

/** Раздаётся ТОЛЬКО когда все боссы жилы мертвы. Пропорционально ВКЛАДУ
 * (damageDealt) каждого участника — не поровну. Это важно: если PvP на
 * жиле ворует часть чужого вклада (см. engine/vein-pvp.js), кража должна
 * реально что-то менять в итоговой доле, а не быть косметикой. */
function distributeVeinRewards(vein, participantIds) {
  if (!allBossesDead(vein) || !participantIds.length) return {};
  const totalReward = vein.durabilityMax * 2;
  const totalContribution = participantIds.reduce((sum, id) => sum + (vein.participants[id]?.damageDealt || 0), 0);
  if (totalContribution <= 0) {
    // Никто формально не копал (все участвовали только в боях с боссом) —
    // страхуемся от деления на 0, делим поровну как раньше.
    const share = Math.floor(totalReward / participantIds.length);
    return participantIds.reduce((acc, id) => { acc[id] = share; return acc; }, {});
  }
  return participantIds.reduce((acc, id) => {
    const contribution = vein.participants[id]?.damageDealt || 0;
    acc[id] = Math.floor(totalReward * (contribution / totalContribution));
    return acc;
  }, {});
}

module.exports = {
  RESONANCE_DRILL, VEIN_ANNIHILATOR, requiredTool, canMineTier,
  createVein, durabilityPercent, miningDamage, applyMining,
  BOSS_TRIGGER_PERCENT, PLAYERS_PER_BOSS, shouldSpawnBosses, bossCountForParticipants,
  bossHpFor, spawnBosses, aliveBosses, allBossesDead, nextBossToJoin,
  distributeVeinRewards,
};
