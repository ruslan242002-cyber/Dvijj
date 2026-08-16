'use strict';

const { step } = require('../game/router.js');
const { broadcastToAllPlayers } = require('../lib/broadcast.js');
const { backupPlayerState } = require('../lib/player-backup.js');
const { markEventProcessedOnce } = require('../lib/idempotency.js');

async function handleVkEvent(body, deps) {
  const {
    store,
    vk,
    rng = Math.random,
    confirmationCode,
    secret,
    getProfileLink,
    resolveEnemyImage,
    marketStore,
    pvpStore,
    ambushStore,
    knownPlayersStore,
    veinStore,
    bossStore,
    raidStore,
    guildStore,
    worldStateStore,
    tractStore,
    redis,
  } = deps;

  if (body.type === 'confirmation') {
    return confirmationCode || '';
  }

  if (secret && body.secret !== secret) {
    return 'ok';
  }

  if (body.type === 'message_new') {
    const message = body.object?.message || body.object;
    const peerId = message.peer_id ?? message.from_id;
    const text = message.text || '';

    // ИДЕМПОТЕНТНОСТЬ (lib/idempotency.js) — отдельно от player-lock.js
    // ниже: тот не даёт двум запросам выполниться ОДНОВРЕМЕННО, это не
    // даёт ОДНО И ТО ЖЕ событие VK обработать ДВАЖДЫ при повторной
    // доставке (VK ретраит, если не получил 'ok' вовремя — может
    // случиться уже после того, как первая попытка успешно завершилась
    // и лок давно снят). message.id — то, что VK и так гарантирует
    // уникальным и монотонным в рамках сообщества, отдельный event_id
    // изобретать не нужно. Проверяем ДО store.get и вообще ДО любого
    // побочного эффекта — если это повтор, просто тихо подтверждаем.
    const isFirstDelivery = await markEventProcessedOnce({ redis }, message.id);
    if (!isFirstDelivery) {
      return 'ok';
    }

    const prevState = await store.get(peerId);

    if (knownPlayersStore) {
      // Не блокируем основной ответ игроку, если трекинг вдруг подведёт —
      // рассылка это второстепенная функция, а не критичный путь.
      knownPlayersStore
        .trackPlayer(peerId)
        .catch((err) => console.error('trackPlayer упал:', err.message));
    }

    const routerDeps = {
      ...(getProfileLink
        ? { getProfileLink: () => getProfileLink(peerId) }
        : {}),
      marketStore,
      pvpStore,
      ambushStore,
      veinStore,
      bossStore,
      raidStore,
      guildStore,

      // ВАЖНО:
      // Эти два store создаются в api/vk.js и должны пройти всю цепочку
      // api/vk -> webhook-handler -> router -> scenes.
      // Раньше они терялись здесь.
      worldStateStore,
      tractStore,

      redis,
      store,
    };

    // БЛОКИРОВКА ОТ ГОНКИ ПРИ СПАМ-КЛИКАМ (lib/player-lock.js) — если
    // store.tryLockPlayer/unlockPlayer не подключены (deps.store их не
    // поддерживает), просто пропускаем блокировку без ошибки — это не
    // обязательная зависимость, деградация мягкая.
    const hasLock =
      typeof store.tryLockPlayer === 'function' &&
      typeof store.unlockPlayer === 'function';

    if (hasLock) {
      const locked = await store.tryLockPlayer(peerId);

      if (!locked) {
        // Предыдущий ход этого же игрока ещё не сохранён — это дубль-клик
        // или повторная доставка события от VK. Тихо подтверждаем, НЕ
        // трогая состояние повторно.
        return 'ok';
      }
    }

    let reply;
    let nextState;
    let veinJustSpawned;

    try {
      ({ reply, nextState, veinJustSpawned } = await step(
        prevState,
        text,
        rng,
        routerDeps,
        peerId
      ));
    } catch (err) {
      console.error('vk webhook: step() упал:', err);

      const player = prevState?.player;

      if (player) {
        // Есть за что зацепиться — возвращаем на станцию с тем же
        // персонажем, прогресс цел.
        nextState = {
          scene: 'station',
          player,
        };

        reply = {
          text: '⚠️ Что-то пошло не так на этом экране. Возвращаю тебя на станцию — прогресс не потерян.',
          buttons: [],
        };
      } else if (!prevState) {
        // Действительно новый игрок — до этого момента для него вообще
        // ничего не сохранялось, тут "начать заново" — это буквально
        // онбординг, а не потеря прогресса.
        nextState = {
          scene: 'start',
        };

        reply = {
          text: 'Начнём. Напиши что угодно.',
          buttons: [],
        };
      } else {
        // ОПАСНЫЙ СЛУЧАЙ: prevState существует, но player в нём пуст.
        // Не стираем существующее состояние автоматически.
        console.error(
          'vk webhook: prevState существует, но player пуст для peerId=' +
            peerId +
            ' — НЕ сбрасываю автоматически.'
        );

        await vk.sendMessage(
          peerId,
          '⚠️ Не получилось загрузить твоего персонажа на этом шаге. Персонаж не удалён — попробуй написать что угодно ещё раз через минуту. Если не поможет — набери «Сброс», чтобы начать заново вручную.',
          [],
          null
        );

        return 'ok';
      }
    } finally {
      if (hasLock) {
        await store.unlockPlayer(peerId).catch(() => {});
      }
    }

    // БЭКАП ПЕРЕД ПЕРЕЗАПИСЬЮ (lib/player-backup.js) — сохраняет prevState,
    // то есть состояние ДО этого шага.
    if (redis) {
      backupPlayerState({ redis }, peerId, prevState).catch(() => {});
    }

    await store.set(peerId, nextState);

    let attachment;

    if (reply.imageKey && typeof resolveEnemyImage === 'function') {
      attachment = await resolveEnemyImage(reply.imageKey).catch(() => null);
    }

    await vk.sendMessage(
      peerId,
      reply.text,
      reply.buttons,
      attachment
    );

    // Жила появилась именно на этом шаге — рассылаем всем известным
    // игрокам, не блокируя ответ текущему.
    if (veinJustSpawned && knownPlayersStore) {
      (async () => {
        try {
          const allPlayers =
            await knownPlayersStore.getAllKnownPlayers();

          const text = `⚡ ОБНАРУЖЕНА ЖИЛА РЕСУРСА

Т${veinJustSpawned.tier} · ${veinJustSpawned.resource}

Корабли уже слетаются — набери «⛏️ Жила» на хабе станции, чтобы присоединиться.`;

          const result = await broadcastToAllPlayers(
            vk,
            allPlayers,
            text,
            []
          );

          console.log(
            `рассылка о жиле: отправлено ${result.sent}, не удалось ${result.failed}`
          );
        } catch (err) {
          console.error(
            'рассылка о появлении жилы упала:',
            err.message
          );
        }
      })();
    }

    return 'ok';
  }

  return 'ok';
}

module.exports = { handleVkEvent };
