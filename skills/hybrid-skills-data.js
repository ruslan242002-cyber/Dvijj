'use strict';

const HYBRID_SKILLS = {
  oracle: {
    id: 'oracle', name: 'Оракул', stations: ['Приют', 'Терминус'], cd: 4,
    description: 'Гибрид Приюта и Терминуса: чистый урон, часть которого вырывается из способности цели к самовосстановлению.',
    usesFocus: true, damaging: true, pure: true,
    requiresFactions: [{ faction: 'Приют', rank: 5 }, { faction: 'Терминус', rank: 5 }],
    formula: (a) => a.stats.mind * 1.0 + a.stats.reaction * 0.6
  },
  desecrated_ward: {
    id: 'desecrated_ward', name: 'Осквернённый страж', stations: ['Арсенал', 'Вуаль'], cd: 4,
    description: 'Гибрид Арсенала и Вуали: пробивает половину экранирования на удар и разъедает ещё немного навсегда.',
    usesFocus: true, damaging: true, shieldPierce: 0.5, shieldShred: 8,
    requiresFactions: [{ faction: 'Арсенал', rank: 5 }, { faction: 'Вуаль', rank: 5 }],
    formula: (a) => a.stats.power * 0.9 + a.stats.endurance * 0.9
  },
  necrotech: {
    id: 'necrotech', name: 'Некротехник', stations: ['Терминус', 'Вуаль'], cd: 4,
    description: 'Гибрид Терминуса и Вуали: периодический урон, частично возвращающийся как лечение через петлю инъектора.',
    usesFocus: true, damaging: true, pure: true, selfHealPct: 0.08,
    requiresFactions: [{ faction: 'Терминус', rank: 5 }, { faction: 'Вуаль', rank: 5 }],
    formula: (a) => a.stats.endurance * 0.7 + a.stats.mind * 0.5,
    applyDot: { type: 'dot', amount: 14, turnsLeft: 3 }
  },
  gatekeeper: {
    id: 'gatekeeper', name: 'Хранитель врат', stations: ['Приют', 'Арсенал'], cd: 4,
    description: 'Гибрид Приюта и Арсенала: мощное самоисцеление вместе с ударом.',
    usesFocus: true, damaging: true, pure: true, selfHealPct: 0.3,
    requiresFactions: [{ faction: 'Приют', rank: 5 }, { faction: 'Арсенал', rank: 5 }],
    formula: (a) => a.hpMax * 0.1
  },
  anomaly_warden: {
    id: 'anomaly_warden', name: 'Страж Аномалий', stations: ['Арсенал', 'Терминус'], cd: 4,
    description: 'Гибрид Арсенала и Терминуса: разъедает экранирование цели навсегда.',
    usesFocus: true, damaging: true, shieldShred: 10,
    requiresFactions: [{ faction: 'Арсенал', rank: 5 }, { faction: 'Терминус', rank: 5 }],
    formula: (a) => a.stats.reaction * 1.0 + a.stats.power * 0.5
  },
  core_breaker: {
    id: 'core_breaker', name: 'Разрушитель Ядра', stations: ['Вуаль', 'Приют'], cd: 3,
    description: 'Гибрид Вуали и Приюта: пробивает треть экранирования на удар — ставка на частоту, не на разовую мощь.',
    usesFocus: true, damaging: true, shieldPierce: 0.33,
    requiresFactions: [{ faction: 'Вуаль', rank: 5 }, { faction: 'Приют', rank: 5 }],
    formula: (a) => a.stats.reaction * 1.2 + a.stats.firepower * 0.4
  },
  polymath: {
    id: 'polymath', name: 'Полимат', stations: ['Приют', 'Терминус', 'Арсенал', 'Вуаль'], cd: 3,
    description: 'Требует ранг IV сразу во всех четырёх станциях. Жертвует пиковой мощью ради гибкости.',
    usesFocus: true, damaging: true,
    requiresFactions: [
      { faction: 'Приют', rank: 4 }, { faction: 'Терминус', rank: 4 },
      { faction: 'Арсенал', rank: 4 }, { faction: 'Вуаль', rank: 4 }
    ],
    formula: (a) => (a.stats.power + a.stats.mind + a.stats.reaction + a.stats.endurance) * 0.25
  },
  trakt_rift: {
    id: 'trakt_rift', name: 'Разлом Тракта', stations: ['red zone specialist'], cd: 4,
    description: 'Требует 5+ побед над врагами тира 5+. Почти бесполезен вне тяжёлых стычек.',
    usesFocus: true, damaging: true, pure: true,
    requiresHighTierKills: 5,
    formula: (a) => a.stats.power * 1.1 + a.stats.endurance * 0.8
  },
  trakt_synthesis: {
    id: 'trakt_synthesis', name: 'Синтез Тракта', stations: ['Приют', 'Терминус', 'Арсенал'], cd: 4,
    description: 'Редчайший тройной гибрид — эндгейм-трофей, не мейнстримный билд.',
    usesFocus: true, damaging: true, pure: true,
    requiresFactions: [
      { faction: 'Приют', rank: 5 }, { faction: 'Терминус', rank: 5 }, { faction: 'Арсенал', rank: 5 }
    ],
    formula: (a) => a.stats.mind * 0.8 + a.stats.power * 0.8 + a.stats.reaction * 0.4
  }
};

function canEquipHybridSkill(player, hybridSkill, getFactionRank) {
  if (hybridSkill.requiresHighTierKills) {
    return (player.highTierKills || 0) >= hybridSkill.requiresHighTierKills;
  }
  if (!hybridSkill.requiresFactions) return true;
  return hybridSkill.requiresFactions.every((req) => getFactionRank(player, req.faction) >= req.rank);
}

module.exports = { HYBRID_SKILLS, canEquipHybridSkill };
