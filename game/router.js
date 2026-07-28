/**
 * Игровой роутер: то, что раньше рисовалось кубами в SaleBot, теперь —
 * обычная функция от (текущая сцена, входящее сообщение) к (ответ, новая сцена).
 * Ничего не завязано на ВК напрямую — vk.sendMessage(peerId, text, buttons)
 * это единственная точка выхода, поэтому в тестах подставляется fake-клиент.
 */
'use strict';

const { resolveTurn } = require('../engine/combat-engine.js');
const { SKILLS } = require('../engine/skills-data.js');
const { rollEvent, rollLoot } = require('../engine/exploration-engine.js');

const FACTIONS = ['Приют', 'Терминус', 'Арсенал', 'Вуаль'];

const FACTION_KIT = {
  'Приют':    { skills: ['heal_field'], statBias: { mind: 6, endurance: 4 } },
  'Терминус': { skills: ['living_heat'], statBias: { endurance: 8, power: 2 } },
  'Арсенал':  { skills: ['plasma_bolt', 'overload'], statBias: { power: 6, firepowerBonus: 4 } },
  'Вуаль':    { skills: ['anima_drain', 'corrosion'], statBias: { mind: 6, reaction: 4 } }
};

const MAX_EQUIPPED_SKILLS = 3;
const RESET_COMMAND = 'Сброс';

// Полный хаб станции — после завершения обучения доступны все локации.
// Разбивается на ряды по 3 автоматически в vk/client.js.
const HUB_BUTTONS = ['Исследовать', 'Мостик', 'Отсек', 'Декон-камера', 'Кантина', 'Врата Тракта', 'Статус', 'Профиль', 'Сброс'];
const ZONE_BUTTONS = ['Патрулируемый', 'Спорный', 'Открытый космос', 'Назад'];
const ZONE_BY_LABEL = { 'Патрулируемый': 'blue', 'Спорный': 'yellow', 'Открытый космос': 'red' };
const ZONE_LABEL = { blue: 'Патрулируемый сектор', yellow: 'Спорный сектор', red: 'Открытый космос' };

const CURATORS = { 'Приют': 'Ирис Вейл', 'Терминус': 'Дрого Кейн', 'Арсенал': 'Рен Окса', 'Вуаль': 'Шёпот' };

/** Дежурный дрон-манекен — фиксированный слабый противник для тренировочного
 * боя, тот самый, что описан в тексте онбординга («Тренировочный отсек»). */
function trainerDrone() {
  return {
    name: 'Дрон-манекен',
    hp: 100, hpMax: 100,
    stats: { power: 8, mind: 8, reaction: 8, endurance: 10, firepower: 10, shielding: 5 },
    luck: 0, accuracy: 0.5, dodge: 0.05, focus: 0.4, periodic: []
  };
}

function freshPlayer(name, faction) {
  const bias = (FACTION_KIT[faction] || {}).statBias || {};
  const starterSkills = (FACTION_KIT[faction] || {}).skills || [];
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
    periodic: [],
    statPoints: 5,
    equippedSkills: starterSkills.slice(0, MAX_EQUIPPED_SKILLS),
    inventory: [],
    credits: 0,
    radiation: 0,
    zone: 'blue' // текущий сектор для "Исследовать" — меняется через Врата Тракта
  };
}

/** Экипированные умения игрока — если игрок ещё ни разу не настраивал их
 * через профиль (нет поля или оно пустое), используем стартовый набор фракции. */
function equippedSkillIds(player) {
  if (player.equippedSkills && player.equippedSkills.length) return player.equippedSkills;
  return (FACTION_KIT[player.faction] || {}).skills || [];
}
function skillButtons(player) {
  return equippedSkillIds(player).map((id) => SKILLS[id]?.name).filter(Boolean);
}
function skillIdByName(name) {
  return Object.values(SKILLS).find((s) => s.name === name)?.id || null;
}

