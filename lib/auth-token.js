'use strict';

const crypto = require('crypto');

/**
 * ТОКЕН-ФОЛЛБЭК для resolvePeerId() в lib/profile-handler.js — используется,
 * когда launchParams недоступны. Раньше verify(token) просто возвращал сам
 * token, а sign(peerId) возвращал String(peerId) — то есть "токен" был
 * буквально открытым текстом peerId: любой мог отправить token=123456 и
 * получить доступ к профилю игрока 123456. Не было известно, для чего этот
 * путь реально нужен (не Mini App launchParams) — раз назначение неясно, а
 * старая реализация была форджируемой напрямую, самый безопасный выбор —
 * не убирать путь целиком (вдруг он всё же используется где-то), а сделать
 * его настоящим: сервер сам подписывает токен (после того как peerId уже
 * был подтверждён каким-то другим способом, например через verifyLaunchParams
 * один раз), клиент присылает этот токен дальше — подделать его без секрета
 * невозможно.
 *
 * Формат токена: `${peerId}.${expiresAtMs}.${hmacBase64url}`
 */

const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000; // 12 часов

function computeHmac(payload, secret) {
    return crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function timingSafeEqual(a, b) {
    const bufA = Buffer.from(String(a));
    const bufB = Buffer.from(String(b));
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
}

/** Выдаёт подписанный токен на peerId. Вызывать ТОЛЬКО после того, как peerId
 * уже подтверждён (например через verifyLaunchParams) — эта функция сама
 * ничью личность не проверяет, она просто подписывает то, что ей передали. */
function sign(peerId, secret, ttlMs = DEFAULT_TTL_MS) {
    if (!peerId || !secret) return null;
    const expiresAt = Date.now() + ttlMs;
    const payload = `${peerId}.${expiresAt}`;
    const hmac = computeHmac(payload, secret);
    return `${payload}.${hmac}`;
}

/** Возвращает peerId, если токен подписан этим secret'ом и ещё не истёк; иначе null. */
function verify(token, secret) {
    if (!token || !secret) return null;
    const parts = String(token).split('.');
    if (parts.length !== 3) return null;
    const [peerId, expiresAtStr, hmac] = parts;

    const expiresAt = Number(expiresAtStr);
    if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;

    const expectedHmac = computeHmac(`${peerId}.${expiresAtStr}`, secret);
    if (!timingSafeEqual(expectedHmac, hmac)) return null;

    return peerId;
}

module.exports = { sign, verify, DEFAULT_TTL_MS };
