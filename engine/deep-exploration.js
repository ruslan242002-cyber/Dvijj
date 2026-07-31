'use strict';

const { rollEventWithContext } = require('./world-context');

/*
 * "Чем дольше с захода исследования, тем больше награда и сильнее
 * противники" — depth здесь НЕ характеристика персонажа, а счётчик
 * ТЕКУЩЕЙ вылазки: сколько раз подряд игрок нажал "Продолжить путь",
 * не выходя на станцию. router.js должен:
 *   - завести state.payload.depth = 0 при входе в "Исследовать"
 *   - +1 на каждый шаг "Продолжить путь"
 *   - сбросить в 0 при возврате на станцию, поражении или эвакуации
 *
 * Без сброса это была бы постоянная прогрессия (фактически новый левел),
 * а не риск в рамках одной вылазки — что было бы совсем другой, куда
 * более сильной по балансу механикой, чем просили.
 */

const MAX_DEPTH_TIER_BONUS = 6; // потолок тира противника не растёт бесконечно
const TIER_BONUS_PER_STEPS = 2; // +1 к потолку тира за каждые 2 шага вглубь
const REWARD_PER_STEP = 0.12; // +12% к награде процедурных находок за шаг
const MAX_REWARD_MULTIPLIER = 3.5; // потолок множителя награды

function depthTierBonus(depth) {
  return Math.min(Math.floor(depth / TIER_BONUS_PER_STEPS), MAX_DEPTH_TIER_BONUS);
}

function depthRewardMultiplier(depth) {
  return Math.min(1 + depth * REWARD_PER_STEP, MAX_REWARD_MULTIPLIER);
}

/**
 * То же самое, что rollEventWithContext, но:
 *  - потолок тира противника в процедурной ветке поднят на depthTierBonus(depth)
 *    (сам сдвиг уже сделан внутри world-context.js через параметр depth)
 *  - кредиты и количество в находках/жилах домножены на depthRewardMultiplier(depth)
 *
 * Секторы и динамические события НЕ масштабируются глубиной — у них
 * своя, более редкая логика эскалации, трогать её глубиной вылазки
 * не нужно (см. комментарий в world-context.js).
 */
function rollEventWithDepth(player, zone, depth = 0, rng = Math.random) {
  const event = rollEventWithContext(player, zone, rng, depth);

  if (event.source !== 'procedural') return event;

  const rewardMult = depthRewardMultiplier(depth);

  if ((event.type === 'find' || event.type === 'node') && event.loot) {
    event.loot = {
      ...event.loot,
      credits: Math.round(event.loot.credits * rewardMult),
      // количество растёт медленнее кредитов и с меньшим потолком —
      // иначе долгая вылазка заваливает трюм раньше, чем кошелёк
      qty: Math.round(event.loot.qty * Math.min(rewardMult, 2)),
    };
  }

  if (event.type === 'ambush' && event.enemy) {
    // тир уже поднят внутри rollEventWithContext через effectiveLevel —
    // здесь просто помечаем событие для текста/логов ("усиленный противник")
    event.depthBonusTier = depthTierBonus(depth);
  }

  event.depth = depth;
  event.rewardMultiplier = rewardMult;
  return event;
}

module.exports = { rollEventWithDepth, depthTierBonus, depthRewardMultiplier };
