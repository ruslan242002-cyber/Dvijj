'use strict';
const LOCATION_IMAGES = {
  'Приют': { bridge: 'priyut-shtab.jpeg', repair: null, decon: 'decon-generic.jpeg', cantina: 'priyut-bar.jpeg', gates: 'priyut-gates.jpeg', station: 'priyut-overview.jpeg', market: 'priyut-market.jpeg' },
  'Терминус': { bridge: 'terminus-most.jpeg', repair: null, decon: 'decon-generic.jpeg', cantina: null, gates: 'terminus-gates.jpeg', station: 'terminus-hub.jpeg', market: null },
  'Арсенал': { bridge: 'arsenal-shtab.jpeg', repair: 'arsenal-repair.jpeg', decon: 'decon-generic.jpeg', cantina: 'arsenal-bar.jpeg', gates: 'arsenal-gates.jpeg', station: 'arsenal-hub.jpeg', market: null },
  'Вуаль': { bridge: 'vual-shtab.jpeg', repair: 'vual-scavenger.jpeg', decon: 'decon-generic.jpeg', cantina: 'vual-bar.jpeg', gates: 'vual-gates.jpeg', station: 'vual-hub.jpeg', market: null, housing: 'vual-housing.jpeg' },
};
function imageForLocation(key, faction) {
  const stationImages = LOCATION_IMAGES[faction];
  const file = stationImages ? stationImages[key] : null;
  return file ? `locations/${file}` : null;
}
module.exports = { LOCATION_IMAGES, imageForLocation };
