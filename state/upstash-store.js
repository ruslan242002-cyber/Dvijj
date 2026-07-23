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
 * Бесплатный тариф Upstash — 10 000 команд в сутки не завязанных на число
 * "сообщений" бота, а не 50/10000 сообщений как в конструкторах — этого
 * с большим запасом хватает на старте и растёт линейно за копейки, а не
 * скачками тарифных пакетов.
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

  const headers = { Authorization: `Bearer ${authToken}` };
  const key = (userId) => `periferia:player:${userId}`;

  return {
    async get(userId) {
      const res = await fetch(`${baseUrl}/get/${encodeURIComponent(key(userId))}`, { headers });
      if (!res.ok) throw new Error(`Upstash GET failed: ${res.status}`);
      const data = await res.json();
      if (!data.result) return null;
      try { return JSON.parse(data.result); }
      catch { return null; }
    },
    async set(userId, state) {
      const value = encodeURIComponent(JSON.stringify(state));
      const res = await fetch(`${baseUrl}/set/${encodeURIComponent(key(userId))}/${value}`, { headers });
      if (!res.ok) throw new Error(`Upstash SET failed: ${res.status}`);
    }
  };
}

module.exports = { upstashStore };
