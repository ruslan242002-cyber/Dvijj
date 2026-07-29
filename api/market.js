'use strict';

/*
 * Вход сайта биржи (VK Mini App), по аналогии с api/profile.js.
 *
 * ДОПУЩЕНИЯ (подгоните под реальные сигнатуры, у меня нет исходников
 * vk-launch-params.js / upstash-store.js / profile-handler.js, только
 * их описание в архиве):
 *   - vk/vk-launch-params.js экспортирует verifyLaunchParams(query) -> { vkUserId } | null
 *   - state/upstash-store.js экспортирует loadPlayer(vkUserId) / savePlayer(player)
 *   - для кредитов используется отдельный атомарный ключ credits:{playerId}
 *     (см. market-store-upstash.js) — здесь при отдаче профиля покупателя
 *     кредиты читаются ИМЕННО оттуда, а не из player.credits в блобе,
 *     иначе после первой же покупки/продажи цифры разъедутся.
 *
 * Если что-то из этого называется иначе — поправьте require() и вызовы,
 * остальная логика (действия биржи) от этого не зависит.
 */

const { verifyLaunchParams } = require('../vk/vk-launch-params');
const { loadPlayer, savePlayer } = require('../state/upstash-store');
const { createUpstashMarketStore } = require('../market/market-store-upstash');
const {
  createListing,
  cancelListing,
  purchaseListing,
  listActiveListings,
  MarketError,
} = require('../market/market-engine');
const { redis } = require('../state/upstash-store'); // предполагаемый экспорт клиента

module.exports = async function marketHandler(req, res) {
  const auth = verifyLaunchParams(req.query || req.body);
  if (!auth) {
    res.status(401).json({ error: 'INVALID_LAUNCH_PARAMS' });
    return;
  }

  const player = await loadPlayer(auth.vkUserId);
  if (!player) {
    res.status(404).json({ error: 'PLAYER_NOT_FOUND' });
    return;
  }

  const marketStore = createUpstashMarketStore(redis);
  const deps = { store: marketStore };

  const action = (req.query && req.query.action) || (req.body && req.body.action);

  try {
    switch (action) {
      case 'list': {
        const cursor = req.query && req.query.cursor;
        const listings = await listActiveListings(deps, { cursor });
        res.status(200).json({ listings });
        return;
      }

      case 'myListings': {
        const ids = await marketStore.getPlayerListingIds(player.id);
        const listings = await Promise.all(ids.map((id) => marketStore.getListing(id)));
        res.status(200).json({ listings: listings.filter(Boolean) });
        return;
      }

      case 'create': {
        const { itemId, itemName, qty, price } = req.body;
        const { listing } = await createListing(deps, player, {
          itemId,
          itemName,
          qty: Number(qty),
          price: Number(price),
        });
        await savePlayer(player);
        res.status(200).json({ listing, inventory: player.inventory });
        return;
      }

      case 'cancel': {
        const { listingId } = req.body;
        await cancelListing(deps, player, listingId);
        await savePlayer(player);
        res.status(200).json({ inventory: player.inventory });
        return;
      }

      case 'buy': {
        const { listingId, qty } = req.body;
        const { purchase } = await purchaseListing(deps, player, listingId, Number(qty));
        await savePlayer(player);
        res.status(200).json({ purchase, credits: player.credits, inventory: player.inventory });
        return;
      }

      default:
        res.status(400).json({ error: 'UNKNOWN_ACTION' });
    }
  } catch (err) {
    if (err instanceof MarketError) {
      res.status(400).json({ error: err.code });
      return;
    }
    // eslint-disable-next-line no-console
    console.error('market handler error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
};
