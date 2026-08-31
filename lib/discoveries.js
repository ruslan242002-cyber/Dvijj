'use strict';

/**
 * DISCOVERIES — то, что игрок УЗНАЁТ и что сохраняется надолго (по
 * модели FOUND → KNOWLEDGE → FUTURE EFFECT из periferia_live_space_TZ.txt
 * раздел 3.3/22). НЕ отдельное хранилище состояния — каталог поверх уже
 * существующих player.flags (тот же принцип "не переделывать storage
 * без необходимости"). Каталог даёт человекочитаемое имя/описание
 * записи, которую иначе игрок никак не мог бы посмотреть — флаг сам по
 * себе невидим для игрока, discovery — видим.
 */
const DISCOVERY_CATALOG = {
  hidden_frequency: {
    name: 'Скрытая частота',
    description: 'Частота древнего сигнала, расшифрованная в Красной зоне. По ней можно поймать редкий безопасный проход через опасный сектор.',
    sourceFlag: 'ancient_signal_decoded',
  },
  ship_trail_coordinates: {
    name: 'Координаты чужого следа',
    description: 'Записанные координаты неизвестного корабля — источник ведёт к скрытой сети беглецов.',
    sourceFlag: 'ship_trail_recorded',
  },
  drone_relay_location: {
    name: 'Скрытая ретрансляционная вышка',
    description: 'Маршрут повреждённого дрона привёл к нестанционной вышке — кто-то тайно картографирует сектор.',
    sourceFlag: 'drone_route_tracked',
  },
  pirate_intel: {
    name: 'Разведданные о пиратах',
    description: 'Переданные фракции сведения о пиратском экипаже — известно, где искать их базу.',
    sourceFlag: 'pirate_report_filed',
  },
  old_shipping_lane: {
    name: 'Старый торговый маршрут',
    description: 'Заброшенный маяк указывает на маршрут, которым раньше ходили конвои — до того, как его забросили.',
    sourceFlag: 'old_shipping_lane_found',
  },
};

/** Записывает discovery игроку — ставит и сам флаг (для условий/гейтов,
 * та же логика что и раньше), и добавляет запись в player.discoveries
 * (для того, чтобы игрок мог реально посмотреть, что узнал). Безопасно
 * вызывать повторно — не дублирует запись. */
function recordDiscovery(player, discoveryId) {
  const entry = DISCOVERY_CATALOG[discoveryId];
  if (!entry) return;

  player.flags = player.flags || {};
  player.flags[entry.sourceFlag] = true;

  player.discoveries = player.discoveries || {};
  if (!player.discoveries[discoveryId]) {
    player.discoveries[discoveryId] = { discoveredAt: Date.now() };
  }
}

function hasDiscovery(player, discoveryId) {
  return !!(player.discoveries && player.discoveries[discoveryId]);
}

/** Список для показа игроку — с именем/описанием из каталога, не
 * голыми id. */
function listDiscoveries(player) {
  const owned = player.discoveries || {};
  return Object.keys(owned)
    .map((id) => DISCOVERY_CATALOG[id])
    .filter(Boolean);
}

module.exports = { DISCOVERY_CATALOG, recordDiscovery, hasDiscovery, listDiscoveries };
