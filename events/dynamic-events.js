'use strict';

/**
 * ⚠️ ПЕРЕПИСАНО ПОСЛЕ РЕАЛЬНОГО БАГА ЗАЦИКЛИВАНИЯ (найден по скриншоту
 * переписки в ВК — "Слабый сигнал бедствия" повторялся бесконечно даже
 * после "Проигнорировать"). Причина: моя первая версия использовала
 * придуманное поле choice.result и event.flag, которые game/scenes/
 * exploration.js вообще не читает — реальный интерфейс choice это ТОЛЬКО
 * choice.combat / choice.loot / choice.consequence / choice.reputation /
 * choice.xp (см. exploration.js: case SCENES.EXPLORATION_EVENT_CHOICE).
 * Флаг можно выставить ТОЛЬКО через choice.consequence (строка-ключ в
 * choices/consequence-engine.js:CONSEQUENCE_TRIGGERS) — прямого
 * "choice.flag" не существует. Теперь каждый выбор с последствием
 * ссылается на реальную запись в consequence-engine.js.
 */
const { getFragmentStatus } = require('../lore/trakt-mythos.js');
const { getArcForFaction, getNextAvailableQuest } = require('../storylines/curator-arcs.js');

const EVENT_TEMPLATES = {
  'curator_message': {
    zones: ['blue', 'yellow'],
    weight: 15,
    condition: (player) => {
      const arc = getArcForFaction(player.faction);
      const nextQuest = arc ? getNextAvailableQuest(player, arc) : null;
      return !!nextQuest && !player.flags?.curator_message_seen;
    },
    generate: (player) => {
      const arc = getArcForFaction(player.faction);
      const quest = getNextAvailableQuest(player, arc);
      return {
        type: 'story',
        text: `Личное сообщение от куратора ${arc.curator}:\n\n«${quest.name} — дело срочное. Загляни, как будет минута».`,
        choices: [
          { text: 'Понятно', consequence: 'curator_message_seen' },
        ],
      };
    },
  },
  'stranded_signal': {
    zones: ['blue'],
    weight: 30,
    condition: (player) => !player.flags?.saved_stranded && !player.flags?.ignored_stranded,
    generate: () => ({
      type: 'choice',
      text: 'Слабый сигнал бедствия. Частный канал, не станционный. Кто-то застрял.',
      choices: [
        { text: 'Ответить на сигнал', consequence: 'stranded_rescued' },
        { text: 'Проигнорировать', consequence: 'stranded_ignored' },
      ],
    }),
  },
  'anomaly_whisper': {
    zones: ['yellow'],
    weight: 20,
    condition: (player) => !!player.flags?.touched_abyss && !player.flags?.anomaly_whisper_seen,
    generate: (player) => ({
      type: 'combat_choice',
      text: `Ты слышишь их снова. Но теперь — ближе. Яснее.\n\n«${player.name || 'Пилот'}... ты уже наш».`,
      choices: [
        { text: '«Я слушаю»', consequence: 'echo_allied' },
        { text: 'Атаковать', combat: { zoneOverride: 'yellow' } },
        { text: 'Бежать', consequence: 'anomaly_whisper_seen_flee' },
      ],
    }),
  },
  'fragment_guardian': {
    zones: ['red'],
    weight: 100,
    condition: (player) => getFragmentStatus(player).some((f) => f.unlocked && !f.collected),
    generate: (player, rng) => {
      const candidates = getFragmentStatus(player).filter((f) => f.unlocked && !f.collected);
      const target = candidates[Math.floor(rng() * candidates.length)];
      return {
        type: 'boss',
        text: `Сканер взрывается сигналами. Это место — не просто опасно. Оно охраняется.\n\n${target.name} где-то рядом, и что-то определённо не хочет отдавать его без боя.`,
        fragmentId: target.id,
        combat: { tier: 7 + Math.floor(rng() * 3), guardianName: target.guardian },
      };
    },
  },
  'truth_ruin': {
    zones: ['red'],
    weight: 10,
    condition: (player) => (player.lore && player.lore.hypothesis) === 'BETRAYAL' && !player.flags?.truth_ruin_seen,
    generate: () => ({
      type: 'choice',
      text: 'Руины станции, которой не должно быть в реестре. Пятая станция? «Нейтралитет». Уничтоженная так давно, что о ней не осталось даже слухов — только эти руины.',
      choices: [
        { text: 'Осмотреться', consequence: 'betrayal_confirmed', loot: { resource: 'Сплавы', tier: 2, qty: 5 } },
      ],
    }),
  },
};

/** Взвешенно выбирает и генерирует одно подходящее событие для зоны,
 * либо null, если ни один шаблон сейчас не подходит. */
function generateEvent(player, zone, rng = Math.random) {
  const candidates = Object.values(EVENT_TEMPLATES).filter((t) => {
    if (!t.zones.includes(zone)) return false;
    if (t.condition && !t.condition(player)) return false;
    return true;
  });
  if (candidates.length === 0) return null;
  const totalWeight = candidates.reduce((sum, t) => sum + t.weight, 0);
  let roll = rng() * totalWeight;
  for (const template of candidates) {
    roll -= template.weight;
    if (roll <= 0) return template.generate(player, rng);
  }
  return candidates[candidates.length - 1].generate(player, rng);
}

module.exports = { EVENT_TEMPLATES, generateEvent };
