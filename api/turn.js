/**
 * ВАЖНО: этот файл должен лежать по пути  api/turn.js  от КОРНЯ репозитория.
 * Vercel превращает его в адрес:  https://ваш-проект.vercel.app/api/turn
 * Ничего внутри менять не нужно.
 */
'use strict';
const { handleTurn } = require('../webhook/handler.js');

module.exports = (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Используйте POST' });
    return;
  }
  const result = handleTurn(req.body || {});
  res.status(200).json(result);
};
