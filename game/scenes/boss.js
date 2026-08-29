'use strict';

const { findBoss, allBossIds } = require('../../bosses/boss-data.js');
const { spawnBossInstance, resolvePlayerVsBoss, distributeRewards, shouldSpawnBoss } = require('../../bosses/boss-engine.js');
const { SKILLS } = require('../../engine/skills-data.js');
const { hubMessage, stationButtons, skillButtons, skillIdByName, skillCooldownNote } = require('./common.js');
const { startCooldown, tickCooldowns } = require('../../engine/cooldowns.js');
const { checkAchievements } = require('../../lib/achievements.js');
const { grantXp } = require('../../engine/leveling.js');
const { activeGuildBonuses } = require('../../guilds/guild-levels.js');
const { logWorldEvent } = require('../../lib/world-feed.js');
const { logEconomyEvent, EVENT_TYPES } = require('../../lib/economy-audit.js');
const { notifyPlayer } = require('../../lib/notifications.js');
const { SCENES } = require('./ids.js');
const { BOSS_IMAGE_MANIFEST } = require('../../engine/travel-images/boss-image-manifest.js');
const { formatBossStatusCard } = require('../../lib/boss-status-card.js');

// Тема именной локации (lib/named-locations.js) -> id боссов, которые
// там водятся (engine/world-bosses/boss-data.js:location). Несколько
// боссов на одну тему — при встрече выбирается случайный среди них.
// Кузня Забытых (industrial), Кладбище Флота (wreckage), Некрополь Ксарн
// (ruins) и Бездна Оррин (abyss) — все 4 красные локации; Ярмарка Теней
// (smuggle) — единственная жёлтая, поэтому и босс там послабже.
const BOSS_LOCATION_THEMES = {
  abyss: ['guardian_unnamed_horizons', 'abyss_firstborn'],
  ruins: ['ksarn_praxid', 'ksarn_memorist', 'ksarn_echo_keeper'],
  industrial: ['forge_archon', 'oblivion_engineer'],
  wreckage: ['echo_destroyer', 'void_keeper', 'vexar_chronofallen'],
  smuggle: ['shadow_auctioneer'],
};

// Небольшой шанс на каждом шаге вылазки по подходящей локации — не
// гарантия при каждом визите (иначе локация превратится в "комнату
// босса", а не место с шансом на редкую опасную встречу).
const BOSS_ENCOUNTER_CHANCE = 0.06;

/** Вызывать из exploration.js на каждый шаг вылазки (после броска
 * обычного события) — если тема локации подходит и шанс сработал,
 * возвращает bossId для встречи, иначе null. Не трогает bossStore —
 * только решает, "срабатывает" ли сама встреча. */
function rollBossEncounter(locationTheme, rng = Math.random) {
  const candidates = BOSS_LOCATION_THEMES[locationTheme];
  if (!candidates || !candidates.length) return null;
  if (rng() >= BOSS_ENCOUNTER_CHANCE) return null;
  return candidates[Math.floor(rng() * candidates.length)];
}

/** Экран встречи с конкретным именным боссом — загружает существующий
 * активный инстанс (если кто-то уже начал бой) или спавнит новый (если
 * прошёл кулдаун респавна). imageKey подхватывается автоматически уже
 * существующим механизмом (vk/photo-cache.js через deps.resolveEnemyImage,
 * см. vk/webhook-handler.js) — здесь только нужно его правильно указать. */
async function bossEncounterScreen(deps, player, playerId, bossId, prefixText = '') {
  const boss = findBoss(bossId);
  if (!boss || !deps.bossStore) return null;

  let instance = await deps.bossStore.getActiveBoss(bossId);
  if (!instance || instance.defeated) {
    const lastDefeatedAt = (await deps.bossStore.getLastDefeatedAt(bossId)) || 0;
    if (!shouldSpawnBoss(bossId, lastDefeatedAt)) return null;
    instance = spawnBossInstance(bossId);
    await deps.bossStore.saveBoss(instance, bossId);
  }

  return {
    reply: {
      text: `${prefixText}${formatBossStatusCard(boss, instance)}`,
      buttons: ['⚔️ Атаковать', '🏃 Уйти'],
      imageKey: BOSS_IMAGE_MANIFEST[bossId]?.file,
    },
    nextState: { scene: SCENES.BOSS_HUB, player, activeBossId: bossId },
  };
}


const BOSS_SLOT = 'default';
// Раньше — единственный ACTIVE_BOSS_ID='test_colossus'. Теперь 11 реальных
// боссов (bosses/boss-data.js — адаптер над engine/world-bosses/), у
// каждого СВОЙ таймер респавна (bossId используется как slot-ключ в
// bossStore вместо общего 'default' — getLastDefeatedAt/setLastDefeatedAt
// уже принимают произвольный slot, ничего менять в сторе не пришлось).

/** Выбирает случайного среди боссов, чей персональный таймер респавна уже
 *  истёк. Если ни один не готов — возвращает null и ближайшее время
 *  ожидания (для текста "никто не потревожил Периферию"). */
