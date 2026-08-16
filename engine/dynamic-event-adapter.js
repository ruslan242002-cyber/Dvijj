'use strict';

/**
 * Адаптер сюжетных событий world-context -> exploration.js.
 *
 * Dynamic events остаются отдельной системой.
 * Здесь они приводятся к уже существующему контракту exploration.js.
 *
 * ВАЖНО:
 * Не создаём новый движок событий и не дублируем combat.
 */

function buildDynamicEnemy({
  name,
  tier = 1,
  rng = Math.random,
  fragmentId = null,
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
        Math.round(
          base * 0.7
        )
      ),
    },

    luck: Math.round(
      8 + safeTier * 1.5
    ),

    accuracy:
      0.72 +
      Math.min(
        safeTier,
        5
      ) *
        0.02,

    dodge:
      0.08 +
      Math.min(
        safeTier,
        5
      ) *
        0.015,

    focus:
      0.65 +
      Math.min(
        safeTier,
        5
      ) *
        0.02,

    periodic: [],

    /*
     * Служебные данные сюжетного боя.
     * Combat их не использует как боевые характеристики,
     * но они сохраняются в объекте врага для следующего шага
     * сюжетной цепочки.
     */
    ...(fragmentId
      ? {
          fragmentId,
        }
      : {}),
  };
}

/**
 * Переносит награду dynamic-event в формат
 * существующего exploration.js.
 */
function rewardFields(
  reward = {}
) {
  const result = {};

  if (
    reward.credits !==
    undefined
  ) {
    result.credits =
      reward.credits;
  }

  if (
    reward.reputation !==
    undefined
  ) {
    result.reputation =
      reward.reputation;
  }

  if (
    reward.faction
  ) {
    result.faction =
      reward.faction;
  }

  if (
    reward.flag
  ) {
    result.consequence =
      reward.flag;
  }

  return result;
}

/**
 * Превращает одну сюжетную кнопку
 * в существующий формат exploration.
 */
function adaptChoice(
  choice,
  rng
) {
  const result =
    choice.result || {};

  /*
   * Самая важная часть:
   * результат выбора не должен исчезать после нажатия.
   *
   * exploration.js после выбора показывает choice.text,
   * поэтому результат добавляем туда сразу.
   */
  const visibleText = [
    choice.text,
    result.text,
  ]
    .filter(
      (value) =>
        typeof value ===
          'string' &&
        value.trim()
    )
    .join(
      '\n\n'
    );

  const adapted = {
    id:
      choice.id,

    text:
      visibleText ||
      'Продолжить',

    ...rewardFields(
      result.reward
    ),
  };

  if (
    result.consequenceId
  ) {
    adapted.consequence =
      result.consequenceId;
  }

  if (
    choice.combat
  ) {
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

          fragmentId:
            choice.fragmentId ||
            null,
        }),
    };
  }

  /*
   * Некоторые события задают сюжетный
   * флаг непосредственно на событии.
   */
  if (
    choice.flag
  ) {
    adapted.consequence =
      choice.flag;
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

  switch (
    event.type
  ) {
    /**
     * Личное сообщение куратора.
     *
     * Был просто story без кнопки,
     * теперь это нормальное одношаговое
     * событие exploration.
     */
    case 'story':
      return {
        ...event,

        type:
          'choice',

        choices: [
          {
            id:
              'continue',

            text:
              '📨 Принять сообщение',

            result: {
              text:
                'Сообщение сохранено. Координаты и поручение куратора теперь учитываются в дальнейших событиях.',
            },

            flag:
              event.flag ||
              null,
          },
        ],
      };

    /**
     * Обычный сюжетный выбор.
     */
    case 'choice':
      return {
        ...event,

        type:
          'choice',

        choices: (
          event.choices ||
          []
        ).map(
          (choice) =>
            adaptChoice(
              choice,
              rng
            )
        ),
      };

    /**
     * Сюжетный выбор,
     * где один из вариантов ведёт в combat.
     */
    case 'combat_choice':
      return {
        ...event,

        type:
          'choice',

        choices: (
          event.choices ||
          []
        ).map(
          (choice) =>
            adaptChoice(
              choice,
              rng
            )
        ),
      };

    /**
     * Страж фрагмента Тракта.
     *
     * Сам бой остаётся существующим combat.
     * Здесь только передаём ему служебный fragmentId.
     */
    case 'boss':
      return {
        ...event,

        type:
          'choice',

        choices: [
          {
            id:
              'fight_guardian',

            text:
              '⚔️ Сразиться со стражем',

            fragmentId:
              event.fragmentId ||
              null,

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
            id:
              'retreat',

            text:
              '🚶 Отступить',
          },
        ].map(
          (choice) =>
            adaptChoice(
              choice,
              rng
            )
        ),
      };

    /**
     * Сюжетная находка / подтверждение гипотезы.
     */
    case 'discovery':
      return {
        ...event,

        type:
          'choice',

        choices: [
          {
            id:
              'inspect_discovery',

            text:
              '🔎 Изучить находку',

            result: {
              text:
                event.text ||
                'Ты внимательно изучаешь находку.',
            },

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
      /*
       * Неизвестный тип не ломаем.
       * Возвращаем исходное событие,
       * чтобы существующая procedural-ветка
       * могла обработать его своим способом.
       */
      return event;
  }
}

module.exports = {
  adaptDynamicEvent,
  buildDynamicEnemy,
};
