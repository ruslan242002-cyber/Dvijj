'use strict';

/**
 * ДОКТОР ВОРН — реальные функции. Держим обе в одном файле. Тема Ворна
 * — риск/непредсказуемость (его же карточка: "все предложения имеют
 * непредсказуемые последствия") — обе функции используют настоящую
 * переменность через rng, не фиксированный результат.
 */
const { addToInventory } = require('../common.js');
const { listDiscoveries } = require('../../../lib/discoveries.js');

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

const RESEARCH_COST = 250;

/** «Исследования» — Ворн ищет связь между УЖЕ сделанными discoveries
 * игрока (тема из общего документа арок: "Ворн слишком заинтересован
 * в этих совпадениях" — Этап 5 общей тайны). Не даёт НОВЫЙ discovery,
 * а честно связывает существующие — раскрывает что-то более крупное
 * из уже собранных кусочков, не выдумывает с нуля. */
async function vornResearch(player, backScene, rng, deps) {
  const { characterScreen } = require('../named-character.js');

  const owned = listDiscoveries(player);
  if (owned.length < 2) {
    return characterScreen('doktor_vorn', player, backScene, 'Ворн разочарованно вздыхает: «У тебя пока слишком мало кусочков, чтобы искать закономерность. Возвращайся, когда узнаешь больше».\n\n');
  }

  if ((player.credits || 0) < RESEARCH_COST) {
    return characterScreen('doktor_vorn', player, backScene, `Ворн разводит руками: «Анализ совпадений — 💳${RESEARCH_COST}. Даже одержимость стоит денег».\n\n`);
  }
  player.credits -= RESEARCH_COST;

  const a = owned[Math.floor(rng() * owned.length)];
  let b = owned[Math.floor(rng() * owned.length)];
  while (b === a && owned.length > 1) {
    b = owned[Math.floor(rng() * owned.length)];
  }

  return characterScreen(
    'doktor_vorn',
    player,
    backScene,
    `Ворн раскладывает твои находки рядом — «${a.name}» и «${b.name}» — и долго молчит.\n\n` +
      `«Совпадение — это то, что случается один раз. Два раза — уже система». Он не договаривает, что именно видит, но по глазам — видит явно немало.\n\n`
  );
}

/** «Задания» — вариативный разовый результат, как у остальных
 * персонажей, не многошаговый квест (те живут в lib/npc-arcs.js). */
async function vornQuest(player, backScene, rng, deps) {
  const { characterScreen } = require('../named-character.js');

  const roll = rng();
  let resultText;
  if (roll < 0.35) {
    addToInventory(player, 'Изотопы', 1, 8);
    resultText = 'Ворн просил принести образцы из опасного сектора — получилось без лишних вопросов. Часть материала — тебе, за риск.';
  } else if (roll < 0.7) {
    const { grantXp } = require('../../../engine/leveling.js');
    grantXp(player, 30);
    resultText = 'Эксперимент оказался успешнее, чем ожидал сам Ворн — редкий случай, когда он признаёт, что был неправ. +30 опыта, за помощь.';
  } else {
    player.credits = (player.credits || 0) + 200;
    resultText = 'Результаты заинтересовали покупателя со стороны — Ворн честно делится частью выручки. 💳200.';
  }

  return characterScreen('doktor_vorn', player, backScene, `${resultText}\n\n`);
}

const RISK_COST = 400;

/** «Риск/Награда» — самая крайняя версия темы Ворна: диапазон исходов
 * шире, чем у "Обмена" — от настоящей потери до серьёзного выигрыша.
 * Не притворяется безопасным выбором, ставки честно выше. */
async function vornRiskReward(player, backScene, rng, deps) {
  const { characterScreen } = require('../named-character.js');

  if ((player.credits || 0) < RISK_COST) {
    return characterScreen('doktor_vorn', player, backScene, `Ворн ухмыляется: «Настоящий риск стоит 💳${RISK_COST}. Дешёвого риска не бывает — это уже не риск».\n\n`);
  }
  player.credits -= RISK_COST;

  const roll = rng();
  let resultText;
  if (roll < 0.25) {
    resultText = '«Ну вот, — Ворн даже не удивлён, — иногда эксперимент — это просто потеря. Зато честная». Ничего не вышло — совсем ничего.';
  } else if (roll < 0.5) {
    player.credits += Math.round(RISK_COST * 0.5);
    resultText = 'Частичный успех — Ворн возвращает половину вложенного, разочарованно качая головой.';
  } else if (roll < 0.85) {
    player.credits += RISK_COST * 3;
    resultText = `«Вот это, — Ворн доволен по-настоящему, — стоило риска». Возврат в тройном размере: 💳${RISK_COST * 3}.`;
  } else {
    const { grantXp } = require('../../../engine/leveling.js');
    grantXp(player, 80);
    player.credits += RISK_COST * 2;
    resultText = `Редчайший результат — Ворн выглядит почти потрясённым. Двойной возврат (💳${RISK_COST * 2}) и +80 опыта — «Такое я вижу не каждый день».`;
  }

  return characterScreen('doktor_vorn', player, backScene, `${resultText}\n\n`);
}

module.exports = { vornTrade, vornModification, vornResearch, vornQuest, vornRiskReward };
