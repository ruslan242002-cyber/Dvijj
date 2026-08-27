'use strict';

const YIELD_BONUS_PER_MEMBER_PCT = 8;
const MAX_YIELD_BONUS_PCT = 24;
const AMBUSH_REDUCTION_PER_MEMBER_PCT = 10;
const MAX_AMBUSH_REDUCTION_PCT = 30;

async function nearbyPartyMemberCount(deps, player, playerId) {
  if (!deps.partyStore || !deps.presenceStore) return 0;
  const party = await deps.partyStore.getPartyForPlayer(playerId).catch(() => null);
  if (!party || party.members.length < 2) return 0;
  const nodeId = player.currentNodeId;
  if (!nodeId) return 0;
  const nearby = await deps.presenceStore.getActivePlayersAtNode(nodeId, playerId).catch(() => []);
  const partyMemberIds = new Set(party.members.map((m) => m.peerId).filter((id) => id !== playerId));
  return nearby.filter((p) => partyMemberIds.has(p.peerId)).length;
}

async function partyYieldBonusFor(deps, player, playerId) {
  const count = await nearbyPartyMemberCount(deps, player, playerId);
  return Math.min(MAX_YIELD_BONUS_PCT, count * YIELD_BONUS_PER_MEMBER_PCT);
}

async function partyAmbushReductionFor(deps, player, playerId) {
  const count = await nearbyPartyMemberCount(deps, player, playerId);
  return Math.min(MAX_AMBUSH_REDUCTION_PCT, count * AMBUSH_REDUCTION_PER_MEMBER_PCT);
}

module.exports = {
  nearbyPartyMemberCount, partyYieldBonusFor, partyAmbushReductionFor,
  YIELD_BONUS_PER_MEMBER_PCT, MAX_YIELD_BONUS_PCT, AMBUSH_REDUCTION_PER_MEMBER_PCT, MAX_AMBUSH_REDUCTION_PCT,
};
