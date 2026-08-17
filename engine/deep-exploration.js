'use strict';

const {
  rollEventWithContext,
} = require('./world-context');

const {
  rollEvent,
} = require('./exploration-engine');

/*
 * «Чем дольше с захода исследования, тем больше награда и сильнее
 * противники» — depth здесь НЕ характеристика персонажа, а счётчик
 * ТЕКУЩЕЙ вылазки: сколько раз подряд игрок нажал «Продолжить путь».
 *
 * Для обычной вылазки сохраняется старый world-context:
 *   exploration -> deep-exploration -> world-context
 *
 * Для именованной локации с theme:
 *   exploration -> deep-exploration -> exploration-engine
 *
 * Это важно: world-context содержит глобальные секторные и динамические
 * события, которые не должны перебивать контекст конкретной высадки.
 */

const MAX_DEPTH_TIER_BONUS = 6;
const TIER_BONUS_PER_STEPS = 2;
const REWARD_PER_STEP = 0.12;
const MAX_REWARD_MULTIPLIER = 3.5;

function depthTierBonus(depth) {
  return Math.min(
    Math.floor(
      depth / TIER_BONUS_PER_STEPS
    ),
    MAX_DEPTH_TIER_BONUS
  );
}

function depthRewardMultiplier(depth) {
  return Math.min(
    1 + depth * REWARD_PER_STEP,
    MAX_REWARD_MULTIPLIER
  );
}

/**
 * Генерация события текущей вылазки.
 *
 * theme — тема конкретной именованной локации:
 *   anomaly      -> Разлом Кайлара
 *   hostile      -> Пустошь Табира
 *   border       -> Периметр Танвир
 *   smuggle      -> Ярмарка Теней
 *   ruins        -> Некрополь Ксарн
 *   abyss        -> Бездна Оррин
 *   industrial   -> Кузня Забытых
 *   wreckage     -> Кладбище флота
 *   и т.д.
 *
 * Если theme отсутствует — ничего не меняем и используем
 * существующий world-context со всеми его глобальными событиями.
 *
 * Если theme есть — намеренно пропускаем world-context:
 * секторные и глобальные dynamic events относятся к космосу/миру,
 * а игрок уже находится внутри конкретной локации.
 */
function rollEventWithDepth(
  player,
  zone,
  depth = 0,
  rng = Math.random,
  weightsOverride = null,
  theme = null
) {
  const hasNamedLocation =
    typeof theme === 'string' &&
    theme.length > 0;

  let event;

  if (hasNamedLocation) {
    const effectiveLevel =
      depth > 0
        ? (player.level ?? 1) +
          Math.floor(depth / 2)
        : player.level ?? null;

    event = {
      ...rollEvent(
        zone,
        rng,
        effectiveLevel,
        weightsOverride,
        theme
      ),
      source: 'procedural',
      locationTheme: theme,
    };
  } else {
    event =
      rollEventWithContext(
        player,
        zone,
        rng,
        depth,
        weightsOverride
      );
  }

  if (
    event.source !==
    'procedural'
  ) {
    return event;
  }

  const rewardMult =
    depthRewardMultiplier(
      depth
    );

  if (
    (event.type === 'find' ||
      event.type === 'node') &&
    event.loot
  ) {
    event.loot = {
      ...event.loot,

      credits:
        Math.round(
          event.loot.credits *
            rewardMult
        ),

      /*
       * Количество ресурсов растёт медленнее кредитов.
       * Потолок ×2 сохраняем из существующей механики.
       */
      qty:
        Math.round(
          event.loot.qty *
            Math.min(
              rewardMult,
              2
            )
        ),
    };
  }

  if (
    event.type ===
      'ambush' &&
    event.enemy
  ) {
    event.depthBonusTier =
      depthTierBonus(
        depth
      );
  }

  event.depth =
    depth;

  event.rewardMultiplier =
    rewardMult;

  return event;
}

module.exports = {
  rollEventWithDepth,
  depthTierBonus,
  depthRewardMultiplier,
};
