'use strict';

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
        text: `Личное сообщение от куратора ${arc.curator}:\n\n«${quest.name} — дело срочное. Найди меня лично, как будет минута».`,
        flag: 'curator_message_seen'
      };
    }
  },
  'stranded_signal': {
    zones: ['blue'],
    weight: 30,
    condition: (player) => !player.flags?.saved_stranded,
    generate: () => ({
      type: 'choice',
      text: 'Слабый сигнал бедствия. Частный канал, не станционный. Кто-то застрял.',
      choices: [
        {
          id: 'rescue',
          text: 'Ответить на сигнал',
          result: {
            text: 'Пилот шаттла «Ласточка». Ранен, но жив. Даёт тебе координаты тайника в благодарность.',
            reward: { credits: 100, reputation: 5, flag: 'saved_stranded' }
          }
        },
        {
          id: 'ignore',
          text: 'Проигнорировать',
          result: { text: 'Сигнал тихнет. Потом — обрывается. Ты продолжаешь путь.', flag: 'ignored_stranded' }
        }
      ]
    })
  },
  'anomaly_whisper': {
    zones: ['yellow'],
    weight: 20,
    // Одноразово: touched_abyss даёт право на встречу, но только один раз.
    condition: (player) => !!player.flags?.touched_abyss && !player.flags?.anomaly_whisper_seen,
    generate: (player) => ({
      type: 'combat_choice',
      flag: 'anomaly_whisper_seen',
      text: `Ты слышишь их снова. Но теперь — ближе. Яснее.\n\n«${player.name || 'Пилот'}... Ты коснулся. Теперь ты — часть. Присоединяйся. Или умри».\n\nОтголоски окружают. Но они... ждут. Чего-то. Тебя?`,
      choices: [
        {
          id: 'join',
          text: '«Я слушаю»',
          result: {
            text: 'Ты открыл разум. Они влились — не как паразиты, как... знания. Теперь ты понимаешь их язык. И они — твой.',
            consequenceId: 'echo_allied'
          }
        },
        {
          id: 'fight',
          text: 'Атаковать',
          combat: { zoneOverride: 'yellow' }
        },
        {
          id: 'flee',
          text: 'Бежать',
          result: { text: 'Ты бежал. Они позволили. Почему?', flag: 'echo_mercy' }
        }
      ]
    })
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
        text: `Сканер взрывается сигналами. Это место — не просто опасно. Оно охраняется.\n\n${target.guardian} блокирует путь к ${target.name}.\n\n${target.lore}`,
        fragmentId: target.id,
        combat: { tier: 7 + Math.floor(rng() * 3), guardianName: target.guardian }
      };
    }
  },
  'truth_ruin': {
    zones: ['red'],
    weight: 10,
    condition: (player) => (player.lore && player.lore.hypothesis) === 'BETRAYAL',
    generate: () => ({
      type: 'discovery',
      text: 'Руины станции, которой не должно быть в реестре. Пятая станция? «Нейтралитет». Уничтожена до обрыва Тракта.\n\nВ логах: «...предали договор. Периферия — не авария. Периферия — приговор».\n\nКто вынес приговор? Кому?',
      reward: { credits: 150 },
      hypothesisConfirm: 'BETRAYAL'
    })
  }
};

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
