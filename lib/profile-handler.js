
/**
 * Логика сайта-профиля отделена от транспорта (как и с ВК-вебхуком) —
 * handleProfileRequest(req, deps) чистая асинхронная функция, deps.store
 * и deps.secret подставляются в тестах, в проде — Upstash и переменная
 * окружения PROFILE_TOKEN_SECRET.
 */
'use strict';

const { verify } = require('./auth-token.js');
const { MAX_EQUIPPED_SKILLS } = require('../game/router.js');
const { SKILLS } = require('../engine/skills-data.js');

const ALLOCATABLE_STATS = ['power', 'mind', 'reaction', 'endurance'];

function skillCatalog() {
  return Object.values(SKILLS).map((s) => ({ id: s.id, name: s.name, station: s.station }));
}

async function handleProfileRequest({ method, token, body }, { store, secret }) {
  const peerId = verify(token, secret);
  if (!peerId) return { status: 401, json: { error: 'Неверная или просроченная ссылка. Запросите новую кнопкой «Профиль» в игре.' } };

  const state = await store.get(peerId);
  if (!state || !state.player) {
    return { status: 404, json: { error: 'Профиль ещё не создан — начните игру в сообществе ВК.' } };
  }

  if (method === 'GET') {
    return { status: 200, json: { player: state.player, allSkills: skillCatalog(), maxEquippedSkills: MAX_EQUIPPED_SKILLS } };
  }

  if (method === 'POST') {
    const action = body?.action;

    if (action === 'allocateStat') {
      const stat = body.stat;
      if (!ALLOCATABLE_STATS.includes(stat)) {
        return { status: 400, json: { error: 'Неизвестный параметр.' } };
      }
      if (!state.player.statPoints || state.player.statPoints <= 0) {
        return { status: 400, json: { error: 'Нет свободных очков.' } };
      }
      state.player.stats[stat] += 1;
      state.player.statPoints -= 1;
      await store.set(peerId, state);
      return { status: 200, json: { player: state.player } };
    }

    if (action === 'setEquippedSkills') {
      const ids = Array.isArray(body.skillIds) ? [...new Set(body.skillIds)] : [];
      if (ids.length === 0 || ids.length > MAX_EQUIPPED_SKILLS) {
        return { status: 400, json: { error: `Нужно выбрать от 1 до ${MAX_EQUIPPED_SKILLS} умений.` } };
      }
      const invalid = ids.filter((id) => !SKILLS[id]);
      if (invalid.length) {
        return { status: 400, json: { error: `Неизвестные умения: ${invalid.join(', ')}` } };
      }
      state.player.equippedSkills = ids;
      await store.set(peerId, state);
      return { status: 200, json: { player: state.player } };
    }

    return { status: 400, json: { error: 'Неизвестное действие.' } };
  }

  return { status: 405, json: { error: 'Метод не поддерживается.' } };
}

module.exports = { handleProfileRequest, skillCatalog, ALLOCATABLE_STATS };
