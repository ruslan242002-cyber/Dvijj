'use strict';
const LOCATION_IMAGES = {
  'Приют': { bridge: 'priyut-shtab.jpg', repair: null, decon: 'decon-generic.jpg', cantina: 'priyut-bar.jpg', gates: 'priyut-gates.jpg', station: 'priyut-overview.jpg', market: 'priyut-market.jpg' },
  'Терминус': { bridge: 'terminus-most.jpg', repair: null, decon: 'decon-generic.jpg', cantina: null, gates: 'terminus-gates.jpg', station: 'terminus-hub.jpg', market: null },
  'Арсенал': { bridge: 'arsenal-shtab.jpg', repair: 'arsenal-repair.jpg', decon: 'decon-generic.jpg', cantina: 'arsenal-bar.jpg', gates: 'arsenal-gates.jpg', station: 'arsenal-hub.jpg', market: null },
  'Вуаль': { bridge: 'vual-shtab.jpg', repair: 'vual-scavenger.jpg', decon: 'decon-generic.jpg', cantina: 'vual-bar.jpg', gates: 'vual-gates.jpg', station: 'vual-hub.jpg', market: null, housing: 'vual-housing.jpg' },
};
function imageForLocation(key, faction) {
  const stationImages = LOCATION_IMAGES[faction];
  const file = stationImages ? stationImages[key] : null;
  return file ? `locations/${file}` : null;
}
module.exports = { LOCATION_IMAGES, imageForLocation };
