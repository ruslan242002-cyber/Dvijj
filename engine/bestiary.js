'use strict';

/**
 * БЕСТИАРИЙ — именные монстры из карт, которые вы присылали для картинок.
 * Раньше это был пустой файл (rollLootByEnemyName всегда возвращал []),
 * хотя router.js уже вызывал её после каждой победы — теперь она
 * реально что-то делает.
 *
 * Помимо особой добычи (rollLootByEnemyName), это единственный файл,
 * который умеет генерировать именных существ ВМЕСТО обычных generic-врагов
 * с процедурными именами (rollNamedEncounter) — им может воспользоваться
 * exploration-логика, чтобы редко подсовывать игроку не "Дрейф-обломок",
 * а настоящую "Тракт-эхо-матку" с её лором.
 *
 * Тир и зона выведены из "УРОВЕНЬ ОПАСНОСТИ" на карте (E/D/C/B/A/S) —
 * переведено в шкалу тиров игры (1-7), как в engine/exploration-engine.js.
 * Статы — не с карт (там только шкалы-полоски, не числа), а рассчитаны
 * по той же формуле, что и generateEnemy() в exploration-engine.js, для
 * согласованности баланса.
 */

const { maxTierForLevel } = require('./tier-bands.js');

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
      { id: 'chip_xp_gain_1', name: 'Нейрочип: Быстрое обучение I', chance: 0.02 },
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
      { id: 'chip_precision_1', name: 'Нейрочип: Меткость I', chance: 0.02 },
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
      { id: 'chip_loot_find_1', name: 'Нейрочип: Удачливая находка I', chance: 0.02 },
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
      { id: 'chip_evasion_1', name: 'Нейрочип: Манёвренность I', chance: 0.02 },
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
      { id: 'chip_fuel_efficiency_1', name: 'Нейрочип: Экономия топлива I', chance: 0.02 },
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
      { id: 'chip_cooldown_mastery_1', name: 'Нейрочип: Скорость восстановления I', chance: 0.02 },
    ],
  },
  kuratorskiy_strazh: {
    id: 'kuratorskiy_strazh', name: 'Кураторский страж', danger: 'A', zones: ['yellow', 'red'],
    lore: 'Автоматизированный конструкт древней постройки, патрулирующий руины у станций. Нейтрален, только пока его не трогают.',
    tier: DANGER_TIER.A,
    neutral: true, // не нападает первым — см. neutral_encounter в router.js
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
      { id: 'oskolok_bezdny', name: 'Осколок Бездны', chance: 0.02 },
    ],
  },
  trakt_eho_matka: {
    id: 'trakt_eho_matka', name: 'Тракт-эхо-матка', danger: 'A', zones: ['red'],
    lore: 'Генератор Отголосков — крупная неподвижная тварь, глубоко вплетённая в структуру Тракта. Сама не атакует напрямую, но её присутствие искажает пространство, создавая постоянные засадные события в радиусе сектора. Уничтожение матки снижает уровень искажений и частоту засад.',
    tier: DANGER_TIER.A,
    stationary: true, // не двигается и не атакует первой — см. заметку ниже
    stats: statsForTier(DANGER_TIER.A, { shielding: 1.4, reaction: 0.3 }),
    loot: [
      { id: 'matochnoe_yadro', name: 'Маточное ядро', chance: 0.04 },
      { id: 'eho_ikra', name: 'Эхо-икра', chance: 0.05 },
      { id: 'redkaya_matrica_rosta', name: 'Редкая матрица роста', chance: 0.01 },
      { id: 'oskolok_bezdny', name: 'Осколок Бездны', chance: 0.02 },
    ],
  },

  tenevoy_golovorez_rynka: {
id: 'tenevoy_golovorez_rynka', name: 'Теневой головорез рынка', danger: 'C', zones: ['yellow'],
lore: 'Бывшие охранники караванов, наёмники и должники, что продали долг за возможность остаться в живых. Патрулируют сектора Ярмарки Теней, охраняя интересы торговцев и свои доли. Не задают вопросов — сразу режут. «Ты либо товар, либо тень. Третьего не дано».',
tier: DANGER_TIER.C,
stats: statsForTier(DANGER_TIER.C, { reaction: 1.2, shielding: 1.15 }),
loot: [
{ id: 'fragment_rynochnogo_koda', name: 'Фрагмент рыночного кода', chance: 0.10 },
{ id: 'oblomki_lyogkoy_broni', name: 'Обломки лёгкой брони', chance: 0.12 },
{ id: 'modificirovanniy_nozh', name: 'Модифицированный нож', chance: 0.08 },
{ id: 'tenevoy_zheton', name: 'Теневой жетон', chance: 0.04 },
{ id: 'chip_rare_implant_1', name: 'Нейрочип: Редкий имплант', chance: 0.01 },
],
  },

  impulsniy_strannik: {
id: 'impulsniy_strannik', name: 'Импульсный странник', danger: 'C', zones: ['yellow'],
lore: 'Одинокий кочевник спорных секторов — перемещается короткими энергетическими скачками, никогда не задерживаясь на месте дольше нескольких минут. Пилоты называют его "мигалкой" — заметить проще по следу, чем по самому существу.',
tier: DANGER_TIER.C,
stats: statsForTier(DANGER_TIER.C, { reaction: 1.35, endurance: 0.85 }),
loot: [
{ id: 'impulsniy_sgustok', name: 'Импульсный сгусток', chance: 0.09 },
{ id: 'sledovoy_fragment', name: 'Следовой фрагмент', chance: 0.06 },
{ id: 'chip_evasion_2', name: 'Нейрочип: Манёвренность II', chance: 0.02 },
],
  },

  ekzo_parser: {
id: 'ekzo_parser', name: 'Экзо-парсер', danger: 'B', zones: ['yellow', 'red'],
lore: 'Автономный аналитический дрон довоенной постройки — до сих пор пытается расшифровать сигналы Тракта по программе, которую никто уже не помнит. Не агрессивен без причины, но защищает собранные данные с холодной методичностью.',
tier: DANGER_TIER.B,
stats: statsForTier(DANGER_TIER.B, { mind: 1.4, shielding: 1.1 }),
loot: [
{ id: 'arhivniy_disk', name: 'Архивный диск', chance: 0.08 },
{ id: 'parsing_yadro', name: 'Ядро парсинга', chance: 0.05 },
{ id: 'oskolok_dannyh', name: 'Осколок данных', chance: 0.06 },
{ id: 'chip_intel_1', name: 'Нейрочип: Аналитика I', chance: 0.02 },
],
  },

  pozhiratel_signalov: {
id: 'pozhiratel_signalov', name: 'Пожиратель сигналов', danger: 'B', zones: ['red'],
lore: 'Хищник, питающийся электромагнитным излучением — глушит связь на подлёте, оставляя жертву без возможности позвать на помощь. Именно из-за него глубокие вылазки в открытый космос ведутся молча.',
tier: DANGER_TIER.B,
stats: statsForTier(DANGER_TIER.B, { reaction: 1.2, mind: 1.15 }),
loot: [
{ id: 'signalniy_organ', name: 'Сигнальный орган', chance: 0.08 },
{ id: 'glushilka_yadro', name: 'Ядро глушилки', chance: 0.05 },
{ id: 'chip_stealth_1', name: 'Нейрочип: Скрытность I', chance: 0.02 },
],
  },

  oskolok_trakta: {
id: 'oskolok_trakta', name: 'Осколок Тракта', danger: 'A', zones: ['red'],
lore: 'Не совсем существо — скорее застывший в движении фрагмент самого Тракта, принявший форму, чтобы защититься. Именно за этим охотятся легендарные контракты Арсенала: тот, кто найдёт его первым, получает то, что не купить ни за какие кредиты.',
tier: DANGER_TIER.A,
stats: statsForTier(DANGER_TIER.A, { mind: 1.3, power: 1.2, shielding: 1.2 }),
loot: [
{ id: 'chistiy_oskolok', name: 'Чистый осколок Тракта', chance: 0.05 },
{ id: 'rezonans_yadro', name: 'Резонансное ядро', chance: 0.04 },
{ id: 'chip_rare_implant_2', name: 'Нейрочип: Редкий имплант II', chance: 0.02 },
],
  },

  rezonant: {
id: 'rezonant', name: 'Резонант', danger: 'B', zones: ['yellow', 'red'],
lore: 'Существо, буквально состоящее из застывшего резонанса Тракта — форма нестабильна, перетекает и меняется каждые несколько секунд. Разлом Кайлара — единственное известное место, где их видели больше одного разом.',
tier: DANGER_TIER.B,
stats: statsForTier(DANGER_TIER.B, { power: 1.3, shielding: 0.8 }),
loot: [
{ id: 'zastyvshiy_rezonans', name: 'Застывший резонанс', chance: 0.08 },
{ id: 'nestabilnoye_yadro', name: 'Нестабильное ядро', chance: 0.05 },
{ id: 'chip_power_1', name: 'Нейрочип: Мощь I', chance: 0.02 },
],
  },

  pustotnik: {
id: 'pustotnik', name: 'Пустотник', danger: 'A', zones: ['red'],
lore: 'Обитатель самых глубоких точек искажения — Бездна Оррин считается его домом, хотя "дом" здесь слово условное. Не столько нападает, сколько притягивает к себе всё, что подлетает слишком близко.',
tier: DANGER_TIER.A,
stats: statsForTier(DANGER_TIER.A, { power: 1.25, mind: 1.25 }),
loot: [
{ id: 'fragment_pustoty', name: 'Фрагмент пустоты', chance: 0.06 },
{ id: 'gravitac_yadro', name: 'Гравитационное ядро', chance: 0.04 },
{ id: 'chip_rare_implant_3', name: 'Нейрочип: Редкий имплант III', chance: 0.01 },
],
  },

  plazmoid_tkach: {
id: 'plazmoid_tkach', name: 'Плазмоид-ткач', danger: 'B', zones: ['red'],
lore: 'Плетёт из чистой плазмы структуры, похожие на паутину — говорят, это остатки промышленной автоматики Кузни Забытых, мутировавшей за десятилетия работы без операторов.',
tier: DANGER_TIER.B,
stats: statsForTier(DANGER_TIER.B, { firepower: 1.3, endurance: 1.1 }),
loot: [
{ id: 'plazmennaya_nit', name: 'Плазменная нить', chance: 0.08 },
{ id: 'tkackiy_modul', name: 'Ткацкий модуль', chance: 0.05 },
{ id: 'chip_firepower_1', name: 'Нейрочип: Огневая мощь I', chance: 0.02 },
],
  },

  shipastiy_svyaznik: {
id: 'shipastiy_svyaznik', name: 'Шипастый связник', danger: 'C', zones: ['yellow'],
lore: 'Колониальное существо — отдельные особи слабы, но действуют через общую нервную сеть, шипы которой пронизывают целые участки Периметра Танвир. Убить одного — не значит остановить остальных.',
tier: DANGER_TIER.C,
stats: statsForTier(DANGER_TIER.C, { endurance: 1.25, shielding: 1.05 }),
loot: [
{ id: 'nervniy_ship', name: 'Нервный шип', chance: 0.10 },
{ id: 'kolonialnaya_tkan', name: 'Колониальная ткань', chance: 0.07 },
{ id: 'chip_endurance_1', name: 'Нейрочип: Выносливость I', chance: 0.02 },
],
  },

  bezmolvniy_zhnets: {
id: 'bezmolvniy_zhnets', name: 'Безмолвный жнец', danger: 'A', zones: ['red'],
lore: 'Не издаёт ни звука, ни сигнала — сканеры видят его, только когда уже поздно. Пилоты Кладбища флота уверены, что именно он довершает то, что начала забытая битва: подчищает уцелевших.',
tier: DANGER_TIER.A,
stats: statsForTier(DANGER_TIER.A, { reaction: 1.3, firepower: 1.2 }),
loot: [
{ id: 'tihiy_klinok', name: 'Тихий клинок', chance: 0.06 },
{ id: 'zhatvenniy_modul', name: 'Жатвенный модуль', chance: 0.04 },
{ id: 'chip_rare_implant_4', name: 'Нейрочип: Редкий имплант IV', chance: 0.01 },
],
  },

  // ── ДОБАВЛЕНО (из engine/enemy-skills/creature-skills.js) — были
  // именные навыки, но самих существ в бестиарии не было вообще. Тир/
  // лор/добыча — моя реконструкция под стиль уже существующих записей,
  // ПРОВЕРЬ перед вводом в игру (навыки в creature-skills.js — реальные,
  // присланные, эта часть — только лор-обвязка вокруг них).

  incubation_node: {
    id: 'incubation_node', name: 'Инкубационный узел', danger: 'B', zones: ['red'],
    lore: 'Полуразумный нарост неясного происхождения, вживлённый в обшивку заброшенных станций. Не двигается сам, но защищает себя искажающим полем — задеть его случайно опаснее, чем напасть осознанно.',
    tier: DANGER_TIER.B,
    stats: statsForTier(DANGER_TIER.B, { shielding: 1.3, reaction: 0.5 }),
    loot: [
      { id: 'iskazhennaya_tkan', name: 'Искажённая ткань', chance: 0.07 },
      { id: 'nariv_reagenta', name: 'Нарост реагента', chance: 0.05 },
      { id: 'chip_shield_1', name: 'Нейрочип: Стойкость щита I', chance: 0.02 },
    ],
  },
  dust_eater_scout: {
    id: 'dust_eater_scout', name: 'Пылеед-Разведчик', danger: 'E', zones: ['blue'],
    lore: 'Мелкая падальная форма, зарывается в пылевые наносы и бросается на добычу внезапно. Слабый противник поодиночке — опасен только тем, кто его не заметил вовремя.',
    tier: DANGER_TIER.E,
    stats: statsForTier(DANGER_TIER.E, { reaction: 1.3 }),
    loot: [
      { id: 'pylevoy_pancir', name: 'Пылевой панцирь', chance: 0.11 },
      { id: 'peschanaya_zheleza', name: 'Песчаная железа', chance: 0.06 },
    ],
  },
  devastator_mk7: {
    id: 'devastator_mk7', name: 'Опустошитель МК-7', danger: 'B', zones: ['red'],
    lore: 'Довоенная боевая платформа, давно потерявшая связь с командованием, но не переставшая выполнять последний приказ — зачистка сектора. Ракетный залп на разогреве слышно издалека.',
    tier: DANGER_TIER.B,
    stats: statsForTier(DANGER_TIER.B, { firepower: 1.3, endurance: 1.2 }),
    loot: [
      { id: 'raketniy_modul', name: 'Ракетный модуль', chance: 0.06 },
      { id: 'plazm_rezak', name: 'Плазменный резак (компонент)', chance: 0.04 },
      { id: 'chip_firepower_2', name: 'Нейрочип: Огневая мощь II', chance: 0.02 },
    ],
  },
  perimeter_render: {
    id: 'perimeter_render', name: 'Рватель Периметра', danger: 'B', zones: ['red'],
    lore: 'Существо, живущее на границе искривлённых зон — само тело слегка не совпадает с окружающим пространством. Гравитационные искажения вокруг него мешают прицелиться.',
    tier: DANGER_TIER.B,
    stats: statsForTier(DANGER_TIER.B, { mind: 1.2, shielding: 0.9 }),
    loot: [
      { id: 'iskrivl_membrana', name: 'Искривлённая мембрана', chance: 0.07 },
      { id: 'bioenerg_zheleza', name: 'Биоэнергетическая железа', chance: 0.05 },
    ],
  },
  berth_listener: {
    id: 'berth_listener', name: 'Причальный Слушатель', danger: 'C', zones: ['yellow'],
    lore: 'Обитает у заброшенных причалов, улавливая отголоски старых переговоров и сигналов — некоторые пилоты клянутся, что слышали от него собственный голос.',
    tier: DANGER_TIER.C,
    stats: statsForTier(DANGER_TIER.C, { mind: 1.15 }),
    loot: [
      { id: 'rezonans_membrana', name: 'Резонансная мембрана', chance: 0.08 },
      { id: 'echo_organ', name: 'Эхо-орган', chance: 0.05 },
    ],
  },
  arsenal_scrap_crab: {
    id: 'arsenal_scrap_crab', name: 'Мусорщик-Краб Арсенала', danger: 'D', zones: ['blue'],
    lore: 'Промышленный утилизатор, переоборудованный из старого сборочного дрона — режущими клешнями разбирает всё, что найдёт, включая незваных гостей. Взрывной модуль — заводской дефект, не фича.',
    tier: DANGER_TIER.D,
    stats: statsForTier(DANGER_TIER.D, { power: 1.15, shielding: 1.1 }),
    loot: [
      { id: 'rezh_klesnya', name: 'Режущая клешня', chance: 0.09 },
      { id: 'utiliz_modul', name: 'Утилизационный модуль', chance: 0.05 },
    ],
  },
  arsenal_rusty_dummy: {
    id: 'arsenal_rusty_dummy', name: 'Ржавый Манекен Арсенала', danger: 'C', zones: ['yellow'],
    lore: 'Учебная мишень военных полигонов Арсенала, давно потерявшая протокол остановки — продолжает "тренировать" боевой протокол на всём, что движется в радиусе сенсоров.',
    tier: DANGER_TIER.C,
    stats: statsForTier(DANGER_TIER.C, { firepower: 1.1, shielding: 1.15 }),
    loot: [
      { id: 'ucheb_modul', name: 'Учебный модуль наведения', chance: 0.08 },
      { id: 'poligon_bronya', name: 'Полигонная броня (лом)', chance: 0.06 },
    ],
  },
  crystal_rupturer: {
    id: 'crystal_rupturer', name: 'Кристаллический Разрывник', danger: 'B', zones: ['red'],
    lore: 'Кристаллическая форма жизни, растущая прямо в корпусах разбитых кораблей — резкий фазовый удар способен пробить обшивку не хуже прямого попадания.',
    tier: DANGER_TIER.B,
    stats: statsForTier(DANGER_TIER.B, { power: 1.25, firepower: 1.15 }),
    loot: [
      { id: 'krist_oskolok', name: 'Кристаллический осколок', chance: 0.08 },
      { id: 'razryv_yadro', name: 'Ядро разрыва', chance: 0.05 },
    ],
  },
  burrower_render: {
    id: 'burrower_render', name: 'Буресос-Разрыватель', danger: 'B', zones: ['red'],
    lore: 'Роет тоннели прямо в астероидных полях, вылетая внезапно из-под обломков. Сейсмический удар при выходе на поверхность способен сбить с курса даже тяжёлый корабль.',
    tier: DANGER_TIER.B,
    stats: statsForTier(DANGER_TIER.B, { power: 1.3, endurance: 1.15 }),
    loot: [
      { id: 'buriln_koget', name: 'Бурильный коготь', chance: 0.08 },
      { id: 'seysm_zheleza', name: 'Сейсмическая железа', chance: 0.05 },
    ],
  },
  squat_mimoid: {
    id: 'squat_mimoid', name: 'Сквот-Мимоид', danger: 'E', zones: ['blue'],
    lore: 'Мимикрирует под обломки и мусор дрейфующих полей — большинство пилотов пролетают мимо, даже не заметив, что "мусор" только что моргнул.',
    tier: DANGER_TIER.E,
    stats: statsForTier(DANGER_TIER.E, { reaction: 1.2, shielding: 0.7 }),
    loot: [
      { id: 'mimikr_tkan', name: 'Мимикрирующая ткань', chance: 0.10 },
      { id: 'oblomochniy_pancir', name: 'Обломочный панцирь', chance: 0.06 },
    ],
  },
  joint_burser: {
    id: 'joint_burser', name: 'Бурсер Стыков', danger: 'B', zones: ['red'],
    lore: 'Гнездится в стыковочных узлах заброшенных станций — пульсирующие нарывы на теле выделяют структурно-разъедающее вещество, разрушающее даже бронированную обшивку.',
    tier: DANGER_TIER.B,
    stats: statsForTier(DANGER_TIER.B, { endurance: 1.25, shielding: 1.1 }),
    loot: [
      { id: 'stykov_nariv', name: 'Стыковочный нарыв', chance: 0.07 },
      { id: 'razyed_veschestvo', name: 'Разъедающее вещество', chance: 0.05 },
    ],
  },
  shadow_wailer: {
    id: 'shadow_wailer', name: 'Теневой Плачун', danger: 'B', zones: ['red'],
    lore: 'Издаёт крик, парализующий концентрацию ещё до самого удара — пилоты Кладбища флота называют его крик "последним, что слышишь перед тем, как перестаёшь целиться".',
    tier: DANGER_TIER.B,
    stats: statsForTier(DANGER_TIER.B, { reaction: 1.3, mind: 1.1 }),
    loot: [
      { id: 'plach_organ', name: 'Орган плача', chance: 0.07 },
      { id: 'tenevoy_fragment', name: 'Теневой фрагмент', chance: 0.05 },
    ],
  },
  tanvir_ashwalker: {
    id: 'tanvir_ashwalker', name: 'Пеплоход Танвира', danger: 'C', zones: ['yellow'],
    lore: 'Территориальный хищник спорного периметра Танвир — метит границы пепельными выбросами, яростно защищая застолблённый участок от любого, кто пересёк черту.',
    tier: DANGER_TIER.C,
    stats: statsForTier(DANGER_TIER.C, { power: 1.15, endurance: 1.1 }),
    loot: [
      { id: 'peplen_zheleza', name: 'Пепельная железа', chance: 0.08 },
      { id: 'territor_marker', name: 'Территориальный маркер', chance: 0.05 },
    ],
  },
  synapse_render: {
    id: 'synapse_render', name: 'Разрыватель Синапсов', danger: 'A', zones: ['red'],
    lore: 'Психонический хищник, бьющий напрямую по нервной системе пилота через корпус корабля — синаптическая дезинтеграция в его исполнении оставляет цель полностью беззащитной на несколько секунд.',
    tier: DANGER_TIER.A,
    stats: statsForTier(DANGER_TIER.A, { mind: 1.4, power: 1.1 }),
    loot: [
      { id: 'synaps_fragment', name: 'Синаптический фрагмент', chance: 0.06 },
      { id: 'psiho_yadro', name: 'Психоническое ядро', chance: 0.04 },
      { id: 'chip_rare_implant_5', name: 'Нейрочип: Редкий имплант V', chance: 0.01 },
    ],
  },
  anchor_sucker: {
    id: 'anchor_sucker', name: 'Якорный Присос', danger: 'C', zones: ['yellow'],
    lore: 'Присасывается к корпусу проходящих кораблей у станционных якорных полей — парализующая хватка не даёт вырваться, пока не высосет достаточно энергии.',
    tier: DANGER_TIER.C,
    stats: statsForTier(DANGER_TIER.C, { endurance: 1.2, shielding: 1.05 }),
    loot: [
      { id: 'prisosn_organ', name: 'Присасывающий орган', chance: 0.08 },
      { id: 'yakorn_zheleza', name: 'Якорная железа', chance: 0.05 },
    ],
  },
  shadow_range_unit: {
    id: 'shadow_range_unit', name: 'Теневой Полигонник', danger: 'B', zones: ['red'],
    lore: 'Автоматизированная турельная платформа с полным боекомплектом и никаких ограничений на применение — дымовая завеса и самодеструкция говорят о том, что сдаваться она не умеет.',
    tier: DANGER_TIER.B,
    stats: statsForTier(DANGER_TIER.B, { firepower: 1.35, shielding: 0.9 }),
    loot: [
      { id: 'turel_modul', name: 'Турельный модуль', chance: 0.07 },
      { id: 'boekomplekt', name: 'Боекомплект (лом)', chance: 0.06 },
      { id: 'chip_firepower_3', name: 'Нейрочип: Огневая мощь III', chance: 0.01 },
    ],
  },
  void_sentinel: {
    id: 'void_sentinel', name: 'Пустотный Страж', danger: 'B', zones: ['red'],
    lore: 'Древний конструкт, охраняющий границы искажённых зон — поле искажения вокруг него делает прицеливание почти бесполезным на средней дистанции.',
    tier: DANGER_TIER.B,
    stats: statsForTier(DANGER_TIER.B, { shielding: 1.25, mind: 1.15 }),
    loot: [
      { id: 'pustot_fragment_strazha', name: 'Фрагмент пустотного стража', chance: 0.07 },
      { id: 'iskazhen_yadro', name: 'Искажённое ядро', chance: 0.05 },
    ],
  },
  void_whisper: {
    id: 'void_whisper', name: 'Шёпот Пустоты', danger: 'E', zones: ['blue'],
    lore: 'Слабый, но навязчивый паразит акустических полей — его "шёпот" забивает связь помехами, пока не отобьёшь его подальше от корпуса.',
    tier: DANGER_TIER.E,
    stats: statsForTier(DANGER_TIER.E, { mind: 1.1 }),
    loot: [
      { id: 'akustich_zheleza', name: 'Акустическая железа', chance: 0.10 },
      { id: 'shepot_fragment', name: 'Фрагмент шёпота', chance: 0.06 },
    ],
  },
  sandgulper_scorcher: {
    id: 'sandgulper_scorcher', name: 'Пескоглот-Выжигатель', danger: 'B', zones: ['red'],
    lore: 'Роется в раскалённых песках красных зон, оставляя за собой оплавленный след — термальный рывок при атаке способен поджечь обшивку с одного соприкосновения.',
    tier: DANGER_TIER.B,
    stats: statsForTier(DANGER_TIER.B, { power: 1.3, firepower: 1.2 }),
    loot: [
      { id: 'oplavl_pancir', name: 'Оплавленный панцирь', chance: 0.07 },
      { id: 'vyzhig_zheleza', name: 'Выжигающая железа', chance: 0.05 },
    ],
  },
  arsenal_thrower_clicker: {
    id: 'arsenal_thrower_clicker', name: 'Метатель-Щелкун Арсенала', danger: 'D', zones: ['blue'],
    lore: 'Мелкий боевой дрон Арсенала, действующий стаями — по отдельности слаб, но синхронизация стаи заметно повышает боеспособность выживших особей.',
    tier: DANGER_TIER.D,
    stats: statsForTier(DANGER_TIER.D, { reaction: 1.25 }),
    loot: [
      { id: 'metat_modul', name: 'Метательный модуль', chance: 0.09 },
      { id: 'stayn_chip', name: 'Стайный чип синхронизации', chance: 0.05 },
    ],
  },
  sand_clicker: {
    id: 'sand_clicker', name: 'Песчаный Щелкун', danger: 'E', zones: ['blue'],
    lore: 'Самый распространённый обитатель патрулируемой зоны — пугливый и слабый, кусается только с испугу.',
    tier: DANGER_TIER.E,
    stats: statsForTier(DANGER_TIER.E, { reaction: 1.1 }),
    loot: [
      { id: 'peschan_pancir', name: 'Песчаный панцирь', chance: 0.12 },
      { id: 'schelkun_zheleza', name: 'Железа щелкуна', chance: 0.06 },
    ],
  },
  border_crawler: {
    id: 'border_crawler', name: 'Граничный Ползун', danger: 'E', zones: ['blue'],
    lore: 'Держится у границ безопасных секторов, готовый скрыться при первом же признаке серьёзного сопротивления — тревожный отход у него отработан до автоматизма.',
    tier: DANGER_TIER.E,
    stats: statsForTier(DANGER_TIER.E, { reaction: 1.25 }),
    loot: [
      { id: 'granich_pancir', name: 'Граничный панцирь', chance: 0.10 },
      { id: 'polzun_zheleza', name: 'Железа ползуна', chance: 0.06 },
    ],
  },
  sand_swivel: {
    id: 'sand_swivel', name: 'Песчаный Вертлюг', danger: 'C', zones: ['yellow'],
    lore: 'Крупная песчаная форма с вращающимся хвостовым сегментом — хвостовая волна сбивает с ног (и с курса) любого, кто подошёл слишком близко.',
    tier: DANGER_TIER.C,
    stats: statsForTier(DANGER_TIER.C, { power: 1.15, reaction: 1.1 }),
    loot: [
      { id: 'vertlyug_segment', name: 'Сегмент вертлюга', chance: 0.08 },
      { id: 'hvost_zheleza', name: 'Хвостовая железа', chance: 0.05 },
    ],
  },
  shard_shepherd: {
    id: 'shard_shepherd', name: 'Осколочный Пастырь', danger: 'C', zones: ['yellow'],
    lore: 'Собирает и удерживает вокруг себя рой мелких резонансных осколков, направляя их на цель резонансными ловушками — рой не опасен сам по себе, но координация роя делает пастыря живучим.',
    tier: DANGER_TIER.C,
    stats: statsForTier(DANGER_TIER.C, { mind: 1.15, shielding: 1.1 }),
    loot: [
      { id: 'rezonans_oskolok', name: 'Резонансный осколок', chance: 0.08 },
      { id: 'pastyr_zheleza', name: 'Железа пастыря', chance: 0.05 },
    ],
  },
};

