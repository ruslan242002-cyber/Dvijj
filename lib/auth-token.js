
/**
 * Подписанные токены для персональной ссылки на профиль — без отдельной
 * таблицы сессий и без логина: бот один раз генерирует ссылку с токеном,
 * сайт проверяет подпись и по ней узнаёт, чей это профиль (VK peer_id).
 * Подделать токен без секрета (PROFILE_TOKEN_SECRET) невозможно —
 * это обычная HMAC-подпись, встроенный модуль crypto, без зависимостей.
 */
'use strict';
const crypto = require('crypto');

const DEFAULT_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30; // 30 дней

function sign(peerId, secret, now = Date.now()) {
  if (!secret) throw new Error('signToken: нужен секрет (PROFILE_TOKEN_SECRET).');
  const payload = `${peerId}.${now}`;
  const payloadB64 = Buffer.from(payload, 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
}

/** Возвращает peerId (строка) при валидном токене, иначе null. Ничего не бросает. */
function verify(token, secret, { maxAgeMs = DEFAULT_MAX_AGE_MS, now = Date.now() } = {}) {
  if (!secret || !token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;

  const expectedSig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;

  let payload;
  try { payload = Buffer.from(payloadB64, 'base64url').toString('utf8'); }
  catch { return null; }

  const dot = payload.lastIndexOf('.');
  if (dot === -1) return null;
  const peerId = payload.slice(0, dot);
  const ts = Number(payload.slice(dot + 1));
  if (!peerId || !Number.isFinite(ts)) return null;
  if (now - ts > maxAgeMs) return null;

  return peerId;
}

module.exports = { sign, verify, DEFAULT_MAX_AGE_MS };
