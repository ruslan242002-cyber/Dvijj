/**
 * Общая логика обработки запроса — не зависит от того, Vercel это,
 * Cloudflare Worker или локальный http-сервер. Один вход, один выход,
 * никакого состояния снаружи payload (SaleBot хранит state в переменных
 * клиента и присылает его в каждом запросе).
 *
 * Контракт (то, что нужно один раз прописать в блоке "Исходящий вебхук" в
 * SaleBot/BotHelp):
 *
 *   POST https://<ваш-домен>/api/turn
 *   body: {
 *     "action": "attack" | "skill",
 *     "skillId": "plasma_bolt",      // только если action == "skill"
 *     "stimId": "field_stim",        // необязательно, любое действие
 *     "state": { "player": {...}, "enemy": {...} }   // JSON-строка из переменной клиента
 *   }
 *
 *   ответ: { "log": "...", "state": {...}, "finished": bool, "winner": "attacker"|"defender"|null }
 *
 *   POST https://<ваш-домен>/api/explore
 *   body: { "zone": "blue" | "yellow" | "red" }
 *   ответ: { "type": "find"|"ambush"|"anomaly"|"distress"|"node", "text": "...", ... }
 *
 * В SaleBot после вызова вебхука результат приходит в переменные —
 * подставьте {webhook_result.log} прямо в текст сообщения блока.
 */
'use strict';

const { resolveTurn } = require('../engine/combat-engine.js');
const { SKILLS, STIMS } = require('../engine/skills-data.js');
const { rollEvent } = require('../engine/exploration-engine.js');

function handleTurn(body) {
  const { action, skillId, stimId, state } = body;
  if (!state || !state.player || !state.enemy) {
    return { error: 'Нужен state.player и state.enemy в запросе.' };
  }

  const attacker = state.player;
  const defender = state.enemy;
  const skill = action === 'skill' ? SKILLS[skillId] : null;
  if (action === 'skill' && !skill) return { error: `Неизвестный навык: ${skillId}` };
  const stim = stimId ? STIMS[stimId] : null;
  if (stimId && !stim) return { error: `Неизвестный стим: ${stimId}` };

  const result = resolveTurn({ attacker, defender, stim, skill });

  return {
    log: result.log.join(' '),
    state: { player: result.attacker, enemy: result.defender },
    finished: result.finished,
    winner: result.winner
  };
}

function handleExplore(body) {
  const zone = body.zone || 'blue';
  const event = rollEvent(zone);
  return event;
}

/** Универсальный обработчик: (path, body) => ответ (обычный JS-объект) */
function route(path, body) {
  if (path.endsWith('/turn')) return handleTurn(body || {});
  if (path.endsWith('/explore')) return handleExplore(body || {});
  return { error: `Неизвестный путь: ${path}. Используйте /api/turn или /api/explore.` };
}

module.exports = { handleTurn, handleExplore, route };
