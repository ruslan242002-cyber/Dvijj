'use strict';

/**
 * ОБЩИЕ ДАННЫЕ И ХЕЛПЕРЫ, используемые больше чем одним модулем сцен.
 * Вынесено из router.js как часть рефакторинга на отдельные сцены
 * (game/scenes/*.js) — раньше всё это жило в одном файле на 1500+ строк.
 */

const { xpToNext } = require('../../engine/leveling.js');
const { RECIPES } = require('../../crafting/crafting-engine.js');
const { GEAR_RECIPES } = require('../../engine/gear-engine.js');
const { SYSTEM_REPAIR_MATERIAL } = require('../../engine/ship-systems.js');
const { explorationStatusCard } = require('../../lib/status-card.js');
const { SKILLS } = require('../../engine/skills-data.js');
const { getDailyContracts, getReputationTitle } = require('../../contracts/contracts-engine.js');
const { getDistrictAtmosphere } = require('../../city/city-engine.js');
const { DISTRICTS } = require('../../city/districts-data.js');
const { rollStationEvent } = require('../../city/station-events.js');
const { trophyProgressText } = require('../../lib/trophies.js');
const { stormStatusText, isStormActive, STORM_REWARD_MULTIPLIER } = require('../../lib/world-storm.js');
const { applyDerivedStats } = require('../../engine/derived-stats.js');
const { SHIP_SKILL_BY_FACTION } = require('../../engine/ship-skills.js');

const DANGER_LABEL = {
  low: 'низкая',
  medium: 'средняя',
  high: 'высокая',
};

/**
 * Карточка станции при заходе на хаб — картинка (см. imageForLocation
 * ('station', faction) в hub.js) + описание в духе "Вы находитесь на
 * станции: X", плюс редкое случайное событие станции (station-events.js)
 * простым текстом внизу, если повезло сработать.
 *
 * Возвращает { text, reward } — reward нужно применить к игроку в hub.js
 * (эта функция сама player не мутирует, только читает).
 */
function stationArrivalCard(player, rng = Math.random) {
  const district = DISTRICTS[player.faction];
  const curator = CURATORS[player.faction] || 'куратор станции';
  const atmosphere = getDistrictAtmosphere(player.faction);
  const dangerLabel = district
    ? (DANGER_LABEL[district.danger] || district.danger)
    : '—';

  let text =
    `📍 Вы находитесь на станции: ${player.faction}\n` +
    `Куратор: ${curator}\n` +
    `Опасность станции: ${dangerLabel}`;

  if (district) {
    text += `\n\n${district.description}`;
  }

  if (atmosphere) {
    text += `\n\n${atmosphere.time}`;
  }

  if (isStormActive()) {
    text += `\n\n${stormStatusText()}`;
  }

  const event =
    district
      ? rollStationEvent(
          district.events,
          rng
        )
      : null;

  if (event) {
    text += `\n\n${event.text}`;
  }

  return {
    text,
    reward: event?.reward || null,
  };
}

const FACTIONS = [
  'Приют',
  'Терминус',
  'Арсенал',
  'Вуаль',
  'Кузница',
];

/** Расписание открытия городов по уровню */
const CITY_UNLOCK_LEVEL = {
  Арсенал: 5,
  Вуаль: 10,
  Терминус: 15,
  Кузница: 20,
};

const {
  unlockedSkillsForPlayer,
} = require('../../engine/skills-data.js');

const {
  freshShip,
} = require('../../engine/ship.js');

/**
 * КОМБАТ-БОНУСЫ ФРАКЦИЙ
 */
const FACTION_KIT = {
  Приют: {
    statBias: {
      mind: 6,
      endurance: 4,
    },
  },

  Терминус: {
    statBias: {
      endurance: 8,
      power: 2,
    },
  },

  Арсенал: {
    statBias: {
      power: 6,
      firepowerBonus: 4,
    },
  },

  Вуаль: {
    statBias: {
      mind: 6,
      reaction: 4,
    },
  },

  Кузница: {
    statBias: {
      endurance: 6,
      power: 6,
    },
  },
};

const MAX_EQUIPPED_SKILLS = 3;
const RESET_COMMAND = 'Сброс';

