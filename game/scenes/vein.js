'use strict';

const {
  requiredTool, canMineTier, durabilityPercent, miningDamage, applyMining,
  shouldSpawnBosses, spawnBosses, aliveBosses, allBossesDead,
  nextBossToJoin, distributeVeinRewards, dominantFaction,
} = require('../../engine/resource-vein.js');
const { resolveVeinAttack, stealVeinContribution } = require('../../engine/vein-pvp.js');
const { shouldTriggerRaid, markRaidTriggered } = require('../../engine/vein-raid-timer.js');
const { createBossRound, submitPlayerAction, isRoundReady, resolveBossRound } = require('../../engine/group-boss-combat.js');
const { generateEnemy } = require('../../engine/exploration-engine.js');
const { resolveTurn } = require('../../engine/combat-engine.js');
const { maybeSpeak } = require('../../lib/fifth-voice.js');
const { skillButtons, skillIdByName, addToInventory, stationButtons, hubMessage } = require('./common.js');
const { SKILLS } = require('../../engine/skills-data.js');
const { SCENES } = require('./ids.js');

const TOOL_NAMES = { resonance_drill: 'Резонансный бур', vein_annihilator: 'Аннигилятор жилы' };

function toolStatusLine(player, vein) {
  const tool = requiredTool(vein.tier);
  if (!tool) return '';
  const has = canMineTier(player, vein.tier);
  return `\n🔧 Требуется: ${TOOL_NAMES[tool]}${has ? ' (есть)' : ' — НЕТ У ТЕБЯ, копать нельзя'}`;
}

function veinStatusText(vein) {
  const pct = durabilityPercent(vein);
  const participantCount = Object.keys(vein.participants).length;
  const bossLine = vein.bossesSpawned
    ? `\n\n👹 Боссов на жиле: ${vein.bosses.length}, живых: ${aliveBosses(vein).length}`
    : '';
  const blockader = dominantFaction(vein);
  const blockadeLine = blockader
    ? `\n\n🚩 Блокада: станция «${blockader}» контролирует добычу здесь — доля других фракций облагается налогом в её пользу.`
    : '';
  return `⛏️ ЖИЛА РЕСУРСА (Т${vein.tier}, ${vein.resource})\n\nПрочность: ${pct}%\nСейчас на месте: ${participantCount} корабл${participantCount === 1 ? 'ь' : 'ей'}${bossLine}${blockadeLine}`;
}

async function veinHubEntry(deps, player, playerId) {
  if (!deps.veinStore) {
    return { reply: { text: '⛏️ Система жил сейчас недоступна.', buttons: stationButtons(deps, player) }, nextState: { scene: 'station', player } };
  }
  const vein = await deps.veinStore.getActiveVein();
  if (!vein) {
    return { reply: { text: '⛏️ Активной жилы сейчас нет. Как только она появится — тебе придёт уведомление, где бы ты ни был(а).', buttons: stationButtons(deps, player) }, nextState: { scene: 'station', player } };
  }
  return veinHubScreen(deps, player, playerId, vein, '');
}

function veinHubButtons(player, vein, playerId) {
  const buttons = [];
  const inBossPhase = vein.bossesSpawned && !allBossesDead(vein);
  if (!inBossPhase) buttons.push('⛏️ Копать');
  const others = Object.keys(vein.participants).filter((id) => id !== playerId);
  if (others.length) buttons.push('👥 Найти людей');
  if (inBossPhase) buttons.push('⚔️ К боссу');
  buttons.push('⬅️ Улететь');
  return buttons;
}

function veinHubScreen(deps, player, playerId, vein, prefixText) {
  return {
    reply: { text: `${prefixText || ''}${veinStatusText(vein)}${toolStatusLine(player, vein)}`, buttons: veinHubButtons(player, vein, playerId) },
    nextState: { scene: SCENES.VEIN_HUB, player }
  };
}

