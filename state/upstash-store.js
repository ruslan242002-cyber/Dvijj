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
    if (!res.ok) throw new Error(`Upstash request failed: ${res.status}`);
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
      await execute(['SET', key(userId), JSON.stringify(state)]);
    }
  };
}

module.exports = { upstashStore };
