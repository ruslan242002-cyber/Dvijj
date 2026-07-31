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
 * https://ваш-домен/<путь>/файл.jpg — то есть с уже задеплоенного
 * статического хостинга Vercel, что надёжнее.
 *
 * ИСПРАВЛЕНО: раньше путь на Vercel был жёстко зашит как "/enemies/..."
 * независимо от того, что реально лежит в imageKey. Для врагов imageKey —
 * голое имя файла ('graviarh.jpg'), и это совпадало с /enemies/ случайно.
 * Но imageForLocation()/imageForCurator() возвращают imageKey уже СО своей
 * папкой ('locations/priyut-shtab.jpg', 'curators/curator-iris-veyl.jpg') —
 * и старый код всё равно лепил их под /enemies/, получая несуществующий
 * путь. Теперь: если в imageKey уже есть "/", используем его как путь
 * как есть; если нет (голое имя — случай врагов) — добавляем "enemies/".
 */
'use strict';

const VK_API_VERSION = '5.199';
const CACHE_PREFIX = 'vk:photo:';

/**
 * @param {string} imageKey — либо голое имя файла врага ("dron.jpg"),
 *   либо путь с папкой ("locations/priyut-shtab.jpg", "curators/curator-shyopot.jpg")
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

/** Путь на статическом хостинге для конкретного imageKey — см. заметку
 * "ИСПРАВЛЕНО" в шапке файла. */
function staticPathFor(imageKey) {
  return imageKey.includes('/') ? imageKey : `enemies/${imageKey}`;
}

async function uploadPhoto(imageKey, { vkToken, baseUrl, apiUrl }) {
  const path = staticPathFor(imageKey);

  // 1. Получаем адрес для загрузки
  const serverParams = new URLSearchParams({ access_token: vkToken, v: VK_API_VERSION, peer_id: '0' });
  const serverRes = await fetch(`${apiUrl}/photos.getMessagesUploadServer?${serverParams}`);
  const serverData = await serverRes.json();
  if (serverData.error) throw new Error(`photos.getMessagesUploadServer: ${serverData.error.error_msg}`);
  const uploadUrl = serverData.response.upload_url;

  // 2. Скачиваем саму картинку с нашего же статического хостинга
  const imgRes = await fetch(`${baseUrl}/${path}`);
  if (!imgRes.ok) throw new Error(`Картинка ${imageKey} не найдена по адресу ${baseUrl}/${path}`);
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
