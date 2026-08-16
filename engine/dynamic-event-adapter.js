'use strict';

/**
 * Адаптер сюжетных событий world-context -> exploration.js.
 *
 * Генератор dynamic-events.js не должен знать о сценах игры.
 * Он возвращает доменные события, а этот слой приводит их
 * к существующему контракту exploration.js.
 */

function buildDynamicEnemy({
  name,
  tier = 1,
  rng = Math.random,
}) {
  const safeTier = Math.max(
    1,
    Number(tier) || 1
  );

  const hp = Math.round(
    (110 + rng() * 70) *
      (1 + safeTier * 0.12)
  );

  const base =
    14 + safeTier * 4;

  return {
    name:
      name ||
      'Страж аномалии',

    tier: safeTier,

    hp,
    hpMax: hp,

    stats: {
      power: Math.round(
        base * 1.1
      ),
      mind: Math.round(
        base * 1.1
      ),
      reaction: Math.round(
        base * 1.1
      ),
      endurance: Math.round(
        base * 1.1
      ),
      firepower: Math.round(
        base * 1.25
      ),
      shielding: Math.min(
        70,
        Math.round(base * 0.7)
      ),
    },

    luck: Math.round(
      8 + safeTier * 1.5
    ),

    accuracy:
      0.72 +
      Math.min(safeTier, 5) * 0.02,

    dodge:
      0.08 +
      Math.min(safeTier, 5) * 0.015,

    focus:
      0.65 +
      Math.min(safeTier, 5) * 0.02,

    periodic: [],
  };
}

function rewardFields(
  reward = {}
) {
  return {
    ...(reward.credits
      ? {
          credits:
            reward.credits,
        }
      : {}),

    ...(reward.reputation
      ? {
          reputation:
            reward.reputation,
        }
      : {}),

    ...(reward.faction
      ? {
          faction:
            reward.faction,
        }
      : {}),

    ...(reward.flag
      ? {
          consequence:
            reward.flag,
        }
      : {}),
  };
}

function adaptChoice(
  choice,
  rng
) {
  const result =
    choice.result || {};

  const adapted = {
    id: choice.id,
    text: choice.text,

    ...rewardFields(
      result.reward
    ),
  };

  if (result.consequenceId) {
    adapted.consequence =
      result.consequenceId;
  }

  if (choice.combat) {
    adapted.combat = {
      zoneOverride:
        choice.combat
          .zoneOverride,

      enemy:
        choice.combat.enemy ||
        buildDynamicEnemy({
          name:
            choice.combat
              .guardianName,

          tier:
            choice.combat.tier,

          rng,
        }),
    };
  }

  return adapted;
}

function adaptDynamicEvent(
  event,
  rng = Math.random
) {
  if (
    !event ||
    event.source !==
      'dynamic'
  ) {
    return event;
  }

  switch (event.type) {
    case 'story':
      return {
        ...event,

        type: 'choice',

        choices: [
          {
            id: 'continue',

            text:
              '📨 Принять сообщение',

            consequence:
              event.flag || null,
          },
        ],
      };

    case 'choice':
    case 'combat_choice':
      return {
        ...event,

        type: 'choice',

        choices: (
          event.choices || []
        ).map((choice) =>
          adaptChoice(
            choice,
            rng
          )
        ),
      };

    case 'boss':
      return {
        ...event,

        type: 'choice',

        choices: [
          {
            id:
              'fight_guardian',

            text:
              '⚔️ Сразиться со стражем',

            combat: {
              tier:
                event.combat?.tier ||
                7,

              guardianName:
                event.combat
                  ?.guardianName ||
                'Страж фрагмента',

              zoneOverride:
                'red',
            },
          },

          {
            id: 'retreat',

            text:
              '🚶 Отступить',
          },
        ].map((choice) =>
          adaptChoice(
            choice,
            rng
          )
        ),
      };

    case 'discovery':
      return {
        ...event,

        type: 'choice',

        choices: [
          {
            id:
              'inspect_discovery',

            text:
              '🔎 Изучить находку',

            ...rewardFields(
              event.reward
            ),

            ...(event.hypothesisConfirm
              ? {
                  consequence:
                    `hypothesis:${event.hypothesisConfirm}`,
                }
              : {}),
          },
        ],
      };

    default:
      return event;
  }
}

module.exports = {
  adaptDynamicEvent,
  buildDynamicEnemy,
};
