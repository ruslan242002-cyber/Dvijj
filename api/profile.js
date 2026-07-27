/**
 * Путь: api/profile.js -> https://ваш-проект.vercel.app/api/profile
 * Вызывается со страницы public/profile.html через fetch — тот же домен,
 * поэтому CORS не нужен.
 *
 * Основной способ авторизации теперь — параметры запуска VK Mini App
 * (launch=... с сырой query-строкой vk_user_id/sign), проверяемые через
 * VK_MINI_APP_SECRET (секретный ключ именно мини-приложения, из его
 * настроек — НЕ путать с VK_GROUP_TOKEN или VK_CALLBACK_SECRET).
 * Старый token (подписанная ссылка) оставлен как запасной путь.
 */
'use strict';
const { handleProfileRequest } = require('../lib/profile-handler.js');
const { upstashStore } = require('../state/upstash-store.js');

module.exports = async (req, res) => {
  const token = (req.query && req.query.token) || (req.body && req.body.token);
  const launchParams = (req.query && req.query.launch) || (req.body && req.body.launchParams);

  try {
    const result = await handleProfileRequest(
      { method: req.method, token, launchParams, body: req.body },
      { store: upstashStore(), secret: process.env.PROFILE_TOKEN_SECRET, vkAppSecret: process.env.VK_MINI_APP_SECRET }
    );
    res.status(result.status).json(result.json);
  } catch (err) {
    console.error('profile handler error:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
};
