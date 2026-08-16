'use strict';

/**
 * АУДИТ-ЛОГ ЭКОНОМИКИ — без этого невозможно ответить на вопрос "откуда
 * взялась дыра в экономике" постфактум, только гадать. Каждое движение
 * кредитов/ресурсов пишется одной строкой в общий журнал (Redis list,
 * LPUSH — новые события первыми). Список подрезается до
 * MAX_LOG_ENTRIES, чтобы не расти бесконечно — это диагностический
 * инструмент за последние дни, не архив на все времена.
 *
 * НЕ блокирует и не может сломать основной поток — logEconomyEvent
 * оборачивает запись в try/catch и молча проглатывает ошибку сама.
 * Причина: если Redis временно недоступен именно в момент записи лога,
 * это не повод отменять реальную покупку/крафт/донат игроку — аудит
 * вторичен по отношению к самой игре.
 *
 * ИНТЕГРАЦИЯ — вызывать logEconomyEvent() рядом с местом, где реально
 * меняются player.credits/player.inventory, а не централизованно
 * откуда-то снаружи (иначе легко пропустить путь, где изменение
 * произошло). Уже размеченные точки (см. EVENT_TYPES) покрывают:
 * находки/лут, крафт, покупки/продажи на бирже, донаты в гильдию,
 * награды с боссов и торговых маршрутов — этого достаточно для базовой
 * KPI-таблицы (Credits Generated/Day, Credits Destroyed/Day и т.п.),
 * которую MMO-обзор называл обязательной ДО новых систем.
 */

const AUDIT_KEY = 'economy:audit';
const MAX_LOG_ENTRIES = 20000;

const EVENT_TYPES = {
  LOOT_CREDITS: 'loot_credits',
  LOOT_RESOURCE: 'loot_resource',
  CRAFT_SPEND: 'craft_spend',
  MARKET_BUY: 'market_buy',
  MARKET_SELL: 'market_sell',
  GUILD_DONATE: 'guild_donate',
  GUILD_WITHDRAW: 'guild_withdraw',
  GUILD_UPGRADE_SPEND: 'guild_upgrade_spend',
  BOSS_REWARD: 'boss_reward',
  TRADE_ROUTE_REWARD: 'trade_route_reward',
  CONTRACT_REWARD: 'contract_reward',
  HOUSING_SPEND: 'housing_spend',
  SHIP_REPAIR: 'ship_repair',
};

/**
 * event — { type, playerId, credits?, resource?, tier?, qty?, note? }.
 * credits: положительное = приход игроку, отрицательное = списание.
 * Не передавай итоговый баланс сюда — баланс читается отдельно, если
 * нужен, это не задача аудит-лога дублировать player state.
 */
async function logEconomyEvent(deps, event) {
  if (!deps || !deps.redis) return; // деградирует тихо — см. шапку файла
  try {
    const entry = JSON.stringify({ ...event, ts: Date.now() });
    await deps.redis.lpush(AUDIT_KEY, entry);
    await deps.redis.ltrim(AUDIT_KEY, 0, MAX_LOG_ENTRIES - 1);
  } catch (err) {
    // намеренно проглатываем — см. пояснение в шапке файла
  }
}

/** Последние N событий, самые новые первыми. */
async function getRecentEconomyEvents(deps, limit = 200) {
  if (!deps || !deps.redis) return [];
  try {
    const raw = await deps.redis.lrange(AUDIT_KEY, 0, limit - 1);
    return raw.map((r) => JSON.parse(r));
  } catch (err) {
    return [];
  }
}

/**
 * Простой KPI-срез за события, уже загруженные в память (getRecentEconomyEvents
 * или отдельная выгрузка) — считает Credits Generated/Destroyed и топ
 * ресурсов. Не ходит в Redis сама, работает над готовым массивом — так
 * её можно применить и к 200 последним событиям, и к экспорту побольше.
 */
function summarizeEconomyEvents(events) {
  let creditsGenerated = 0;
  let creditsDestroyed = 0;
  const resourceGenerated = {};
  const resourceDestroyed = {};

  for (const e of events) {
    if (typeof e.credits === 'number') {
      if (e.credits > 0) creditsGenerated += e.credits;
      else creditsDestroyed += Math.abs(e.credits);
    }
    if (typeof e.qty === 'number' && e.resource) {
      const bucket = e.qty > 0 ? resourceGenerated : resourceDestroyed;
      bucket[e.resource] = (bucket[e.resource] || 0) + Math.abs(e.qty);
    }
  }

  return { creditsGenerated, creditsDestroyed, netCredits: creditsGenerated - creditsDestroyed, resourceGenerated, resourceDestroyed, sampleSize: events.length };
}

module.exports = { EVENT_TYPES, logEconomyEvent, getRecentEconomyEvents, summarizeEconomyEvents, AUDIT_KEY, MAX_LOG_ENTRIES };
