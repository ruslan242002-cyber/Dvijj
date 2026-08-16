'use strict';

/**
 * engine/travel-images/boss-image-manifest.js
 *
 * Манифест картинок боссов — тот же паттерн, что image-manifest.js для
 * травел-картинок (file:null было бы честной ошибкой, если файла нет,
 * но здесь файлы РЕАЛЬНО есть — присланы в Боссы.zip, распакованы,
 * сопоставлены с bossId вручную по тексту на самой карточке).
 *
 * ВАЖНО: путь ниже — туда, куда я распаковал архив в своей песочнице
 * (/home/claude/bosses_zip/). Перед деплоем эти 11 файлов нужно
 * положить в постоянное хранилище проекта (например assets/bosses/) и
 * поправить BOSS_IMAGE_ROOT — иначе путь будет невалиден в реальном
 * деплое на Vercel.
 */
const BOSS_IMAGE_ROOT = 'assets/bosses'; // ПОПРАВЬ путь при реальном деплое

const BOSS_IMAGE_MANIFEST = {
  guardian_unnamed_horizons: { file: `${BOSS_IMAGE_ROOT}/guardian_unnamed_horizons.png`, key: 'boss_guardian_unnamed_horizons' },
  ksarn_praxid: { file: `${BOSS_IMAGE_ROOT}/ksarn_praxid.png`, key: 'boss_ksarn_praxid' },
  forge_archon: { file: `${BOSS_IMAGE_ROOT}/forge_archon.png`, key: 'boss_forge_archon' },
  ksarn_memorist: { file: `${BOSS_IMAGE_ROOT}/ksarn_memorist.png`, key: 'boss_ksarn_memorist' },
  echo_destroyer: { file: `${BOSS_IMAGE_ROOT}/echo_destroyer.png`, key: 'boss_echo_destroyer' },
  oblivion_engineer: { file: `${BOSS_IMAGE_ROOT}/oblivion_engineer.png`, key: 'boss_oblivion_engineer' },
  shadow_auctioneer: { file: `${BOSS_IMAGE_ROOT}/shadow_auctioneer.png`, key: 'boss_shadow_auctioneer' },
  void_keeper: { file: `${BOSS_IMAGE_ROOT}/void_keeper.png`, key: 'boss_void_keeper' },
  abyss_firstborn: { file: `${BOSS_IMAGE_ROOT}/abyss_firstborn.png`, key: 'boss_abyss_firstborn' },
  ksarn_echo_keeper: { file: `${BOSS_IMAGE_ROOT}/ksarn_echo_keeper.png`, key: 'boss_ksarn_echo_keeper' },
  vexar_chronofallen: { file: `${BOSS_IMAGE_ROOT}/vexar_chronofallen.png`, key: 'boss_vexar_chronofallen' },
};

function bossImageFor(bossId) {
  return BOSS_IMAGE_MANIFEST[bossId] || null;
}

module.exports = { BOSS_IMAGE_MANIFEST, BOSS_IMAGE_ROOT, bossImageFor };