async function pickReadyBoss(deps) {
  const ready = [];
  let soonestHoursLeft = Infinity;
  for (const bossId of allBossIds()) {
    const boss = findBoss(bossId);
    const lastDefeated = await deps.bossStore.getLastDefeatedAt(bossId);
    if (shouldSpawnBoss(bossId, lastDefeated)) {
      ready.push(bossId);
    } else if (boss.respawnMinHours < 999999) {
      const hoursLeft = Math.max(0, boss.respawnMinHours - (Date.now() - lastDefeated) / 3600000);
      soonestHoursLeft = Math.min(soonestHoursLeft, hoursLeft);
    }
  }
  if (!ready.length) return { bossId: null, soonestHoursLeft: soonestHoursLeft === Infinity ? null : Math.round(soonestHoursLeft) };
  return { bossId: ready[Math.floor(Math.random() * ready.length)], soonestHoursLeft: null };
}

/** Гильдейский бонус к урону по мировому боссу (3-й уровень гильд-
 *  апгрейда) — читается здесь явно и передаётся в resolvePlayerVsBoss,
 *  сам движок босса не знает о гильдиях (тот же принцип, что feeDiscount
 *  в market-engine.js). Деградирует тихо, если гильдии/deps.guildStore
 *  нет — 0% бонуса, бой всё равно работает. */
async function guildDamageBonusFor(deps, player) {
  if (!player.guildId || !deps.guildStore) return 0;
  const guildLevel = await deps.guildStore.getGuildUpgradeLevel(player.guildId);
  return activeGuildBonuses(guildLevel).worldBossDamagePct;
}

async function bossHub(deps, player, playerId, prefixText = '') {
  // ВАЖНО: 11 именных боссов (engine/world-bosses/) НЕ показываются здесь.
  // По уточнению — они "обычные враги, но в разы сильнее", встречаются НА
  // СВОЕЙ ЛОКАЦИИ (см. boss.location в engine/world-bosses/boss-data.js),
  // не через центральную кнопку станции. Настоящий "мировой босс" —
  // отдельная механика через лайки/посты сообщества ВК, ещё не построена.
  // Раньше здесь была ротация среди всех 11 — убрана по прямому указанию.
  return {
    reply: { text: `${prefixText}👹 МИРОВОЙ БОСС\n\nЭта механика ещё не запущена — появление мирового босса будет связано с активностью сообщества «Периферии» в ВК. Сильные противники сейчас встречаются на своих локациях в открытом космосе.`, buttons: ['⬅️ Назад'] },
    nextState: { scene: 'station', player }
  };
}


