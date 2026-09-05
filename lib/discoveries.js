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
  k17_signal_trace: {
    name: 'След сигнала K-17',
    description: 'Частота старого аварийного сигнала, о котором предупреждал Кран. Прослежена, но не объяснена.',
    sourceFlag: 'k17_resolved',
  },
  archive_inconsistency: {
    name: 'Несоответствие в архиве',
    description: 'Запись с невозможной датой ведёт не к человеку, подделавшему её, а к самой архивной системе. Айрин теперь тоже это заметила.',
    sourceFlag: 'ayrin_01_complete',
  },
  mara_people_memory: {
    name: 'Память людей',
    description: 'Неофициальные списки старожилов Приюта помнят больше, чем любой официальный реестр — Мара ищет там кого-то из старого экипажа.',
    sourceFlag: 'mara_01_complete',
  },
  official_registry_altered: {
    name: 'Переписанный реестр',
    description: 'Официальные записи о старом экипаже не совпадают с тем, что помнят люди — и, судя по всему, реестр меняли не единожды.',
    sourceFlag: 'mara_02_complete',
  },
  dispatcher_route_memory: {
    name: 'Память о маршруте',
    description: 'Груз был запечатан не в том порту, что указан в накладной — диспетчер запомнила это несоответствие.',
    sourceFlag: 'dispatcher_route_memory_found',
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
