'use strict';

const {
  rollEvent,
} = require('./exploration-engine');

const {
  generateEvent,
} = require('../events/dynamic-events');

const {
  adaptDynamicEvent,
} = require('./dynamic-event-adapter');

const {
  SECTOR_LORE,
  getSectorInfo,
  getConnectedSectors,
  generateSectorDescription,
} = require('../worldgen/sector-map');

/*
 * Зоны везде называются blue/yellow/red.
 */

function sectorsForZone(
  zone
) {
  return Object.entries(
    SECTOR_LORE
  )
    .filter(
      ([, sector]) =>
        sector.danger === zone
    )
    .map(
      ([id]) => id
    );
}

const SECTOR_VISIT_CHANCE =
  0.15;

function maybeVisitSector(
  player,
  zone,
  rng = Math.random
) {
  const candidates =
    sectorsForZone(
      zone
    ).filter((id) => {
      const info =
        getSectorInfo(
          id,
          player
        );

      return (
        info &&
        info.unlocked &&
        player.currentSectorId !==
          id
      );
    });

  if (
    candidates.length === 0
  ) {
    return null;
  }

  if (
    rng() >
    SECTOR_VISIT_CHANCE
  ) {
    return null;
  }

  const sectorId =
    candidates[
      Math.floor(
        rng() *
          candidates.length
      )
    ];

  const sector =
    SECTOR_LORE[
      sectorId
    ];

  const calmedFlag =
    `sector_${sectorId}_calmed`;

  return {
    type: 'sector',

    sectorId,

    text:
      generateSectorDescription(
        sectorId,
        player
      ),

    connections:
      getConnectedSectors(
        sectorId
      ),

    residentId:
      sector.resident ||
      null,

    residentAlive:
      sector.resident
        ? !(
            player.flags &&
            player.flags[
              calmedFlag
            ]
          )
        : false,
  };
}

const DYNAMIC_EVENT_CHANCE =
  0.15;

function rollEventWithContext(
  player,
  zone,
  rng = Math.random,
  depth = 0,
  weightsOverride = null
) {
  const sectorVisit =
    maybeVisitSector(
      player,
      zone,
      rng
    );

  if (sectorVisit) {
    return sectorVisit;
  }

  if (
    rng() <
    DYNAMIC_EVENT_CHANCE
  ) {
    const dynamicEvent =
      generateEvent(
        player,
        zone,
        rng
      );

    if (dynamicEvent) {
      return adaptDynamicEvent(
        {
          ...dynamicEvent,
          source: 'dynamic',
        },
        rng
      );
    }
  }

  const effectiveLevel =
    depth > 0
      ? (player.level ?? 1) +
        Math.floor(
          depth / 2
        )
      : player.level ?? null;

  return {
    ...rollEvent(
      zone,
      rng,
      effectiveLevel,
      weightsOverride
    ),

    source:
      'procedural',
  };
}

module.exports = {
  rollEventWithContext,
  maybeVisitSector,
  sectorsForZone,
};
