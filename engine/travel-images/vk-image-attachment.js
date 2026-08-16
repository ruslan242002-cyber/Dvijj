'use strict';

/**
 * engine/travel-images/vk-image-attachment.js
 *
 * Загружает локальный файл картинки в VK ОДИН раз и кеширует полученный
 * attachment-id (формат "photo{owner_id}_{photo_id}") в Redis навсегда —
 * повторные вызовы для того же ключа читают из кеша, не трогая VK Upload API.
 *
 * Отдельный маленький Redis-клиент (те же env-переменные, что и остальной
 * проект: UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN), а не
 * зависимость от общего стора — можно использовать этот файл даже если
 * не подключён остальной api/vk.js.
 */
const fs = require('fs');

function redisClient({ url, token } = {}) {
  const baseUrl = url || process.env.UPSTASH_REDIS_REST_URL;
  const authToken = token || process.env.UPSTASH_REDIS_REST_TOKEN;
  const headers = { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' };
  return {
    async get(key) {
      const res = await fetch(`${baseUrl}/get/${encodeURIComponent(key)}`, { method: 'GET', headers });
      const data = await res.json();
      return data.result || null;
    },
    async set(key, value) {
      const res = await fetch(`${baseUrl}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}`, { method: 'POST', headers });
      const data = await res.json();
      return data.result;
    },
  };
}

const cacheKey = (imageKey) => `periferia:vk_attachment:${imageKey}`;

/**
 * @param {object} vkClient — существующий клиент VK API. Должен уметь:
 *   - vkClient.call('photos.getMessagesUploadServer', { peer_id }) -> { upload_url }
 *   - загрузку файла на upload_url (multipart/form-data, поле "photo")
 *   - vkClient.call('photos.saveMessagesPhoto', { photo, server, hash }) -> [{ owner_id, id }]
 *   Если имена методов другие — правь только внутри uploadToVk(), остальное не трогай.
 * @param {object} redis — опционально: свой Redis-клиент с get/set(key,value).
 *   Если не передан — создаётся свой (см. redisClient() выше).
 * @param {string} imageKey — уникальный ключ картинки (см. manifest.key)
 * @param {string} filePath — локальный путь к файлу (см. manifest.file)
 */
async function getOrUploadAttachment(vkClient, redis, imageKey, filePath, peerIdForUpload) {
  const store = redis || redisClient();
  const cached = await store.get(cacheKey(imageKey));
  if (cached) return cached;
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `getOrUploadAttachment: файла "${filePath}" нет на диске. ` +
      `Это ожидаемо, пока вы не положили картинку по этому пути — см. соответствующий image-manifest.js`
    );
  }
  const attachment = await uploadToVk(vkClient, filePath, peerIdForUpload);
  await store.set(cacheKey(imageKey), attachment);
  return attachment;
}

async function uploadToVk(vkClient, filePath, peerId) {
  const { upload_url } = await vkClient.call('photos.getMessagesUploadServer', { peer_id: peerId });
  const form = new FormData();
  form.append('photo', new Blob([fs.readFileSync(filePath)]), 'photo.jpg');
  const uploadRes = await fetch(upload_url, { method: 'POST', body: form });
  const uploadData = await uploadRes.json(); // { server, photo, hash }
  const saved = await vkClient.call('photos.saveMessagesPhoto', uploadData);
  const photo = saved[0];
  return `photo${photo.owner_id}_${photo.id}`;
}

/** Ручной сброс кеша одной картинки — на случай, если заменили файл на
 * диске и хотите перезалить (например, обновили арт). Не вызывается
 * автоматически. */
async function invalidateAttachment(redis, imageKey) {
  const store = redis || redisClient();
  await store.set(cacheKey(imageKey), '');
}

module.exports = { getOrUploadAttachment, invalidateAttachment, redisClient };