async function handleVein(state, input, rng, deps, playerId) {
  const veinStore = deps.veinStore;

  switch (state.scene) {
    case SCENES.VEIN_HUB: {
      const player = state.player;

      if (input === '⬅️ Улететь') {
        return { reply: { text: hubMessage(player), buttons: stationButtons(deps, player) }, nextState: { scene: 'station', player } };
      }

      if (!veinStore) return veinHubEntry(deps, player, playerId);
      let vein = await veinStore.getActiveVein();
      if (!vein) {
        return { reply: { text: '⛏️ Жила уже выработана и закрыта — похоже, ты опоздал(а).', buttons: stationButtons(deps, player) }, nextState: { scene: 'station', player } };
      }

      if (shouldTriggerRaid(vein)) {
        vein = await veinStore.updateVeinAtomic((v) => {
          if (!v) return v;
          markRaidTriggered(v);
          return v;
        });
        const enemy = generateEnemy(player.level, rng);
        return {
          reply: { text: `⚠️ На жилу выходит ${enemy.name}! Добыча прервана, пока не разберёшься с ним.`, buttons: ['⚔️ Атаковать', 'Попытаться уйти'] },
          nextState: { scene: SCENES.VEIN_MONSTER_COMBAT, player, enemy }
        };
      }

      if (input === '⛏️ Копать') {
        const tool = requiredTool(vein.tier);
        if (tool && !canMineTier(player, vein.tier)) {
          return veinHubScreen(deps, player, playerId, vein, `⛔ Нужен ${TOOL_NAMES[tool]} — без него эта руда не даётся.\n\n`);
        }
        const dmg = miningDamage(player.level);
        vein = await veinStore.updateVeinAtomic((v) => {
          if (!v) return v;
          applyMining(v, playerId, player.level, player.faction);
          return v;
        });
        if (!vein) {
          return { reply: { text: 'Жила исчезла прямо у тебя на глазах — кто-то успел добить её раньше.', buttons: stationButtons(deps, player) }, nextState: { scene: 'station', player } };
        }
        const minedPlayer = { ...player };
        addToInventory(minedPlayer, vein.resource, vein.tier, Math.max(1, Math.round(dmg / 8)));

        if (shouldSpawnBosses(vein)) {
          const participantCount = Object.keys(vein.participants).length;
          vein = await veinStore.updateVeinAtomic((v) => {
            if (!v || v.bossesSpawned) return v;
            spawnBosses(v, participantCount);
            return v;
          });
          return {
            reply: { text: `⛏️ Копаешь. ${veinStatusText(vein)}\n\n💥 Прочность жилы упала до критической — на месте появляются защитники!`, buttons: veinHubButtons(minedPlayer, vein, playerId) },
            nextState: { scene: SCENES.VEIN_HUB, player: minedPlayer }
          };
        }

        return veinHubScreen(deps, minedPlayer, playerId, vein, '⛏️ Копаешь. ');
      }

      if (input === '👥 Найти людей') {
        const others = Object.entries(vein.participants).filter(([id]) => id !== playerId);
        if (!others.length) return veinHubScreen(deps, player, playerId, vein, 'Кроме тебя, на жиле сейчас никого.\n\n');
        const lines = others.map(([id, entry]) => `${id.slice(0, 6)}… — уровень ${entry.level || '?'}`);
        const buttons = [...others.map(([id]) => `Атаковать: ${id}`), '⬅️ Назад'];
        return {
          reply: { text: `👥 НА ЖИЛЕ СЕЙЧАС\n\n${lines.join('\n')}`, buttons },
          nextState: { scene: SCENES.VEIN_ATTACK_LIST, player, veinParticipants: vein.participants }
        };
      }

      if (input === '⚔️ К боссу') {
        if (!vein.bossesSpawned || allBossesDead(vein)) return veinHubScreen(deps, player, playerId, vein);
        const boss = nextBossToJoin(vein);
        if (!boss) return veinHubScreen(deps, player, playerId, vein, 'Все боссы уже повержены!\n\n');
        return {
          reply: { text: `⚔️ ${boss.id}\n❤️ ${boss.hp}/${boss.hpMax}\n\nВыбери действие — ход разрешится, как только все участники команды сходят в этом раунде.`, buttons: ['Атаковать', ...skillButtons(player, {})] },
          nextState: { scene: SCENES.VEIN_BOSS_COMBAT, player, bossId: boss.id }
        };
      }

      return veinHubScreen(deps, player, playerId, vein);
    }

    case SCENES.VEIN_ATTACK_LIST: {
      if (input === '⬅️ Назад') return veinHubEntry(deps, state.player, playerId);
      const match = /^Атаковать: (.+)$/.exec(input);
      if (!match) return veinHubEntry(deps, state.player, playerId);
      const victimId = match[1];
      const victimState = deps.store ? await deps.store.get(victimId) : null;
      if (!victimState || !victimState.player) {
        return { reply: { text: 'Цель уже покинула жилу.', buttons: ['⬅️ Назад'] }, nextState: { scene: SCENES.VEIN_HUB, player: state.player } };
      }
      return {
        reply: { text: `⚔️ Атакуешь ${victimState.player.name || 'соперника'} (ур. ${victimState.player.level || 1}) прямо на жиле.`, buttons: ['Атаковать', ...skillButtons(state.player, {})] },
        nextState: { scene: SCENES.VEIN_PVP_COMBAT, player: state.player, victimId, victimSnapshot: victimState.player }
      };
    }

    case SCENES.VEIN_PVP_COMBAT: {
      const skillId = input === 'Атаковать' ? null : skillIdByName(input);
      const skill = skillId ? SKILLS[skillId] : null;
      if (input !== 'Атаковать' && !skill) {
        return { reply: { text: 'Выбери действие кнопкой ниже.', buttons: ['Атаковать', ...skillButtons(state.player, {})] }, nextState: state };
      }
      const result = resolveVeinAttack({ attacker: state.player, defender: state.victimSnapshot, skill, rng });
      if (result.defender.hp <= 0) {
        let stolen = 0;
        if (veinStore) {
          await veinStore.updateVeinAtomic((v) => {
            if (!v) return v;
            stolen = stealVeinContribution(v, playerId, state.victimId);
            return v;
          });
        }
        return {
          reply: { text: `💥 ${result.log.join(' ')}\n\n🏆 Победа!${stolen > 0 ? ` Украдено ${stolen} ед. чужого вклада в добычу.` : ''}`, buttons: ['⬅️ Назад'] },
          nextState: { scene: SCENES.VEIN_HUB, player: result.attacker }
        };
      }
      if (result.attacker.hp <= 0) {
        return {
          reply: { text: `💥 ${result.log.join(' ')}\n\n☠️ Тебя вывели из строя. Отступаешь зализывать раны.`, buttons: stationButtons(deps, result.attacker) },
          nextState: { scene: 'station', player: { ...result.attacker, hp: Math.round(result.attacker.hpMax * 0.3) } }
        };
      }
      return {
        reply: { text: `💥 ${result.log.join(' ')}\n\n❤️ Ты: ${result.attacker.hp}/${result.attacker.hpMax} — Соперник: ${result.defender.hp}/${result.defender.hpMax}`, buttons: ['Атаковать', ...skillButtons(result.attacker, {})] },
        nextState: { scene: SCENES.VEIN_PVP_COMBAT, player: result.attacker, victimId: state.victimId, victimSnapshot: result.defender }
      };
    }

    case SCENES.VEIN_MONSTER_COMBAT: {
      if (input === 'Попытаться уйти') {
        return veinHubEntry(deps, state.player, playerId);
      }
      const skillId = input === '⚔️ Атаковать' ? null : skillIdByName(input);
      const skill = skillId ? SKILLS[skillId] : null;
      const result = resolveTurn({ attacker: state.player, defender: state.enemy, skill, rng });
      if (result.defender.hp <= 0) {
        const player = { ...result.attacker };
        addToInventory(player, 'Сплавы', 1, 3);
        return { reply: { text: `💥 ${result.log.join(' ')}\n\n🏆 ${state.enemy.name} уничтожен. Можно вернуться к добыче.`, buttons: ['⬅️ Назад'] }, nextState: { scene: SCENES.VEIN_HUB, player } };
      }
      if (result.attacker.hp <= 0) {
        return { reply: { text: `💥 ${result.log.join(' ')}\n\n☠️ Поражение. Отступаешь на станцию.`, buttons: stationButtons(deps, result.attacker) }, nextState: { scene: 'station', player: { ...result.attacker, hp: Math.round(result.attacker.hpMax * 0.3) } } };
      }
      return {
        reply: { text: `💥 ${result.log.join(' ')}\n\n❤️ ${result.attacker.hp}/${result.attacker.hpMax}`, buttons: ['⚔️ Атаковать', ...skillButtons(result.attacker, {})] },
        nextState: { scene: SCENES.VEIN_MONSTER_COMBAT, player: result.attacker, enemy: result.defender }
      };
    }

    case SCENES.VEIN_BOSS_COMBAT: {
      const skillId = input === 'Атаковать' ? null : skillIdByName(input);
      const skill = skillId ? SKILLS[skillId] : null;
      if (!veinStore) return veinHubEntry(deps, state.player, playerId);

      let roundResult = null;
      const vein = await veinStore.updateVeinAtomic((v) => {
        if (!v) return v;
        const boss = v.bosses.find((b) => b.id === state.bossId);
        if (!boss || !boss.alive) return v;
        boss.round = boss.round || createBossRound();
        boss.fighters = boss.fighters || {};
        boss.fighters[playerId] = boss.fighters[playerId] || state.player;
        boss.round = submitPlayerAction(boss.round, playerId, { skill });

        const aliveIds = Object.keys(boss.fighters).filter((id) => boss.fighters[id].hp > 0);
        if (isRoundReady(boss.round, aliveIds)) {
          roundResult = resolveBossRound(boss.round, aliveIds, boss.fighters, boss, rng);
          boss.fighters = roundResult.fighters;
          boss.hp = roundResult.bossHp;
          boss.round = roundResult.nextRound;
          if (roundResult.bossDefeated) boss.alive = false;
        }
        return v;
      });

      if (!vein) return veinHubEntry(deps, state.player, playerId);
      const boss = vein.bosses.find((b) => b.id === state.bossId);

      if (!roundResult) {
        return {
          reply: { text: '⏳ Действие принято — ждём, пока сходят остальные участники команды. Проверь позже.', buttons: ['🔄 Проверить'] },
          nextState: { scene: SCENES.VEIN_BOSS_COMBAT, player: state.player, bossId: state.bossId }
        };
      }

      const myFighter = roundResult.fighters[playerId] || state.player;

      if (boss && !boss.alive) {
        let rewardNote = '';
        let player = { ...myFighter };
        const voiceLine = maybeSpeak(player, 'vein_boss_first_kill');
        if (voiceLine) player.pendingVoiceMessage = voiceLine;
        if (allBossesDead(vein)) {
          const rewards = distributeVeinRewards(vein, Object.keys(vein.participants));
          const myReward = rewards[playerId] || 0;
          player.credits = (player.credits || 0) + myReward;
          rewardNote = `\n\n🏆 Жила полностью зачищена! Твоя доля: 💳${myReward}.`;
          await veinStore.clearVein();
        } else {
          rewardNote = '\n\n➡️ Твой босс повержен — беги на помощь тем, кто ещё бьётся.';
        }
        return { reply: { text: `💥 ${roundResult.log.join(' ')}${rewardNote}`, buttons: stationButtons(deps, player) }, nextState: { scene: 'station', player } };
      }

      if (myFighter.hp <= 0) {
        return { reply: { text: `💥 ${roundResult.log.join(' ')}\n\n☠️ Тебя вывело из строя. Отступаешь.`, buttons: stationButtons(deps, myFighter) }, nextState: { scene: 'station', player: { ...myFighter, hp: Math.round(myFighter.hpMax * 0.3) } } };
      }

      return {
        reply: { text: `💥 ${roundResult.log.join(' ')}\n\n❤️ Ты: ${myFighter.hp}/${myFighter.hpMax} — Босс: ${boss.hp}/${boss.hpMax}`, buttons: ['Атаковать', ...skillButtons(myFighter, {})] },
        nextState: { scene: SCENES.VEIN_BOSS_COMBAT, player: myFighter, bossId: state.bossId }
      };
    }

    default:
      return null;
  }
}

module.exports = { handleVein, veinHubEntry };