const HUB_BUTTONS = [
  'Исследовать',
  'Мостик',
  'Отсек',
  'Декон-камера',
  'Бар',
  'Контракты',
  'Биржа',
  'Дуэль',
  'Жильё',
  'Врата Тракта',
  '📊 Статус',
  'Профиль',
  'Сброс',
];

const ZONE_BUTTONS = [
  'Патрулируемый',
  'Спорный',
  'Открытый космос',
  'К другим станциям',
  '⬅️ Назад',
];

const ZONE_BY_LABEL = {
  Патрулируемый: 'blue',
  Спорный: 'yellow',
  'Открытый космос': 'red',
};

const ZONE_LABEL = {
  blue: 'Патрулируемый сектор',
  yellow: 'Спорный сектор',
  red: 'Открытый космос',
};

const MIN_LEVEL_FOR_ZONE = {
  blue: 1,
  yellow: 3,
  red: 7,
};

const CURATORS = {
  Приют: 'Ирис Вейл',
  Терминус: 'Шёпот',
  Арсенал: 'Рен Окса',
  Вуаль: 'Дрого Кейн',
  Кузница: 'Марта Ковач',
};

const ZONE_TRAVEL_PHRASES = {
  blue: [
    'Патрульный дрон станции лениво сканирует твой позывной и отворачивается — путь свободен.',
    'Знакомый гул генераторов станции затихает за спиной.',
    'Курс проложен, приборы спокойны — сектор патрулируемый.',
    'Мимо проплывает разметочный буй — граница патрулируемой зоны, всё как обычно.',
    'Скафандр чуть скрипит на стыках — привычный звук, ничего тревожного.',
    'Диспетчер станции коротко подтверждает курс и переключается на следующего.',
    'Здесь спокойно настолько, что мысли сами уходят куда-то в сторону.',
    'Знакомые созвездия за иллюминатором — этот участок ты уже видел(а) не раз.',
  ],

  yellow: [
    'Датчик радиации тихо щёлкает — пока в пределах нормы, но чаще, чем час назад.',
    'Обрывок чужих переговоров на общей частоте — сектор явно оспаривается.',
    'Обломки чужого корабля проплывают мимо — здесь недавно был бой.',
    'Приборы дважды теряют и находят сигнал станции — связь здесь уже не такая надёжная.',
    'На периферии сканера — что-то похожее на брошенный маяк, отключённый и молчаливый.',
    'Воздух в кабине как будто гуще — или просто нервы, сложно сказать наверняка.',
    'Чей-то незнакомый позывной мелькает в эфире и пропадает, не дождавшись ответа.',
    'Разметка сектора здесь старая, местами выцветшая — граница спорной территории.',
  ],

  red: [
    'Здесь эхо Тракта не в приборах — оно в голове.',
    'Связь со станцией слабеет с каждой секундой.',
    'Приборы фиксируют резонанс, для которого нет описания в базе.',
    'Тишина здесь неправильная — слишком плотная, будто сам космос затаил дыхание.',
    'На периферии зрения что-то движется — оборачиваешься, и там пусто.',
    'Датчики то и дело сходят с ума, показывая невозможные значения и тут же сбрасываясь.',
    'Свет далёких звёзд здесь как будто чуть тусклее обычного.',
    'Ощущение, что за тобой наблюдают, не проходит с самого входа в сектор.',
  ],
};

const STATION_TRAVEL_PHRASES = [
  'Тракт прокладывает курс между станциями — недолго, но не мгновенно.',
  'Обломки давно потерянных ковчегов мелькают за бортом.',
  'Резонанс Тракта на секунду искажает показания приборов — обычное дело для прыжка.',
  'Станция назначения уже видна вдалеке — почти на месте.',
  'Корабль мягко потряхивает на границе течений Тракта — пассажиры бы такое не одобрили.',
  'Автопилот коротко мигает индикатором коррекции курса и снова затихает.',
  'За бортом проносится вереница чужих маячков — оживлённый межстанционный коридор.',
  'Двигатели гудят ровнее обычного — редкий спокойный перелёт.',
];

