'use strict';

const { step } = require('../game/router.js');

async function handleVkEvent(body, deps) {
  const { store, vk, rng = Math.random, confirmationCode, secret, getProfileLink, resolveEnemyImage, marketStore, pvpStore, ambushStore } = deps;

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
    const routerDeps = {
      ...(getProfileLink ? { getProfileLink: () => getProfileLink(peerId) } : {}),
      marketStore,
      pvpStore,
      ambushStore,
      store,
    };

    let reply, nextState;
    try {
      ({ reply, nextState } = await step(prevState, text, rng, routerDeps, peerId));
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
    return 'ok';
  }

  return 'ok';
}

module.exports = { handleVkEvent };
