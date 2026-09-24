'use strict';

/**
 * VK ЖЁСТКО ОГРАНИЧИВАЕТ подпись кнопки 40 символами (vk/client.js уже
 * страхуется через .slice(0,40) на отправке — так что длинные подписи
 * не падают с ошибкой, а молча обрезаются клиентом с многоточием, что
 * и заметил пользователь). Это платформенный лимит, не настройка,
 * "раздвинуть" его нельзя — единственный честный способ решить это,
 * не теряя смысл: короткая подпись на самой кнопке + полный текст
 * варианта пронумерован в теле сообщения над кнопками.
 *
 * ⚠️ ПО ПРЯМОМУ ЗАПРОСУ ПОЛЬЗОВАТЕЛЯ — системное решение на уровне
 * рендеринга (named-character.js), а не переписывание вручную каждой
 * из 111+ существующих длинных реплик по отдельности.
 */
const MAX_BUTTON_LEN = 40;

/** Достаёт ведущий эмодзи (с возможным вариационным селектором и
 * пробелом после) — часть подписи, которую всегда сохраняем целиком. */
function leadingEmoji(text) {
  const m = text.match(/^(\p{Extended_Pictographic}\uFE0F?\s*)/u);
  return m ? m[1] : '';
}

/** Короткая версия текста под лимит VK — режет по границе слова, не
 * по символу, эмодзи в начале сохраняет всегда. Без "..." — сама
 * причина фикса была в незаметно обрезанном тексте, плодить то же
 * самое многоточие в новом месте было бы бессмысленно. */
function shortButtonLabel(text, maxLen = MAX_BUTTON_LEN) {
  if (text.length <= maxLen) return text;
  const emoji = leadingEmoji(text);
  const rest = text.slice(emoji.length);
  const budget = maxLen - emoji.length;
  let cut = rest.slice(0, budget);
  const lastSpace = cut.lastIndexOf(' ');
  if (lastSpace > budget * 0.4) cut = cut.slice(0, lastSpace);
  return (emoji + cut).trimEnd();
}

/** Строит и подписи кнопок, и (если хоть одна подпись была урезана)
 * пронумерованный список полных вариантов для тела сообщения — иначе
 * пустую строку, чтобы не захламлять короткие меню номерами зря. */
function buildChoiceDisplay(choices) {
  const buttons = choices.map((c) => shortButtonLabel(c.text));
  const anyShortened = choices.some((c) => c.text.length > MAX_BUTTON_LEN);
  const optionsList = anyShortened
    ? '\n\n' + choices.map((c, i) => `${i + 1}. ${c.text}`).join('\n')
    : '';
  return { buttons, optionsList };
}

module.exports = { MAX_BUTTON_LEN, shortButtonLabel, buildChoiceDisplay };
