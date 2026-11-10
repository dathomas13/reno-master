/**
 * The export of a list of costs for someone outside: the bank that pays out a KfW loan,
 * the tax adviser. They want two things - a table they can open in Excel and the
 * receipts themselves, numbered so that line 7 of the table is file 07.
 *
 * Planning is pure, like the diary archive: the page writes the files with the same
 * ZIP writer, and the list of what goes in can be tested without a bucket.
 */
import { safeName, type ExportFile, type ExportPlan } from './exportArchive';
import { DEFAULT_OPTIONS, labelOf, type OptionSets } from './options';
import type { Cost, Photo, Trade } from './types';
import { formatAmount, round2 } from '@/lib/money';

export interface CostExportSource {
  costs: Cost[];
  photos: Photo[];
  trades?: Trade[];
  sets?: OptionSets;
}

/** an archive plan like the diary's - the table first, then the receipts in the order of the table */
export interface CostExportPlan extends ExportPlan {
  /** files that carry bytes from storage */
  receiptCount: number;
  /** costs without any receipt, so the page can say so before the bank does */
  withoutReceipt: number;
}

export const COST_TABLE_NAME = 'Rechnungen.csv';

/** what the bank sees first: oldest invoice on line 1 */
function chronological(costs: readonly Cost[]): Cost[] {
  return [...costs].sort((a, b) => a.date.localeCompare(b.date) || a.vendor.localeCompare(b.vendor, 'de'));
}

function extensionOf(photo: Photo): string {
  if (photo.contentType === 'application/pdf') return 'pdf';
  if (photo.contentType === 'image/png') return 'png';
  return 'jpg';
}

/** receipts of one cost, by either direction of the link, in the order the cost lists them */
export function receiptsOf(cost: Cost, photos: readonly Photo[]): Photo[] {
  const linked = photos.filter((photo) => photo.costId === cost.id || cost.receiptPhotoIds.includes(photo.id));
  const order = (photo: Photo) => {
    const index = cost.receiptPhotoIds.indexOf(photo.id);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  return linked.sort((a, b) => order(a) - order(b));
}

/** `belege/07_2026-03-12_Hornbach.pdf`, with -2, -3 for further pages of the same invoice */
export function receiptFileName(cost: Cost, number: number, page: number, photo: Photo): string {
  const prefix = String(number).padStart(2, '0') + (page > 0 ? `-${page + 1}` : '');
  const vendor = safeName(cost.vendor || cost.description, 'Rechnung');
  return `Belege/${prefix}_${cost.date}_${vendor}.${extensionOf(photo)}`;
}

export function planCostExport(source: CostExportSource): CostExportPlan {
  const sets = source.sets ?? DEFAULT_OPTIONS;
  const tradeName = new Map((source.trades ?? []).map((trade) => [trade.id, trade.name]));
  const ordered = chronological(source.costs);
  const receipts: ExportFile[] = [];
  const receiptNames = new Map<string, string[]>();
  let withoutReceipt = 0;

  ordered.forEach((cost, index) => {
    const files = receiptsOf(cost, source.photos).map((photo, page) => ({
      name: receiptFileName(cost, index + 1, page, photo),
      // the untouched original where one was archived, the bank wants the real document
      storagePath: photo.originalPath ?? photo.storagePath,
      bytes: (photo.originalPath ? photo.originalBytes : undefined) ?? photo.bytes,
      mime: photo.contentType,
    }));
    if (files.length === 0) withoutReceipt += 1;
    receiptNames.set(cost.id, files.map((file) => file.name.replace(/^Belege\//, '')));
    receipts.push(...files);
  });

  const table = costTable(ordered, { sets, tradeName, receiptNames });
  return {
    files: [{ name: COST_TABLE_NAME, text: table, bytes: table.length, mime: 'text/csv' }, ...receipts],
    fileCount: receipts.length,
    totalBytes: receipts.reduce((total, file) => total + file.bytes, 0),
    withoutOriginal: 0,
    receiptCount: receipts.length,
    withoutReceipt,
  };
}

interface TableContext {
  sets: OptionSets;
  tradeName: Map<string, string>;
  receiptNames: Map<string, string[]>;
}

/**
 * German CSV for Excel: semicolons, decimal comma, a byte order mark. The costs come in
 * already sorted; the running number is the one in the receipt file names.
 */
export function costTable(costs: readonly Cost[], context: TableContext): string {
  const { sets, tradeName, receiptNames } = context;
  const header = [
    'Nr', 'Datum', 'Firma/Händler', 'Beschreibung', 'Rechnungsnummer', 'Gewerk', 'Kategorie',
    'Netto', 'MwSt-Satz', 'MwSt', 'Brutto', 'Status', 'Bezahlt von', 'Zahlungsart', 'Kennzeichen', 'Beleg',
  ];
  const rows: unknown[][] = costs.map((cost, index) => [
    index + 1,
    cost.date,
    cost.vendor,
    cost.description,
    cost.invoiceNumber ?? '',
    tradeName.get(cost.tradeId ?? '') ?? '',
    labelOf(sets.costCategories, cost.category),
    cost.amountNet !== undefined ? formatAmount(cost.amountNet) : '',
    cost.vatRate != null ? `${cost.vatRate} %` : '',
    cost.vatAmount !== undefined ? formatAmount(cost.vatAmount) : '',
    formatAmount(cost.amountGross),
    labelOf(sets.paymentStatus, cost.paymentStatus),
    labelOf(sets.payers, cost.paidBy),
    labelOf(sets.paymentMethods, cost.paymentMethod),
    (cost.marks ?? []).map((mark) => labelOf(sets.costMarks, mark)).join(', '),
    (receiptNames.get(cost.id) ?? []).join(', ') || 'kein Beleg',
  ]);

  // net and VAT only add up when every line has them; a partial sum would mislead
  const sum = (pick: (cost: Cost) => number | undefined) => {
    const values = costs.map(pick);
    return values.every((value) => value !== undefined)
      ? formatAmount(round2(values.reduce<number>((total, value) => total + (value ?? 0), 0)))
      : '';
  };
  if (costs.length > 0) {
    rows.push([
      '', '', 'Summe', `${costs.length} Rechnungen`, '', '', '',
      sum((cost) => cost.amountNet), '', sum((cost) => cost.vatAmount), sum((cost) => cost.amountGross || 0),
      '', '', '', '', '',
    ]);
  }

  const escape = (cell: unknown) => `"${String(cell ?? '').replace(/"/g, '""')}"`;
  return `\ufeff${[header, ...rows].map((row) => row.map(escape).join(';')).join('\r\n')}`;
}

/** `rechnungen-kfw-2026-11-10`: the filter in the name, so two exports do not get mixed up */
export function costExportBaseName(day: string, filterLabel?: string): string {
  const filter = filterLabel ? safeName(filterLabel, '').toLowerCase().replace(/\s+/g, '-') : '';
  return ['rechnungen', filter, day].filter(Boolean).join('-');
}
