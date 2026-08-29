'use strict';

/**
 * СТАТУС-КАРТОЧКА БОЯ С БОССОМ — чисто отображение, никакой боевой
 * логики здесь нет и не должно быть. Реальный урон/попадания считает
 * bosses/boss-engine.js (resolvePlayerVsBoss) — эта карточка просто
 * рисует текстом то, что уже посчитано, тем же форматом, что и
 * остальной HUD игры (эмодзи+КАПС-заголовок, прогресс-бар 20 сегментов
 * ■/□, флейвор-текст снизу).
 *
 * Подключение изображений боссов (из присланного zip) — отдельный шаг,
 * сюда не входит: см. engine/travel-images/ для уже готового паттерна
 * кэширования картинок в VK (getOrUploadAttachment), тот же подход можно
 * применить к боссам через отдельный image-manifest по bossId.
 */

const { renderCard } = require('./status-card.js');

function progressBar(current, max, width = 20) {
  const pct = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
  const filled = Math.round(pct * width);
  return `[${'■'.repeat(filled)}${'□'.repeat(width - filled)}] ${(pct * 100).toFixed(2)}%`;
}

const PHASE_LABEL = { normal: null, rage: 'ЯРОСТЬ' };

/**
 * @param {object} bossDef — запись из bosses/boss-data.js (findBoss(bossId))
 * @param {object} instance — активный инстанс (hp/hpMax/bossPhase/participants)
 */
function formatBossStatusCard(bossDef, instance) {
  const lines = [];
  if (bossDef.lore) lines.push(bossDef.subtitle || bossDef.lore, '');
  lines.push(`❤ HP: ${Math.max(0, instance.hp)} / ${instance.hpMax}`);
  lines.push(progressBar(instance.hp, instance.hpMax));

  const phaseLabel = PHASE_LABEL[instance.bossPhase];
  if (phaseLabel) {
    lines.push('', `⚠ ${phaseLabel}: ${bossDef.name}`);
  }

  lines.push('', `Угроза: ${bossDef.threatLevel}`, `Локация: ${bossDef.location}`);

  return renderCard(`👹 ${bossDef.name}`, lines);
}

/** Краткая строка для превью в списке/хабе — не полная карточка. */
function formatBossHpLine(instance) {
  return `${progressBar(instance.hp, instance.hpMax, 16)}`;
}

module.exports = { formatBossStatusCard, formatBossHpLine, progressBar };
