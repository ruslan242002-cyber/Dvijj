'use strict';

function createUpstashRedisClient({ url, token } = {}) {
  const baseUrl = url || process.env.UPSTASH_REDIS_REST_URL;
  const authToken = token || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!baseUrl || !authToken) {
    throw new Error(
      'createUpstashRedisClient: нужны UPSTASH_REDIS_REST_URL и UPSTASH_REDIS_REST_TOKEN ' +
      '(переменные окружения в Vercel или параметры вызова).'
    );
  }

  const headers = { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' };

  async function execute(commandArray) {
    const res = await fetch(baseUrl, { method: 'POST', headers, body: JSON.stringify(commandArray) });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Upstash request failed: ${res.status} ${errText}`);
    }
    const data = await res.json();
    if (data.error) throw new Error(`Upstash error: ${data.error}`);
    return data.result;
  }

  return {
    async get(key) {
      return execute(['GET', key]);
    },
    async set(key, value) {
      return execute(['SET', key, value]);
    },
    async del(key) {
      return execute(['DEL', key]);
    },
    async zadd(key, { score, member }) {
      return execute(['ZADD', key, String(score), String(member)]);
    },
    async zrem(key, member) {
      return execute(['ZREM', key, String(member)]);
    },
    async zrange(key, start, stop, { rev } = {}) {
      return execute([rev ? 'ZREVRANGE' : 'ZRANGE', key, String(start), String(stop)]);
    },
    async sadd(key, member) {
      return execute(['SADD', key, String(member)]);
    },
    async srem(key, member) {
      return execute(['SREM', key, String(member)]);
    },
    async smembers(key) {
      return execute(['SMEMBERS', key]);
    },
    async incrby(key, delta) {
      return execute(['INCRBY', key, String(delta)]);
    },
    async eval(script, keys, args) {
      return execute(['EVAL', script, String(keys.length), ...keys, ...args]);
    },
  };
}

module.exports = { createUpstashRedisClient };
