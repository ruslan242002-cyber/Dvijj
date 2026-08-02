'use strict';

/**
 * ЖУРНАЛ ПИЛОТА — записи ключевых моментов жизни персонажа. Не декорация:
 * питает сага-генератор (lib/saga-generator.js) и искажается при высоком
 * заражении Бездной (уже существующий player.abyssCorruption, не новый
 * параллельный счётчик — искажение реальности вписывается ровно в то,
 * что Бездна и так делает с игроком по лору).
 */

const CORRUPTION_THRESHOLD_FOR_DISTORTION = 75; // порог abyssCorruption, после которого записи начинают искажаться
const DISTORTION_CHANCE = 0.3;

function addLogEntry(player, entryId, text) {
  player.logbook = player.logbook || [];
  if (player.logbook.some((e) => e.id === entryId)) return false; // уже записано — не дублируем
  player.logbook.push({ id: entryId, text, date: Date.now(), corrupted: false });
  return true;
}

/** Простое, предсказуемое искажение текста — не случайный набор символов
 * (это бы читалось как баг, не как лор), а конкретная подмена: последнее
 * предложение заменяется на короткую тревожную вставку. */
function distortText(text) {
  const sentences = text.split(/(?<=[.!?])\s+/);
  if (sentences.length <= 1) return `${text} …или нет. Я не уверен(а), что помню это правильно.`;
  sentences[sentences.length - 1] = 'Или было не так. Уже не разобрать.';
  return sentences.join(' ');
}

/** Вызывать при значимом росте заражения Бездной (см. lib/abyss-corruption.js:
 * useAbyssTech) — не каждую запись искажает разом, у каждой свой шанс,
 * чтобы журнал искажался постепенно, а не весь одномоментно. */
function maybeCorruptLogbook(player, rng = Math.random) {
  if (!player.logbook || (player.abyssCorruption || 0) < CORRUPTION_THRESHOLD_FOR_DISTORTION) return player;
  let corruptedCount = 0;
  player.logbook = player.logbook.map((entry) => {
    if (entry.corrupted || rng() >= DISTORTION_CHANCE) return entry;
    corruptedCount += 1;
    return { ...entry, text: distortText(entry.text), corrupted: true };
  });
  return { player, corruptedCount };
}

module.exports = { CORRUPTION_THRESHOLD_FOR_DISTORTION, addLogEntry, distortText, maybeCorruptLogbook };