function trainerDrone() {
  return {
    name: 'Дрон-манекен',
    tier: 0,
    hp: 100,
    hpMax: 100,
    stats: {
      power: 8,
      mind: 8,
      reaction: 8,
      endurance: 10,
      firepower: 10,
      shielding: 5,
    },
    luck: 0,
    accuracy: 0.5,
    dodge: 0.05,
    focus: 0.4,
    periodic: [],
  };
}

const MIN_LEVEL_TO_JOIN_FACTION = 30;

function canJoinFaction(
  player,
  newFaction
) {
  if (
    !FACTIONS.includes(
      newFaction
    )
  ) {
    return {
      ok: false,
      reason:
        'UNKNOWN_FACTION',
    };
  }

  if (
    player.faction ===
    newFaction
  ) {
    return {
      ok: false,
      reason:
        'ALREADY_THIS_FACTION',
    };
  }

  if (
    (player.level || 1) <
    MIN_LEVEL_TO_JOIN_FACTION
  ) {
    return {
      ok: false,
      reason:
        'LEVEL_TOO_LOW',
    };
  }

  return {
    ok: true,
  };
}

function switchFaction(
  player,
  newFaction
) {
  const oldBias =
    (
      FACTION_KIT[
        player.faction
      ] || {}
    ).statBias || {};

  const newBias =
    (
      FACTION_KIT[
        newFaction
      ] || {}
    ).statBias || {};

  player.stats = {
    ...player.stats,
  };

  player.stats.power =
    (player.stats.power || 0) -
    (oldBias.power || 0) +
    (newBias.power || 0);

  player.stats.mind =
    (player.stats.mind || 0) -
    (oldBias.mind || 0) +
    (newBias.mind || 0);

  player.stats.reaction =
    (player.stats.reaction || 0) -
    (oldBias.reaction || 0) +
    (newBias.reaction || 0);

  player.stats.endurance =
    (player.stats.endurance || 0) -
    (oldBias.endurance || 0) +
    (newBias.endurance || 0);

  player.baseFirepower =
    (player.baseFirepower ?? 26) -
    (oldBias.firepowerBonus || 0) +
    (newBias.firepowerBonus || 0);

  player.faction =
    newFaction;

  const starterSkills =
    unlockedSkillsForPlayer(
      newFaction,
      player.level || 1
    ).map(
      (s) => s.id
    );

  player.equippedSkills =
    starterSkills.slice(
      0,
      MAX_EQUIPPED_SKILLS
    );

  if (player.ship) {
    const shipSkill =
      SHIP_SKILL_BY_FACTION[
        newFaction
      ];

    player.ship.equippedSkills =
      shipSkill
        ? [shipSkill]
        : [];
  }

  applyDerivedStats(
    player
  );

  return player;
}

function currentStation(
  player
) {
  return (
    player.visitingStation ||
    player.faction
  );
}

function freshPlayer(
  name,
  faction
) {
  const bias =
    (
      FACTION_KIT[
        faction
      ] || {}
    ).statBias || {};

  const starterSkills =
    unlockedSkillsForPlayer(
      faction,
      1
    ).map(
      (s) => s.id
    );

  return {
    name,
    faction,

    hp: 220,
    hpMax: 220,

    stats: {
      power:
        20 +
        (bias.power || 0),

      mind:
        20 +
        (bias.mind || 0),

      reaction:
        20 +
        (bias.reaction || 0),

      endurance:
        22 +
        (bias.endurance || 0),

      firepower:
        26 +
        (bias.firepowerBonus || 0),

      shielding: 18,
    },

    luck: 10,
    accuracy: 0.8,
    dodge: 0.12,
    focus: 0.76,

    periodic: [],

    statPoints: 5,

    equippedSkills:
      starterSkills.slice(
        0,
        MAX_EQUIPPED_SKILLS
      ),

    inventory: [],
    tripCargo: [],

    ship:
      freshShip(faction),

    equippedPassives: [],
    knownPassives: [],

    credits: 0,
    radiation: 0,

    zone: 'blue',

    level: 1,
    xp: 0,

    killCount: 0,

    zoneVisits: {
      blue: 0,
      yellow: 0,
      red: 0,
    },

    completedQuests: [],
    reputation: 0,
    npcMeetings: {},
  };
}

const DECON_BASE_FEE = 300;

