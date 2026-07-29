'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createDuel, submitTurn, PvpError } = require('./pvp-engine');
const { PVP_ERRORS } = require('./pvp-data');

function createMockStore() {
  const duels = new Map();
  const activeDuel = new Map();

  return {
    async getDuel(id) { return duels.get(id) || null; },
    async saveDuel(duel) { duels.set(duel.id, JSON.parse(JSON.stringify(duel))); },
    async getActiveDuelId(playerId) { return activeDuel.get(playerId) || null; },
    async setActiveDuelId(playerId, duelId) { activeDuel.set(playerId, duelId); },
    async clearActiveDuelId(playerId) { activeDuel.delete(playerId); },
    async updateDuelAtomic(duelId, applyFn) {
      const duel = duels.get(duelId);
      if (!duel) { const e = new Error('DUEL_NOT_FOUND'); e.code = 'DUEL_NOT_FOUND'; throw e; }
      const copy = JSON.parse(JSON.stringify(duel));
      const updated = applyFn(copy);
      duels.set(duelId, updated);
      return updated;
    },
  };
}

function makeFighterPlayer(id, overrides = {}) {
  return {
    id, name: id,
    hp: 200, hpMax: 200,
    stats: { power: 20, mind: 20, reaction: 20, endurance: 20, firepower: 26, shielding: 10 },
    luck: 10, accuracy: 0.8, dodge: 0.1, focus: 0.76,
    equippedSkills: [],
    ...overrides,
  };
}

test('createDuel snapshots both fighters and marks both as busy', async () => {
  const store = createMockStore();
  const a = makeFighterPlayer('a');
  const b = makeFighterPlayer('b');

  const duel = await createDuel({ store }, a, b);

  assert.equal(duel.fighterA.id, 'a');
  assert.equal(duel.fighterB.id, 'b');
  assert.equal(duel.turnOf, 'A');
  assert.equal(await store.getActiveDuelId('a'), duel.id);
  assert.equal(await store.getActiveDuelId('b'), duel.id);
});

test('createDuel rejects self-challenge', async () => {
  const store = createMockStore();
  const a = makeFighterPlayer('a');
  await assert.rejects(
    () => createDuel({ store }, a, a),
    (err) => err instanceof PvpError && err.code === PVP_ERRORS.CANNOT_CHALLENGE_SELF
  );
});

test('createDuel rejects if either player already in a duel', async () => {
  const store = createMockStore();
  const a = makeFighterPlayer('a');
  const b = makeFighterPlayer('b');
  const c = makeFighterPlayer('c');
  await createDuel({ store }, a, b);

  await assert.rejects(
    () => createDuel({ store }, a, c),
    (err) => err instanceof PvpError && err.code === PVP_ERRORS.ALREADY_IN_DUEL
  );
  await assert.rejects(
    () => createDuel({ store }, c, b),
    (err) => err instanceof PvpError && err.code === PVP_ERRORS.ALREADY_IN_DUEL
  );
});

test('submitTurn rejects when it is not the caller\'s turn', async () => {
  const store = createMockStore();
  const a = makeFighterPlayer('a');
  const b = makeFighterPlayer('b');
  const duel = await createDuel({ store }, a, b);

  await assert.rejects(
    () => submitTurn({ store }, 'b', duel.id, {}, {}, {}, () => 0.01),
    (err) => err instanceof PvpError && err.code === PVP_ERRORS.NOT_YOUR_TURN
  );
});

test('submitTurn alternates turnOf after a non-finishing hit', async () => {
  const store = createMockStore();
  const a = makeFighterPlayer('a');
  const b = makeFighterPlayer('b', { hp: 5000, hpMax: 5000 });
  const duel = await createDuel({ store }, a, b);

  const updated = await submitTurn({ store }, 'a', duel.id, {}, {}, {}, () => 0.01);

  assert.equal(updated.turnOf, 'B');
  assert.equal(updated.status, 'active');
  assert.ok(updated.fighterB.hp < 5000);
});

test('submitTurn finishes the duel and frees both players when a fighter dies', async () => {
  const store = createMockStore();
  const a = makeFighterPlayer('a', { stats: { power: 500, mind: 20, reaction: 20, endurance: 20, firepower: 500, shielding: 0 } });
  const b = makeFighterPlayer('b', { hp: 1, hpMax: 1 });
  const duel = await createDuel({ store }, a, b);

  const updated = await submitTurn({ store }, 'a', duel.id, {}, {}, {}, () => 0.01);

  assert.equal(updated.status, 'finished');
  assert.equal(updated.winner, 'A');
  assert.equal(await store.getActiveDuelId('a'), null);
  assert.equal(await store.getActiveDuelId('b'), null);
});

test('submitTurn rejects further turns once the duel is finished', async () => {
  const store = createMockStore();
  const a = makeFighterPlayer('a', { stats: { power: 500, mind: 20, reaction: 20, endurance: 20, firepower: 500, shielding: 0 } });
  const b = makeFighterPlayer('b', { hp: 1, hpMax: 1 });
  const duel = await createDuel({ store }, a, b);
  await submitTurn({ store }, 'a', duel.id, {}, {}, {}, () => 0.01);

  await assert.rejects(
    () => submitTurn({ store }, 'b', duel.id, {}, {}, {}, () => 0.01),
    (err) => err instanceof PvpError && err.code === PVP_ERRORS.DUEL_FINISHED
  );
});

test('submitTurn rejects unknown skill id', async () => {
  const store = createMockStore();
  const a = makeFighterPlayer('a');
  const b = makeFighterPlayer('b');
  const duel = await createDuel({ store }, a, b);

  await assert.rejects(
    () => submitTurn({ store }, 'a', duel.id, { skillId: 'nope' }, {}, {}, () => 0.01),
    (err) => err instanceof PvpError && err.code === PVP_ERRORS.UNKNOWN_SKILL
  );
});

test('submitTurn applies a real skill from SKILLS and can trigger lifesteal/self-heal', async () => {
  const store = createMockStore();
  const a = makeFighterPlayer('a', { hp: 100, hpMax: 200 });
  const b = makeFighterPlayer('b', { hp: 5000, hpMax: 5000 });
  const duel = await createDuel({ store }, a, b);

  const SKILLS = {
    lifesteal_bolt: { id: 'lifesteal_bolt', usesFocus: true, damaging: true, lifestealPct: 0.5, formula: (att) => att.stats.power * 2 },
  };

  const updated = await submitTurn({ store }, 'a', duel.id, { skillId: 'lifesteal_bolt' }, SKILLS, {}, () => 0.01);
  assert.ok(updated.fighterA.hp > 100);
  assert.ok(updated.fighterB.hp < 5000);
});

test('full duel resolves to a winner within a bounded number of turns (no infinite loop)', async () => {
  const store = createMockStore();
  const a = makeFighterPlayer('a', { stats: { power: 40, mind: 20, reaction: 20, endurance: 20, firepower: 40, shielding: 0 } });
  const b = makeFighterPlayer('b', { stats: { power: 5, mind: 20, reaction: 20, endurance: 20, firepower: 5, shielding: 0 } });
  let duel = await createDuel({ store }, a, b);

  let turns = 0;
  const maxTurns = 50;
  while (duel.status !== 'finished' && turns < maxTurns) {
    const side = duel.turnOf === 'A' ? 'a' : 'b';
    duel = await submitTurn({ store }, side, duel.id, {}, {}, {}, () => 0.01);
    turns += 1;
  }

  assert.equal(duel.status, 'finished');
  assert.ok(['A', 'B'].includes(duel.winner));
  assert.ok(turns < maxTurns);
});
