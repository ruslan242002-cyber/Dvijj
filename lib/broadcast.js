'use strict';

/**
 * РАССЫЛКА ВСЕМ ИГРОКАМ — используется для уведомления о появлении жилы
 * (и потенциально других общемировых событий). Не шлёт всё разом — ВК
 * API ограничивает частоту messages.send, поэтому рассылка идёт пачками
 * с паузой между ними. Отдельные неудачи (например, пользователь
 * заблокировал сообщения от сообщества) не прерывают всю рассылку —
 * просто считаются в failed.
 */

const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_BATCH_DELAY_MS = 1000;

async function broadcastToAllPlayers(vk, peerIds, text, buttons, options = {}) {
  const batchSize = options.batchSize || DEFAULT_BATCH_SIZE;
  const batchDelayMs = options.batchDelayMs ?? DEFAULT_BATCH_DELAY_MS;

  let sent = 0;
  let failed = 0;
  const failedIds = [];

  for (let i = 0; i < peerIds.length; i += batchSize) {
    const batch = peerIds.slice(i, i + batchSize);
    const results = await Promise.allSettled(batch.map((id) => vk.sendMessage(id, text, buttons)));
    results.forEach((r, idx) => {
      if (r.status === 'fulfilled') {
        sent += 1;
      } else {
        failed += 1;
        failedIds.push(batch[idx]);
      }
    });
    if (i + batchSize < peerIds.length && batchDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, batchDelayMs));
    }
  }

  return { sent, failed, failedIds };
}

module.exports = { broadcastToAllPlayers, DEFAULT_BATCH_SIZE, DEFAULT_BATCH_DELAY_MS };
