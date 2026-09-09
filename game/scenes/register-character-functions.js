'use strict';

/**
 * ЕДИНЫЙ РЕЕСТР всех реальных функций именных персонажей — все 18
 * регистраций в одном месте.
 *
 * ⚠️ ВАЖНО: этот файл НЕ требует ('./named-character.js') САМ —
 * получает registerFunctionHandler ПАРАМЕТРОМ снаружи. Вызывается
 * ЛЕНИВО, изнутри самого named-character.js, при первом реальном
 * обращении игрока (см. ensureFunctionsRegistered() там) — не при
 * загрузке модулей вообще. Это полностью убирает любую возможную
 * зависимость от порядка require где бы то ни было в проекте: к
 * моменту, когда обрабатывается реальный ввод игрока, весь граф
 * require уже гарантированно полностью разрешён.
 */
function registerAllCharacterFunctions(registerFunctionHandler) {
  const mara = require('./character-functions/mara_keyn.js');
  registerFunctionHandler('mara_keyn', 'repair', mara.maraRepair);
  registerFunctionHandler('mara_keyn', 'rumors', mara.maraRumors);
  registerFunctionHandler('mara_keyn', 'shelter', mara.maraShelter);
  registerFunctionHandler('mara_keyn', 'find_people', mara.maraFindPeople);
  registerFunctionHandler('mara_keyn', 'crew', mara.maraCrew);
  registerFunctionHandler('mara_keyn', 'special_quests', mara.maraSpecialQuest);

  const ayrin = require('./character-functions/ayrin_velmor.js');
  registerFunctionHandler('ayrin_velmor', 'reputation_check', ayrin.ayrinReputationCheck);
  registerFunctionHandler('ayrin_velmor', 'archives', ayrin.ayrinArchivesAccess);
  registerFunctionHandler('ayrin_velmor', 'legalization', ayrin.ayrinLegalization);
  registerFunctionHandler('ayrin_velmor', 'special_missions', ayrin.ayrinSpecialMission);

  const vorn = require('./character-functions/doktor_vorn.js');
  registerFunctionHandler('doktor_vorn', 'trade', vorn.vornTrade);
  registerFunctionHandler('doktor_vorn', 'modifications', vorn.vornModification);
  registerFunctionHandler('doktor_vorn', 'research', vorn.vornResearch);
  registerFunctionHandler('doktor_vorn', 'quests', vorn.vornQuest);
  registerFunctionHandler('doktor_vorn', 'risk_reward', vorn.vornRiskReward);

  const kayr = require('./character-functions/kayr.js');
  registerFunctionHandler('kayr', 'restore_coordinates', kayr.restoreCoordinates);
  registerFunctionHandler('kayr', 'old_routes_quests', kayr.oldRoutesLead);
  registerFunctionHandler('kayr', 'old_dock_reputation', kayr.oldDockReputationStatus);
}

module.exports = { registerAllCharacterFunctions };
