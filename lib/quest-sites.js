'use strict';

/**
 * ЭКРАН РАССЛЕДОВАНИЯ НА МЕСТЕ — многошаговая находка внутри
 * исследования (lib/quest-sites.js). Не мини-игра в привычном смысле
 * (нет очков/уровней) — просто интерактивная сцена с реальными
 * развилками выбора, оканчивающаяся конкретной находкой (discovery).
 */
const { SCENES } = require('./ids.js');
const { recordDiscovery } = require('../../lib/discoveries.js');
const { addToInventory } = require('./common.js');

function questSiteScreen(player, site, stepId, prefixText = '') {
  const step = site.steps[stepId];
  let buttons, optionsList = '';
  if (step.final) {
    buttons = ['➡️ Продолжить исследование'];
  } else if (step.triggerCombat) {
    buttons = ['⚔️ В бой'];
  } else {
    // ⚠️ Тот же VK 40-символьный лимит, что и в named-character.js
    // (lib/button-utils.js) — короткая подпись + полный текст в теле.
    const { buildChoiceDisplay } = require('../../lib/button-utils.js');
    const built = buildChoiceDisplay(step.choices);
    buttons = built.buttons;
    optionsList = built.optionsList;
  }

  return {
    reply: { text: `${prefixText}${step.text}${optionsList}`, buttons },
    nextState: { scene: SCENES.QUEST_SITE, player, siteId: site.siteId, stepId, zone: site.zone, depth: site.depth || 0 },
  };
}

async function handleQuestSite(state, input, rng, deps) {
  const { QUEST_SITES } = require('../../lib/quest-sites.js');
  const site = { siteId: state.siteId, ...QUEST_SITES[state.siteId] };
  const step = site.steps[state.stepId];

  if (step.triggerCombat && input === '⚔️ В бой') {
    return {
      reply: { text: 'Дрон бросается вперёд — сканеры красным заливают его корпус.', buttons: ['⚔️ Обычная атака'] },
      nextState: {
        scene: 'pre_combat',
        player: state.player,
        enemy: step.enemy,
        npcArcCombat: null,
        questSiteReturn: { siteId: state.siteId, onWinStep: step.onWin, onWinText: step.onWinText, zone: site.zone },
      },
    };
  }

  if (step.final && input === '➡️ Продолжить исследование') {
    const player = state.player;
    if (step.discovery) recordDiscovery(player, step.discovery);
    if (step.loot) addToInventory(player, step.loot.resource, step.loot.tier, step.loot.qty);
    player.flags = player.flags || {};
    player.flags[site.resolvedFlag] = true;
    return {
      reply: { text: '🔎 Находка занесена в журнал. Можно возвращаться с ответом.', buttons: ['⬅️ Назад'] },
      nextState: { scene: 'station', player },
    };
  }

  const { shortButtonLabel } = require('../../lib/button-utils.js');
  const choice = step.choices?.find((c) => c.text === input || shortButtonLabel(c.text) === input);
  if (choice) {
    return questSiteScreen(state.player, site, choice.next);
  }

  return questSiteScreen(state.player, site, state.stepId, 'Выбери один из вариантов.\n\n');
}

module.exports = { questSiteScreen, handleQuestSite };
