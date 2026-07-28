/**
 * Логика атмосферы станции: текущая смена (по часам) + резонансный шторм
 * (псевдослучайно по дню, как "погода"). Всё принимает необязательный
 * "now" (мс, как Date.now()) — по умолчанию берёт реальное время, но тесты
 * могут подставить любой момент для детерминированной проверки.
 *
 * В присланном варианте isRaining(seed) принимал параметр seed, но нигде
 * его не использовал — внутри функция всегда считала от Date.now()
 * напрямую, из-за чего параметр был бутафорским, а сама функция не
 * поддавалась детерминированному тестированию. Здесь named-параметр
 * "now" реально используется.
 */
'use strict';

const { DISTRICTS, STATION_SHIFTS } = require('./districts-data.js');

const DAY_MS = 24 * 60 * 60 * 1000;

function getCurrentTimePhase(now = Date.now()) {
  const hour = new Date(now).getHours();
  for (const [phase, data] of Object.entries(STATION_SHIFTS)) {
    if (data.start <= data.end) {
      if (hour >= data.start && hour < data.end) return { phase, ...data };
    } else {
      // переход через полночь (ночная смена: 21:00 -> 05:00)
      if (hour >= data.start || hour < data.end) return { phase, ...data };
    }
  }
  return { phase: 'NIGHT', ...STATION_SHIFTS.NIGHT };
}

/** ~30% дней — резонансный шторм. Псевдослучайно, но детерминированно по дню:
 * один и тот же день всегда даёт один и тот же результат. */
function isStormActive(now = Date.now()) {
  const day = Math.floor(now / DAY_MS);
  return ((day * 9301 + 49297) % 233280) / 233280 < 0.3;
}

function getDistrictAtmosphere(districtId, now = Date.now()) {
  const district = DISTRICTS[districtId];
  if (!district) return null;

  const time = getCurrentTimePhase(now);
  const modifierKey = isStormActive(now) ? 'storm' : time.modifier;
  const timeText = district.timeModifiers[modifierKey] || district.timeModifiers[time.modifier];

  return {
    base: district.atmosphere,
    time: timeText,
    danger: district.danger,
    shift: time.name,
    storm: modifierKey === 'storm',
    full: `${district.atmosphere}\n\n${timeText}`
  };
}

module.exports = {
  getCurrentTimePhase, isStormActive, getDistrictAtmosphere
};