function deconFee(
  faction
) {
  if (
    faction ===
    'Приют'
  ) {
    return 0;
  }

  if (
    faction ===
    'Вуаль'
  ) {
    return Math.round(
      DECON_BASE_FEE *
        0.5
    );
  }

  return DECON_BASE_FEE;
}

function equippedSkillIds(
  player
) {
  if (
    player.equippedSkills &&
    player.equippedSkills.length
  ) {
    return player.equippedSkills;
  }

  return unlockedSkillsForPlayer(
    player.faction,
    player.level || 1
  ).map(
    (s) => s.id
  );
}

function skillButtons(
  player,
  cooldowns = {}
) {
  return equippedSkillIds(
    player
  )
    .filter(
      (id) =>
        !(cooldowns[id] > 0)
    )
    .map(
      (id) =>
        SKILLS[id]?.name
    )
    .filter(Boolean);
}

function skillCooldownNote(
  player,
  cooldowns = {}
) {
  const onCd =
    equippedSkillIds(
      player
    )
      .filter(
        (id) =>
          cooldowns[id] > 0
      )
      .map(
        (id) =>
          `⏳ ${SKILLS[id]?.name}: ещё ${cooldowns[id]} х.`
      );

  return onCd.length
    ? onCd.join('\n')
    : '';
}

function skillIdByName(
  name
) {
  return Object.values(
    SKILLS
  ).find(
    (s) =>
      s.name === name
  )?.id || null;
}

function addToInventory(
  player,
  resource,
  tier,
  qty
) {
  const inv =
    player.inventory ||
    (
      player.inventory = []
    );

  const existing =
    inv.find(
      (i) =>
        i.resource ===
          resource &&
        i.tier === tier
    );

  if (existing) {
    existing.qty += qty;
  } else {
    inv.push({
      resource,
      tier,
      qty,
    });
  }
}

function sellInventory(
  player
) {
  let total = 0;

  for (
    const item of
    player.inventory || []
  ) {
    total +=
      item.qty *
      item.tier *
      8;
  }

  player.inventory = [];

  player.credits =
    (player.credits || 0) +
    total;

  return total;
}

function isResourceProtected(
  resource,
  tier,
  player
) {
  const owned =
    new Set(
      player.modules || []
    );

  const neededForModule =
    RECIPES.some(
      (r) =>
        !owned.has(r.id) &&
        r.cost.some(
          (c) =>
            c.resource ===
              resource &&
            c.tier === tier
        )
    );

  const ownedGear =
    new Set(
      player.gear || []
    );

  const neededForGear =
    GEAR_RECIPES.some(
      (r) =>
        !ownedGear.has(r.id) &&
        r.cost.some(
          (c) =>
            c.resource ===
              resource &&
            c.tier === tier
        )
    );

  const shipDamaged =
    player.ship?.systems &&
    Object.values(
      player.ship.systems
    ).some(
      (v) => v < 100
    );

  const neededForShipRepair =
    shipDamaged &&
    Object.values(
      SYSTEM_REPAIR_MATERIAL
    ).some(
      (m) =>
        m.resource ===
          resource &&
        m.tier === tier
    );

  return (
    neededForModule ||
    neededForGear ||
    neededForShipRepair
  );
}

function sellUnprotectedInventory(
  player
) {
  let total = 0;
  const kept = [];

  for (
    const item of
    player.inventory || []
  ) {
    if (
      isResourceProtected(
        item.resource,
        item.tier,
        player
      )
    ) {
      kept.push(item);
    } else {
      total +=
        item.qty *
        item.tier *
        8;
    }
  }

  player.inventory =
    kept;

  player.credits =
    (player.credits || 0) +
    total;

  return {
    total,
    keptCount:
      kept.length,
  };
}