/** Добавляет ресурс в инвентарь игрока, объединяя с уже существующим стаком того же тира */
function addToInventory(player, resource, tier, qty) {
  const inv = player.inventory || (player.inventory = []);
  const existing = inv.find((i) => i.resource === resource && i.tier === tier);
  if (existing) existing.qty += qty;
  else inv.push({ resource, tier, qty });
}

/** Продаёт весь инвентарь игрока за кредиты (простая ставка: 8 кредитов за единицу тира) */
function sellInventory(player) {
  let total = 0;
  for (const item of player.inventory || []) total += item.qty * item.tier * 8;
  player.inventory = [];
  player.credits = (player.credits || 0) + total;
  return total;
}

/** Общий обработчик исследования сектора — используется и с главного хаба,
 * и из Врат Тракта. Возвращает { reply, nextState }. */
function explore(player, zone, rng) {
  const event = rollEvent(zone, rng);
  if (event.type === 'ambush') {
    return {
      reply: { text: `⚠️ ОТГОЛОСОК\n\n${event.text}`, buttons: ['Атаковать', 'Отступить'] },
      nextState: { scene: 'pre_combat', player, enemy: event.enemy, zone }
    };
  }
  if (event.type === 'anomaly') {
    player.radiation = Math.min(100, (player.radiation || 0) + event.radiationGain);
    return {
      reply: { text: `🌀 АНОМАЛИЯ\n\n${event.text}\n☢️ Облучение: ${player.radiation}%`, buttons: HUB_BUTTONS },
      nextState: { scene: 'station', player }
    };
  }
  if (event.type === 'distress') {
    player.credits = (player.credits || 0) + event.reward.credits;
    return {
      reply: { text: `📡 СИГНАЛ БЕДСТВИЯ\n\n${event.text}\n💳 +${event.reward.credits} кредитов за спасательный рейс.`, buttons: HUB_BUTTONS },
      nextState: { scene: 'station', player }
    };
  }
  if (event.type === 'node') {
    addToInventory(player, event.resource, event.tier, 1);
    return {
      reply: { text: `⛏️ ЗАЛЕЖЬ\n\n${event.text}\nВ трюм добавлено: 1× ${event.resource} T${event.tier}.`, buttons: HUB_BUTTONS },
      nextState: { scene: 'station', player }
    };
  }
  // find
  addToInventory(player, event.loot.resource, event.loot.tier, event.loot.qty);
  player.credits = (player.credits || 0) + event.loot.credits;
  return {
    reply: { text: `🔭 ${event.text}`, buttons: HUB_BUTTONS },
    nextState: { scene: 'station', player }
  };
}

/**
 * Основная точка входа. state — то, что лежит в хранилище для этого userId
 * (или null для нового игрока). deps.getProfileLink() — необязательная
 * функция без аргументов, отдаёт готовую персональную ссылку на сайт-профиль.
 * Возвращает { reply: {text, buttons}, nextState }. Ничего не мутирует
 * снаружи и не делает I/O — вызывающий код (webhook) сам решает, как
 * сохранить nextState и как физически отправить reply.
 */
