'use strict';
/**
* ЕЖЕНЕДЕЛЬНЫЙ РЕЙТИНГ ПО СТАНЦИИ — общий мир, не player-owned. Три
* отдельных зачёта (kills/level/credits), каждый — свой Redis sorted set
* (ZADD/ZREVRANGE), ключ включает номер недели, поэтому сброс происходит
* сам собой — новая неделя начинает пустой набор ключей, старые просто
* больше не читаются (можно чистить их отдельным TTL, не обязательно
* для корректности рейтинга).
*
* НЕ читает и не пишет player-объект — вызывающий код (router.js/сцена)
* сам решает, когда обновлять счётчик (после боя/после левелапа/после
* начисления кредитов), передавая актуальное значение сюда.
*/
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
function weekNumber(now = Date.now()) {
return Math.floor(now / WEEK_MS);
}
function leaderboardKey(faction, metric, now = Date.now()) {
return `leaderboard:${faction}:${metric}:${weekNumber(now)}`;
}
const METRICS = ['kills', 'level', 'credits'];
function makeLeaderboardStore(redis) {
return {
/** Обновляет позицию игрока в рейтинге станции по метрике — ZADD сам
* перезаписывает старое значение того же playerId, так что можно
* звать на каждое изменение без риска задвоения записей. */
async updateScore(faction, metric, playerId, playerName, score) {
if (!METRICS.includes(metric)) return;
const key = leaderboardKey(faction, metric);
await redis.zadd(key, { score, member: `${playerId}:${playerName}` });
},
/** Топ-N за текущую неделю по конкретной метрике конкретной станции. */
async getTop(faction, metric, limit = 10, now = Date.now()) {
if (!METRICS.includes(metric)) return [];
const key = leaderboardKey(faction, metric, now);
const raw = await redis.zrange(key, 0, limit - 1, { rev: true, withScores: true });
// @upstash/redis отдаёт плоский массив [member, score, member, score, ...]
const entries = [];
for (let i = 0; i < raw.length; i += 2) {
const [, name] = String(raw[i]).split(':');
entries.push({ name: name || raw[i], score: Number(raw[i + 1]) });
}
return entries;
},
};
}
function formatLeaderboard(entries, metricLabel) {
if (!entries.length) return `Рейтинг по «${metricLabel}» пока пуст.`;
const lines = entries.map((e, i) => `${i + 1}. ${e.name} — ${e.score}`);
return ` РЕЙТИНГ СТАНЦИИ ЗА НЕДЕЛЮ (${metricLabel})\n\n${lines.join('\n')}`;
}
module.exports = { makeLeaderboardStore, formatLeaderboard, weekNumber, leaderboardKey, METRICS };
