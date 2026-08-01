'use strict';

/**
 * СПОСОБНОСТИ БЕСТИАРИЯ — у каждого именного монстра (engine/bestiary.js)
 * теперь есть одна сигнатурная способность, привязанная к его лору, и
 * применяется она НЕ случайно, а на фиксированном такте (cadence) — раз в
 * N ходов монстра. Это осознанный выбор вместо шанса каждый ход: игрок
 * может выучить паттерн ("Гравиарх бьёт хваткой каждый второй ход — стим
 * лучше приберечь") — иначе бой становится не испытанием, а очередным
 * рандомным гриндом, что и просили исправить.
 *
 * Формат skill — ТОТ ЖЕ, что и в engine/skills-data.js (formula/pure/
 * damaging/shieldPierce/shieldShred/lifestealPct/selfHealPct/applyDot) —
 * никакой новой механики в combat-engine.js не потребовалось, useSkill()
 * уже умеет всё это для любого объекта такой формы, будь то умение игрока
 * или монстра.
 *
 * pickEnemyAction(enemy) — точка входа для router.js (game/scenes/combat.js,
 * держится в памяти отдельно): инкрементирует personal turnCount монстра
 * и решает, применять ли способность в этот ход. Мутирует enemy.turnCount
 * (та же манера, что и остальной код проекта).
 */

