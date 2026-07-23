/**
 * ВАЖНО: этот файл должен лежать по пути  api/explore.js  от КОРНЯ репозитория.
 * Vercel превращает его в адрес:  https://ваш-проект.vercel.app/api/explore
 * Ничего внутри менять не нужно.
 */
'use strict';
const { handleExplore } = require('../webhook/handler.js');

module.exports = (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Используйте POST' });
    return;
  }
  const result = handleExplore(req.body || {});
  res.status(200).json(result);
};
