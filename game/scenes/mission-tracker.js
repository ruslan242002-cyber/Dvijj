'use strict';

/**
 * ТРЕКЕР ЗАДАНИЙ — по прямому запросу пользователя: с ростом числа
 * систем квестов (основная линия Q1-14 × 5 персонажей, точки
 * расследования lib/quest-sites.js, путешествия lib/quest-journeys.js)
 * должен быть один экран, где видно, что делать дальше, а не только
 * узнавать это, заходя к каждому NPC по очереди.
 *
 * Ничего не меняет в игре — чисто информационный экран, читает
 * существующее состояние (getAvailableStage + флаги), не хранит
 * ничего своего.
 */
const { SCENES } = require('./ids.js');
const { getAvailableStage } = require('../../lib/npc-arcs.js');
const { QUEST_SITES } = require('../../lib/quest-sites.js');

const CHARACTER_LABELS = {
  kran: 'Кран',
  dispatcher: 'Диспетчер',
  ayrin_velmor: 'Айрин',
  mara_keyn: 'Мара',
  doktor_vorn: 'Ворн',
};

/** Проверяет, ждёт ли игрок точку расследования для этого персонажа —
 * т.е. отправлен (requiredFlag стоит), но ещё не нашёл (resolvedFlag
 * не стоит). Возвращает подсказку с названием зоны, куда лететь. */
function pendingQuestSiteFor(player, charId) {
  for (const site of Object.values(QUEST_SITES)) {
    if (site.npcName !== charId) continue;
    if (!!player.flags?.[site.requiredFlag] && !player.flags?.[site.resolvedFlag]) {
      return site.zone;
    }
  }
  return null;
}

function missionTrackerScreen(player, prefixText = '') {
  const lines = [];

  for (const [charId, label] of Object.entries(CHARACTER_LABELS)) {
    const stage = getAvailableStage(charId, player);
    const pendingZone = pendingQuestSiteFor(player, charId);

    if (pendingZone) {
      lines.push(`🔎 ${label}: ждёт находки — исследуй ${pendingZone === 'blue' ? 'безопасную (🟢)' : pendingZone} зону, затем вернись с докладом`);
    } else if (stage) {
      // Показываем и для ещё не встреченных персонажей тоже (первая
      // стадия = сама встреча) — так игрок сразу видит, к кому вообще
      // стоит подойти, не только тех, кого уже нашёл сам.
      lines.push(`💬 ${label}: «${stage.title}» — загляни поговорить`);
    } else {
      lines.push(`✅ ${label}: сейчас новых заданий нет`);
    }
  }

  const activeCount = lines.filter((l) => l.startsWith('🔎') || l.startsWith('💬')).length;
  const summary = activeCount > 0
    ? `📋 АКТИВНЫХ ЗАДАЧ: ${activeCount}\n\n`
    : '📋 Активных задач нет — загляни к кому-нибудь из пятерых на станции.\n\n';

  return {
    reply: {
      text: `${prefixText}${summary}${lines.join('\n')}`,
      buttons: ['⬅️ Назад'],
    },
    nextState: { scene: SCENES.MISSION_TRACKER, player },
  };
}

async function handleMissionTracker(state, input, rng, deps) {
  if (state.scene !== SCENES.MISSION_TRACKER) return null;
  return { reply: { text: '', buttons: [] }, nextState: { scene: 'station', player: state.player } };
}

module.exports = { missionTrackerScreen, handleMissionTracker };
