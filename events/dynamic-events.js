'use strict';

const { getFragmentStatus } = require('../lore/trakt-mythos.js');

/**
 * ДИНАМИЧЕСКИЕ СОБЫТИЯ
 * 
 * Вместо чисто случайных встреч — события с КОНТЕКСТОМ.
 * То, что игрок находит, зависит от:
 * - его прогресса в квестах
 * - сделанных выборов
 * - текущей гипотезы о Тракте
 * - репутации с фракциями
 */

const EVENT_TEMPLATES = {
  // === СИНЯЯ ЗОНА (безопасная) ===
  
  'stranded_signal': {
    zones: ['blue'],
    weight: 30,
    condition: (state) => !state.flags?.saved_stranded,
    generate: (state, rng) => {
      const hasNote = state.quests?.active?.priyut_1_missing?.flags?.has_note;
      return {
        type: 'choice',
        text: hasNote 
          ? 'Сигнал бедствия — частота знакомая. Это тот самый канал, что использовал пропавший пилот. Совпадение?'
          : 'Слабый сигнал бедствия. Частный канал, не станционный. Кто-то застрял.',
        choices: [
          { 
            id: 'rescue', 
            text: 'Ответить на сигнал',
            result: {
              text: 'Пилот шаттла «Ласточка». Ранен, но жив. Даёт тебе координаты тайника в благодарность.',
              reward: { credits: 100, reputation: 5, flag: 'saved_stranded' },
              unlockLocation: 'hidden_cache_alpha'
            }
          },
          {
            id: 'ignore',
            text: 'Проигнорировать',
            result: {
              text: 'Сигнал тихнет. Потом — обрывается. Ты продолжаешь путь.',
              flag: 'ignored_stranded'
            }
          }
        ]
      };
    }
  },
  
  'curator_message': {
    zones: ['blue', 'yellow'],
    weight: 15,
    condition: (state) => {
      const arc = require('../storylines/curator-arcs.js').getArcForFaction(state.player.faction);
      const nextQuest = arc ? require('../storylines/curator-arcs.js').getNextAvailableQuest(state, arc) : null;
      return !!nextQuest && !state.flags?.curator_message_seen;
    },
    generate: (state, rng) => {
      const arc = require('../storylines/curator-arcs.js').getArcForFaction(state.player.faction);
      const quest = require('../storylines/curator-arcs.js').getNextAvailableQuest(state, arc);
      return {
        type: 'story',
        text: `Личное сообщение от ${arc.curator}:\n\n«${quest.name} — дело срочное. Встретимся в моём кабинете.»\n\n[Квест доступен: ${quest.name}]`,
        autoStartQuest: quest.id,
        flag: 'curator_message_seen'
      };
    }
  },
  
  // === ЖЁЛТАЯ ЗОНА (опасная) ===
  
  'anomaly_whisper': {
    zones: ['yellow'],
    weight: 20,
    condition: (state) => state.flags?.touched_abyss,
    generate: (state, rng) => {
      return {
        type: 'combat_choice',
        text: 'Ты слышишь их снова. Но теперь — ближе. Яснее.\n\n«${state.player.name}... Ты коснулся. Теперь ты — часть. Присоединяйся. Или умри.»\n\nОтголоски окружают. Но они... ждут. Чего-то. Тебя?',
        choices: [
          {
            id: 'join',
            text: '«Я слушаю»',
            result: {
              text: 'Ты открыл разум. Они влились — не как паразиты, как... знания. Теперь ты понимаешь их язык. И они — твой.\n\n[+Навык: Психонический зов]',
              reward: { skill: 'psychic_call', reputation: -20, flag: 'echo_allied' }
            }
          },
          {
            id: 'fight',
            text: 'Атаковать',
            combat: {
              enemyType: 'echo_whisperers',
              count: 4,
              special: 'mind_damage' // атаки снижают focus
            }
          },
          {
            id: 'flee',
            text: 'Бежать',
            result: {
              text: 'Ты бежал. Они позволили. Почему?',
              flag: 'echo_mercy'
            }
          }
        ]
      };
    }
  },
  
  // === КРАСНАЯ ЗОНА (смертельная) ===
  
  'fragment_guardian': {
    zones: ['red'],
    weight: 100, // гарантировано, если условия
    condition: (state) => {
      const fragments = getFragmentStatus(state);
      return fragments.some(f => f.unlocked && !f.collected);
    },
    generate: (state, rng) => {
      const fragments = getFragmentStatus(state).filter(f => f.unlocked && !f.collected);
      const target = fragments[Math.floor(rng() * fragments.length)];
      
      return {
        type: 'boss',
        text: `Сканер взрывается сигналами. Это место — не просто опасно. Оно ОХРАНЯЕТСЯ.\n\n${target.guardian} блокирует путь к ${target.name}.\n\n${target.lore}`,
        fragmentId: target.id,
        combat: {
          enemyType: 'fragment_guardian',
          guardianName: target.guardian,
          tier: 7 + Math.floor(rng() * 3),
          special: 'phase_shift' // босс меняет фазу при 50% HP
        }
      };
    }
  },
  
  'truth_ruin': {
    zones: ['red'],
    weight: 10,
    condition: (state) => state.lore?.hypothesis === 'BETRAYAL',
    generate: (state, rng) => {
      return {
        type: 'discovery',
        text: 'Руины станции, которой НЕ ДОЛЖНО БЫТЬ в реестре. Пятая станция? «Нейтралитет». Уничтожена до обрыва Тракта.\n\nВ логах: «...предали договор. Периферия — не авария. Периферия — ПРИГОВОР.»\n\nКто вынес приговор? Кому?',
        reward: { evidence: 'neutral_station_logs', hypothesisConfirm: 'BETRAYAL' },
        unlockQuest: 'betrayal_1_the_fifth'
      };
    }
  }
};

function generateEvent(state, zone, rng) {
  // Фильтруем подходящие шаблоны
  const candidates = Object.values(EVENT_TEMPLATES).filter(t => {
    if (!t.zones.includes(zone)) return false;
    if (t.condition && !t.condition(state)) return false;
    return true;
  });
  
  if (candidates.length === 0) return null;
  
  // Взвешенный выбор
  const totalWeight = candidates.reduce((s, t) => s + t.weight, 0);
  let roll = rng() * totalWeight;
  
  for (const template of candidates) {
    roll -= template.weight;
    if (roll <= 0) return template.generate(state, rng);
  }
  
  return candidates[candidates.length - 1].generate(state, rng);
}

module.exports = { EVENT_TEMPLATES, generateEvent };
