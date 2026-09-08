'use strict';

/**
 * ДОКТОР ВОРН — реальные функции. Держим обе в одном файле. Тема Ворна
 * — риск/непредсказуемость (его же карточка: "все предложения имеют
 * непредсказуемые последствия") — обе функции используют настоящую
 * переменность через rng, не фиксированный результат.
 */
const { addToInventory } = require('../common.js');

const TRADE_COST = { resource: 'Изотопы', tier: 1, qty: 5 };

/** «Обмен» — меняет ресурсы на результаты экспериментов. */
async function vornTrade(player, backScene, rng, deps) {
  const { characterScreen } = require('../named-character.js');

  const inv = player.inventory || [];
  const owned = inv.find((i) => i.resource === TRADE_COST.resource && i.tier === TRADE_COST.tier);
  if (!owned || owned.qty < TRADE_COST.qty) {
    return characterScreen(
      'doktor_vorn',
      player,
      backScene,
      `Ворн смотрит на пустые руки: «Принеси мне ${TRADE_COST.qty}× ${TRADE_COST.resource} T${TRADE_COST.tier} — тогда поговорим об обмене».\n\n`
    );
  }

  owned.qty -= TRADE_COST.qty;

  const roll = rng();
  let resultText;
  if (roll < 0.15) {
    resultText = 'Ворн долго возится с образцами, потом разводит руками: «Ничего интересного на этот раз. Бывает». Ресурсы потрачены впустую.';
  } else if (roll < 0.55) {
    addToInventory(player, 'Полимеры', 1, 12);
    resultText = 'Побочный продукт эксперимента оказался неожиданно полезным. Ворн отдаёт его без особого сожаления.';
  } else if (roll < 0.9) {
    player.credits = (player.credits || 0) + 150;
    resultText = '«Это, — Ворн явно доволен, — можно продать намного дороже, чем ты думаешь». Выдаёт 💳150.';
  } else {
    addToInventory(player, 'Изотопы', 2, 3);
    resultText = 'Ворн замирает, разглядывая результат. «Вот это — редкость. Забирай, пока я не передумал».';
  }

  return characterScreen('doktor_vorn', player, backScene, `${resultText}\n\n`);
}

const MOD_COST = 300;
const MOD_STATS = ['power', 'mind', 'reaction', 'endurance'];
const STAT_NAMES = { power: 'силу', mind: 'разум', reaction: 'реакцию', endurance: 'выносливость' };

/** «Модификации» — постоянное, но нестабильное изменение случайного
 * стата ("нестабильные усиления" из карточки Ворна). Не таймерный
 * баф/дебаф (не лезем во engine/status/statusEngine.js, у него другая
 * задача — 5 конкретных боевых статусов, не абстрактные модификации) —
 * просто честный, необратимый риск: может как усилить, так и ослабить. */
async function vornModification(player, backScene, rng, deps) {
  const { characterScreen } = require('../named-character.js');

  if ((player.credits || 0) < MOD_COST) {
    return characterScreen('doktor_vorn', player, backScene, `Ворн разводит руками: «Модификация — 💳${MOD_COST}. Эксперименты не бывают дешёвыми».\n\n`);
  }

  player.credits -= MOD_COST;
  player.stats = player.stats || {};
  const stat = MOD_STATS[Math.floor(rng() * MOD_STATS.length)];
  const success = rng() < 0.7; // 70% на успех — риск реальный, но не монетка

  let resultText;
  if (success) {
    player.stats[stat] = (player.stats[stat] || 0) + 3;
    resultText = `Модификация приживается. «Вот видишь, — Ворн доволен, — иногда получается с первого раза». ${STAT_NAMES[stat]} +3, постоянно.`;
  } else {
    player.stats[stat] = Math.max(0, (player.stats[stat] || 0) - 1);
    resultText = `Что-то пошло не так — организм отторгает изменение. «Бывает и так, — Ворн пожимает плечами без особого сочувствия. — Часть эксперимента». ${STAT_NAMES[stat]} −1, постоянно.`;
  }

  return characterScreen('doktor_vorn', player, backScene, `${resultText}\n\n`);
}

module.exports = { vornTrade, vornModification };
