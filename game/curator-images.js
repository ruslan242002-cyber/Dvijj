'use strict';

/**
 * Портреты кураторов станций — показываются при ЛЮБОМ взаимодействии с
 * куратором: Кантина (доска заданий), диалоговые квесты арок
 * (storylines/curator-arcs.js), разговор с Шёпотом про гипотезы Тракта,
 * и приветствие после тренировочного боя.
 *
 * Ключ — faction (не npc id), потому что все точки взаимодействия уже
 * оперируют player.faction напрямую. Исключение — Шёпот: разговор о
 * гипотезах Тракта доступен с любой станции (это отдельная механика
 * лора, не завязанная на куратора ИГРОКА), поэтому там картинка Шёпота
 * берётся напрямую по имени, а не через player.faction.
 */

const CURATOR_IMAGES = {
  'Приют': 'curator-iris-veyl.jpg',
  'Терминус': 'curator-shyopot.jpg',
  'Арсенал': 'curator-ren-oksa.jpg',
  'Вуаль': 'curator-drogo-keyn.jpg',
};

function imageForCurator(faction) {
  const file = CURATOR_IMAGES[faction];
  return file ? `curators/${file}` : null;
}

module.exports = { CURATOR_IMAGES, imageForCurator };
