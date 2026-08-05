'use strict';

/**
 * ИМЕНОВАННЫЙ СЛОЙ МЕСТ — не замена системе дистанции/зон (она остаётся
 * ровно той же: топливо, опасность, гейты по уровню корабля), а
 * ориентир поверх неё. Вместо "высадка на дистанции 7" — выбор между
 * несколькими конкретными, по-разному звучащими местами внутри одной
 * зоны. Это и есть источник нелинейности: не "глубже/мельче", а "куда
 * именно из нескольких вариантов".
 *
 * Тема (theme) — не механический модификатор, а флейвор-акцент места,
 * задел на будущее (например, для более точного подбора событий/лута
 * под конкретную локацию, если понадобится).
 */

const LOCATIONS_BY_ZONE = {
  blue: [
    { id: 'kovcheg9', name: 'Астероид «Ковчег-9»', theme: 'salvage', blurb: 'Остов древней жилой станции, вросший в породу — здесь до сих пор находят целые отсеки.' },
    { id: 'tishina', name: 'Спутник Тишины', theme: 'calm', blurb: 'Мёртвая луна без единого сигнала — идеальное место для тех, кто не хочет неожиданностей.' },
    { id: 'prichal_pervogo', name: 'Причал Первого Прибытия', theme: 'origin', blurb: 'Здесь сели первые ковчеги беженцев после разрыва Тракта — задолго до того, как кто-то из живущих сейчас родился. Приют вырос именно отсюда.' },
    { id: 'poligon_arsenala', name: 'Старый полигон Арсенала', theme: 'military', blurb: 'Заброшенное стрельбище довоенной эпохи — мишени всё ещё стоят рядами, изрешеченные, будто испытания прервали вчера, а не десятилетия назад.' },
  ],
  yellow: [
    { id: 'razlom_kaylara', name: 'Разлом Кайлара', theme: 'anomaly', blurb: 'Трещина в коре планеты, откуда постоянно сочится резонанс Тракта — красиво и опасно одновременно.' },
    { id: 'pustosh_tabira', name: 'Пустошь Табира', theme: 'hostile', blurb: 'Выжженная равнина, кишащая тварями — здесь бой находит тебя быстрее, чем ты его.' },
    { id: 'perimetr_tanvir', name: 'Спорный периметр Танвир', theme: 'border', blurb: 'Ничья земля между зонами влияния станций — старые пограничные вышки до сих пор мигают чужими опознавательными кодами.' },
    { id: 'yarmarka_tenej', name: 'Ярмарка Теней', theme: 'smuggle', blurb: 'Стихийный рынок вне юрисдикции любой станции — торгуют всем, спрашивают мало, а сдачу лучше не ждать.' },
  ],
  red: [
    { id: 'nekropol_ksarn', name: 'Некрополь Ксарн', theme: 'ruins', blurb: 'Руины города, вымершего за одну ночь — записи о причине не сохранились, и это само по себе плохой знак.' },
    { id: 'bezdna_orrin', name: 'Бездна Оррин', theme: 'abyss', blurb: 'Самая глубокая из известных точек искажения — говорят, именно отсюда впервые заговорил Пятый Голос.' },
    { id: 'kuznya_zabytyh', name: 'Кузня Забытых', theme: 'industrial', blurb: 'Промышленный комплекс, куда старше нынешней Кузницы — те, кто его строил, работали ещё до разрыва Тракта. Станки до сих пор гудят сами по себе.' },
    { id: 'kladbische_flota', name: 'Кладбище флота', theme: 'wreckage', blurb: 'Сотни обломков кораблей, слипшихся в единое поле — целая забытая битва, о которой не осталось ни одной записи ни в одной станции.' },
  ],
};

