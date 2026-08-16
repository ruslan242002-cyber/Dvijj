'use strict';

/**
 * Адаптер dynamic-events -> существующий exploration.js.
 *
 * Dynamic-events генерирует сюжетные события.
 * Exploration уже умеет обрабатывать обычный choice/combat.
 *
 * Здесь НЕ создаётся новый движок.
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

    tier:
      safeTier,

    hp,
    hpMax:
      hp,

    stats: {
      power:
        Math.round(
          base * 1.1
        ),

      mind:
        Math.round(
          base * 1.1
        ),

      reaction:
        Math.round(
          base * 1.1
        ),

      endurance:
        Math.round(
          base * 1.1
        ),

      firepower:
        Math.round(
          base * 1.25
        ),

      shielding:
        Math.min(
          70,
          Math.round(
            base * 0.7
          )
        ),
    },

    luck:
      Math.round(
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

    ...(fragmentId
      ? {
          fragmentId,
        }
      : {}),
  };
}

/**
 * Переносит reward в поля,
 * которые реально понимает exploration.js.
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

  /*
   * В dynamic-events flag находится
   * внутри reward.
   *
   * exploration.js понимает consequence,
   * поэтому сразу нормализуем его.
   */
  if (
    reward.flag
  ) {
    result.consequence =
      reward.flag;
  }

  return result;
}

/**
 * Нормализация одного выбора.
 */
function adaptChoice(
  choice,
  rng,
  eventFlag = null
) {
  const result =
    choice.result || {};

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

  /*
   * Последствие конкретного выбора.
   *
   * Например:
   * echo_allied
   */
  if (
    result.consequenceId
  ) {
    adapted.consequence =
      result.consequenceId;
  }

  /*
   * result.flag используется,
   * например, у stranded_signal/flee.
   */
  if (
    result.flag
  ) {
    adapted.consequence =
      result.flag;
  }

  /*
   * Флаг самого события.
   *
   * Например:
   * anomaly_whisper_seen
   *
   * Он нужен после любого выбора.
   */
  if (
    eventFlag
  ) {
    adapted.eventFlag =
      eventFlag;
  }

  /*
   * Локальный flag выбора имеет
   * более высокий приоритет.
   */
  if (
    choice.flag
  ) {
    adapted.eventFlag =
      choice.flag;
  }

  /*
   * Существующий combat.
   * Никакого нового боевого движка.
   */
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
     * Сообщение куратора.
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
                'Сообщение сохранено. Поручение куратора теперь учитывается в дальнейших событиях.',
            },

            consequence:
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
              rng,
              event.flag ||
                null
            )
        ),
      };

    /**
     * Сюжетный выбор,
     * который может привести к бою.
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
              rng,
              event.flag ||
                null
            )
        ),
      };

    /**
     * Страж фрагмента Тракта.
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
              rng,
              event.flag ||
                null
            )
        ),
      };

    /**
     * Сюжетная находка.
     */
    case 'discovery': {
      const choice = {
        id:
          'inspect_discovery',

        text:
          '🔎 Изучить находку',

        result: {
          text:
            event.text ||
            'Ты внимательно изучаешь находку.',
        },

        /*
         * Кредиты и прочие reward-поля
         * остаются на choice.
         */
        ...rewardFields(
          event.reward
        ),
      };

      if (
        event.hypothesisConfirm
      ) {
        choice.consequence =
          `hypothesis:${event.hypothesisConfirm}`;
      }

      if (
        event.flag
      ) {
        choice.eventFlag =
          event.flag;
      }

      return {
        ...event,

        type:
          'choice',

        choices: [
          choice,
        ],
      };
    }

    default:
      /*
       * Неизвестный тип не уничтожаем.
       * Возвращаем исходное событие.
       */
      return event;
  }
}

module.exports = {
  adaptDynamicEvent,
  buildDynamicEnemy,
};
