'use strict';

const DANGER_TIER = { E: 1, D: 2, C: 3, B: 5, A: 6, S: 7 };

function statsForTier(tier, mult = {}) {
  const base = 12 + tier * 4;
  return {
    power: Math.round(base * (mult.power ?? 1)),
    mind: Math.round(base * (mult.mind ?? 1)),
    reaction: Math.round(base * (mult.reaction ?? 1)),
    endurance: Math.round(base * (mult.endurance ?? 1)),
    firepower: Math.round(base * (mult.firepower ?? 1.1)),
    shielding: Math.min(70, Math.round(base * (mult.shielding ?? 0.6))),
  };
}

function hpForTier(tier, mult = 1) {
  return Math.round((90 + tier * 22) * mult);
}

const BESTIARY = {
  scrap_zhuk: {
    id: 'scrap_zhuk', name: 'Скрап-жук', danger: 'E', zones: ['blue'],
    lore: 'Мелкий бронированный падальщик, кормится обшивкой брошенных капсул. Безопасен поодиночке, но станции жалуются на рои в трюмах.',
    tier: DANGER_TIER.E,
    stats: statsForTier(DANGER_TIER.E, { shielding: 0.9 }),
    loot: [
      { id: 'obl_splava', name: 'Обломки сплава', chance: 0.10 },
      { id: 'org_kley', name: 'Органический клей', chance: 0.08 },
      { id: 'sensor_glaz', name: 'Сенсорный глаз', chance: 0.03 },
    ],
  },
  pylevoy_padalschik: {
    id: 'pylevoy_padalschik', name: 'Пылевой Падальщик', danger: 'E', zones: ['blue'],
    lore: 'Небольшое насекомоподобное существо, санитар мёртвых миров — очищает территории от останков, не давая распространяться инфекции.',
    tier: DANGER_TIER.E,
    stats: statsForTier(DANGER_TIER.E, { reaction: 1.2 }),
    loot: [
      { id: 'hitin_plastiny', name: 'Хитиновые пластины', chance: 0.12 },
      { id: 'biomusor', name: 'Биомусор', chance: 0.15 },
      { id: 'tehnolom', name: 'Технолом', chance: 0.08 },
    ],
  },
  skitalets_schelkun: {
    id: 'skitalets_schelkun', name: 'Скиталец-щелкун', danger: 'C', zones: ['blue', 'yellow'],
    lore: 'Разведчик падальщиков — мелкое шестилапое существо с развитым слуховым аппаратом. Не нападает первым, но защищается роем.',
    tier: DANGER_TIER.C,
    stats: statsForTier(DANGER_TIER.C, { reaction: 1.15 }),
    loot: [
      { id: 'biomassa', name: 'Биомасса', chance: 0.12 },
      { id: 'hitin', name: 'Хитин', chance: 0.10 },
      { id: 'zhelezy_schelkuna', name: 'Железы щелкуна', chance: 0.04 },
    ],
  },
  igolnik: {
    id: 'igolnik', name: 'Игольник', danger: 'C', zones: ['yellow'],
    lore: 'Дальний ассасин аномальных зон — стреляет полыми кристаллическими иглами с нейротоксином, избегает прямого контакта.',
    tier: DANGER_TIER.C,
    stats: statsForTier(DANGER_TIER.C, { reaction: 1.3, power: 0.9 }),
    loot: [
      { id: 'kristal_igla', name: 'Кристаллическая игла', chance: 0.10 },
      { id: 'toksich_meshochek', name: 'Токсичный мешочек', chance: 0.08 },
      { id: 'neyrotoksin', name: 'Нейротоксин', chance: 0.05 },
      { id: 'fragment_hitina', name: 'Фрагмент хитинового покрова', chance: 0.06 },
    ],
  },
  hitin_tkach: {
    id: 'hitin_tkach', name: 'Хитин-ткач', danger: 'C', zones: ['yellow'],
    lore: 'Строительный рой — плетёт хитиновые баррикады в спорных секторах, иногда перекрывая проходы между станциями.',
    tier: DANGER_TIER.C,
    stats: statsForTier(DANGER_TIER.C, { shielding: 1.1, endurance: 1.1 }),
    loot: [
      { id: 'hitinovaya_nit', name: 'Хитиновая нить', chance: 0.10 },
      { id: 'stroit_smola', name: 'Строительная смола', chance: 0.07 },
      { id: 'pleteniy_pancir', name: 'Плетёный панцирь', chance: 0.04 },
    ],
  },
  signalniy_kleshch: {
    id: 'signalniy_kleshch', name: 'Сигнальный клещ', danger: 'D', zones: ['yellow'],
    lore: 'Паразит-ретранслятор, присасывается к дронам-разведчикам. Куратор Вуали подозревает, что через клещей сливают координаты патрулей.',
    tier: DANGER_TIER.D,
    stats: statsForTier(DANGER_TIER.D, { reaction: 1.3 }),
    loot: [
      { id: 'retranslyator_kleshnya', name: 'Ретранслятор-клешня', chance: 0.07 },
      { id: 'zaryazh_pancir', name: 'Заряженный панцирь', chance: 0.05 },
      { id: 'ukraden_log_chip', name: 'Украденный лог-чип', chance: 0.02 },
    ],
  },
  trakt_plakalschitsa: {
    id: 'trakt_plakalschitsa', name: 'Тракт-плакальщица', danger: 'D', zones: ['yellow'],
    lore: 'Хищный мимик — издаёт звук, неотличимый от крика о помощи, эксплуатируя distress-сигналы, чтобы заманить пилотов в засаду.',
    tier: DANGER_TIER.D,
    stats: statsForTier(DANGER_TIER.D, { reaction: 1.2 }),
    loot: [
      { id: 'golosovaya_membrana', name: 'Голосовая мембрана', chance: 0.09 },
      { id: 'falshiviy_mayak', name: 'Фальшивый маяк', chance: 0.06 },
      { id: 'rezonans_zheleza', name: 'Резонансная железа', chance: 0.03 },
    ],
  },
  razlomnik: {
    id: 'razlomnik', name: 'Разломник', danger: 'D', zones: ['yellow', 'red'],
    lore: 'Хищник пространственных трещин — тело частично фазировано, позволяет проскальзывать сквозь трещины реальности. Охотится стаей.',
    tier: DANGER_TIER.D + 1,
    stats: statsForTier(DANGER_TIER.D + 1, { reaction: 1.4, shielding: 0.6 }),
    loot: [
      { id: 'razlomniy_klyk', name: 'Разломный клык', chance: 0.08 },
      { id: 'stabilniy_fragment', name: 'Стабильный фрагмент', chance: 0.05 },
      { id: 'plot_razlomnika', name: 'Плоть разломника', chance: 0.06 },
      { id: 'adaptiv_neyromodul', name: 'Адаптивный нейромодуль', chance: 0.02 },
    ],
  },
  hronozhnets: {
    id: 'hronozhnets', name: 'Хроножнец', danger: 'D', zones: ['red'],
    lore: 'Повелитель искажённого времени — питается временной энергией, искажая причинно-следственные связи. Рекомендуется избегать любой ценой.',
    tier: DANGER_TIER.D + 2,
    stats: statsForTier(DANGER_TIER.D + 2, { mind: 1.3, reaction: 0.7 }),
    loot: [
      { id: 'hronoyadro', name: 'Хроноядро', chance: 0.06 },
      { id: 'fragmenty_realnosti', name: 'Фрагменты реальности', chance: 0.04 },
      { id: 'kvant_rezonator', name: 'Квантовый резонатор', chance: 0.02 },
    ],
  },
  graviarh: {
    id: 'graviarh', name: 'Гравиарх', danger: 'B', zones: ['yellow', 'red'],
    lore: 'Гравитационный хищник — искажает локальное поле тяжести, притягивает добычу и сдавливает её под огромным давлением. Медлителен, но неотвратим.',
    tier: DANGER_TIER.B,
    stats: statsForTier(DANGER_TIER.B, { endurance: 1.3, reaction: 0.6 }),
    loot: [
      { id: 'gravi_kristall', name: 'Грави-кристалл', chance: 0.10 },
      { id: 'fragment_gravizhelezy', name: 'Фрагмент грави-железы', chance: 0.07 },
      { id: 'plastiny_ekzopancirya', name: 'Пластины экзопанциря', chance: 0.05 },
      { id: 'gravitac_yad', name: 'Гравитационный яд', chance: 0.04 },
      { id: 'myaso_graviarha', name: 'Мясо гравиарха', chance: 0.01 },
    ],
  },
  pulsarid: {
    id: 'pulsarid', name: 'Пульсарид', danger: 'B', zones: ['yellow', 'red'],
    lore: 'Скаут роя улья — лёгкий разведчик, созданный для поиска жертв и передачи координат улью. Атакует стаями, избегая прямого боя.',
    tier: DANGER_TIER.B,
    stats: statsForTier(DANGER_TIER.B, { reaction: 1.3 }),
    loot: [
      { id: 'hitin', name: 'Хитин', chance: 0.10 },
      { id: 'zhelezy_pulsarida', name: 'Железы пульсарида', chance: 0.06 },
      { id: 'neyronniy_uzel', name: 'Нейронный узел', chance: 0.03 },
    ],
  },
  pustotniy_pozhiratel: {
    id: 'pustotniy_pozhiratel', name: 'Пустотный Пожиратель', danger: 'A', zones: ['red'],
    lore: 'Биокосмическая форма жизни из межзвёздной пустоты. Появляется там, где нарушен баланс пространства. Рекомендуется полное уничтожение или бегство.',
    tier: DANGER_TIER.A,
    stats: statsForTier(DANGER_TIER.A, { mind: 1.2, shielding: 1.2 }),
    loot: [
      { id: 'temnaya_energiya', name: 'Тёмная энергия', chance: 0.08 },
      { id: 'bioplazma', name: 'Биоплазма', chance: 0.06 },
      { id: 'fragmenty_iskazheniya', name: 'Фрагменты искажения', chance: 0.03 },
    ],
  },
  kuratorskiy_strazh: {
    id: 'kuratorskiy_strazh', name: 'Кураторский страж', danger: 'A', zones: ['yellow', 'red'],
    lore: 'Автоматизированный конструкт древней постройки, патрулирующий руины у станций. Нейтрален, только пока его не трогают.',
    tier: DANGER_TIER.A,
    stats: statsForTier(DANGER_TIER.A, { power: 1.2, endurance: 1.2 }),
    loot: [
      { id: 'strazh_plata', name: 'Страж-плата', chance: 0.06 },
      { id: 'reliktoviy_splav', name: 'Реликтовый сплав', chance: 0.04 },
      { id: 'fragment_protokola', name: 'Фрагмент протокола', chance: 0.01 },
    ],
  },
  nulevoy_zhnets: {
    id: 'nulevoy_zhnets', name: 'Нулевой жнец', danger: 'S', zones: ['red'],
    lore: 'Враждебный юнит неизвестного происхождения. Создан для тотального сбора энергии и ресурсов. Не испытывает страха, не отступает, не останавливается.',
    tier: DANGER_TIER.S,
    stats: statsForTier(DANGER_TIER.S, { power: 1.3, firepower: 1.3 }),
    loot: [
      { id: 'energoyadro', name: 'Энергоядро', chance: 0.05 },
      { id: 'splav_nihron', name: 'Сплав «Нихрон»', chance: 0.03 },
    ],
  },
  trakt_eho_matka: {
    id: 'trakt_eho_matka', name: 'Тракт-эхо-матка', danger: 'A', zones: ['red'],
    lore: 'Генератор Отголосков — крупная неподвижная тварь, глубоко вплетённая в структуру Тракта. Сама не атакует напрямую, но её присутствие искажает пространство, создавая постоянные засадные события в радиусе сектора. Уничтожение матки снижает уровень искажений и частоту засад.',
    tier: DANGER_TIER.A,
    stationary: true,
    stats: statsForTier(DANGER_TIER.A, { shielding: 1.4, reaction: 0.3 }),
    loot: [
      { id: 'matochnoe_yadro', name: 'Маточное ядро', chance: 0.04 },
      { id: 'eho_ikra', name: 'Эхо-икра', chance: 0.05 },
      { id: 'redkaya_matrica_rosta', name: 'Редкая матрица роста', chance: 0.01 },
    ],
  },
};

