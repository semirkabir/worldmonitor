import type { FinancialCenter, CentralBank, CommodityHub } from '@/config/finance-geo';
import type { EntityRenderer, EntityRenderContext } from '../types';

function row(ctx: EntityRenderContext, label: string, value: string): HTMLElement {
  const r = ctx.el('div', 'edp-detail-row');
  r.append(ctx.el('span', 'edp-detail-label', label));
  r.append(ctx.el('span', 'edp-detail-value', value));
  return r;
}

export class FinancialCenterRenderer implements EntityRenderer {
  renderSkeleton(data: unknown, ctx: EntityRenderContext): HTMLElement {
    const fc = data as FinancialCenter;
    const container = ctx.el('div', 'edp-generic');

    const header = ctx.el('div', 'edp-header');
    header.append(ctx.el('h2', 'edp-title', fc.name));
    header.append(ctx.el('div', 'edp-subtitle', `${fc.city}, ${fc.country}`));

    const badgeRow = ctx.el('div', 'edp-badge-row');
    const typeClass = fc.type === 'global' ? 'edp-badge edp-badge-severity'
      : fc.type === 'regional' ? 'edp-badge edp-badge-tier'
        : 'edp-badge';
    badgeRow.append(ctx.badge(fc.type.toUpperCase(), typeClass));
    if (fc.gfciRank) badgeRow.append(ctx.badge(`GFCI #${fc.gfciRank}`, 'edp-badge edp-badge-tier'));
    header.append(badgeRow);
    container.append(header);

    if (fc.description) container.append(ctx.el('p', 'edp-description', fc.description));

    const [detailCard, detailBody] = ctx.sectionCard('Details');
    detailBody.append(row(ctx, 'City', `${fc.city}, ${fc.country}`));
    detailBody.append(row(ctx, 'Classification', fc.type));
    if (fc.gfciRank) detailBody.append(row(ctx, 'GFCI Rank', `#${fc.gfciRank}`));
    container.append(detailCard);

    if (fc.specialties && fc.specialties.length > 0) {
      const [specCard, specBody] = ctx.sectionCard('Specialties');
      const tags = ctx.el('div', 'edp-tags');
      for (const s of fc.specialties) tags.append(ctx.badge(s, 'edp-tag'));
      specBody.append(tags);
      container.append(specCard);
    }

    return container;
  }
}

export class CentralBankRenderer implements EntityRenderer {
  renderSkeleton(data: unknown, ctx: EntityRenderContext): HTMLElement {
    const bank = data as CentralBank;
    const container = ctx.el('div', 'edp-generic');

    const header = ctx.el('div', 'edp-header');
    header.append(ctx.el('h2', 'edp-title', bank.shortName || bank.name));
    if (bank.shortName && bank.shortName !== bank.name) {
      header.append(ctx.el('div', 'edp-subtitle', bank.name));
    }
    header.append(ctx.el('div', 'edp-subtitle', `${bank.city}, ${bank.country}`));

    const badgeRow = ctx.el('div', 'edp-badge-row');
    const typeClass = bank.type === 'major' ? 'edp-badge edp-badge-severity'
      : bank.type === 'supranational' ? 'edp-badge edp-badge-tier'
        : 'edp-badge';
    badgeRow.append(ctx.badge(bank.type.toUpperCase(), typeClass));
    if (bank.currency) badgeRow.append(ctx.badge(bank.currency, 'edp-badge'));
    header.append(badgeRow);
    container.append(header);

    if (bank.description) container.append(ctx.el('p', 'edp-description', bank.description));

    const [detailCard, detailBody] = ctx.sectionCard('Details');
    detailBody.append(row(ctx, 'Full Name', bank.name));
    detailBody.append(row(ctx, 'City', `${bank.city}, ${bank.country}`));
    if (bank.currency) detailBody.append(row(ctx, 'Currency', bank.currency));
    detailBody.append(row(ctx, 'Classification', bank.type));
    container.append(detailCard);

    return container;
  }
}

export class CommodityHubRenderer implements EntityRenderer {
  renderSkeleton(data: unknown, ctx: EntityRenderContext): HTMLElement {
    const hub = data as CommodityHub;
    const container = ctx.el('div', 'edp-generic');

    const header = ctx.el('div', 'edp-header');
    header.append(ctx.el('h2', 'edp-title', hub.name));
    header.append(ctx.el('div', 'edp-subtitle', `${hub.city}, ${hub.country}`));

    const badgeRow = ctx.el('div', 'edp-badge-row');
    badgeRow.append(ctx.badge(hub.type.toUpperCase(), 'edp-badge'));
    header.append(badgeRow);
    container.append(header);

    if (hub.description) container.append(ctx.el('p', 'edp-description', hub.description));

    const [detailCard, detailBody] = ctx.sectionCard('Details');
    detailBody.append(row(ctx, 'City', `${hub.city}, ${hub.country}`));
    detailBody.append(row(ctx, 'Type', hub.type));
    container.append(detailCard);

    if (hub.commodities && hub.commodities.length > 0) {
      const [commCard, commBody] = ctx.sectionCard('Commodities Traded');
      const tags = ctx.el('div', 'edp-tags');
      for (const c of hub.commodities) tags.append(ctx.badge(c, 'edp-tag'));
      commBody.append(tags);
      container.append(commCard);
    }

    return container;
  }
}
