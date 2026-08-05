'use strict';

const { rollEvent } = require('./exploration-engine');
const { generateEvent } = require('../events/dynamic-events');
const { SECTOR_LORE, getSectorInfo, getConnectedSectors, generateSectorDescription } = require('../worldgen/sector-map');

/*
 * Зоны везде называются blue/yellow/red — одинаково в exploration-engine.js
 * и dynamic-events.js, маппинг не нужен. sector-map.js использует поле
 * `danger` в том же пространстве имён, так что секторы естественно
 * привязываются к зоне через danger.
 *
 * Везде ниже — player, не state (как и во всём остальном роутере).
 */

// Именные секторы, которые можно "встретить" в данной зоне.
function sectorsForZone(zone) {
  return Object.entries(SECTOR_LORE)
    .filter(([, sector]) => sector.danger === zone)
    .map(([id]) => id);
}

// Как часто вместо обычной "находки" встречается ИМЕННОЙ сектор (с историей
// и секретами), если игрок туда ещё не заходил. Не 100%, чтобы не превращать
// каждый шаг в лор-дамп — обычные встречи остаются основой темпа игры.
const SECTOR_VISIT_CHANCE = 0.15;

function maybeVisitSector(player, zone, rng = Math.random) {
  const candidates = sectorsForZone(zone).filter((id) => {
    const info = getSectorInfo(id, player);
    return info && info.unlocked && player.currentSectorId !== id;
  });

  if (candidates.length === 0) return null;
  if (rng() > SECTOR_VISIT_CHANCE) return null;

  const sectorId = candidates[Math.floor(rng() * candidates.length)];
  const sector = SECTOR_LORE[sectorId];
  const calmedFlag = `sector_${sectorId}_calmed`;
  return {
    type: 'sector',
    sectorId,
    text: generateSectorDescription(sectorId, player),
    connections: getConnectedSectors(sectorId),
    // "Хозяин" сектора (см. engine/bestiary.js) — есть только у секторов,
    // где явно задано поле resident (пока только sector_9). residentAlive
    // отражает, ещё жив ли он в мире ЭТОГО игрока — router.js использует
    // это, чтобы решить, предлагать ли кнопку атаки.
    residentId: sector.resident || null,
    residentAlive: sector.resident ? !(player.flags && player.flags[calmedFlag]) : false,
  };
}

/**
 * Точка входа для шага "Продолжить путь". Порядок попыток:
 *   1. Именной сектор (лор, секреты) — редко, и только если там ещё не был.
 *   2. Контекстное динамическое событие (сюжет/выбор/босс-охранник) —
 *      только если хоть один шаблон реально подходит под прогресс игрока.
 *   3. Обычная процедурная встреча (rollEvent) — базовый случай, как сейчас.
 *
 * Если сектор посещён (case 1), сохраните в router.js
 * player.currentSectorId = result.sectorId — эта функция сама
 * player не мутирует, только предлагает событие.
 *
 * ВАЖНО про "combat" внутри событий из dynamic-events.js (anomaly_whisper.fight,
 * fragment_guardian): там нет готового объекта enemy, только { tier, ... } —
 * собрать реального Fighter'а через generateEnemy(zone, rng, player.level),
 * применив переданный tier/guardianName поверх, должен уже router.js в
 * момент резолва этого выбора. world-context.js только отдаёт сырые данные
 * события, ничего не резолвит.
 *
 * depth (по умолчанию 0) — глубина текущей вылазки (см. engine/deep-exploration.js).
 * Влияет ТОЛЬКО на потолок тира в процедурной ветке (через эффективный
 * уровень) — секторы и динамические события проверяют условия по
 * настоящему player, без сдвига, чтобы глубина вылазки не открывала
 * сюжетный контент раньше времени.
 */
// Раньше: если хоть один шаблон динамического события подходил игроку,
// он ВСЕГДА перехватывал ролл — 100% случаев, без исключений. Из-за этого,
// пока не исчерпаны одноразовые сюжетные флаги (curator_message,
// stranded_signal и т.д.), обычные боевые встречи не могли выпасть вообще
// — именно поэтому казалось, что монстров "очень мало", особенно в
// голубой зоне на старте. Теперь у динамических событий тот же
// вероятностный гейт, что и у именных секторов — конкурируют за место,
// а не гарантированно перехватывают его.
const DYNAMIC_EVENT_CHANCE = 0.15;

function rollEventWithContext(player, zone, rng = Math.random, depth = 0, weightsOverride = null) {
  const sectorVisit = maybeVisitSector(player, zone, rng);
  if (sectorVisit) return sectorVisit;

  if (rng() < DYNAMIC_EVENT_CHANCE) {
    const dynamicEvent = generateEvent(player, zone, rng);
    if (dynamicEvent) return { ...dynamicEvent, source: 'dynamic' };
  }

  const effectiveLevel = depth > 0 ? (player.level ?? 1) + Math.floor(depth / 2) : player.level ?? null;
  return { ...rollEvent(zone, rng, effectiveLevel, weightsOverride), source: 'procedural' };
}

module.exports = { rollEventWithContext, maybeVisitSector, sectorsForZone };
