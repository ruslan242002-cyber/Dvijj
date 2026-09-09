'use strict';

/**
 * ЕДИНЫЙ РЕЕСТР всех реальных функций именных персонажей — все 18
 * регистраций в одном месте, вызываются ОДНОЙ функцией
 * registerAllCharacterFunctions() из game/router.js, ПОСЛЕ того как
 * router.js уже завершил СВОИ собственные top-level require (то есть
 * все нужные модули к этому моменту гарантированно полностью
 * загружены).
 *
 * ⚠️ БАГ-ФИКС: раньше каждая регистрация была разбросана по top-level
 * коду hub.js/volny-port.js — `require('./named-character.js')
 * .registerFunctionHandler(...)` выполнялось СРАЗУ при загрузке ЭТИХ
 * файлов. Проблема: если router.js требует hub.js РАНЬШЕ, чем сам
 * named-character.js (что и происходит — hub.js на строке 21,
 * named-character.js на строке 33) — hub.js триггерит ПЕРВУЮ загрузку
 * named-character.js прямо во время своей собственной. Если у
 * named-character.js (через свою цепочку require) существует хоть
 * один путь, пусть даже косвенный, обратно к какому-то ещё
 * не полностью загруженному модулю — Node вернёт НЕПОЛНЫЙ exports
 * (то, что успело присвоиться к module.exports к этому моменту), и
 * registerFunctionHandler окажется undefined. Именно так упало в
 * проде: "require(...).registerFunctionHandler is not a function".
 * Вынос ВСЕХ регистраций в отдельную функцию, вызываемую ПОСЛЕ
 * загрузки всего router.js — полностью убирает эту хрупкость,
 * независимо от точного порядка require где бы то ни было.
 */
function registerAllCharacterFunctions() {
  const { registerFunctionHandler } = require('./named-character.js');

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
