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
    async expire(key, seconds) {
      return execute(['EXPIRE', key, String(seconds)]);
    },
    async setnx(key, value) {
      return execute(['SETNX', key, value]);
    },
    async hget(key, field) {
      return execute(['HGET', key, field]);
    },
    async hset(key, fieldValues) {
      const args = [];
      for (const [field, value] of Object.entries(fieldValues)) {
        args.push(field, String(value));
      }
      return execute(['HSET', key, ...args]);
    },
    async hdel(key, field) {
      return execute(['HDEL', key, field]);
    },
    async hlen(key) {
      return execute(['HLEN', key]);
    },
    async lpush(key, value) {
      return execute(['LPUSH', key, value]);
    },
    async lrange(key, start, stop) {
      return execute(['LRANGE', key, String(start), String(stop)]);
    },
    async ltrim(key, start, stop) {
      return execute(['LTRIM', key, String(start), String(stop)]);
    },
    async zadd(key, { score, member }) {
      return execute(['ZADD', key, String(score), String(member)]);
    },
    async zrem(key, member) {
      return execute(['ZREM', key, String(member)]);
    },
    async zrange(key, start, stop, { rev, withScores } = {}) {
      const cmd = [rev ? 'ZREVRANGE' : 'ZRANGE', key, String(start), String(stop)];
      if (withScores) cmd.push('WITHSCORES');
      return execute(cmd);
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
    async hincrby(key, field, delta) {
      return execute(['HINCRBY', key, field, String(delta)]);
    },
    async hgetall(key) {
      const flat = await execute(['HGETALL', key]);
      if (!flat) return {};
      const obj = {};
      for (let i = 0; i < flat.length; i += 2) {
        obj[flat[i]] = flat[i + 1];
      }
      return obj;
    },
    async eval(script, keys, args) {
      return execute(['EVAL', script, String(keys.length), ...keys, ...args]);
    },
  };
}

module.exports = { createUpstashRedisClient };
