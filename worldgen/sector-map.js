'use strict';

/**
 * ПРОЦЕДУРНАЯ КАРТА СЕКТОРОВ
 * 
 * Мир — не случайный набор встреч, а СВЯЗАННАЯ СТРУКТУРА.
 * Секторы имеют: историю, опасность, секреты, связи с другими.
 */

const { getFragmentStatus } = require('../lore/trakt-mythos.js');

const SECTOR_TYPES = {
  DERELICT: 'derelict',      // заброшенные объекты
  ANOMALY: 'anomaly',        // аномальные зоны
  STATION_DEBRIS: 'debris',  // обломки станций
  LIVING: 'living',          // «живые» участки Тракта
  FORBIDDEN: 'forbidden'     // закрытые до выполнения условий
};

const SECTOR_LORE = {
  'sector_7': {
    name: 'Кладбище «Горизонтов»',
    type: 'derelict',
    danger: 'yellow',
    history: 'Здесь разбились три колонных корабля при попытке прорваться через обрыв. Тела не нашли. Скафандры — пустые.',
    secrets: [
      { id: 'horizon_logs', condition: { flag: 'has_analyzer' }, text: 'Логи последних минут: «Они внутри. Они ВСЕГДА были внутри.»' }
    ],
    connections: ['sector_12', 'sector_8']
  },
  
  'sector_12': {
    name: 'Разлом Кейна',
    type: 'anomaly',
    danger: 'red',
    history: 'Дрого Кейн лично вёл здесь бой 40 лет назад. Потерял весь взвод. Сам выжил — но перестал говорить на 3 месяца.',
    secrets: [
      { id: 'kaine_confession', condition: { quest: 'terminus_3_guilt' }, text: 'Голографическая запись молодого Дрого: «Я приказал отступить. Они не послушались. Это не их вина. Это МОЯ.»' }
    ],
    connections: ['sector_7', 'sector_15']
  },
  
  'sector_23': {
    name: 'Точка Невозврата',
    type: 'forbidden',
    danger: 'red',
    unlockCondition: { fragments: 4 },
    history: 'Сканеры показывают: Тракт здесь НЕ оборван. Он СВЁРНУТ. Как ткань. Кто-то или что-то СЖАЛО его.',
    secrets: [
      { id: 'trakt_heart', condition: { fragments: 6 }, text: 'Ты видишь СЕРДЦЕ. Не метафорически. Орган. Пульсирующее. Размером со станцию. И оно ЗНАЕТ тебя.' }
    ],
    connections: []
  }
};

function getSectorInfo(sectorId, state) {
  const sector = SECTOR_LORE[sectorId];
  if (!sector) return null;
  
  const unlocked = !sector.unlockCondition || checkUnlock(state, sector.unlockCondition);
  
  return {
    ...sector,
    unlocked,
    availableSecrets: sector.secrets.filter(s => !s.condition || checkCondition(state, s.condition))
  };
}

// ДОБАВЛЕНО: раньше вызывалась, но не была объявлена — падало с ReferenceError
// на любом секторе с unlockCondition. Условие { fragments: N } проверяет
// число СОБРАННЫХ (не просто разблокированных) фрагментов Тракта.
function checkUnlock(state, condition) {
  if (condition.fragments !== undefined) {
    const fragments = getFragmentStatus(state);
    const collected = fragments.filter(f => f.collected).length;
    return collected >= condition.fragments;
  }
  return checkCondition(state, condition);
}

function checkCondition(state, condition) {
  if (condition.flag) return !!(state.flags && state.flags[condition.flag]);
  if (condition.quest) return !!(state.quests?.completed?.includes(condition.quest));
  return false;
}

function getConnectedSectors(sectorId) {
  const sector = SECTOR_LORE[sectorId];
  return sector ? sector.connections : [];
}

function generateSectorDescription(sectorId, state) {
  const info = getSectorInfo(sectorId, state);
  if (!info) return 'Неизвестный сектор.';
  
  let text = `📍 ${info.name}\n${'⚠️'.repeat(info.danger === 'red' ? 3 : info.danger === 'yellow' ? 2 : 1)} Зона: ${info.danger}\n\n${info.history}`;
  
  if (!info.unlocked) {
    text += '\n\n🔒 [Заблокировано. Требуется прогресс в главном квесте.]';
    return text;
  }
  
  if (info.availableSecrets.length > 0) {
    text += '\n\n🔍 Обнаружены аномалии:';
    for (const secret of info.availableSecrets) {
      text += `\n• ${secret.text.substring(0, 100)}...`;
    }
  }
  
  if (info.connections.length > 0) {
    const connected = info.connections.map(c => SECTOR_LORE[c]?.name || c).join(', ');
    text += `\n\n↔️ Связанные секторы: ${connected}`;
  }
  
  return text;
}

module.exports = {
  SECTOR_LORE,
  getSectorInfo,
  getConnectedSectors,
  generateSectorDescription
};
