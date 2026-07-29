'use strict';

const { checkUnlock } = require('../lore/trakt-mythos.js');

const SECTOR_TYPES = {
  DERELICT: 'derelict',
  ANOMALY: 'anomaly',
  STATION_DEBRIS: 'debris',
  LIVING: 'living',
  FORBIDDEN: 'forbidden'
};

const SECTOR_LORE = {
  'sector_7': {
    name: 'Кладбище «Горизонтов»',
    type: SECTOR_TYPES.DERELICT,
    danger: 'yellow',
    history: 'Здесь разбились три колонных корабля при попытке прорваться через обрыв. Тела не нашли. Скафандры — пустые.',
    secrets: [
      { id: 'horizon_logs', condition: { flag: 'has_analyzer' }, text: 'Логи последних минут: «Они внутри. Они ВСЕГДА были внутри».' }
    ],
    connections: ['sector_12', 'sector_8']
  },
  'sector_12': {
    name: 'Разлом Кейна',
    type: SECTOR_TYPES.ANOMALY,
    danger: 'red',
    history: 'Дрого Кейн лично вёл здесь бой сорок лет назад. Потерял весь взвод. Сам выжил — но перестал говорить на три месяца.',
    secrets: [
      { id: 'kaine_confession', condition: { quest: 'terminus_5' }, text: 'Голографическая запись молодого Дрого: «Я приказал отступить. Они не послушались. Это не их вина. Это МОЯ».' }
    ],
    connections: ['sector_7', 'sector_15']
  },
  'sector_23': {
    name: 'Точка Невозврата',
    type: SECTOR_TYPES.FORBIDDEN,
    danger: 'red',
    unlockCondition: { type: 'fragments', count: 4 },
    history: 'Сканеры показывают: Тракт здесь не оборван. Он свёрнут. Как ткань. Кто-то или что-то сжало его.',
    secrets: [
      { id: 'trakt_heart', condition: { fragments: 6 }, text: 'Ты видишь сердце. Не метафорически. Орган. Пульсирующее. Размером со станцию. И оно знает тебя.' }
    ],
    connections: ['sector_15']
  },

  // ── Добавлены при заполнении sector_8/sector_15 (были только ссылками
  //    без описания в connections двух других секторов) ──
  'sector_8': {
    name: 'Причал-Призрак «Девятый»',
    type: SECTOR_TYPES.STATION_DEBRIS,
    danger: 'yellow',
    history: 'Грузовой причал, обслуживавший рейсы к «Горизонтам». Не эвакуирован — просто замолчал в одну смену. Стыковочные захваты до сих пор раскрыты, будто кого-то ждут.',
    secrets: [
      { id: 'ninth_dock_manifest', condition: { quest: 'priyut_1_missing' }, text: 'Грузовой манифест «Девятого»: последний рейс числится за тем самым пилотом, которого вы искали для Приюта.' }
    ],
    connections: ['sector_7']
  },
  'sector_15': {
    name: 'Слепая Прогалина',
    type: SECTOR_TYPES.ANOMALY,
    danger: 'red',
    history: 'Дальше по разлому, где Кейн потерял взвод, пространство ведёт себя иначе — время в этом кармане течёт рывками, будто что-то заикается, пытаясь досказать одно и то же.',
    secrets: [
      { id: 'silence_reading', condition: { flag: 'echo_allied' }, text: 'Отголоски здесь узнают тебя. Не как чужого. Как ЕЩЁ ОДНОГО, кто уже слушал.' }
    ],
    connections: ['sector_12', 'sector_23']
  }
};

const SECRET_PREVIEW_LENGTH = 100;

function getSectorInfo(sectorId, player) {
  const sector = SECTOR_LORE[sectorId];
  if (!sector) return null;
  const unlocked = !sector.unlockCondition || checkUnlock(player, sector.unlockCondition);
  return {
    ...sector,
    unlocked,
    availableSecrets: sector.secrets.filter((s) => !s.condition || checkCondition(player, s.condition))
  };
}

function checkCondition(player, condition) {
  if (condition.flag) return !!(player.flags && player.flags[condition.flag]);
  if (condition.quest) return (player.completedQuests || []).includes(condition.quest);
  if (condition.fragments) return checkUnlock(player, { type: 'fragments', count: condition.fragments });
  return false;
}

function getConnectedSectors(sectorId) {
  const sector = SECTOR_LORE[sectorId];
  return sector ? sector.connections : [];
}

function generateSectorDescription(sectorId, player) {
  const info = getSectorInfo(sectorId, player);
  if (!info) return 'Неизвестный сектор.';
  const dangerIcons = info.danger === 'red' ? 3 : info.danger === 'yellow' ? 2 : 1;
  let text = `📍 ${info.name}\n${'⚠️'.repeat(dangerIcons)} Зона: ${info.danger}\n\n${info.history}`;
  if (!info.unlocked) {
    text += '\n\n🔒 [Заблокировано. Требуется прогресс в главном квесте.]';
    return text;
  }
  if (info.availableSecrets.length > 0) {
    text += '\n\n🔍 Обнаружены аномалии:';
    for (const secret of info.availableSecrets) {
      const truncated = secret.text.length > SECRET_PREVIEW_LENGTH;
      const preview = secret.text.substring(0, SECRET_PREVIEW_LENGTH);
      text += `\n• ${preview}${truncated ? '...' : ''}`;
    }
  }
  if (info.connections.length > 0) {
    const connected = info.connections.map((c) => SECTOR_LORE[c]?.name || c).join(', ');
    text += `\n\n↔️ Связанные секторы: ${connected}`;
  }
  return text;
}

module.exports = {
  SECTOR_TYPES, SECTOR_LORE,
  getSectorInfo, checkCondition, getConnectedSectors, generateSectorDescription
};
