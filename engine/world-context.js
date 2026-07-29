'use strict';

const { rollEvent } = require('./exploration-engine');
const { generateEvent } = require('../events/dynamic-events');
const { SECTOR_LORE, getSectorInfo, getConnectedSectors, generateSectorDescription } = require('../worldgen/sector-map');

/*
 * Хорошая новость: exploration-engine.js уже называет зоны blue/yellow/red —
 * ровно так же, как ждёт dynamic-events.js. Маппинг не нужен.
 *
 * sector-map.js использует поле `danger` ('yellow'/'red'/...) — это то же
 * пространство имён, что и зоны, так что секторы естественно привязываются
 * к зоне через danger, без отдельного поля zone.
 */

// Именные секторы, которые можно "встретить" в данной зоне.
// ВАЖНО: sector_7 ссылается на sector_8, а sector_12 на sector_15 как на
// connections, но ни sector_8, ни sector_15 не описаны в SECTOR_LORE —
// это не баг (generateSectorDescription просто покажет id вместо имени),
// но это незаполненный контент, который стоит либо дописать, либо
// осознанно оставить как "слухи о том, чего пока нет на карте".
function sectorsForZone(zone) {
  return Object.entries(SECTOR_LORE)
    .filter(([, sector]) => sector.danger === zone)
    .map(([id]) => id);
}

// Как часто вместо обычной "находки" встречается ИМЕННОЙ сектор (с историей
// и секретами), если игрок туда ещё не заходил. Не 100%, чтобы не превращать
// каждый шаг в лор-дамп — обычные встречи остаются основой темпа игры.
const SECTOR_VISIT_CHANCE = 0.35;

function maybeVisitSector(state, zone, rng = Math.random) {
  const candidates = sectorsForZone(zone).filter((id) => {
    const info = getSectorInfo(id, state);
    return info && info.unlocked && state.player?.currentSectorId !== id;
  });

  if (candidates.length === 0) return null;
  if (rng() > SECTOR_VISIT_CHANCE) return null;

  const sectorId = candidates[Math.floor(rng() * candidates.length)];
  return {
    type: 'sector',
    sectorId,
    text: generateSectorDescription(sectorId, state),
    connections: getConnectedSectors(sectorId),
  };
}

/**
 * Точка входа для шага "Продолжить путь". Порядок попыток:
 *   1. Именной сектор (лор, секреты) — редко, и только если там ещё не был.
 *   2. Контекстное динамическое событие (сюжет/выбор/босс-охранник) —
 *      только если хоть один шаблон реально подходит под прогресс игрока.
 *   3. Обычная процедурная встреча (rollEvent) — базовый случай, как сейчас.
 *
 * Если сектор посещён (case 1), не забудьте в router.js сохранить
 * state.player.currentSectorId = result.sectorId — эта функция сама
 * player не мутирует, только предлагает событие.
 *
 * `state` должен содержать как минимум то же, что уже требует
 * events/dynamic-events.js: state.player (name, faction, level,
 * currentSectorId), state.flags, state.quests, state.lore.
 */
function rollEventWithContext(state, zone, rng = Math.random) {
  const sectorVisit = maybeVisitSector(state, zone, rng);
  if (sectorVisit) return sectorVisit;

  const dynamicEvent = generateEvent(state, zone, rng);
  if (dynamicEvent) return { ...dynamicEvent, source: 'dynamic' };

  const playerLevel = state.player?.level ?? null;
  return { ...rollEvent(zone, rng, playerLevel), source: 'procedural' };
}

module.exports = { rollEventWithContext, maybeVisitSector, sectorsForZone };