/**
 * Смещение весов событий по теме места — раньше тема была чисто
 * декоративной (плюс разовая награда за первый визит), теперь реально
 * меняет, что чаще выпадает. Не абсолютные веса — ДЕЛЬТЫ поверх обычных
 * весов зоны (ZONE_WEIGHTS в engine/exploration-engine.js), применяются
 * через applyThemeWeightBias ниже.
 */
const THEME_WEIGHT_BIAS = {
  hostile: { ambush: 15, find: -8, anomaly: -7 },      // Пустошь Табира — бой чаще
  ruins: { find: 12, ambush: -6, anomaly: -6 },        // Некрополь Ксарн — находки чаще
  anomaly: { anomaly: 15, find: -8, ambush: -7 },      // Разлом Кайлара — аномалии чаще
  smuggle: { distress: 10, find: 5, ambush: -15 },     // Ярмарка Теней — сигналы/находки, меньше боя
  border: { ambush: 8, distress: 5, anomaly: -13 },    // Периметр Танвир — пограничные стычки
  military: { ambush: 10, find: 5, anomaly: -15 },     // Полигон Арсенала — бой/трофеи
  calm: { ambush: -15, find: 5, anomaly: 10 },         // Спутник Тишины — спокойнее
  origin: { find: 10, ambush: -10 },                   // Причал Первого Прибытия
  salvage: { find: 15, node: 5, ambush: -20 },         // Ковчег-9 — находки
  abyss: { anomaly: 20, ambush: -10, find: -10 },      // Бездна Оррин — аномалии доминируют
  industrial: { node: 15, find: 5, ambush: -20 },      // Кузня Забытых — залежи/находки
  wreckage: { find: 15, ambush: 5, anomaly: -20 },     // Кладбище флота — находки+бой
};

/** Применяет дельту темы поверх базовых весов зоны, не давая ни одному
 * весу уйти в 0 или отрицательное значение (иначе событие вообще
 * перестанет выпадать, что не входило в замысел — просто реже). */
function applyThemeWeightBias(baseWeights, theme) {
  const bias = THEME_WEIGHT_BIAS[theme];
  if (!bias) return baseWeights;
  const result = { ...baseWeights };
  for (const [type, delta] of Object.entries(bias)) {
    if (result[type] === undefined) continue;
    result[type] = Math.max(1, result[type] + delta);
  }
  return result;
}

function locationsForZone(zone) {
  return LOCATIONS_BY_ZONE[zone] || LOCATIONS_BY_ZONE.blue;
}

function findLocationById(id) {
  for (const zone of Object.values(LOCATIONS_BY_ZONE)) {
    const found = zone.find((loc) => loc.id === id);
    if (found) return found;
  }
  return null;
}

/**
 * Скромная награда за ПЕРВОЕ посещение конкретного места — не за
 * повторные визиты, стимул реально облететь все 12 точек хотя бы раз, а
 * не оседать на одной и той же. Привязана к теме места, не одна и та же
 * цифра на всё подряд.
 */
const FIRST_VISIT_REWARDS = {
  salvage: { resource: 'Сплавы', tier: 1, qty: 5 },
  calm: { credits: 40 },
  origin: { credits: 60 },
  military: { resource: 'Изотопы', tier: 1, qty: 4 },
  anomaly: { resource: 'Реголит', tier: 2, qty: 3 },
  hostile: { credits: 50 },
  border: { credits: 55 },
  smuggle: { credits: 90 },
  ruins: { resource: 'Полимеры', tier: 2, qty: 3 },
  abyss: null, // особый случай — см. ниже, не ресурс/кредиты, а лорный отклик
  industrial: { resource: 'Реголит', tier: 3, qty: 3 },
  wreckage: { resource: 'Сплавы', tier: 2, qty: 4 },
};

function firstVisitRewardFor(location) {
  if (!location) return null;
  return FIRST_VISIT_REWARDS[location.theme] || null;
}

module.exports = { LOCATIONS_BY_ZONE, locationsForZone, findLocationById, firstVisitRewardFor, applyThemeWeightBias };
