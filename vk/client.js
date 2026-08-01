'use strict';

const VK_API_VERSION = '5.199';

function buildKeyboard(buttons, { inline = false, oneTime = false } = {}) {
  if (!buttons || buttons.length === 0) return undefined;

  const rows = [];
  let textRow = [];
  const MAX_PER_ROW = 2; // раньше 3 — длинные названия умений ("Полевой ремонт" и т.п.) обрезались в узкой кнопке
  const flushTextRow = () => { if (textRow.length) { rows.push(textRow); textRow = []; } };

  buttons.forEach((b) => {
    if (typeof b === 'string') {
      textRow.push({ action: { type: 'text', label: b.slice(0, 40) }, color: 'primary' });
      if (textRow.length >= MAX_PER_ROW) flushTextRow();
    } else if (b && b.url) {
      flushTextRow();
      rows.push([{ action: { type: 'open_link', link: b.url, label: String(b.label || 'Открыть').slice(0, 40) } }]);
    } else if (b && b.label) {
      // Текстовая кнопка с явным цветом — { label, color }, color один из
      // 'primary' (синий, по умолчанию), 'default' (белый/серый),
      // 'positive' (зелёный), 'negative' (красный). Используется точечно
      // (например "Контракты" зелёным, "Врата Тракта" красным на хабе
      // станции) — обычные кнопки как были строками, так и остаются.
      textRow.push({ action: { type: 'text', label: String(b.label).slice(0, 40) }, color: b.color || 'primary' });
      if (textRow.length >= MAX_PER_ROW) flushTextRow();
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
    async sendMessage(peerId, text, buttons, attachment) {
      const params = new URLSearchParams({
        access_token: accessToken,
        v: VK_API_VERSION,
        peer_id: String(peerId),
        message: text,
        random_id: String(Math.floor(Math.random() * 2 ** 31))
      });
      const keyboard = buildKeyboard(buttons);
      if (keyboard) params.set('keyboard', keyboard);
      if (attachment) params.set('attachment', attachment);

      const res = await fetch(`${apiUrl}/messages.send?${params.toString()}`, { method: 'POST' });
      const data = await res.json();
      if (data.error) throw new Error(`VK API error ${data.error.error_code}: ${data.error.error_msg}`);
      return data.response;
    }
  };
}

module.exports = { vkClient, buildKeyboard };
