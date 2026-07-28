/**
 * Загрузка фото в ВК для прикрепления к сообщению. ВК не показывает
 * картинки по внешней ссылке в тексте — фото обязательно нужно один раз
 * загрузить на серверы ВК и получить attachment-строку вида "photo123_456".
 * Официальная схема (photos.getMessagesUploadServer -> загрузка файла ->
 * photos.saveMessagesPhoto) выполняется один раз на файл, результат
 * кэшируется в том же хранилище, что и прогресс игроков — повторные
 * встречи с тем же врагом не грузят картинку заново.
 *
 * Сама картинка берётся не с диска (файлы в public не гарантированно
 * доступны serverless-функции на чтение), а обычным fetch по адресу
 * https://ваш-домен/enemies/файл.jpg — то есть с уже задеплоенного
 * статического хостинга Vercel, что надёжнее.
 */
'use strict';

const VK_API_VERSION = '5.199';
const CACHE_PREFIX = 'vk:photo:';

/**
 * @param {string} imageKey — имя файла из game/enemy-images.js (например "dron.jpg")
 * @param {object} deps — { vkToken, store, baseUrl, apiUrl? }
 * @returns {Promise<string|null>} attachment-строка "photo{owner}_{id}" либо null, если что-то пошло не так
 */
async function resolveEnemyImage(imageKey, { vkToken, store, baseUrl, apiUrl = 'https://api.vk.com/method' }) {
  if (!imageKey) return null;

  const cacheKey = `${CACHE_PREFIX}${imageKey}`;
  try {
    const cached = await store.get(cacheKey);
    if (cached) return cached;
  } catch {
    // кэш недоступен — не критично, просто загрузим заново
  }

  try {
    const attachment = await uploadPhoto(imageKey, { vkToken, baseUrl, apiUrl });
    if (attachment) {
      try { await store.set(cacheKey, attachment); } catch { /* кэш недоступен — не критично */ }
    }
    return attachment;
  } catch (err) {
    console.error(`resolveEnemyImage: не удалось загрузить ${imageKey}:`, err.message);
    return null;
  }
}

async function uploadPhoto(imageKey, { vkToken, baseUrl, apiUrl }) {
  // 1. Получаем адрес для загрузки
  const serverParams = new URLSearchParams({ access_token: vkToken, v: VK_API_VERSION, peer_id: '0' });
  const serverRes = await fetch(`${apiUrl}/photos.getMessagesUploadServer?${serverParams}`);
  const serverData = await serverRes.json();
  if (serverData.error) throw new Error(`photos.getMessagesUploadServer: ${serverData.error.error_msg}`);
  const uploadUrl = serverData.response.upload_url;

  // 2. Скачиваем саму картинку с нашего же статического хостинга
  const imgRes = await fetch(`${baseUrl}/enemies/${imageKey}`);
  if (!imgRes.ok) throw new Error(`Картинка ${imageKey} не найдена по адресу ${baseUrl}/enemies/${imageKey}`);
  const imgBlob = await imgRes.blob();

  // 3. Заливаем на сервер загрузки ВК
  const form = new FormData();
  form.append('photo', imgBlob, imageKey);
  const uploadRes = await fetch(uploadUrl, { method: 'POST', body: form });
  const uploadData = await uploadRes.json();
  if (!uploadData.photo || uploadData.photo === '[]') throw new Error('ВК не принял загруженный файл');

  // 4. Сохраняем как фото для сообщений — получаем постоянный id
  const saveParams = new URLSearchParams({
    access_token: vkToken, v: VK_API_VERSION,
    server: String(uploadData.server), photo: uploadData.photo, hash: uploadData.hash
  });
  const saveRes = await fetch(`${apiUrl}/photos.saveMessagesPhoto?${saveParams}`, { method: 'POST' });
  const saveData = await saveRes.json();
  if (saveData.error) throw new Error(`photos.saveMessagesPhoto: ${saveData.error.error_msg}`);

  const photo = saveData.response[0];
  return `photo${photo.owner_id}_${photo.id}`;
}

module.exports = { resolveEnemyImage, uploadPhoto };
