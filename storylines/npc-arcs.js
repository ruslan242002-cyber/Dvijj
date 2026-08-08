'use strict';

const { isQuestAvailable } = require('../quests/quest-engine.js');

/**
 * МИНИ-АРКИ ИМЕНЫХ NPC (не кураторов) — дополнение к storylines/curator-arcs.js,
 * не замена. У кураторов уже есть полноценные арки. У остальных NPC —
 * только счётчик встреч (firstMeeting/repeatMeeting/trusted, см.
 * city/npc-roster.js), без сюжета. Выбраны два самых ярких по флейвору:
 * Осведомитель Кес (знает больше, чем говорит) и Слушатель Орен (молчит —
 * редкий случай, когда "он наконец заговорил" само по себе кульминация).
 * Оба реально находятся на Терминусе (см. city/districts-data.js —
 * рядом с Шёпотом и Рю), не на Вуали, как ошибочно указывало устаревшее
 * поле station в npc-roster.js.
 *
 * Формат — 1:1 с curator-arcs.js (quests[] с id/prerequisites/stages,
 * choices с полем next, работает через тот же quest-engine.js).
 * prerequisites.npcTrust читает player.npcMeetings[npcId] — то же поле,
 * что уже двигает firstMeeting→repeatMeeting→trusted реплики.
 */
const NPC_ARCS = {
  'osvedomitel_kes': {
    id: 'arc_kes',
    name: 'Цена слухов',
    npc: 'Осведомитель Кес',
    description: 'Кес знает больше, чем говорит. Вопрос — кому она это продаёт.',
    quests: [{
      id: 'kes_1_source',
      name: 'Источник',
      prerequisites: { npcTrust: { npc: 'osvedomitel_kes', count: 5 } },
      stages: {
        start: {
          text: 'Кес понижает голос, хотя рядом никого нет.\n\n«Раз уж ты тут не в первый раз... скажу как есть. Не все слухи, что я собираю, идут Шёпоту. Часть уходит на другую станцию. За кредиты. Осуждаешь?»',
          choices: [
            { label: 'Кому именно ты продаёшь?', next: 'reveal', flags: { asked_kes: true } },
            { label: 'Не моё дело', next: 'declined' },
          ],
        },
        reveal: {
          text: 'Она смотрит долго, прежде чем ответить.\n\n«Арсеналу. Окса платит за то, что Шёпот предпочёл бы держать при себе. Я не предатель — я просто не кладу все яйца в одну корзину. На этой станции так выживают».',
          choices: [
            { label: 'Помочь ей замести следы', next: 'help_cover', flags: { helped_kes_cover: true } },
            { label: 'Сказать, что доложишь Шёпоту', next: 'threaten', flags: { threatened_kes: true } },
            { label: 'А что говорят про сам Тракт?', next: 'hypothesis_hint' },
          ],
        },
        hypothesis_hint: {
          text: '«Слухи? У меня их вагон. Самый упрямый — что Тракт не сломался сам. Кто-то не поделил станции ещё до Разрыва, и то, что ты называешь катастрофой — чья-то месть, которая удалась слишком хорошо». Она пожимает плечами. «Верить или нет — сам решай».',
          choices: [
            { label: 'Вернуться к разговору', next: 'reveal' },
          ],
        },
        help_cover: {
          text: 'Ты помогаешь ей подчистить пару неудобных записей в логах станции. Кес выдыхает.\n\n«Не забуду. У меня всегда найдётся кое-что интересное для тебя первого — раньше, чем для остальных».',
          terminal: true,
          reward: { xp: 60, credits: 80, flag: 'kes_ally' },
        },
        threaten: {
          text: 'Кес не паникует — только смотрит холоднее.\n\n«Доложишь — я перестану быть тебе полезной. Подумай, что теряешь». Она права. Отношения портятся, но не рвутся совсем.',
          terminal: true,
          reward: { xp: 20, flag: 'kes_tense' },
        },
        declined: {
          text: '«Как скажешь», — Кес пожимает плечами и возвращается к своим делам. Момент упущен, но дверь не закрыта — может, в другой раз.',
          terminal: true,
          reward: { xp: 10 },
        },
      },
    }],
  },
  'slushatel': {
    id: 'arc_oren',
    name: 'Первое слово',
    npc: 'Слушатель Орен',
    description: 'Орен молчит с тех пор, как начал слушать Тракт. Может, однажды скажет, что услышал.',
    quests: [{
      id: 'oren_1_word',
      name: 'То, что он услышал',
      // Высокий порог доверия — это редкая, заслуженная сцена, не рядовой квест.
      prerequisites: { npcTrust: { npc: 'slushatel', count: 10 }, fragments: 3 },
      stages: {
        start: {
          text: 'Ты садишься рядом, как обычно, не ожидая ответа. Но в этот раз Орен поворачивает голову.\n\n«Ты слышишь его иначе, чем остальные. Тише. Но настойчивее». Это первые слова, которые ты от него слышишь.',
          choices: [
            { label: 'Что ты слышишь, когда молчишь?', next: 'listen', flags: { asked_oren: true } },
            { label: 'Промолчать вместе с ним', next: 'silence_together' },
          ],
        },
        listen: {
          text: '«Не голос. Не угрозу. Вопрос, который задают снова и снова, потому что никто не ответил правильно ни разу за все эти годы». Он снова отворачивается к иллюминатору.\n\n«Ты уже слышал часть ответа. В том, что собрал. Собери остальное — и, может, ты услышишь вопрос целиком, а не эхо от него».',
          terminal: true,
          reward: { xp: 80, flag: 'oren_spoke', factionReputation: { faction: 'Терминус', amount: 15 } },
        },
        silence_together: {
          text: 'Ты садишься рядом и молчишь тоже. Странно — впервые тишина между вами не пустая, а общая. Орен не говорит больше ничего, но чуть заметно кивает, прежде чем снова застыть.',
          terminal: true,
          reward: { xp: 40, flag: 'oren_silence_shared' },
        },
      },
    }],
  },
};

/** Тот же паттерн, что getNextAvailableQuest в curator-arcs.js —
 * первый ещё не пройденный квест этого NPC, доступный по prerequisites. */
function getNextAvailableNpcQuest(player, npcId) {
  const arc = NPC_ARCS[npcId];
  if (!arc) return null;
  const completed = player.completedQuests || [];
  for (const quest of arc.quests) {
    if (completed.includes(quest.id)) continue;
    if (isQuestAvailable(player, quest)) return quest;
  }
  return null;
}

module.exports = { NPC_ARCS, getNextAvailableNpcQuest };
