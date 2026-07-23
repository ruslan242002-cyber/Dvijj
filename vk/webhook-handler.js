/**
 * Обработчик событий VK Callback API. Логика отделена от транспорта:
 * handleVkEvent(body, deps) — чистая асинхронная функция, deps можно
 * подменить в тестах (fake store, fake vk-клиент), поэтому весь сценарий
 * "пришло сообщение -> обновили состояние -> отправили ответ" проверяется
 * без единого реального запроса в интернет.
 *
 * Настройка на стороне ВК (один раз, 5 минут):
 *   1. Управление сообществом → Работа с API → Callback API → Включить
 *   2. URL сервера — https://ваш-проект.vercel.app/api/vk
 *   3. Строка/секретный ключ — придумайте и впишите такое же значение
 *      в переменные окружения VK_CONFIRMATION_CODE / VK_CALLBACK_SECRET
 *   4. Типы событий — включите "Новое сообщение"
 *   5. Нажмите "Подтвердить" рядом с URL — если всё настроено, ВК напишет
 *      "Сервер подтверждён"
 */
'use strict';

const { step } = require('../game/router.js');

async function handleVkEvent(body, deps) {
  const { store, vk, rng = Math.random, confirmationCode, secret } = deps;

  if (secret && body.secret !== secret) {
    // Не совпал секрет — отвечаем "ok", чтобы ВК не долбил ретраями, но ничего не делаем
    return 'ok';
  }

  if (body.type === 'confirmation') {
    return confirmationCode || '';
  }

  if (body.type === 'message_new') {
    const message = body.object?.message || body.object; // разные версии API кладут по-разному
    const peerId = message.peer_id ?? message.from_id;
    const text = message.text || '';

    const prevState = await store.get(peerId);
    const { reply, nextState } = step(prevState, text, rng);
    await store.set(peerId, nextState);
    await vk.sendMessage(peerId, reply.text, reply.buttons);
    return 'ok';
  }

  // Любой другой тип события — подтверждаем получение и игнорируем
  return 'ok';
}

module.exports = { handleVkEvent };