function step(state, text, rng = Math.random, deps = {}) {
  const input = (text || '').trim();

  // Глобальная команда — работает из ЛЮБОЙ сцены, даже если где-то застряли
  // в бою или в непонятном состоянии.
  if (input === RESET_COMMAND) {
    return {
      reply: {
        text: '🔄 Прогресс сброшен подчистую.\n\n🛰️ ПЕРИФЕРИЯ\n\nТракт оборвался триста лет назад. Как тебя записать в журнал станции?',
        buttons: []
      },
      nextState: { scene: 'ask_name' }
    };
  }

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
      const curator = CURATORS[input] || 'куратор станции';
      return {
        reply: {
          text: `Добро пожаловать на борт, ${state.name}. Станция «${input}» тебя ждёт.\n\nКуратор ${curator} лично встречает новичков в тренировочном отсеке — активировался дежурный дрон-манекен, никакого риска, просто проверка со скафандром.`,
          buttons: ['Атаковать']
        },
        nextState: { scene: 'pre_combat', player, enemy: trainerDrone(), trainingFight: true }
      };
    }

    // ───────────────────────── ОБУЧЕНИЕ (после тренировочного боя) ─────────────────────────

    case 'quest_report': {
      const player = { ...state.player, statPoints: (state.player.statPoints || 0) + 1 };
      const curator = CURATORS[player.faction] || '';
      return {
        reply: {
          text: `Куратор ${curator}: «Неплохо для начала. Держи премию за инициативу — одно очко параметров сверху». Прежде чем отпустить тебя в космос, пройдёмся по станции — тут всё, что понадобится.`,
          buttons: ['Идём']
        },
        nextState: { scene: 'quest_shop', player }
      };
    }

    case 'quest_shop': {
      // Первый визит в сцену — куратор приводит в отсек и вручает трофей на продажу
      if (!state.player.inventory || state.player.inventory.length === 0) {
        const player = { ...state.player };
        addToInventory(player, 'Сплавы', 1, 3);
        return {
          reply: {
            text: `🔧 РЕМОНТНЫЙ ОТСЕК\n\nКуратор кивает Завхозу: «Покажи, как тут всё устроено». Завхоз суёт тебе в руки 3 куска обшивки: «Барахло с прошлой вылазки — продай, привыкай к обороту трюма».`,
            buttons: ['Продать хлам']
          },
          nextState: { scene: 'quest_shop', player }
        };
      }
      // второй шаг — продажа и переход дальше
      const player = { ...state.player };
      const gained = sellInventory(player);
      return {
        reply: {
          text: `💳 Завхоз отсчитывает ${gained} кредитов: «Вот и весь фокус — находишь, продаёшь, снаряжаешься». Последняя остановка — Врата Тракта.`,
          buttons: ['Идём к вратам']
        },
        nextState: { scene: 'quest_gates', player }
      };
    }

    case 'quest_gates': {
      const player = { ...state.player, zone: 'blue' };
      return {
        reply: {
          text: `🌀 ВРАТА ТРАКТА\n\nКуратор указывает на мерцающий контур: «Патрулируемые секторы — спокойно, спорные — держи ухо востро, открытый космос — только если готов ко всему». Станция полностью открыта.`,
          buttons: HUB_BUTTONS
        },
        nextState: { scene: 'station', player }
      };
    }

    // ───────────────────────────────── ГЛАВНЫЙ ХАБ СТАНЦИИ ─────────────────────────────────

    case 'station': {
      if (input === 'Статус') {
        const p = state.player;
        return {
          reply: {
            text: `${p.name} · ${p.faction}\n❤️ ${p.hp}/${p.hpMax}   💳 ${p.credits || 0}\n📍 Текущий сектор: ${ZONE_LABEL[p.zone] || 'Патрулируемый сектор'}${p.radiation ? `\n☢️ Облучение: ${p.radiation}%` : ''}${p.statPoints ? `\n✨ Нераспределённых очков: ${p.statPoints}` : ''}`,
            buttons: HUB_BUTTONS
          },
          nextState: state
        };
      }
      if (input === 'Профиль') {
        const link = typeof deps.getProfileLink === 'function' ? deps.getProfileLink() : null;
        if (!link) {
          return { reply: { text: 'Терминал профиля сейчас недоступен, попробуйте позже.', buttons: HUB_BUTTONS }, nextState: state };
        }
        return {
          reply: { text: 'Личный терминал профиля готов:', buttons: [{ label: 'Открыть профиль', url: link }, 'Исследовать', 'Статус', 'Сброс'] },
          nextState: state
        };
      }
      if (input === 'Мостик') {
        return {
          reply: { text: '🎛️ МОСТИК\n\nЗдесь решают судьбу станции. Смена позывного и станции приписки — скоро.', buttons: ['Назад'] },
          nextState: { scene: 'loc_bridge', player: state.player }
        };
      }
      if (input === 'Отсек') {
        const p = state.player;
        const items = (p.inventory || []).map((i) => `${i.resource} T${i.tier} ×${i.qty}`).join(', ');
        return {
          reply: {
            text: `🔧 РЕМОНТНЫЙ ОТСЕК\n\n${items ? `В трюме: ${items}` : 'Трюм пуст.'}`,
            buttons: items ? ['Продать всё', 'Назад'] : ['Назад']
          },
          nextState: { scene: 'loc_repair', player: state.player }
        };
      }
      if (input === 'Декон-камера') {
        const p = state.player;
        return {
          reply: {
            text: `☢️ ДЕКОН-КАМЕРА\n\nТекущее облучение: ${p.radiation || 0}%`,
            buttons: p.radiation ? ['Снять облучение', 'Назад'] : ['Назад']
          },
          nextState: { scene: 'loc_decon', player: state.player }
        };
      }
      if (input === 'Кантина') {
        return {
          reply: { text: '🍸 КАНТИНА\n\nПриглушённый свет, бармен протирает стакан. Заказы куратора и коктейли — скоро.', buttons: ['Назад'] },
          nextState: { scene: 'loc_cantina', player: state.player }
        };
      }
      if (input === 'Врата Тракта') {
        return {
          reply: { text: '🌀 ВРАТА ТРАКТА\n\nВыбери, куда прыгнуть:', buttons: ZONE_BUTTONS },
          nextState: { scene: 'loc_gates', player: state.player }
        };
      }
      if (input === 'Исследовать') {
        return explore(state.player, state.player.zone || 'blue', rng);
      }
      // неопознанная команда — не считаем это попыткой исследовать, просто показываем хаб снова
      return { reply: { text: 'Выбери действие кнопкой ниже.', buttons: HUB_BUTTONS }, nextState: state };
    }

    // ───────────────────────────────── ЛОКАЦИИ СТАНЦИИ ─────────────────────────────────

    case 'loc_bridge': {
      return { reply: { text: 'Возвращаешься в главный отсек станции.', buttons: HUB_BUTTONS }, nextState: { scene: 'station', player: state.player } };
    }

    case 'loc_repair': {
      if (input === 'Продать всё') {
        const player = { ...state.player };
        const gained = sellInventory(player);
        return {
          reply: { text: gained ? `Завхоз отсчитывает ${gained} кредитов за находки.` : 'Продавать нечего.', buttons: HUB_BUTTONS },
          nextState: { scene: 'station', player }
        };
      }
      return { reply: { text: 'Возвращаешься в главный отсек станции.', buttons: HUB_BUTTONS }, nextState: { scene: 'station', player: state.player } };
    }

    case 'loc_decon': {
      if (input === 'Снять облучение') {
        const player = { ...state.player, radiation: 0 };
        return { reply: { text: 'Мягкое гудение очистителей — облучение снято подчистую.', buttons: HUB_BUTTONS }, nextState: { scene: 'station', player } };
      }
      return { reply: { text: 'Возвращаешься в главный отсек станции.', buttons: HUB_BUTTONS }, nextState: { scene: 'station', player: state.player } };
    }

    case 'loc_cantina': {
      return { reply: { text: 'Возвращаешься в главный отсек станции.', buttons: HUB_BUTTONS }, nextState: { scene: 'station', player: state.player } };
    }

    case 'loc_gates': {
      if (input === 'Назад') {
        return { reply: { text: 'Возвращаешься в главный отсек станции.', buttons: HUB_BUTTONS }, nextState: { scene: 'station', player: state.player } };
      }
      const zone = ZONE_BY_LABEL[input];
      if (!zone) {
        return { reply: { text: 'Выбери сектор кнопкой ниже.', buttons: ZONE_BUTTONS }, nextState: state };
      }
      const player = { ...state.player, zone };
      return explore(player, zone, rng);
    }

    // ───────────────────────────────────── БОЙ ─────────────────────────────────────

    case 'pre_combat': {
      if (input === 'Отступить') {
        return {
          reply: { text: 'Ты отступаешь на безопасное расстояние.', buttons: HUB_BUTTONS },
          nextState: { scene: 'station', player: state.player }
        };
      }
      const buttons = ['Обычная атака', ...skillButtons(state.player)];
      return {
        reply: { text: `${state.enemy.name}: ❤️ ${state.enemy.hp}/${state.enemy.hpMax}\n\nВыбери действие:`, buttons },
        nextState: { scene: 'combat', player: state.player, enemy: state.enemy, trainingFight: state.trainingFight, zone: state.zone }
      };
    }

    case 'combat': {
      const skillId = input === 'Обычная атака' ? null : skillIdByName(input);
      const skill = skillId ? SKILLS[skillId] : null;
      if (input !== 'Обычная атака' && !skill) {
        const buttons = ['Обычная атака', ...skillButtons(state.player)];
        return { reply: { text: 'Выбери действие кнопкой ниже.', buttons }, nextState: state };
      }

      const result = resolveTurn({ attacker: state.player, defender: state.enemy, skill, rng });

      if (result.finished) {
        if (result.winner === 'attacker') {
          if (state.trainingFight) {
            return {
              reply: { text: `💥 ${result.log.join(' ')}\n\n✅ Дрон-манекен деактивирован. Тренировка окончена — это была только симуляция, статы и HP полностью восстановлены.`, buttons: ['Доложить куратору'] },
              nextState: { scene: 'quest_report', player: { ...result.attacker, hp: result.attacker.hpMax } }
            };
          }
          const loot = rollLoot(state.zone || 'blue', rng);
          const player = { ...result.attacker };
          addToInventory(player, loot.resource, loot.tier, loot.qty);
          player.credits = (player.credits || 0) + loot.credits;
          return {
            reply: {
              text: `💥 ${result.log.join(' ')}\n\n🏆 ${state.enemy.name} уничтожен.\n💳 +${loot.credits} кредитов, +${loot.qty}× ${loot.resource} T${loot.tier}`,
              buttons: HUB_BUTTONS
            },
            nextState: { scene: 'station', player }
          };
        }
        return {
          reply: { text: `💥 ${result.log.join(' ')}\n\n💀 Скафандр пробит. Аварийная капсула эвакуирует тебя на станцию.`, buttons: HUB_BUTTONS },
          nextState: { scene: 'station', player: { ...result.attacker, hp: Math.round(result.attacker.hpMax * 0.5) } }
        };
      }

      // враг тоже ходит (простая AI: обычная атака)
      const enemyTurn = resolveTurn({ attacker: result.defender, defender: result.attacker, rng });
      const log = result.log.concat(enemyTurn.log).join(' ');

      if (enemyTurn.finished && enemyTurn.winner === 'attacker') {
        return {
          reply: { text: `💥 ${log}\n\n💀 Скафандр пробит.`, buttons: HUB_BUTTONS },
          nextState: { scene: 'station', player: { ...enemyTurn.defender, hp: Math.round(enemyTurn.defender.hpMax * 0.5) } }
        };
      }

      const buttons = ['Обычная атака', ...skillButtons(enemyTurn.defender)];
      return {
        reply: { text: `💥 ${log}\n\n${state.enemy.name}: ❤️ ${enemyTurn.attacker.hp}/${enemyTurn.attacker.hpMax}`, buttons },
        nextState: { scene: 'combat', player: enemyTurn.defender, enemy: enemyTurn.attacker, trainingFight: state.trainingFight, zone: state.zone }
      };
    }

    default:
      return { reply: { text: 'Что-то пошло не так, начнём заново.', buttons: [] }, nextState: { scene: 'start' } };
  }
}

module.exports = {
  step, freshPlayer, equippedSkillIds, addToInventory, sellInventory,
  FACTIONS, FACTION_KIT, MAX_EQUIPPED_SKILLS, HUB_BUTTONS, ZONE_BUTTONS
};