const MONSTER_ABILITIES = {
  scrap_zhuk: {
    name: 'Роевой укус',
    cadence: 3,
    telegraph: (n) => `🦂 ${n} впивается роем мелких жвал.`,
    skill: {
      name: 'Роевой укус', damaging: true, lifestealPct: 0.3,
      formula: (a) => a.stats.firepower * 0.5,
    },
  },
  pylevoy_padalschik: {
    name: 'Едкая слюна',
    cadence: 3,
    telegraph: (n) => `🦂 ${n} брызжет едкой слюной на броню.`,
    skill: {
      name: 'Едкая слюна', damaging: true, shieldShred: 4,
      formula: (a) => a.stats.power * 0.5 + a.stats.firepower * 0.3,
    },
  },
  skitalets_schelkun: {
    name: 'Зов роя',
    cadence: 3,
    telegraph: (n) => `🦂 ${n} щёлкает жвалами — зовёт сородичей на подмогу.`,
    skill: {
      name: 'Зов роя', damaging: true, pure: true, selfHealPct: 0.2,
      formula: (a) => a.hpMax * 0.05,
    },
  },
  igolnik: {
    name: 'Нейротоксичная игла',
    cadence: 2,
    telegraph: (n) => `🕷️ ${n} стреляет кристаллической иглой с нейротоксином.`,
    skill: {
      name: 'Нейротоксичная игла', damaging: true, pure: true,
      applyDot: { type: 'dot', amount: 10, turnsLeft: 3 },
      formula: (a) => a.stats.reaction * 0.6,
    },
  },
  hitin_tkach: {
    name: 'Хитиновые тенета',
    cadence: 3,
    telegraph: (n) => `🕸️ ${n} опутывает тебя вязкими хитиновыми нитями.`,
    skill: {
      name: 'Хитиновые тенета', damaging: true,
      applyDot: { type: 'dot', amount: 8, turnsLeft: 2 },
      formula: (a) => a.stats.endurance * 0.5 + a.stats.power * 0.3,
    },
  },
  signalniy_kleshch: {
    name: 'Взлом сенсоров',
    cadence: 2,
    telegraph: (n) => `📡 ${n} перехватывает и бьёт обратной связью по сенсорам скафандра.`,
    skill: {
      name: 'Взлом сенсоров', damaging: true, pure: true,
      applyDot: { type: 'dot', amount: 6, turnsLeft: 2 },
      formula: (a) => a.stats.reaction * 0.5,
    },
  },
  trakt_plakalschitsa: {
    name: 'Обманный крик',
    cadence: 2,
    telegraph: (n) => `👄 ${n} издаёт крик, неотличимый от зова о помощи, и бросается в открывшуюся брешь.`,
    skill: {
      name: 'Обманный крик', damaging: true, lifestealPct: 0.35,
      formula: (a) => a.stats.firepower * 0.55,
    },
  },
  razlomnik: {
    name: 'Фазовый рывок',
    cadence: 2,
    telegraph: (n) => `🌀 ${n} проскальзывает сквозь трещину пространства прямо у тебя за спиной.`,
    skill: {
      name: 'Фазовый рывок', damaging: true, shieldPierce: 0.5,
      formula: (a) => a.stats.reaction * 0.7,
    },
  },
  hronozhnets: {
    name: 'Искажение времени',
    cadence: 2,
    telegraph: (n) => `⏳ ${n} на миг отматывает собственные раны назад.`,
    skill: {
      name: 'Искажение времени', damaging: true, pure: true, selfHealPct: 0.25,
      formula: (a) => a.stats.mind * 0.5,
    },
  },
  graviarh: {
    name: 'Гравитационная хватка',
    cadence: 2,
    telegraph: (n) => `🪨 ${n} сминает пространство вокруг тебя гравитационной хваткой.`,
    skill: {
      name: 'Гравитационная хватка', damaging: true, pure: true, shieldShred: 8,
      formula: (a) => a.stats.power * 0.7 + a.stats.endurance * 0.4,
    },
  },
  pulsarid: {
    name: 'Импульсный разряд',
    cadence: 2,
    telegraph: (n) => `⚡ ${n} выпускает электромагнитный импульс, обходящий броню.`,
    skill: {
      name: 'Импульсный разряд', damaging: true, shieldPierce: 0.6,
      applyDot: { type: 'dot', amount: 12, turnsLeft: 2 },
      formula: (a) => a.stats.reaction * 0.6,
    },
  },
  pustotniy_pozhiratel: {
    name: 'Поглощение материи',
    cadence: 2,
    telegraph: (n) => `🕳️ ${n} тянется щупальцами Пустоты, поглощая всё на пути.`,
    skill: {
      name: 'Поглощение материи', damaging: true, pure: true, lifestealPct: 0.4,
      formula: (a) => a.stats.mind * 0.6 + a.stats.power * 0.4,
    },
  },
  kuratorskiy_strazh: {
    name: 'Протокол подавления',
    cadence: 2,
    telegraph: (n) => `🛡️ ${n} активирует протокол подавления цели.`,
    skill: {
      name: 'Протокол подавления', damaging: true, shieldShred: 12,
      formula: (a) => a.stats.power * 0.9 + a.stats.firepower * 0.3,
    },
  },
  nulevoy_zhnets: {
    name: 'Абсолютный сбор',
    cadence: 2,
    telegraph: (n) => `☠️ ${n} переходит в режим тотального сбора — не отступит, пока один из вас не падёт.`,
    skill: {
      name: 'Абсолютный сбор', damaging: true, pure: true, lifestealPct: 0.3,
      formula: (a) => a.stats.firepower * 0.9 + a.stats.power * 0.5,
    },
  },
  trakt_eho_matka: {
    name: 'Эхо-резонанс',
    cadence: 2,
    telegraph: (n) => `📿 ${n} искажает пространство резонансом, впивающимся в сознание.`,
    skill: {
      name: 'Эхо-резонанс', damaging: true, pure: true,
      applyDot: { type: 'dot', amount: 15, turnsLeft: 3 },
      formula: (a) => a.stats.mind * 0.5 + a.stats.endurance * 0.4,
    },
  },
};

/**
 * Решает действие монстра на этот ход — обычная атака (skill: null) или
 * его сигнатурная способность, если подошёл такт. Мутирует enemy.turnCount.
 * Возвращает { skill, telegraphText } — telegraphText уже готовая строка
 * с именем монстра, подставлять в лог боя ПЕРЕД строкой урона.
 */
function pickEnemyAction(enemy) {
  enemy.turnCount = (enemy.turnCount || 0) + 1;
  const ability = enemy.bestiaryId && MONSTER_ABILITIES[enemy.bestiaryId];
  if (ability && enemy.turnCount % ability.cadence === 0) {
    return { skill: ability.skill, telegraphText: ability.telegraph(enemy.name) };
  }
  return { skill: null, telegraphText: null };
}

module.exports = { MONSTER_ABILITIES, pickEnemyAction };
