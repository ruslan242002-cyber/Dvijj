/**
 * Продакшен-хранилище состояния игрока поверх Upstash Redis (REST API,
 * без SDK — обычный fetch, чтобы не тащить зависимости).
 *
 * Как завести (бесплатно, ~5 минут):
 *   1. upstash.com → Sign up (можно через GitHub)
 *   2. Create Database → любой регион → Create
 *   3. На странице базы — вкладка "REST API": скопируйте UPSTASH_REDIS_REST_URL
 *      и UPSTASH_REDIS_REST_TOKEN
 *   4. В Vercel: Project → Settings → Environment Variables — вставьте эти
 *      два значения под теми же именами
 *
 * Значение (JSON состояния игрока) отправляется в ТЕЛЕ POST-запроса
 * командой вида ["SET", "ключ", "значение"], а не встраивается в URL —
 * это официально рекомендованный Upstash способ именно для длинных или
 * "сложных" значений (JSON, спецсимволы), URL-путь для этого не годится.
 */
'use strict';

function upstashStore({ url, token } = {}) {
  const baseUrl = url || process.env.UPSTASH_REDIS_REST_URL;
  const authToken = token || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!baseUrl || !authToken) {
    throw new Error(
      'upstashStore: нужны UPSTASH_REDIS_REST_URL и UPSTASH_REDIS_REST_TOKEN ' +
      '(переменные окружения в Vercel или параметры вызова).'
    );
  }

  const headers = { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' };
  const key = (userId) => `periferia:player:${userId}`;

  async function execute(commandArray) {
    const res = await fetch(baseUrl, { method: 'POST', headers, body: JSON.stringify(commandArray) });
    if (!res.ok) {
      // ВАЖНО: печатаем текст ответа Upstash, а не только код статуса —
      // голое "400" ничего не говорит о причине, а текст обычно прямо
      // называет, что не так (неверная команда, лимит размера и т.д.).
      const errText = await res.text().catch(() => '');
      throw new Error(`Upstash request failed: ${res.status} ${errText}`);
    }
    const data = await res.json();
    if (data.error) throw new Error(`Upstash error: ${data.error}`);
    return data.result;
  }

  return {
    async get(userId) {
      const result = await execute(['GET', key(userId)]);
      if (!result) return null;
      try { return JSON.parse(result); }
      catch { return null; }
    },
    async set(userId, state) {
      // Защита от записи "пустого" состояния: если state пришёл как
      // undefined/null (например, из-за забытого await где-то выше по
      // цепочке), JSON.stringify(undefined) даёт не строку, а буквально
      // undefined -> Upstash получает мусор и отвечает 400. Лучше упасть
      // здесь с понятной причиной, чем тихо записать null в Redis.
      if (state === undefined || state === null) {
        throw new Error(`upstashStore.set: state is ${state} for userId ${userId} — отказываюсь писать пустое состояние`);
      }
      await execute(['SET', key(userId), JSON.stringify(state)]);
    }
  };
}

module.exports = { upstashStore };
