'use strict';

/**
 * Референсная реализация store-интерфейса для guild-engine.js поверх
 * Upstash Redis — тот же паттерн, что market-store-upstash.js.
 *
 * Ключи:
 *     guild:{id}                          -> JSON гильдии (без списка участников)
 *     guild:name:{normalizedName}         -> id гильдии (лочит уникальность имени)
 *     guild:{id}:members                   -> hash: playerId -> role
 *     guild:member:{playerId}              -> id гильдии, в которой состоит игрок
 *     guild:{id}:bank:credits              -> атомарный ключ-счётчик
 *     guild:{id}:bank:resources            -> hash: "Ресурс:Тир" -> qty
 *     guild:{id}:upgradeLevel              -> атомарный ключ-счётчик (0..3, guild-levels.js)
 *
 * Требует @upstash/redis — тот же клиент, что уже используется в
 * upstash-store.js/market-store-upstash.js.
 */
function makeGuildStoreUpstash(redis) {
  return {
    async getGuild(guildId) {
      const raw = await redis.get(`guild:${guildId}`);
      return raw ? JSON.parse(raw) : null;
    },

    /** Найти id гильдии по имени — переиспользует тот же ключ
     *  guild:name:{name}, который уже пишется в createGuildAtomic для
     *  лока уникальности, отдельного индекса заводить не нужно. */
    async getGuildIdByName(name) {
      return redis.get(`guild:name:${name.toLowerCase()}`);
    },

    /** Создаёт гильдию и лидера атомарно: SETNX на имя (лочит
     *  уникальность), затем запись самой гильдии и hash участников.
     *  Если имя уже занято — SETNX проваливается. */
    async createGuildAtomic(guild, founderId, role) {
      const nameKey = `guild:name:${guild.name.toLowerCase()}`;
      const locked = await redis.setnx(nameKey, guild.id);
      if (!locked) { const err = new Error('NAME_TAKEN'); throw err; }
      await redis.set(`guild:${guild.id}`, JSON.stringify(guild));
      await redis.hset(`guild:${guild.id}:members`, { [founderId]: role });
      await redis.set(`guild:member:${founderId}`, guild.id);
      return { guild };
    },

    /** Добавляет участника, проверяя лимит внутри одной Lua-операции —
     *  иначе два игрока могли бы одновременно вступить в гильдию с 1
     *  свободным местом и оба пройти проверку "меньше лимита" до записи. */
    async addGuildMemberAtomic(guildId, playerId, role, maxMembers) {
      const script = `
local count = redis.call('HLEN', KEYS[1])
if tonumber(count) >= tonumber(ARGV[3]) then
  return redis.error_reply('GUILD_FULL')
end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
redis.call('SET', KEYS[2], ARGV[4])
return 'OK'
`;
      await redis.eval(script, [`guild:${guildId}:members`, `guild:member:${playerId}`], [playerId, role, maxMembers, guildId]);
    },

    async removeGuildMemberAtomic(guildId, playerId) {
      await redis.hdel(`guild:${guildId}:members`, playerId);
      await redis.del(`guild:member:${playerId}`);
    },

    async getGuildMemberRole(guildId, playerId) {
      return redis.hget(`guild:${guildId}:members`, playerId);
    },

    async setGuildMemberRole(guildId, playerId, role) {
      await redis.hset(`guild:${guildId}:members`, { [playerId]: role });
    },

    async getGuildMemberCount(guildId) {
      return redis.hlen(`guild:${guildId}:members`);
    },

    async addToGuildBankAtomic(guildId, amount) {
      return redis.incrby(`guild:${guildId}:bank:credits`, amount);
    },

    async getGuildBankCredits(guildId) {
      const raw = await redis.get(`guild:${guildId}:bank:credits`);
      return Number(raw) || 0;
    },

    /** Ресурсы банка — hash-поле per resource+tier (напр. "Изотопы:2" ->
     *  qty), один hash на гильдию, а не отдельный ключ на каждый вид. */
    async addToGuildBankResourceAtomic(guildId, resource, tier, qty) {
      return redis.hincrby(`guild:${guildId}:bank:resources`, `${resource}:${tier}`, qty);
    },

    /** Атомарное списание с проверкой достаточности — Lua, иначе два
     *  одновременных withdraw могли бы оба пройти проверку "хватает" до
     *  списания и увести в минус. */
    async withdrawFromGuildBankResourceAtomic(guildId, resource, tier, qty) {
      const script = `
local field = ARGV[1]
local qty = tonumber(ARGV[2])
local have = tonumber(redis.call('HGET', KEYS[1], field) or '0')
if have < qty then return 0 end
redis.call('HINCRBY', KEYS[1], field, -qty)
return 1
`;
      const ok = await redis.eval(script, [`guild:${guildId}:bank:resources`], [`${resource}:${tier}`, qty]);
      return ok === 1;
    },

    async getGuildBankResources(guildId) {
      const raw = await redis.hgetall(`guild:${guildId}:bank:resources`) || {};
      return Object.entries(raw).map(([key, qty]) => {
        const [resource, tier] = key.split(':');
        return { resource, tier: Number(tier), qty: Number(qty) };
      });
    },

    async getPlayerGuildId(playerId) {
      return redis.get(`guild:member:${playerId}`);
    },

    /** Текущий уровень гильд-апгрейда (guild-levels.js) — отдельный
     *  атомарный счётчик, тот же принцип, что bank:credits: не лезем в
     *  основной JSON гильдии, чтобы не парсить/переписывать его в Lua. */
    async getGuildUpgradeLevel(guildId) {
      const raw = await redis.get(`guild:${guildId}:upgradeLevel`);
      return Number(raw) || 0;
    },

    /**
     * Атомарно: проверяет, что уровень гильдии всё ещё expectedLevel
     * (защита от гонки — вдруг кто-то уже купил апгрейд между чтением
     * уровня в guild-engine.js и этим вызовом), проверяет, что ВСЕХ
     * ресурсов из cost хватает, и только если всё сошлось — списывает
     * все ресурсы разом и поднимает уровень. Если что-то одно не
     * сходится — не трогает вообще ничего (не бывает частичного
     * списания).
     *
     * cost — массив [{ resource, tier, qty }, ...] из guild-levels.js.
     */
    async purchaseGuildUpgradeAtomic(guildId, cost, expectedLevel, newLevel) {
      const script = `
local levelKey = KEYS[1]
local bankKey = KEYS[2]
local expectedLevel = tonumber(ARGV[1])
local newLevel = tonumber(ARGV[2])

local currentLevel = tonumber(redis.call('GET', levelKey) or '0')
if currentLevel ~= expectedLevel then
  return 'LEVEL_MISMATCH'
end

for i = 3, #ARGV, 2 do
  local field = ARGV[i]
  local need = tonumber(ARGV[i + 1])
  local have = tonumber(redis.call('HGET', bankKey, field) or '0')
  if have < need then
    return 'INSUFFICIENT_RESOURCES'
  end
end

for i = 3, #ARGV, 2 do
  local field = ARGV[i]
  local need = tonumber(ARGV[i + 1])
  redis.call('HINCRBY', bankKey, field, -need)
end
redis.call('SET', levelKey, newLevel)
return 'OK'
`;
      const args = [String(expectedLevel), String(newLevel)];
      for (const need of cost) {
        args.push(`${need.resource}:${need.tier}`, String(need.qty));
      }
      const result = await redis.eval(
        script,
        [`guild:${guildId}:upgradeLevel`, `guild:${guildId}:bank:resources`],
        args
      );
      return { success: result === 'OK', reason: result === 'OK' ? null : result };
    },
  };
}

module.exports = { makeGuildStoreUpstash };
