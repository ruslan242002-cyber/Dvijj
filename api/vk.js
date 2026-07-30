/**
 * Путь: api/vk.js -> https://ваш-проект.vercel.app/api/vk
 * Это единственный адрес, который нужно вписать в настройки Callback API
 * в сообществе ВК. Дальше всё делает game/router.js — этот файл только
 * подключает реальное хранилище (Upstash), реальный клиент ВК, генерацию
 * персональной ссылки на профиль, загрузку картинок врагов в ВК, и —
 * теперь — биржу и PvP-дуэли.
 *
 * Обязательные переменные окружения (Vercel → Settings → Environment Variables):
 *   VK_GROUP_TOKEN         — ключ доступа сообщества (права: сообщения)
 *   VK_CONFIRMATION_CODE   — строка из настроек Callback API в ВК
 *   VK_CALLBACK_SECRET     — секретный ключ, тот же, что в настройках ВК
 *   PROFILE_TOKEN_SECRET   — любая своя длинная случайная строка (для подписи ссылок на профиль)
 *   UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN — из Upstash (та же база,
 *     что уже используется для состояния игрока — отдельная не нужна)
 *
 * Картинки врагов — положите файлы в public/enemies/ и впишите их в
 * game/enemy-images.js, отдельных переменных окружения для этого не нужно.
 */
'use strict';
const { handleVkEvent } = require('../vk/webhook-handler.js');
const { vkClient } = require('../vk/client.js');
const { upstashStore } = require('../state/upstash-store.js');
const { createUpstashRedisClient } = require('../state/upstash-redis-client.js');
const { createUpstashMarketStore } = require('../market/market-store-upstash.js');
const { createUpstashPvpStore } = require('../pvp/pvp-store-upstash.js');
const { sign } = require('../lib/auth-token.js');
const { resolveEnemyImage } = require('../vk/photo-cache.js');

const redisClient = createUpstashRedisClient();
const marketStore = createUpstashMarketStore(redisClient);
const pvpStore = createUpstashPvpStore(redisClient);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(200).send('ok');
    return;
  }

  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const baseUrl = `https://${host}`;
  const profileSecret = process.env.PROFILE_TOKEN_SECRET;
  const store = upstashStore();
  const vkToken = process.env.VK_GROUP_TOKEN;

  try {
    const reply = await handleVkEvent(req.body || {}, {
      store,
      vk: vkClient(),
      confirmationCode: (process.env.VK_CONFIRMATION_CODE || '').trim(),
      secret: (process.env.VK_CALLBACK_SECRET || '').trim(),
      getProfileLink: profileSecret
        ? (peerId) => `https://${host}/profile.html?token=${sign(String(peerId), profileSecret)}`
        : undefined,
      resolveEnemyImage: (imageKey) => resolveEnemyImage(imageKey, { vkToken, store, baseUrl }),
      marketStore,
      pvpStore,
    });
    res.status(200).send(reply);
  } catch (err) {
    console.error('vk webhook error:', err);
    res.status(200).send('ok');
  }
};
