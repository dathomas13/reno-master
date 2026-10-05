/**
 * Cost summaries. Kept free of React and Firebase so the numbers that end up in the
 * overview can be tested directly - these are the figures Thomas plans the renovation
 * with, a wrong sum here is worse than a wrong pixel anywhere else.
 */
import { createdAtMillis, type Cost, type Trade } from './types';
import { DEFAULT_OPTIONS, labelOf, type OptionSets } from './options';
import { monthKey } from '@/lib/date';
import { round2 } from '@/lib/money';

export interface Bucket {
  key: string;
  total: number;
  count: number;
  /** what to show instead of the key, when the key is an id */
  label?: string;
}

export const NO_CATEGORY = 'ohne Kategorie';

/**
 * Newest first: by invoice date, then - for costs entered on the same day, which happens
 * whenever several receipts are logged in one sitting - by when the entry was created.
 * `date` alone ties there, and Firestore's own tiebreaker (document id) is unrelated to
 * entry order, so the list would not reliably show the latest one on top.
 */
export function sortNewestFirst(costs: Cost[]): Cost[] {
  return [...costs].sort(
    (a, b) => b.date.localeCompare(a.date) || createdAtMillis(b.createdAt) - createdAtMillis(a.createdAt),
  );
}

export function sumGross(costs: Cost[]): number {
  return round2(costs.reduce((sum, cost) => sum + (Number.isFinite(cost.amountGross) ? cost.amountGross : 0), 0));
}

function group(costs: Cost[], keyOf: (cost: Cost) => string): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const cost of costs) {
    const key = keyOf(cost);
    const bucket = map.get(key) ?? { key, total: 0, count: 0 };
    bucket.total += Number.isFinite(cost.amountGross) ? cost.amountGross : 0;
    bucket.count += 1;
    map.set(key, bucket);
  }
  return [...map.values()].map((bucket) => ({ ...bucket, total: round2(bucket.total) }));
}

/**
 * Biggest category first, that is the order the overview shows. Grouped by the stored
 * category id; `label` is what to show for it.
 */
export function byCategory(costs: Cost[], sets: OptionSets = DEFAULT_OPTIONS): Bucket[] {
  const entries = sets.costCategories;
  return group(costs, (cost) => cost.category?.trim() || NO_CATEGORY)
    .map((bucket) => ({ ...bucket, label: bucket.key === NO_CATEGORY ? NO_CATEGORY : labelOf(entries, bucket.key) }))
    .sort((a, b) => b.total - a.total);
}

/** chronological, so the bars read left to right */
export function byMonth(costs: Cost[]): Bucket[] {
  return group(costs, (cost) => monthKey(cost.date)).sort((a, b) => a.key.localeCompare(b.key));
}

export function totalForMonth(costs: Cost[], month: string): number {
  return sumGross(costs.filter((cost) => monthKey(cost.date) === month));
}

export interface TradeBudget {
  trade: Trade;
  actual: number;
  planned: number;
  /** 0..1, capped; 1 means the budget is used up */
  share: number;
  over: boolean;
}

export function budgetPerTrade(costs: Cost[], trades: Trade[]): TradeBudget[] {
  const actuals = new Map<string, number>();
  for (const cost of costs) {
    if (!cost.tradeId) continue;
    actuals.set(cost.tradeId, (actuals.get(cost.tradeId) ?? 0) + (cost.amountGross || 0));
  }
  return trades
    .map((trade) => {
      const actual = round2(actuals.get(trade.id) ?? 0);
      const planned = trade.budgetPlanned ?? 0;
      return {
        trade,
        actual,
        planned,
        share: planned > 0 ? Math.min(actual / planned, 1) : 0,
        over: planned > 0 && actual > planned,
      };
    })
    .filter((row) => row.actual > 0 || row.planned > 0)
    .sort((a, b) => b.actual - a.actual);
}

/** German CSV: semicolon separated, comma as the decimal mark, BOM for Excel */
export function toCsv(
  costs: Cost[],
  formatAmount: (value: number) => string,
  sets: OptionSets = DEFAULT_OPTIONS,
): string {
  const header = [
    'Datum', 'Händler', 'Beschreibung', 'Kategorie', 'Brutto', 'Netto', 'MwSt-Satz', 'Status', 'Rechnungsnummer',
  ];
  const rows = costs.map((cost) => [
    cost.date,
    cost.vendor,
    cost.description,
    labelOf(sets.costCategories, cost.category),
    formatAmount(cost.amountGross),
    cost.amountNet !== undefined ? formatAmount(cost.amountNet) : '',
    cost.vatRate ?? '',
    labelOf(sets.paymentStatus, cost.paymentStatus),
    cost.invoiceNumber ?? '',
  ]);
  const escape = (cell: unknown) => `"${String(cell ?? '').replace(/"/g, '""')}"`;
  // \uFEFF is the byte order mark that makes Excel read the file as UTF-8
  return `\ufeff${[header, ...rows].map((row) => row.map(escape).join(';')).join('\r\n')}`;
}
