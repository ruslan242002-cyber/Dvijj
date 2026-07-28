'use strict';

const { createQuestState, advanceQuest, completeQuest } = require('../quests/quest-engine.js');

/**
 * КУРАТОРСКИЕ АРКИ
 * 
 * У каждой станции — своя сюжетная линия из 5–7 квестов.
 * Прохождение открывает уникальные навыки фракции и фрагменты ключа.
 */

const CURATOR_ARCS = {
  'Приют': {
    id: 'arc_priyut',
    name: 'Клятва Ирис Вейл',
    curator: 'Ирис Вейл',
    description: 'Приют лечит раны. Но Ирис помнит, откуда пришли все эти раны.',
    
    quests: [
      {
        id: 'priyut_1_missing',
        name: 'Пропавший без вести',
        prerequisites: {},
        stages: {
          start: {
            text: `Ирис Вейл смотрит на тебя долго, прежде чем заговорить.\n\n«${state.player.name}. Ты новый. Или почти новый. Есть дело — не для всех. Пилот с «Горизонта-7» перестал отвечать три дня назад. Последний сигнал — жёлтая зона, сектор 4. Найди его. Или то, что от него осталось.»\n\n[if:found_body]Ты нашёл тело. В скафандре — записка: «Они не мёртвы. Они ждут.»[/if]\n[if_not:found_body]Ты ещё не искал.[/if_not]`,
            choices: [
              { id: 'search', text: 'Отправиться в сектор 4', nextStage: 'searching', flags: { searching: true } },
              { id: 'refuse', text: 'Это не моё дело', nextStage: 'refused' }
            ]
          },
          searching: {
            text: 'Ты в секторе 4. Жёлтая зона пульсирует странным светом. Сканер показывает слабый сигнал скафандра в 2 км.\n\nВпереди — развалины дрона. Рядом: следы. Не человеческие. Не отголосков. Что-то третье.',
            choices: [
              { id: 'investigate', text: 'Исследовать следы', nextStage: 'discovery', flags: { found_tracks: true } },
              { id: 'signal', text: 'Идти к сигналу скафандра', nextStage: 'body_found', flags: { found_body: true } },
              { id: 'retreat', text: 'Отступить', nextStage: 'retreated' }
            ]
          },
          body_found: {
            text: 'Тело в скафандре. Лицо не узнать — взрывная декомпрессия. Но в кармане записка, написанная дрожащей рукой:\n\n«Ирис. Не доверяй голосам из Тракта. Они — не эхо. Они — ЗОВ.»\n\nСканер фиксирует приближение. Большое. Быстрое.',
            choices: [
              { id: 'fight', text: 'Встать на защиту тела', nextStage: 'ambush_fight', flags: { defended_body: true } },
              { id: 'flee', text: 'Унести записку и бежать', nextStage: 'escape', flags: { has_note: true } }
            ]
          },
          discovery: {
            text: 'Следы ведут к разлому в пространстве. Не метеоритный. Не техногенный. Края... зубчатые. Как укус.\n\nВ разломе — свет. И голос. Твой голос. Зовёт по имени.\n\n«${playerName}... приближайся...»',
            choices: [
              { id: 'approach', text: 'Подойти ближе', nextStage: 'corruption', flags: { touched_abyss: true } },
              { id: 'record', text: 'Записать всё и уйти', nextStage: 'report', flags: { has_evidence: true } }
            ]
          },
          ambush_fight: {
            text: 'Ты стоишь над телом пилота. Три Отголоска выходят из тумана. Но они... не атакуют сразу. Они СМОТРЯТ. Оценивают.\n\nПотом — хаос.',
            isCombat: true,
            combatSetup: {
              enemyType: 'echo_pack',
              count: 3,
              special: 'evaluating' // враги ждут 1 ход перед атакой
            },
            choices: [
              { id: 'victory', text: 'Продолжить', nextStage: 'victory_return', condition: 'combat_win' },
              { id: 'defeat', text: 'Очнуться', nextStage: 'defeat_wake', condition: 'combat_loss' }
            ]
          },
          victory_return: {
            text: 'Ты принёс тело. Ирис молча приняла записку. Её руки дрожали.\n\n«Спасибо, ${playerName}. Это... не первый такой случай. И, боюсь, не последний.»\n\nОна протягивает тебе медальон — символ Приюта.\n\n«Теперь ты — мои глаза. Мои уши. Моя надежда.»',
            reward: { reputation: 25, item: 'medallion_priyut', unlockSkill: 'heal_field_advanced' },
            terminal: true
          },
          corruption: {
            text: 'Ты коснулся разлома. Не физически — чем-то глубже. Теперь ты СЛЫШИШЬ их. Отголосков. Не как врагов. Как... голоса в толпе.\n\nОни знают твоё имя.\n\n[-10 к макс. HP, +15% к восприятию аномалий]',
            reward: { maxHpPenalty: 10, anomalySense: 0.15, flag: 'touched_abyss' },
            terminal: true
          },
          report: {
            text: 'Ирис изучает записи. Лицо бледнеет.\n\n«Это... невозможно. Тракт не просто сломан. Он ГОЛОДЕН.»\n\nОна даёт тебе координаты. Секретные. Не для всех.\n\n«Найди остальных. Скажи им: «Клятва Ирис» не забыта.»',
            reward: { reputation: 20, fragmentHint: 'fragment_alpha' },
            terminal: true
          },
          refused: {
            text: 'Ирис кивает. Без осуждения. Без удивления.\n\n«Право выбора — единственное, что у нас осталось. Возвращайся, если передумаешь. Или если голоса станут слишком громкими.»',
            terminal: true
          }
        }
      },
      
      {
        id: 'priyut_2_whispers',
        name: 'Шёпоты в стенах',
        prerequisites: { completedQuests: ['priyut_1_missing'] },
        stages: {
          // ... продолжение арки
        }
      }
      
      // ... ещё 3–5 квестов в арке
    ]
  },
  
  'Терминус': {
    id: 'arc_terminus',
    name: 'Долг Дрого Кейна',
    curator: 'Дрого Кейн',
    description: 'Терминус помнит каждого павшего. Дрого — каждого, кого не спас.',
    // ... аналогичная структура
  },
  
  'Арсенал': {
    id: 'arc_arsenal',
    name: 'Оружие Рен Окса',
    curator: 'Рен Окса',
    description: 'Арсенал куёт мечи. Рен куёт правду — она острее.',
    // ...
  },
  
  'Вуаль': {
    id: 'arc_vual',
    name: 'Тишина Шёпота',
    curator: 'Шёпот',
    description: 'Вуаль слышит то, чего нет. Шёпот — то, что осталось.',
    // ...
  }
};

function getArcForFaction(faction) {
  return CURATOR_ARCS[faction];
}

function getNextAvailableQuest(state, arc) {
  const active = state.quests?.active || {};
  const completed = state.quests?.completed || [];
  
  for (const quest of arc.quests) {
    if (active[quest.id]) continue;
    if (completed.includes(quest.id)) continue;
    
    // Проверяем prerequisites
    if (!quest.prerequisites.completedQuests) return quest;
    if (quest.prerequisites.completedQuests.every(q => completed.includes(q))) return quest;
  }
  
  return null;
}

module.exports = { CURATOR_ARCS, getArcForFaction, getNextAvailableQuest };
