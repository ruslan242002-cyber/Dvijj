/**
 * Проверка параметров запуска VK Mini App (см. официальную схему ВК:
 * https://github.com/VKCOM/vk-apps-launch-params). ВК добавляет к URL
 * мини-приложения параметры вида vk_user_id, vk_app_id, ..., sign — и sign
 * это HMAC-SHA256 от отсортированных vk_-параметров на секретном ключе
 * приложения. Так сервер убеждается, что запрос действительно пришёл от ВК
 * и не подделан, без какого-либо отдельного логина.
 *
 * Секретный ключ мини-приложения — НЕ тот же токен, что VK_GROUP_TOKEN и
 * не тот же секрет, что VK_CALLBACK_SECRET. Это отдельное значение из
 * настроек именно Mini App (Настройки приложения → защищённый ключ).
 */
'use strict';
const crypto = require('crypto');

/** queryParams — обычный объект { vk_user_id: '123', sign: '...', ... } */
function verifyLaunchParams(queryParams, secret) {
  if (!secret || !queryParams || !queryParams.sign) return false;

  const vkKeys = Object.keys(queryParams).filter((k) => k.startsWith('vk_')).sort();
  if (vkKeys.length === 0) return false;

  const queryString = vkKeys.map((k) => `${k}=${queryParams[k]}`).join('&');
  const expected = crypto.createHmac('sha256', secret).update(queryString).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const sigBuf = Buffer.from(String(queryParams.sign));
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

/** Разбирает "сырую" query-строку (window.location.search без "?") в объект */
function parseLaunchParams(rawQueryString) {
  const params = {};
  if (!rawQueryString) return params;
  new URLSearchParams(rawQueryString).forEach((value, key) => { params[key] = value; });
  return params;
}

function getUserId(queryParams) {
  return queryParams && queryParams.vk_user_id ? String(queryParams.vk_user_id) : null;
}

module.exports = { verifyLaunchParams, parseLaunchParams, getUserId };
