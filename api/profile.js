
/**
 * Путь: api/profile.js -> https://ваш-проект.vercel.app/api/profile
 * Вызывается со страницы public/profile.html через fetch — тот же домен,
 * поэтому CORS не нужен. Требует переменную окружения PROFILE_TOKEN_SECRET
 * (та же, что используется при генерации ссылки в api/vk.js).
 */
'use strict';
const { handleProfileRequest } = require('../lib/profile-handler.js');
const { upstashStore } = require('../state/upstash-store.js');

module.exports = async (req, res) => {
  const token = (req.query && req.query.token) || (req.body && req.body.token);

  try {
    const result = await handleProfileRequest(
      { method: req.method, token, body: req.body },
      { store: upstashStore(), secret: process.env.PROFILE_TOKEN_SECRET }
    );
    res.status(result.status).json(result.json);
  } catch (err) {
    console.error('profile handler error:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
  }
};
