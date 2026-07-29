'use strict';

const { rollEvent } = require('./exploration-engine');
const { generateEvent } = require('../events/dynamic-events');
const { SECTOR_LORE, getSectorInfo, getConnectedSectors, generateSectorDescription } = require('../worldgen/sector-map');

function sectorsForZone(zone) {
  return Object.entries(SECTOR_LORE)
    .filter(([, sector]) => sector.danger === zone)
    .map(([id]) => id);
}

const SECTOR_VISIT_CHANCE = 0.35;

function maybeVisitSector(player, zone, rng = Math.random) {
  const candidates = sectorsForZone(zone).filter((id) => {
    const info = getSectorInfo(id, player);
    return info && info.unlocked && player.currentSectorId !== id;
  });

  if (candidates.length === 0) return null;
  if (rng() > SECTOR_VISIT_CHANCE) return null;

  const sectorId = candidates[Math.floor(rng() * candidates.length)];
  return {
    type: 'sector',
    sectorId,
    text: generateSectorDescription(sectorId, player),
    connections: getConnectedSectors(sectorId),
  };
}

/**
 * ВАЖНО про "combat" внутри событий из dynamic-events.js (anomaly_whisper.fight,
 * fragment_guardian): там нет готового объекта enemy, только { tier, ... } —
 * собрать реального Fighter'а через generateEnemy(zone, rng, player.level),
 * применив переданный tier/guardianName поверх, должен уже router.js в
 * момент резолва этого выбора. world-context.js только отдаёт сырые данные
 * события, ничего не резолвит.
 */
function rollEventWithContext(player, zone, rng = Math.random) {
  const sectorVisit = maybeVisitSector(player, zone, rng);
  if (sectorVisit) return sectorVisit;

  const dynamicEvent = generateEvent(player, zone, rng);
  if (dynamicEvent) return { ...dynamicEvent, source: 'dynamic' };

  return { ...rollEvent(zone, rng, player.level ?? null), source: 'procedural' };
}

module.exports = { rollEventWithContext, maybeVisitSector, sectorsForZone };
