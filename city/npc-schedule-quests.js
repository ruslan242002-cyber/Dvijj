'use strict';
/**
* КВЕСТЫ ПО РАСПИСАНИЮ NPC — по разбору Kimi. Раньше `schedule` в
* city/npc-roster.js был чистым флейвором (что NPC делает в разное
* время суток), без единой механики поверх. Здесь — по одному квесту
* на каждого из 16 NPC, привязанному к конкретному слоту их же
* расписания (не рандомно — прямо из того, чем они заняты в этот
* момент по roster.js).
*
* Формат объекта — совместим с game/quests-data.js (id/title/text/
* objective/reward), плюс npc и slot для гейта показа: квест доступен
* к получению, только когда игрок посещает станцию этого NPC в
* соответствующий слот расписания (morning/day/evening/night — те же
* ключи, что в STATION_SHIFTS/schedule). objective использует те же
* типы, что и обычная доска (deliver/kill/explore) — objectiveMet()/
* progressText() из quests-data.js работают с ними без изменений.
*
* Интеграция (не сделана здесь, только формат данных): city-engine.js
* или сцена станции при определении текущего слота смены должна
* проверить, есть ли для NPC в этом слоте квест из NPC_SCHEDULE_QUESTS,
* которого ещё нет в player.completedQuests/player.activeScheduleQuests,
* и предложить его как отдельную кнопку у этого NPC.
*/
const NPC_SCHEDULE_QUESTS = [
// ── Приют ──
{ id: 'sq_iris_morning', npc: 'iris_veyl', slot: 'morning', city: 'Приют', minLevel: 1,
title: 'Обход медотсека',
text: 'Ирис Вейл, во время утреннего обхода: «Пока я на обходе — сгоняй за Сплавами, обшивка коек трещит второй месяц».',
objective: { type: 'deliver', resource: 'Сплавы', tier: 1, qty: 4 },
reward: { xp: 25, credits: 30 } },
{ id: 'sq_dorn_morning', npc: 'tehnik_dorn', slot: 'morning', city: 'Приют', minLevel: 1,
title: 'Калибровка декон-камеры',
text: 'Техник Дорн, калибруя декон-камеру: «После ночной смены она сбоит. Принеси Полимеры — заткну щель, пока не рвануло».',
objective: { type: 'deliver', resource: 'Полимеры', tier: 1, qty: 5 },
reward: { xp: 25, credits: 35 } },
{ id: 'sq_mira_night', npc: 'sestra_mira', slot: 'night', city: 'Приют', minLevel: 3,
title: 'Ночное дежурство',
text: 'Сестра Мира, тихо, у койки тяжёлого пациента: «Не шуми. Если хочешь помочь — принеси Биомассу, регенераторам скоро конец».',
objective: { type: 'deliver', resource: 'Биомасса', tier: 1, qty: 6 },
reward: { xp: 30, credits: 25 } },
{ id: 'sq_ansel_day', npc: 'bezhenec', slot: 'day', city: 'Приют', minLevel: 2,
title: 'Взгляд на Тракт',
text: 'Ансель Кроу, глядя в иллюминатор на Тракт: «Слетай в спорный сектор. Не за добычей — просто скажи мне, что там видно. Мне нужно знать, что снаружи ещё что-то есть».',
objective: { type: 'explore', zone: 'yellow', count: 2 },
reward: { xp: 35, credits: 20 } },

// ── Терминус ──
{ id: 'sq_ilva_morning', npc: 'serzhant_ilva', slot: 'morning', city: 'Терминус', minLevel: 4,
title: 'Построение перед выходом',
text: 'Сержант Илва, строя смену: «Раз уж ты тут — зачисти патрулируемый сектор до обеда. Покажи, на что годишься».',
objective: { type: 'kill', count: 4 },
reward: { xp: 40, credits: 50 } },
{ id: 'sq_brok_morning', npc: 'mehanik_brok', slot: 'morning', city: 'Терминус', minLevel: 3,
title: 'Осмотр брони после вылазок',
text: 'Механик Брок, осматривая пробитую броню: «Тащи Реголит — заплатки сами себя не наварят».',
objective: { type: 'deliver', resource: 'Реголит', tier: 1, qty: 6 },
reward: { xp: 30, credits: 40 } },
{ id: 'sq_tayler_evening', npc: 'novobranets', slot: 'evening', city: 'Терминус', minLevel: 2,
title: 'Байки бывалых',
text: 'Новобранец Тайлер, немного привирая: «Говорят, в жёлтой зоне видели что-то странное. Слетай, проверь — а то надо мной опять смеются, что я всему верю».',
objective: { type: 'explore', zone: 'yellow', count: 3 },
reward: { xp: 35, credits: 30 } },
{ id: 'sq_shyopot_night', npc: 'shyopot', slot: 'night', city: 'Терминус', minLevel: 8,
title: 'Тракт звучит честнее',
text: 'Шёпот, не оборачиваясь: «Ночью аномалии не лгут так, как днём. Иди в открытый космос и слушай — я скажу, если услышу то же самое отсюда».',
objective: { type: 'explore', zone: 'red', count: 2 },
reward: { xp: 60, credits: 40 } },

// ── Арсенал ──
{ id: 'sq_oksa_evening', npc: 'ren_oksa', slot: 'evening', city: 'Арсенал', minLevel: 5,
title: 'Задание на зачистку',
text: 'Рен Окса, раздавая задания: «Открытый космос кишит Отголосками. Разберись с тремя — и не экономь боеприпасы, они тут не в дефиците».',
objective: { type: 'kill', count: 3 },
reward: { xp: 45, credits: 60 } },
{ id: 'sq_tark_day', npc: 'oruzheynik_tark', slot: 'day', city: 'Арсенал', minLevel: 6,
title: 'Испытание на прочность',
text: 'Оружейник Тарк, протягивая откалиброванное оружие: «Хочу проверить его не на мишени, а на чём-то живом. Найди именного монстра и покажи, как оно бьёт».',
objective: { type: 'kill', count: 1 },
reward: { xp: 55, credits: 70 } },
{ id: 'sq_niya_night', npc: 'razvedchica_niya', slot: 'night', city: 'Арсенал', minLevel: 4,
title: 'Тихая разведка',
text: 'Разведчица Ния, собираясь незаметно: «Идёшь со мной — точнее, за мной. Пройди спорный сектор, пока я его картографирую с другой стороны».',
objective: { type: 'explore', zone: 'yellow', count: 3 },
reward: { xp: 40, credits: 45 } },
{ id: 'sq_deo_night', npc: 'kontrabandist', slot: 'night', city: 'Арсенал', minLevel: 5,
title: 'Товар для сделки',
text: 'Део «Тень», не глядя в глаза: «Сделки любят темноту, а мне нужен товар. Принеси Изотопы — вопросов не задаю, и ты не задавай».',
objective: { type: 'deliver', resource: 'Изотопы', tier: 2, qty: 5 },
reward: { xp: 35, credits: 80 } },

// ── Вуаль ──
{ id: 'sq_kes_evening', npc: 'osvedomitel_kes', slot: 'evening', city: 'Вуаль', minLevel: 3,
title: 'Слухи для доклада',
text: 'Осведомитель Кес, сортируя слухи: «Мне нужно что-то свежее для доклада Шёпоту. Слетай в спорный сектор — там что-нибудь да найдётся».',
objective: { type: 'explore', zone: 'yellow', count: 3 },
reward: { xp: 30, credits: 50 } },
{ id: 'sq_ryu_night', npc: 'analitik_ryu', slot: 'night', city: 'Вуаль', minLevel: 6,
title: 'Расшифровка ночного улова',
text: 'Аналитик Рю, не отрываясь от осциллографа: «Принеси мне Изотопы для калибровки анализатора — паттерн вот-вот сложится, я чувствую».',
objective: { type: 'deliver', resource: 'Изотопы', tier: 1, qty: 6 },
reward: { xp: 40, credits: 35 } },
{ id: 'sq_oren_evening', npc: 'slushatel', slot: 'evening', city: 'Вуаль', minLevel: 10,
title: 'Одна фраза за день',
text: 'Слушатель Орен, не оборачиваясь, произносит одну фразу: «Красная зона. Иди и послушай сам». Больше он сегодня не скажет ни слова.',
objective: { type: 'explore', zone: 'red', count: 1 },
reward: { xp: 70, credits: 20 } },
{ id: 'sq_keyn_night', npc: 'drogo_keyn', slot: 'night', city: 'Вуаль', minLevel: 7,
title: 'У мемориальной стены',
text: 'Дрого Кейн, каждую ночь у стены с именами: «Ещё один сектор, где мы потеряли людей. Зачисти его — не ради награды, ради них».',
objective: { type: 'kill', count: 5 },
reward: { xp: 50, credits: 55 } },
];
module.exports = { NPC_SCHEDULE_QUESTS };