async function handleBoss(state, input, rng, deps, playerId) {
  if (state.scene === SCENES.BOSS_HUB) {
    if (input === '⬅️ Назад') {
      return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player) }, nextState: { scene: 'station', player: state.player } };
    }
    if (input === '⚔️ Атаковать') {
      const instance = await deps.bossStore.getActiveBoss(state.activeBossId);
      if (!instance || instance.defeated) return bossHub(deps, state.player, playerId, 'Босс уже недоступен.\n\n');
      const buttons = ['⚔️ Обычная атака', ...skillButtons(state.player, state.bossCooldowns || {}), '🏃 Уйти'];
      return { reply: { text: 'Выбери действие:', buttons }, nextState: { scene: SCENES.BOSS_COMBAT, player: state.player, bossCooldowns: state.bossCooldowns || {}, activeBossId: state.activeBossId } };
    }
    return bossHub(deps, state.player, playerId);
  }

  if (state.scene === SCENES.BOSS_COMBAT) {
    if (input === '🏃 Уйти') {
      const instance = await deps.bossStore.getActiveBoss(state.activeBossId);
      const boss = instance ? findBoss(instance.bossId) : null;
      // Переменный шанс — база 40%, растёт с reaction игрока (та же
      // характеристика, что уже отвечает за уклонение/скорость реакции
      // в остальном бою), падает с уровнем угрозы босса. Никогда не 0 и
      // не 100% — побег должен оставаться решением с риском, не гарантией.
      const reactionBonus = (state.player.stats?.reaction || 0) / 200; // 200 reaction -> +100%, реалистично даёт единицы-десятки %
      const threatPenalty = { 'ЛЕГКО': 0, 'СРЕДНИЙ': 0.05, 'ВЫСОКИЙ': 0.1, 'СЛОЖНО': 0.15, 'ВЫСОЧАЙШИЙ': 0.2 }[boss?.threatLevel] || 0.1;
      const escapeChance = Math.max(0.1, Math.min(0.9, 0.4 + reactionBonus - threatPenalty));
      if (rng() < escapeChance) {
        return bossHub(deps, state.player, playerId, '🏃 Манёвр удался — отрываешься от боя без потерь.\n\n');
      }
      return {
        reply: { text: `🏃 Не получилось оторваться — ${boss?.name || 'противник'} остаётся на хвосте, бой продолжается.`, buttons: ['⚔️ Обычная атака', ...skillButtons(state.player, state.bossCooldowns || {}), '🏃 Уйти'] },
        nextState: { scene: SCENES.BOSS_COMBAT, player: state.player, bossCooldowns: state.bossCooldowns || {}, activeBossId: state.activeBossId }
      };
    }
    const skillId = input === '⚔️ Обычная атака' ? null : skillIdByName(input);
    const skill = skillId ? SKILLS[skillId] : null;
    if (input !== '⚔️ Обычная атака' && !skill) {
      const buttons = ['⚔️ Обычная атака', ...skillButtons(state.player, state.bossCooldowns || {}), '🏃 Уйти'];
      return { reply: { text: 'Выбери действие кнопкой ниже.', buttons }, nextState: state };
    }

    const instance = await deps.bossStore.getActiveBoss(state.activeBossId);
    if (!instance || instance.defeated) return bossHub(deps, state.player, playerId, 'Босс уже недоступен.\n\n');

    const guildBonusPct = await guildDamageBonusFor(deps, state.player);
    const result = resolvePlayerVsBoss(instance, state.player, playerId, skill, rng, guildBonusPct);
    if (result.error) return bossHub(deps, state.player, playerId);

    const cooldownsAfterUse = skillId ? startCooldown(state.bossCooldowns || {}, skillId, skill) : (state.bossCooldowns || {});
    const tickedCooldowns = tickCooldowns(cooldownsAfterUse);
    let player = result.player;

    if (result.bossDefeated) {
      await deps.bossStore.saveBoss(instance, instance.bossId);
      await deps.bossStore.setLastDefeatedAt(instance.bossId, Date.now());
      const rewards = distributeRewards(instance);
      for (const [pid, reward] of Object.entries(rewards)) {
        logEconomyEvent(deps, { type: EVENT_TYPES.BOSS_REWARD, playerId: pid, credits: reward.credits, note: 'world_boss_victory' }).catch(() => {});
        if (pid === playerId) {
          player.credits = (player.credits || 0) + reward.credits;
          grantXp(player, reward.xp);
          continue;
        }
        const otherState = await deps.store.get(pid).catch(() => null);
        if (otherState?.player) {
          otherState.player.credits = (otherState.player.credits || 0) + reward.credits;
          grantXp(otherState.player, reward.xp);
          await deps.store.set(pid, otherState).catch(() => {});
          // Уведомляем именно тех, кто не в игре прямо сейчас (текущий
          // playerId уже видит результат в основном ответе ниже, дублировать
          // ему push бессмысленно).
          notifyPlayer(deps, pid, `🎉 Мировой босс повержен! Твоя доля: +${reward.credits} кредитов, +${reward.xp} опыта.`).catch(() => {});
        }
      }
      const myReward = rewards[playerId];
      const newAchievements = checkAchievements(player);
      const achNote = newAchievements.length ? `\n\n${newAchievements.map((a) => `🏆 Достижение: «${a.title}»`).join('\n')}` : '';

      // Лента мира — победа над мировым боссом видна всем, не только
      // участникам боя (см. lib/world-feed.js). Не блокирует ответ
      // игроку (fire-and-forget), не падает, если Redis недоступен.
      const boss = findBoss(instance.bossId);
      logWorldEvent(deps, { type: 'world_boss_defeated', text: `Отряд из ${Object.keys(instance.participants).length} игроков повергает ${boss.name}!` }).catch(() => {});

      return {
        reply: { text: `⚔️ ${result.log.join(' ')}\n\n🎉 БОСС ПОВЕРЖЕН!\nТвоя доля (по вкладу в урон): 💳+${myReward ? myReward.credits : 0}, опыт +${myReward ? myReward.xp : 0}.${achNote}`, buttons: stationButtons(deps, player) },
        nextState: { scene: 'station', player }
      };
    }

    await deps.bossStore.saveBoss(instance, instance.bossId);

    if (result.playerDefeated) {
      const defeatedPlayer = { ...player, hp: Math.round(player.hpMax * 0.3) };
      return {
        reply: { text: `⚔️ ${result.log.join(' ')}\n\n💀 Ты не выдержал удара босса. Эвакуация на станцию, часть HP восстановлена.`, buttons: stationButtons(deps, defeatedPlayer) },
        nextState: { scene: 'station', player: defeatedPlayer }
      };
    }

    const buttons = ['⚔️ Обычная атака', ...skillButtons(player, tickedCooldowns)];
    const cdNote = skillCooldownNote(player, tickedCooldowns);
    const cdLine = cdNote ? `\n\n${cdNote}` : '';
    return {
      reply: { text: `⚔️ ${result.log.join(' ')} (нанёс ${result.dmgDealt})\n\n${formatBossStatusCard(findBoss(instance.bossId), instance)}${cdLine}`, buttons },
      nextState: { scene: SCENES.BOSS_COMBAT, player, bossCooldowns: tickedCooldowns, activeBossId: state.activeBossId }
    };
  }

  return null;
}

module.exports = { bossHub, handleBoss, rollBossEncounter, bossEncounterScreen, BOSS_LOCATION_THEMES };