function stationButtons(
  deps,
  player
) {
  const link =
    typeof deps.getProfileLink ===
    'function'
      ? deps.getProfileLink()
      : null;

  const station =
    currentStation(
      player
    );

  const visiting =
    !!player.visitingStation;

  const rawGroups =
    DISTRICT_GROUPS[
      station
    ] ||
    DISTRICT_GROUPS[
      'Приют'
    ];

  const filteredGroups =
    visiting
      ? rawGroups.filter(
          (g) =>
            g.label !==
              'Бар' &&
            g.label !==
              'Контракты'
        )
      : rawGroups;

  const groups =
    filteredGroups.map(
      (g) => {
        if (
          g.label ===
          'Контракты'
        ) {
          return {
            label:
              'Контракты',
            color:
              'positive',
          };
        }

        if (
          g.label ===
          'Полёт'
        ) {
          return {
            label:
              'Полёт',
            color:
              'negative',
          };
        }

        return g.label;
      }
    );

  const flatTail =
    visiting
      ? [
          '🏠 Домой',
          'Сброс',
        ]
      : ['Сброс'];

  return link
    ? [
        {
          label:
            'Открыть профиль',
          url: link,
        },
        ...groups,
        ...flatTail,
      ]
    : [
        ...groups,
        'Профиль',
        ...flatTail,
      ];
}

function hubMessage(
  player
) {
  const next =
    xpToNext(
      player.level || 1
    );

  const visiting =
    player.visitingStation;

  const headerLine =
    visiting
      ? `🛰️ СТАНЦИЯ «${visiting}» (ты здесь гость — доступны общие услуги, не куратор)`
      : `🛰️ СТАНЦИЯ «${player.faction}»\n${
          CURATORS[
            player.faction
          ] || 'куратор станции'
        } на связи.`;

  const atmosphere =
    getDistrictAtmosphere(
      currentStation(
        player
      )
    );

  const atmosphereLine =
    atmosphere
      ? `\n\n${atmosphere.time}`
      : '';

  const stormLine =
    `\n\n${stormStatusText()}`;

  return (
    `${headerLine}` +
    `${atmosphereLine}` +
    `${stormLine}\n\n` +
    `${player.name} · Ур. ${
      player.level || 1
    } (${player.xp || 0}/${
      next
    } XP)\n` +
    `❤️ ${player.hp}/${player.hpMax}   ` +
    `💳 ${player.credits || 0}\n` +
    `📍 ${
      ZONE_LABEL[
        player.zone
      ] ||
      'Патрулируемый сектор'
    }` +
    `${
      player.radiation
        ? `\n☢️ Облучение: ${player.radiation}%`
        : ''
    }` +
    `${
      player.statPoints
        ? `\n✨ Нераспределённых очков: ${player.statPoints}`
        : ''
    }`
  );
}

function statusText(
  p
) {
  const repLine =
    p.reputation
      ? `\n⭐ Репутация: ${p.reputation} (${getReputationTitle(p.reputation)})`
      : '';

  const trophyLine =
    `\n\n${trophyProgressText(p).summary}`;

  return (
    hubMessage(p) +
    repLine +
    trophyLine
  );
}

/**
 * Создание JOURNEY.
 *
 * Обычный explore из станции сохраняет старое поведение.
 *
 * Если payload содержит locationId, это уже не полёт по космосу,
 * а высадка на конкретную named-location.
 *
 * В таком случае:
 *   - сохраняем theme в player.currentLocationTheme;
 *   - НЕ показываем космические ZONE_TRAVEL_PHRASES;
 *   - НЕ создаём несколько искусственных шагов Тракта;
 *   - сразу передаём игроку существующий контекст поверхности;
 *   - следующим нажатием запускается обычный exploration engine.
 */
function startJourney(
  player,
  kind,
  payload,
  rng
) {
  const isPlanetaryExploration =
    kind === 'explore' &&
    !!payload?.locationId;

  if (kind === 'explore') {
    if (
      payload?.locationTheme
    ) {
      player.currentLocationTheme =
        payload.locationTheme;
    } else {
      delete player.currentLocationTheme;
    }
  } else {
    delete player.currentLocationTheme;
  }

  if (
    isPlanetaryExploration
  ) {
    const locationName =
      payload.locationName ||
      'Неизвестная локация';

    const locationText =
      payload.locationDetail ||
      payload.locationBlurb ||
      'Поверхность этой локации встречает тебя тишиной. Впереди начинается вылазка.';

    return {
      reply: {
        text:
          `🪐 ${locationName}\n\n` +
          `${locationText}\n\n` +
          `Ты начинаешь исследование поверхности.`,

        buttons: [
          'Начать исследование',
        ],
      },

      nextState: {
        scene: 'journey',
        player,
        kind,
        payload,
        stepsLeft: 1,
      },
    };
  }

  const stepsLeft =
    2 +
    Math.floor(
      rng() * 2
    );

  const pool =
    kind === 'explore'
      ? (
          ZONE_TRAVEL_PHRASES[
            payload.zone
          ] ||
          ZONE_TRAVEL_PHRASES.blue
        )
      : STATION_TRAVEL_PHRASES;

  const text =
    pool[
      Math.floor(
        rng() *
          pool.length
      )
    ];

  return {
    reply: {
      text,
      buttons: [
        'Продолжить путь',
      ],
    },

    nextState: {
      scene: 'journey',
      player,
      kind,
      payload,
      stepsLeft,
    },
  };
}