function rollLootByEnemyName(enemyName, rng = Math.random) {
  const entry = Object.values(BESTIARY).find((m) => m.name === enemyName);
  if (!entry) return [];
  return entry.loot.filter((item) => rng() < item.chance).map((item) => ({ id: item.id, name: item.name }));
}

function buildBestiaryFighter(entry, playerLevel) {
  let tier = entry.tier;
  if (playerLevel) tier = Math.max(1, Math.min(tier, playerLevel + 2));
  const hp = hpForTier(tier);
  return {
    name: entry.name,
    tier,
    hp, hpMax: hp,
    stats: { ...entry.stats },
    luck: Math.round(5 + tier * 1.4),
    accuracy: 0.68 + Math.min(tier, 5) * 0.02,
    dodge: 0.06 + Math.min(tier, 5) * 0.015,
    focus: 0.6 + Math.min(tier, 5) * 0.02,
    periodic: [],
    bestiaryId: entry.id,
  };
}

const NAMED_ENCOUNTER_CHANCE = 0.12;

function rollNamedEncounter(zone, playerLevel, rng = Math.random) {
  if (rng() > NAMED_ENCOUNTER_CHANCE) return null;
  const candidates = Object.values(BESTIARY).filter((m) => !m.stationary && m.zones.includes(zone));
  if (candidates.length === 0) return null;
  const entry = candidates[Math.floor(rng() * candidates.length)];
  return buildBestiaryFighter(entry, playerLevel);
}

module.exports = { BESTIARY, rollLootByEnemyName, rollNamedEncounter, buildBestiaryFighter };
