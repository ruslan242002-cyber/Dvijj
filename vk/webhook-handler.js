'use strict';

const { step } = require('../game/router.js');
const { broadcastToAllPlayers } = require('../lib/broadcast.js');

async function handleVkEvent(body, deps) {
  const { store, vk, rng = Math.random, confirmationCode, secret, getProfileLink, resolveEnemyImage, marketStore, pvpStore, ambushStore, knownPlayersStore, veinStore } = deps;

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

    let reply, nextState, veinJustSpawned;
    try {
      ({ reply, nextState, veinJustSpawned } = await step(prevState, text, rng, routerDeps, peerId));
    } catch (err) {
      console.error('vk webhook: step() упал, возвращаю игрока на станцию:', err);
      const player = prevState?.player;
      if (player) {
        nextState = { scene: 'station', player };
        reply = { text: '⚠️ Что-то пошло не так на этом экране. Возвращаю тебя на станцию — прогресс не потерян.', buttons: [] };
      } else {
        nextState = { scene: 'start' };
        reply = { text: '⚠️ Что-то пошло не так. Начнём заново — напиши что угодно.', buttons: [] };
      }
    }

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