function buildGuardianEnemy(
  name,
  tier,
  rng
) {
  const dangerMult = 1.4;

  const hp =
    Math.round(
      (80 +
        rng() *
          120) *
        dangerMult *
        (1 +
          tier *
            0.1)
    );

  const base =
    12 +
    tier * 4;

  return {
    name:
      name ||
      'Страж фрагмента',

    tier,
    hp,
    hpMax: hp,

    stats: {
      power:
        Math.round(
          base * 1.1
        ),

      mind:
        Math.round(
          base * 1.1
        ),

      reaction:
        Math.round(
          base * 1.1
        ),

      endurance:
        Math.round(
          base * 1.1
        ),

      firepower:
        Math.round(
          base * 1.3
        ),

      shielding:
        Math.min(
          70,
          Math.round(
            base * 0.7
          )
        ),
    },

    luck:
      Math.round(
        8 +
          tier *
            1.5
      ),

    accuracy:
      0.72 +
      Math.min(
        tier,
        5
      ) *
        0.02,

    dodge:
      0.08 +
      Math.min(
        tier,
        5
      ) *
        0.015,

    focus:
      0.65 +
      Math.min(
        tier,
        5
      ) *
        0.02,

    periodic: [],
  };
}

function journeyContinueButtons(
  zone,
  isBossContext = false
) {
  const buttons = [
    'Углубиться дальше',
    'Вернуться на станцию',
  ];

  if (
    zone === 'red' ||
    isBossContext
  ) {
    buttons.push(
      'Эвакуироваться'
    );
  }

  return buttons;
}

function safeReturnChoice(
  text,
  player,
  zone,
  depth,
  isBossContext = false,
  extra = {}
) {
  return {
    reply: {
      text:
        `${text}\n\n${explorationStatusCard(player)}`,

      buttons:
        journeyContinueButtons(
          zone,
          isBossContext
        ),
    },

    nextState: {
      scene:
        'journey_continue',

      player,
      zone,
      depth,
      isBossContext,
      ...extra,
    },
  };
}

function stormRewardMult() {
  return isStormActive()
    ? STORM_REWARD_MULTIPLIER
    : 1;
}

