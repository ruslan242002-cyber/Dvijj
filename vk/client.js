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

/** Собирает клавиатуру ВК из списка кнопок (один или несколько рядов).
 * Каждый элемент — либо строка (обычная текстовая кнопка, по нажатию
 * отправляет свою подпись как сообщение), либо объект { label, url }
 * (кнопка-ссылка типа open_link — открывает браузер сразу по нажатию,
 * без отправки сообщения). ВК не позволяет мешать open_link с другими
 * типами в одном ряду, поэтому каждая ссылка автоматически уходит в
 * свой отдельный ряд, а текстовые кнопки группируются в соседние ряды.
 *
 * inline: false (по умолчанию) — обычная, постоянная клавиатура снизу экрана.
 * inline: true — кнопки, приклеенные к конкретному сообщению.
 */
function buildKeyboard(buttons, { inline = false, oneTime = false } = {}) {
  if (!buttons || buttons.length === 0) return undefined;

  const rows = [];
  let textRow = [];
  const flushTextRow = () => { if (textRow.length) { rows.push(textRow); textRow = []; } };

  buttons.forEach((b) => {
    if (typeof b === 'string') {
      textRow.push({ action: { type: 'text', label: b.slice(0, 40) }, color: 'primary' });
    } else if (b && b.url) {
      flushTextRow();
      rows.push([{ action: { type: 'open_link', link: b.url, label: String(b.label || 'Открыть').slice(0, 40) } }]);
    }
  });
  flushTextRow();

  return JSON.stringify({ inline, one_time: oneTime, buttons: rows });
}

function vkClient({ token, apiUrl = 'https://api.vk.com/method' } = {}) {
  const accessToken = token || process.env.VK_GROUP_TOKEN;
  if (!accessToken) {
    throw new Error('vkClient: нужен VK_GROUP_TOKEN (переменная окружения или параметр).');
  }

  return {
    /** Отправляет текстовое сообщение с (опционально) кнопками пользователю peerId */
    async sendMessage(peerId, text, buttons) {
      const params = new URLSearchParams({
        access_token: accessToken,
        v: VK_API_VERSION,
        peer_id: String(peerId),
        message: text,
        random_id: String(Math.floor(Math.random() * 2 ** 31))
      });
      const keyboard = buildKeyboard(buttons);
      if (keyboard) params.set('keyboard', keyboard);

      const res = await fetch(`${apiUrl}/messages.send?${params.toString()}`, { method: 'POST' });
      const data = await res.json();
      if (data.error) throw new Error(`VK API error ${data.error.error_code}: ${data.error.error_msg}`);
      return data.response;
    }
  };
}

module.exports = { vkClient, buildKeyboard };
