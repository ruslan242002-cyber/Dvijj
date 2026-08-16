'use strict';

const crypto = require('crypto');

/**
 * ПРОВЕРКА LAUNCH PARAMS VK MINI APP — раньше verifyLaunchParams() проверяла
 * только наличие vk_user_id, вообще не глядя на sign/secret. Это значило,
 * что /api/profile можно было вызвать с ЛЮБЫМ vk_user_id без какого-либо
 * доказательства, что запрос реально пришёл из открытого в VK Mini App —
 * то есть чтение/изменение чужого персонажа (allocateStat/setEquippedSkills)
 * было доступно кому угодно, кто просто знал/подобрал числовой id.
 *
 * Теперь: настоящая проверка подписи по документированному алгоритму VK
 * (sign_check): берём все vk_*-параметры (кроме sign), сортируем по ключу,
 * склеиваем в query-string, считаем HMAC-SHA256 секретом Mini App, кодируем
 * base64url без padding — сравниваем с параметром sign константным по
 * времени сравнением (защита от timing-атак).
 *
 * Плюс проверка свежести vk_ts — подписанная ссылка не должна работать
 * вечно, если случайно "утечёт" (скриншот, лог, история браузера).
 */

const MAX_LAUNCH_AGE_MS = 24 * 60 * 60 * 1000; // 24 часа — подписанные launch params считаются просроченными позже этого

function parseLaunchParams(raw) {
    return Object.fromEntries(new URLSearchParams(raw));
}

function computeSign(parsed, secret) {
    const vkParams = Object.keys(parsed)
        .filter((key) => key.startsWith('vk_'))
        .sort()
        .map((key) => `${key}=${parsed[key]}`)
        .join('&');
    return crypto
        .createHmac('sha256', secret)
        .update(vkParams)
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

/** Возвращает true только если подпись реально совпадает И launch params не старше MAX_LAUNCH_AGE_MS. */
function verifyLaunchParams(parsed, secret) {
    if (!parsed || !secret) return false;
    if (!parsed.vk_user_id || !parsed.sign) return false;

    const expectedSign = computeSign(parsed, secret);
    if (!timingSafeEqual(expectedSign, parsed.sign)) return false;

    const ts = Number(parsed.vk_ts);
    if (!Number.isFinite(ts)) return false;
    const ageMs = Date.now() - ts * 1000;
    if (ageMs < 0 || ageMs > MAX_LAUNCH_AGE_MS) return false;

    return true;
}

function getUserId(parsed) {
    return parsed.vk_user_id;
}

module.exports = { parseLaunchParams, verifyLaunchParams, getUserId, MAX_LAUNCH_AGE_MS };
