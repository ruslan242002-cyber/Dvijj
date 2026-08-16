'use strict';

/**
 * GUILD PROJECTS — коллективные цели гильдии поверх уже существующего
 * банка (guild-store-upstash.js: bank:credits/bank:resources) и уровней
 * (guild-levels.js). Отличие от гильд-апгрейдов: апгрейд — один линейный
 * путь с постоянным бонусом; проект — разовая цель с конкретным разовым
 * эффектом, можно вести НЕСКОЛЬКО параллельно (в отличие от апгрейдов,
 * где путь один).
 *
 * ГЛАВНОЕ ПРАВИЛО (по обсуждению): никаких личных наград за единицу
 * вклада — иначе игроки начнут оптимизировать "как получить максимум
 * лично", а не помогать гильдии. После завершения — вся гильдия получает
 * результат разом. contributionPoints — только для личного рейтинга
 * внутри гильдии ("кто больше всех помог"), не конвертируются в награду.
 */

const PROJECTS = [
  {
    id: 'repair_dock',
    name: 'Ремонтный док',
    description: 'Совместная мастерская гильдии — снижает стоимость ремонта для всех участников.',
    requirements: {
      credits: 50000,
      resources: [
        { resource: 'Сплавы', tier: 2, qty: 500 },
        { resource: 'Полимеры', tier: 3, qty: 200 },
      ],
    },
    effect: { type: 'repair_discount', repairDiscountPct: 5 },
    effectDescription: '−5% стоимость ремонта для всех участников гильдии',
  },
  {
    id: 'recon_network',
    name: 'Разведывательная сеть',
    description: 'Сеть автономных зондов гильдии — повышает шанс обнаружить редкие места при исследовании.',
    requirements: {
      credits: 30000,
      resources: [
        { resource: 'Изотопы', tier: 2, qty: 100 },
        { resource: 'Сенсорный глаз', tier: 0, qty: 50 },
      ],
    },
    effect: { type: 'rare_discovery', rareDiscoveryBonusPct: 10 },
    effectDescription: '+10% шанс обнаружения редких мест для всех участников гильдии',
  },
  {
    id: 'defensive_perimeter',
    name: 'Оборонительный периметр',
    description: 'Патрульная сеть гильдии на подступах к её территориям — снижает риск засад.',
    requirements: {
      credits: 40000,
      resources: [
        { resource: 'Тяжёлый сплав', tier: 3, qty: 150 },
        { resource: 'Реголит', tier: 2, qty: 300 },
      ],
    },
    effect: { type: 'ambush_risk_reduction', ambushRiskReductionPct: 15 },
    effectDescription: '−15% риск засады в открытом космосе для всех участников гильдии',
  },
];

function findProject(projectId) {
  return PROJECTS.find((p) => p.id === projectId) || null;
}

/** Собирает единый список требований для guild-store (кредиты отдельно,
 *  ресурсы как массив {resource, tier, qty} — тот же формат, что и у
 *  гильд-апгрейдов). */
function requirementsAsResourceList(project) {
  return project.requirements.resources;
}

module.exports = { PROJECTS, findProject, requirementsAsResourceList };
