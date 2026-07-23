/**
 * Минимальный клиент VK Bots API — только то, что нужно текстовой игре:
 * отправка сообщения с кнопками. Использует обычный fetch, без vk-io и
 * прочих SDK — меньше кода, меньше того, что может сломаться при апдейте
 * библиотеки.
 *
 * Токен группы берётся в ВК: Управление сообществом → Работа с API →
 * Ключи доступа → Создать ключ (права — "Сообщения сообщества").
 */
'use strict';

const VK_API_VERSION = '5.199';

/** Собирает клавиатуру ВК из простого списка подписей кнопок (один ряд) */
function buildKeyboard(buttonLabels, { inline = false, oneTime = false } = {}) {
  if (!buttonLabels || buttonLabels.length === 0) return undefined;
  return JSON.stringify({
    inline,
    one_time: oneTime,
    buttons: [buttonLabels.map((label) => ({
      action: { type: 'text', label: String(label).slice(0, 40) },
      color: 'primary'
    }))]
  });
}

function vkClient({ token, apiUrl = 'https://api.vk.com/method' } = {}) {
  const accessToken = token || process.env.VK_GROUP_TOKEN;
  if (!accessToken) {
    throw new Error('vkClient: нужен VK_GROUP_TOKEN (переменная окружения или параметр).');
  }

  return {
    /** Отправляет текстовое сообщение с (опционально) кнопками пользователю peerId */
    async sendMessage(peerId, text, buttonLabels) {
      const params = new URLSearchParams({
        access_token: accessToken,
        v: VK_API_VERSION,
        peer_id: String(peerId),
        message: text,
        random_id: String(Math.floor(Math.random() * 2 ** 31))
      });
      const keyboard = buildKeyboard(buttonLabels);
      if (keyboard) params.set('keyboard', keyboard);

      const res = await fetch(`${apiUrl}/messages.send?${params.toString()}`, { method: 'POST' });
      const data = await res.json();
      if (data.error) throw new Error(`VK API error ${data.error.error_code}: ${data.error.error_msg}`);
      return data.response;
    }
  };
}

module.exports = { vkClient, buildKeyboard };
