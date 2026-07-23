/**
 * Игровой роутер: то, что раньше рисовалось кубами в SaleBot, теперь —
 * обычная функция от (текущая сцена, входящее сообщение) к (ответ, новая сцена).
 * Ничего не завязано на ВК напрямую — vk.sendMessage(peerId, text, buttons)
 * это единственная точка выхода, поэтому в тестах подставляется fake-клиент.
 */
'use strict';

const { resolveTurn } = require('../engine/combat-engine.js');
const { SKILLS } = require('../engine/skills-data.js');
const { rollEvent } = require('../engine/exploration-engine.js');

const FACTIONS = ['Приют', 'Терминус', 'Арсенал', 'Вуаль'];

const FACTION_KIT = {
  'Приют':    { skills: ['heal_field'], statBias: { mind: 6, endurance: 4 } },
  'Терминус': { skills: ['living_heat'], statBias: { endurance: 8, power: 2 } },
  'Арсенал':  { skills: ['plasma_bolt', 'overload'], statBias: { power: 6, firepowerBonus: 4 } },
  'Вуаль':    { skills: ['anima_drain', 'corrosion'], statBias: { mind: 6, reaction: 4 } }
};

function freshPlayer(name, faction) {
  const bias = (FACTION_KIT[faction] || {}).statBias || {};
  return {
    name, faction,
    hp: 220, hpMax: 220,
    stats: {
      power: 20 + (bias.power || 0),
      mind: 20 + (bias.mind || 0),
      reaction: 20 + (bias.reaction || 0),
      endurance: 22 + (bias.endurance || 0),
      firepower: 26 + (bias.firepowerBonus || 0),
      shielding: 18
    },
    luck: 10, accuracy: 0.8, dodge: 0.12, focus: 0.76,
    periodic: []
  };
}

function skillButtons(faction) {
  const ids = (FACTION_KIT[faction] || {}).skills || [];
  return ids.map((id) => SKILLS[id].name);
}
function skillIdByName(name) {
  return Object.values(SKILLS).find((s) => s.name === name)?.id || null;
}

/**
 * Основная точка входа. state — то, что лежит в хранилище для этого userId
 * (или null для нового игрока). Возвращает { reply: {text, buttons}, nextState }.
 * Ничего не мутирует снаружи и не делает I/O — вызывающий код (webhook)
 * сам решает, как сохранить nextState и как физически отправить reply.
 */
function step(state, text, rng = Math.random) {
  const input = (text || '').trim();
  const scene = state?.scene || 'start';

  switch (scene) {
    case 'start': {
      return {
        reply: { text: '🛰️ ПЕРИФЕРИЯ\n\nТракт оборвался триста лет назад. Как тебя записать в журнал станции?', buttons: [] },
        nextState: { scene: 'ask_name' }
      };
    }

    case 'ask_name': {
      if (!input) return { reply: { text: 'Нужен хоть какой-то позывной.', buttons: [] }, nextState: state };
      return {
        reply: { text: `Позывной принят, ${input}.\n\nК какому доку пристыковаться?`, buttons: FACTIONS },
        nextState: { scene: 'ask_faction', name: input }
      };
    }

    case 'ask_faction': {
      if (!FACTIONS.includes(input)) {
        return { reply: { text: 'Выбери одну из четырёх станций кнопкой ниже.', buttons: FACTIONS }, nextState: state };
      }
      const player = freshPlayer(state.name, input);
      return {
        reply: {
          text: `Добро пожаловать на борт, ${state.name}. Станция «${input}» тебя ждёт.`,
          buttons: ['Исследовать', 'Статус']
        },
        nextState: { scene: 'station', player }
      };
    }

    case 'station': {
      if (input === 'Статус') {
        const p = state.player;
        return {
          reply: { text: `${p.name} · ${p.faction}\n❤️ ${p.hp}/${p.hpMax}`, buttons: ['Исследовать', 'Статус'] },
          nextState: state
        };
      }
      // любое другое сообщение (включая "Исследовать") трактуем как попытку исследовать
      const event = rollEvent('blue', rng);
      if (event.type === 'ambush') {
        return {
          reply: { text: `⚠️ ОТГОЛОСОК\n\n${event.text}`, buttons: ['Атаковать', 'Отступить'] },
          nextState: { scene: 'pre_combat', player: state.player, enemy: event.enemy }
        };
      }
      return {
        reply: { text: `🔭 ${event.text}`, buttons: ['Исследовать', 'Статус'] },
        nextState: state
      };
    }

    case 'pre_combat': {
      if (input === 'Отступить') {
        return {
          reply: { text: 'Ты отступаешь на безопасное расстояние.', buttons: ['Исследовать', 'Статус'] },
          nextState: { scene: 'station', player: state.player }
        };
      }
      const buttons = ['Обычная атака', ...skillButtons(state.player.faction)];
      return {
        reply: { text: `${state.enemy.name}: ❤️ ${state.enemy.hp}/${state.enemy.hpMax}\n\nВыбери действие:`, buttons },
        nextState: { scene: 'combat', player: state.player, enemy: state.enemy }
      };
    }

    case 'combat': {
      const skillId = input === 'Обычная атака' ? null : skillIdByName(input);
      const skill = skillId ? SKILLS[skillId] : null;
      if (input !== 'Обычная атака' && !skill) {
        const buttons = ['Обычная атака', ...skillButtons(state.player.faction)];
        return { reply: { text: 'Выбери действие кнопкой ниже.', buttons }, nextState: state };
      }

      const result = resolveTurn({ attacker: state.player, defender: state.enemy, skill, rng });

      if (result.finished) {
        if (result.winner === 'attacker') {
          return {
            reply: { text: `💥 ${result.log.join(' ')}\n\n🏆 ${state.enemy.name} уничтожен.`, buttons: ['Исследовать', 'Статус'] },
            nextState: { scene: 'station', player: result.attacker }
          };
        }
        return {
          reply: { text: `💥 ${result.log.join(' ')}\n\n💀 Скафандр пробит. Аварийная капсула эвакуирует тебя на станцию.`, buttons: ['Исследовать', 'Статус'] },
          nextState: { scene: 'station', player: { ...result.attacker, hp: Math.round(result.attacker.hpMax * 0.5) } }
        };
      }

      // враг тоже ходит (простая AI: обычная атака)
      const enemyTurn = resolveTurn({ attacker: result.defender, defender: result.attacker, rng });
      const log = result.log.concat(enemyTurn.log).join(' ');

      if (enemyTurn.finished && enemyTurn.winner === 'attacker') {
        return {
          reply: { text: `💥 ${log}\n\n💀 Скафандр пробит.`, buttons: ['Исследовать', 'Статус'] },
          nextState: { scene: 'station', player: { ...enemyTurn.attacker, hp: Math.round(enemyTurn.attacker.hpMax * 0.5) } }
        };
      }

      const buttons = ['Обычная атака', ...skillButtons(state.player.faction)];
      return {
        reply: { text: `💥 ${log}\n\n${state.enemy.name}: ❤️ ${enemyTurn.attacker.hp}/${enemyTurn.attacker.hpMax}`, buttons },
        nextState: { scene: 'combat', player: enemyTurn.attacker, enemy: enemyTurn.defender }
      };
    }

    default:
      return { reply: { text: 'Что-то пошло не так, начнём заново.', buttons: [] }, nextState: { scene: 'start' } };
  }
}

module.exports = { step, freshPlayer, FACTIONS, FACTION_KIT };