/** Особая добыча по имени врага — вызывается из resolveCombatTurn в
 * router.js после каждой победы, независимо от того, откуда взялся враг
 * (обычный процедурный или именной из бестиария). */
function rollLootByEnemyName(enemyName, rng = Math.random) {
  const entry = Object.values(BESTIARY).find((m) => m.name === enemyName);
  if (!entry) return [];
  return entry.loot.filter((item) => rng() < item.chance).map((item) => ({ id: item.id, name: item.name }));
}

/** Собирает боеспособного Fighter'а из записи бестиария — та же форма
 * объекта, что и generateEnemy() в exploration-engine.js. */
function buildBestiaryFighter(entry, playerLevel) {
  let tier = entry.tier;
  if (playerLevel) tier = Math.max(1, Math.min(tier, maxTierForLevel(playerLevel)));
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
    neutral: !!entry.neutral,
  };
}

/**
 * Редкий шанс встретить ИМЕННОГО монстра бестиария вместо обычного
 * процедурного врага — вызывается вместо generateEnemy() в момент
 * ambush-события. Возвращает null, если не повезло (обычный случай) —
 * тогда используется прежняя процедурная генерация.
 *
 * "Тракт-эхо-матка" (stationary: true) сюда не попадает намеренно — она
 * не боевая встреча сама по себе, а сюжетный объект сектора (см. заметку
 * в конце файла); её стоит подключать через worldgen/sector-map.js, а не
 * как обычную засаду.
 */