const DISTRICT_GROUPS = {
  Приют: [
    {
      label: 'Штаб',
      buttons: [
        'Мостик',
        '📊 Статус',
      ],
    },
    {
      label: 'Отсек',
      buttons: [
        'Отсек',
        'Мастерская',
      ],
    },
    {
      label: 'Декон-камера',
      buttons: [
        'Декон-камера',
      ],
    },
    {
      label: 'Палубы',
      buttons: [
        'Бар',
        'Биржа',
        'Жильё',
      ],
    },
    {
      label: 'Периферийный сектор',
      buttons: [
        'Терраса памяти',
        'Мастерская новичка',
        'Барак ожидания',
      ],
    },
    {
      label: 'Дуэль',
      buttons: [
        'Дуэль',
      ],
    },
    {
      label: 'Контракты',
      buttons: [
        'Контракты',
      ],
    },
    {
      label: 'Гильдия',
      buttons: [
        'Гильдия',
      ],
    },
    {
      label: '👥 Люди станции',
      buttons: [
        '👥 Люди станции',
      ],
    },
    {
      label: '⚔️ Мировой босс',
      buttons: [
        '⚔️ Мировой босс',
      ],
    },
    {
      label: '👥 Отряд против босса',
      buttons: [
        '👥 Отряд против босса',
      ],
    },
    {
      label: 'Полёт',
      buttons: [
        'Полёт',
      ],
    },
    {
      label: 'Врата Тракта',
      buttons: [
        'Врата Тракта',
      ],
    },
    {
      label: '⛏️ Жила',
      buttons: [
        '⛏️ Жила',
      ],
    },
  ],

  Терминус: [
    {
      label: 'Гарнизон',
      buttons: [
        'Мостик',
        '📊 Статус',
      ],
    },
    {
      label: 'Отсек',
      buttons: [
        'Отсек',
        'Мастерская',
      ],
    },
    {
      label: 'Декон-камера',
      buttons: [
        'Декон-камера',
      ],
    },
    {
      label: 'Казармы',
      buttons: [
        'Бар',
        'Биржа',
        'Жильё',
      ],
    },
    {
      label: 'Рубеж',
      buttons: [
        'Архив теней',
      ],
    },
    {
      label: 'Дуэль',
      buttons: [
        'Дуэль',
      ],
    },
    {
      label: 'Контракты',
      buttons: [
        'Контракты',
      ],
    },
    {
      label: 'Гильдия',
      buttons: [
        'Гильдия',
      ],
    },
    {
      label: '👥 Люди станции',
      buttons: [
        '👥 Люди станции',
      ],
    },
    {
      label: '⚔️ Мировой босс',
      buttons: [
        '⚔️ Мировой босс',
      ],
    },
    {
      label: '👥 Отряд против босса',
      buttons: [
        '👥 Отряд против босса',
      ],
    },
    {
      label: 'Полёт',
      buttons: [
        'Полёт',
      ],
    },
    {
      label: 'Врата Тракта',
      buttons: [
        'Врата Тракта',
      ],
    },
    {
      label: '⛏️ Жила',
      buttons: [
        '⛏️ Жила',
      ],
    },
  ],

  Арсенал: [
    {
      label: 'Штаб',
      buttons: [
        'Мостик',
        '📊 Статус',
      ],
    },
    {
      label: 'Отсек',
      buttons: [
        'Отсек',
        'Мастерская',
      ],
    },
    {
      label: 'Декон-камера',
      buttons: [
        'Декон-камера',
      ],
    },
    {
      label: 'Склад',
      buttons: [
        'Бар',
        'Биржа',
        'Жильё',
      ],
    },
    {
      label: 'Дуэль',
      buttons: [
        'Дуэль',
      ],
    },
    {
      label: 'Контракты',
      buttons: [
        'Контракты',
      ],
    },
    {
      label: 'Гильдия',
      buttons: [
        'Гильдия',
      ],
    },
    {
      label: '👥 Люди станции',
      buttons: [
        '👥 Люди станции',
      ],
    },
    {
      label: '⚔️ Мировой босс',
      buttons: [
        '⚔️ Мировой босс',
      ],
    },
    {
      label: '👥 Отряд против босса',
      buttons: [
        '👥 Отряд против босса',
      ],
    },
    {
      label: 'Полёт',
      buttons: [
        'Полёт',
      ],
    },
    {
      label: 'Врата Тракта',
      buttons: [
        'Врата Тракта',
      ],
    },
    {
      label: '⛏️ Жила',
      buttons: [
        '⛏️ Жила',
      ],
    },
  ],

  Вуаль: [
    {
      label: 'Штаб',
      buttons: [
        'Мостик',
        '📊 Статус',
      ],
    },
    {
      label: 'Цех',
      buttons: [
        'Отсек',
        'Мастерская',
      ],
    },
    {
      label: 'Декон-камера',
      buttons: [
        'Декон-камера',
      ],
    },
    {
      label: 'Модуль',
      buttons: [
        'Бар',
        'Биржа',
        'Жильё',
      ],
    },
    {
      label: 'Дуэль',
      buttons: [
        'Дуэль',
      ],
    },
    {
      label: 'Контракты',
      buttons: [
        'Контракты',
      ],
    },
    {
      label: 'Гильдия',
      buttons: [
        'Гильдия',
      ],
    },
    {
      label: '👥 Люди станции',
      buttons: [
        '👥 Люди станции',
      ],
    },
    {
      label: '⚔️ Мировой босс',
      buttons: [
        '⚔️ Мировой босс',
      ],
    },
    {
      label: '👥 Отряд против босса',
      buttons: [
        '👥 Отряд против босса',
      ],
    },
    {
      label: 'Полёт',
      buttons: [
        'Полёт',
      ],
    },
    {
      label: 'Врата Тракта',
      buttons: [
        'Врата Тракта',
      ],
    },
    {
      label: '⛏️ Жила',
      buttons: [
        '⛏️ Жила',
      ],
    },
  ],

  Кузница: [
    {
      label: 'Плавильня',
      buttons: [
        'Мостик',
        '📊 Статус',
      ],
    },
    {
      label: 'Отсек',
      buttons: [
        'Отсек',
        'Мастерская',
      ],
    },
    {
      label: 'Декон-камера',
      buttons: [
        'Декон-камера',
      ],
    },
    {
      label: 'Литейный квартал',
      buttons: [
        'Бар',
        'Биржа',
        'Жильё',
      ],
    },
    {
      label: 'Дуэль',
      buttons: [
        'Дуэль',
      ],
    },
    {
      label: 'Контракты',
      buttons: [
        'Контракты',
      ],
    },
    {
      label: 'Гильдия',
      buttons: [
        'Гильдия',
      ],
    },
    {
      label: '👥 Люди станции',
      buttons: [
        '👥 Люди станции',
      ],
    },
    {
      label: '⚔️ Мировой босс',
      buttons: [
        '⚔️ Мировой босс',
      ],
    },
    {
      label: '👥 Отряд против босса',
      buttons: [
        '👥 Отряд против босса',
      ],
    },
    {
      label: 'Полёт',
      buttons: [
        'Полёт',
      ],
    },
    {
      label: 'Врата Тракта',
      buttons: [
        'Врата Тракта',
      ],
    },
    {
      label: '⛏️ Жила',
      buttons: [
        '⛏️ Жила',
      ],
    },
  ],
};

