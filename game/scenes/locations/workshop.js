'use strict';

const { RECIPES, hasResourcesFor, describeRecipe, craft } = require('../../../crafting/crafting-engine.js');
const { hubMessage, stationButtons } = require('../common.js');
const { imageForLocation } = require('../../location-images.js');
const { SCENES } = require('../ids.js');

function handleWorkshop(state, input, rng, deps) {
  if (state.scene !== SCENES.WORKSHOP) return null;
      if (input === '⬅️ Назад') {
        return { reply: { text: hubMessage(state.player), buttons: stationButtons(deps, state.player), imageKey: imageForLocation('station', state.player.faction) }, nextState: { scene: 'station', player: state.player } };
      }
      const recipe = RECIPES.find((r) => r.name === input);
      if (!recipe) {
        const lines = RECIPES.map((r, i) => `${i + 1}. ${describeRecipe(r)}${hasResourcesFor(state.player, r) ? ' ✅' : ''}`);
        return { reply: { text: `🔧 МАСТЕРСКАЯ\n\n${lines.join('\n')}`, buttons: [...RECIPES.map((r) => r.name), '⬅️ Назад'] }, nextState: state };
      }
      const player = { ...state.player, inventory: (state.player.inventory || []).map((i) => ({ ...i })) };
      const result = craft(player, recipe.id);
      const text = result.success
        ? `Собрано: ${result.recipe.name}. +${result.recipe.statBonus.amount} к ${result.recipe.statBonus.stat} — навсегда.`
        : result.reason;
      const lines = RECIPES.map((r, i) => `${i + 1}. ${describeRecipe(r)}${hasResourcesFor(player, r) ? ' ✅' : ''}`);
      return {
        reply: { text: `${text}\n\n🔧 МАСТЕРСКАЯ\n\n${lines.join('\n')}`, buttons: [...RECIPES.map((r) => r.name), '⬅️ Назад'] },
        nextState: { scene: 'workshop', player }
      };
}

module.exports = { handleWorkshop };