const NAMED_ENCOUNTER_CHANCE = 0.12;

function rollNamedEncounter(zone, playerLevel, rng = Math.random) {
  if (rng() > NAMED_ENCOUNTER_CHANCE) return null;
  const candidates = Object.values(BESTIARY).filter((m) => !m.stationary && m.zones.includes(zone));
  if (candidates.length === 0) return null;
  const entry = candidates[Math.floor(rng() * candidates.length)];
  return buildBestiaryFighter(entry, playerLevel);
}

module.exports = { BESTIARY, rollLootByEnemyName, rollNamedEncounter, buildBestiaryFighter };

/*
 * ИДЕЯ НА БУДУЩЕЕ (не реализовано здесь, только заметка): "Тракт-эхо-матка"
 * по лору — стационарный объект, который повышает частоту засад в своём
 * секторе, пока жив. Естественное место для неё — новый именной сектор в
 * worldgen/sector-map.js (danger: 'red'), где: (1) при первом посещении
 * сектора игрок узнаёт о матке через текст сектора, (2) отдельная кнопка
 * "Атаковать матку" даёт бой через buildBestiaryFighter(BESTIARY.trakt_eho_matka),
 * (3) после победы — флаг вроде player.flags.eho_matka_killed, который
 * дальнейшая логика ambush-событий в этом секторе может проверять, чтобы
 * снизить вес events типа 'ambush' там же. Скажете — сделаю этот сектор
 * и хук отдельным шагом.
 */