// ИВЕНТ-ГЕЙТИНГ — «Мировой босс» и «Жила» на главной странице города
// раньше были видны всегда. Флаг передаётся ЯВНО параметром при каждом
// вызове, а не хранится в памяти модуля — на Vercel serverless нет
// гарантии, что один и тот же процесс переживёт до следующего запроса
// (холодный старт сбросил бы любой module-level флаг молча). Источник
// правды — реальная проверка deps.veinStore на стороне вызывающего кода
// (см. game/router.js), не кэш здесь.
const HIDDEN_UNTIL_EVENT_LABELS = new Set(['⚔️ Мировой босс', '⛏️ Жила']);

function districtGroupsFor(
  player,
  eventFlags = {}
) {
  const groups = (
    DISTRICT_GROUPS[
      player?.faction
    ] ||
    DISTRICT_GROUPS[
      'Приют'
    ]
  );
  return groups.filter((g) => {
    if (g.label === '⚔️ Мировой босс') return !!eventFlags.worldBoss;
    if (g.label === '⛏️ Жила') return !!eventFlags.vein;
    return true;
  });
}

module.exports = {
  FACTIONS,
  FACTION_KIT,
  CITY_UNLOCK_LEVEL,
  MIN_LEVEL_TO_JOIN_FACTION,
  canJoinFaction,
  switchFaction,
  currentStation,
  MAX_EQUIPPED_SKILLS,
  RESET_COMMAND,

  ZONE_BUTTONS,
  ZONE_BY_LABEL,
  ZONE_LABEL,
  MIN_LEVEL_FOR_ZONE,

  CURATORS,

  ZONE_TRAVEL_PHRASES,
  STATION_TRAVEL_PHRASES,
  DISTRICT_GROUPS,

  trainerDrone,
  freshPlayer,

  equippedSkillIds,
  skillButtons,
  skillIdByName,
  skillCooldownNote,

  addToInventory,
  sellInventory,
  sellUnprotectedInventory,
  isResourceProtected,

  stationButtons,
  hubMessage,
  statusText,

  startJourney,
  buildGuardianEnemy,
  journeyContinueButtons,
  safeReturnChoice,

  stormRewardMult,
  districtGroupsFor,
  stationArrivalCard,
  deconFee,
};
