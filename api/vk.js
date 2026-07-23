/**
 * Путь: api/vk.js -> https://ваш-проект.vercel.app/api/vk
 * Это единственный адрес, который нужно вписать в настройки Callback API
 * в сообществе ВК. Дальше всё делает game/router.js — этот файл только
 * подключает реальное хранилище (Upstash) и реальный клиент ВК.
 *
 * Обязательные переменные окружения (Vercel → Settings → Environment Variables):
 *   VK_GROUP_TOKEN         — ключ доступа сообщества (права: сообщения)
 *   VK_CONFIRMATION_CODE   — строка из настроек Callback API в ВК
 *   VK_CALLBACK_SECRET     — секретный ключ, тот же, что в настройках ВК
 *   UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN — из Upstash
 */
'use strict';
const { handleVkEvent } = require('../vk/webhook-handler.js');
const { vkClient } = require('../vk/client.js');
const { upstashStore } = require('../state/upstash-store.js');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(200).send('ok'); // ВК иногда пингует GET-ом при проверке — отвечаем нейтрально
    return;
  }

  try {
    const reply = await handleVkEvent(req.body || {}, {
      store: upstashStore(),
      vk: vkClient(),
      confirmationCode: process.env.VK_CONFIRMATION_CODE,
      secret: process.env.VK_CALLBACK_SECRET
    });
    res.status(200).send(reply);
  } catch (err) {
    // ВК ждёт "ok" даже при внутренней ошибке, иначе начнёт слать событие повторно раз в секунду
    console.error('vk webhook error:', err);
    res.status(200).send('ok');
  }
};
