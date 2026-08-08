'use strict';

const { step } = require('../game/router.js');
const { broadcastToAllPlayers } = require('../lib/broadcast.js');
const { backupPlayerState } = require('../lib/player-backup.js');

async function handleVkEvent(body, deps) {
  const { store, vk, rng = Math.random, confirmationCode, secret, getProfileLink, resolveEnemyImage, marketStore, pvpStore, ambushStore, knownPlayersStore, veinStore, redis } = deps;

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

    const prevState = await store.get(peerId);
    if (knownPlayersStore) {
      // Не блокируем основной ответ игроку, если трекинг вдруг подведёт —
      // рассылка это второстепенная функция, а не критичный путь.
      knownPlayersStore.trackPlayer(peerId).catch((err) => console.error('trackPlayer упал:', err.message));
    }
    const routerDeps = {
      ...(getProfileLink ? { getProfileLink: () => getProfileLink(peerId) } : {}),
      marketStore,
      pvpStore,
      ambushStore,
      veinStore,
      store,
    };

    // БЛОКИРОВКА ОТ ГОНКИ ПРИ СПАМ-КЛИКАХ (lib/player-lock.js) — если
    // store.tryLockPlayer/unlockPlayer не подключены (deps.store их не
    // поддерживает), просто пропускаем блокировку без ошибки — это не
    // обязательная зависимость, деградация мягкая.
    const hasLock = typeof store.tryLockPlayer === 'function' && typeof store.unlockPlayer === 'function';
    if (hasLock) {
      const locked = await store.tryLockPlayer(peerId);
      if (!locked) {
        // Предыдущий ход этого же игрока ещё не сохранён — это дубль-клик
        // или повторная доставка события от VK. Тихо подтверждаем, НЕ
        // трогая состояние повторно (именно так раньше диалог куратора
        // мог показать рассинхронизированный текст на втором нажатии).
        return 'ok';
      }
    }

    let reply, nextState, veinJustSpawned;
    try {
      ({ reply, nextState, veinJustSpawned } = await step(prevState, text, rng, routerDeps, peerId));
    } catch (err) {
      console.error('vk webhook: step() упал:', err);
      const player = prevState?.player;
      if (player) {
        // Есть за что зацепиться — возвращаем на станцию с тем же
        // персонажем, прогресс цел.
        nextState = { scene: 'station', player };
        reply = { text: '⚠️ Что-то пошло не так на этом экране. Возвращаю тебя на станцию — прогресс не потерян.', buttons: [] };
      } else if (!prevState) {
        // Действительно новый игрок — до этого момента для него вообще
        // ничего не сохранялось, тут "начать заново" — это буквально
        // онбординг, а не потеря прогресса.
        nextState = { scene: 'start' };
        reply = { text: 'Начнём. Напиши что угодно.', buttons: [] };
      } else {
        // ОПАСНЫЙ СЛУЧАЙ: prevState существует (что-то раньше сохранялось),
        // но player в нём пуст — это повреждённое состояние, не "новый
        // игрок". Раньше отсюда автоматически шли в 'start', тихо стирая
        // персонажа при любой мелкой ошибке в какой угодно сцене — этого
        // явно не должно происходить без явного запроса игрока. Теперь: НЕ
        // трогаем store.set() вообще (не перезаписываем то, что лежит в
        // хранилище, вдруг там ещё цел персонаж под другим полем), просто
        // сообщаем об ошибке и предлагаем реальный путь восстановления —
        // ручной /сброс, если игрок сам решит, что прогресс всё равно не
        // спасти. Автоматического стирания персонажа больше нет нигде,
        // кроме явной команды сброса в городе.
        console.error('vk webhook: prevState существует, но player пуст для peerId=' + peerId + ' — НЕ сбрасываю автоматически.');
        await vk.sendMessage(peerId, '⚠️ Не получилось загрузить твоего персонажа на этом шаге. Персонаж не удалён — попробуй написать что угодно ещё раз через минуту. Если не поможет — набери «Сброс», чтобы начать заново вручную.', [], null);
        return 'ok';
      }
    } finally {
      if (hasLock) await store.unlockPlayer(peerId).catch(() => {});
    }

    // БЭКАП ПЕРЕД ПЕРЕЗАПИСЬЮ (lib/player-backup.js) — сохраняет prevState
    // (то, что было ДО этого шага), не nextState. Не блокирует и не может
    // сорвать реальное сохранение — тихо не падает, если deps.redis не
    // подключён (см. пояснение в самом player-backup.js). Именно баги
    // вроде перепутанных lib/housing.js ↔ game/scenes/housing.js — тот
    // случай, где такой откат на один шаг назад спас бы конкретного
    // игрока, если бы баг проявился уже после деплоя на реальных данных.
    if (redis) backupPlayerState({ redis }, peerId, prevState).catch(() => {});

    await store.set(peerId, nextState);

    let attachment;
    if (reply.imageKey && typeof resolveEnemyImage === 'function') {
      attachment = await resolveEnemyImage(reply.imageKey).catch(() => null);
    }
    await vk.sendMessage(peerId, reply.text, reply.buttons, attachment);

    // Жила появилась именно на этом шаге — рассылаем всем известным
    // игрокам, не блокируя ответ текущему (он уже получил свой, выше).
    // Тот, кто "нашёл" жилу этим визитом на станцию, тоже получит
    // уведомление в общей рассылке — не выделяем его отдельно, чтобы не
    // усложнять текст.
    if (veinJustSpawned && knownPlayersStore) {
      (async () => {
        try {
          const allPlayers = await knownPlayersStore.getAllKnownPlayers();
          const text = `⚡ ОБНАРУЖЕНА ЖИЛА РЕСУРСА\n\nТ${veinJustSpawned.tier} · ${veinJustSpawned.resource}\n\nКорабли уже слетаются — набери «⛏️ Жила» на хабе станции, чтобы присоединиться.`;
          const result = await broadcastToAllPlayers(vk, allPlayers, text, []);
          console.log(`рассылка о жиле: отправлено ${result.sent}, не удалось ${result.failed}`);
        } catch (err) {
          console.error('рассылка о появлении жилы упала:', err.message);
        }
      })();
    }

    return 'ok';
  }

  return 'ok';
}

module.exports = { handleVkEvent };
