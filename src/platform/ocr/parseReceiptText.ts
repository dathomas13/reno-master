/**
 * Turns raw OCR text of a German receipt or invoice into form fields.
 *
 * Used with on-device text recognition (ML Kit), which returns text but no structure.
 * Everything here is heuristic and deliberately conservative: a field stays empty
 * rather than being filled with a wrong guess, because the user sees the prefilled
 * form and a wrong number is worse than an empty one.
 */
import { parseAmount, round2 } from '@/lib/money';
import type { ReceiptFields } from './types';

/** vendors that show up on this building site, with the category they usually belong to */
const KNOWN_VENDORS: { pattern: RegExp; name: string; category?: string }[] = [
  { pattern: /bauhaus/i, name: 'Bauhaus', category: 'Material allgemein' },
  { pattern: /hornbach/i, name: 'Hornbach', category: 'Material allgemein' },
  { pattern: /\bobi\b/i, name: 'OBI', category: 'Material allgemein' },
  { pattern: /\btoom\b/i, name: 'toom Baumarkt', category: 'Material allgemein' },
  { pattern: /hagebau/i, name: 'hagebaumarkt', category: 'Material allgemein' },
  { pattern: /raiffeisen/i, name: 'Raiffeisen', category: 'Material allgemein' },
  { pattern: /\bbaywa\b/i, name: 'BayWa', category: 'Material allgemein' },
  { pattern: /amazon/i, name: 'Amazon', category: 'Werkzeug' },
  { pattern: /w[uü]rth/i, name: 'Würth', category: 'Werkzeug' },
  { pattern: /\bhilti\b/i, name: 'Hilti', category: 'Werkzeug' },
  { pattern: /bosch/i, name: 'Bosch', category: 'Werkzeug' },
  { pattern: /\bikea\b/i, name: 'IKEA' },
  { pattern: /\bedeka\b|\brewe\b|\blidl\b|\baldi\b|\bnetto\b/i, name: 'Lebensmittel', category: 'Verpflegung Helfer' },
];

const TOTAL_KEYWORDS =
  /(summe|gesamtbetrag|gesamtsumme|gesamt|zu\s*zahlen|zahlbetrag|endbetrag|rechnungsbetrag|total|brutto)/i;
const NET_KEYWORDS = /(netto|nettobetrag|zwischensumme|warenwert)/i;
const VAT_KEYWORDS = /(mwst|mehrwertsteuer|ust|umsatzsteuer)/i;
const DATE_KEYWORDS = /(datum|rechnungsdatum|belegdatum|lieferdatum|kaufdatum|vom)/i;
const INVOICE_KEYWORDS = /(rechnung(s)?[-\s.]?(nr|nummer)|beleg[-\s.]?(nr|nummer)|re[-\s.]?nr)/i;

const AMOUNT = /-?\d{1,3}(?:[.\s]\d{3})*(?:[.,]\d{2})|-?\d+[.,]\d{2}|-?\d+(?=\s*(?:€|EUR))/gi;
const ADDRESS_LINE = /^\s*(\d{4,5}\s|[A-Za-zÄÖÜäöüß.\- ]+(stra(ß|ss)e|str\.|weg|platz|allee|gasse)\b)/i;
const NOISE_LINE = /^(tel|telefon|fax|ust-?id|steuer|iban|bic|www\.|http|e-?mail|kasse|bon|beleg|datum|uhrzeit)/i;

function plausibleDate(year: number, month: number, day: number): string | undefined {
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const now = new Date();
  const maxYear = now.getFullYear() + 1;
  if (year < 2020 || year > maxYear) return undefined;
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return iso;
}

/** all dates in a line, German and ISO notation */
function datesIn(line: string): string[] {
  const found: string[] = [];
  for (const match of line.matchAll(/\b(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})\b/g)) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    let year = Number(match[3]);
    if (year < 100) year += 2000;
    const iso = plausibleDate(year, month, day);
    if (iso) found.push(iso);
  }
  for (const match of line.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    const iso = plausibleDate(Number(match[1]), Number(match[2]), Number(match[3]));
    if (iso) found.push(iso);
  }
  return found;
}

function amountsIn(line: string): number[] {
  const values: number[] = [];
  for (const match of line.match(AMOUNT) ?? []) {
    const value = parseAmount(match);
    if (value !== null && Number.isFinite(value)) values.push(value);
  }
  return values;
}

function pickVendor(lines: string[]): { vendor?: string; category?: string } {
  const head = lines.slice(0, 12).join('\n');
  for (const known of KNOWN_VENDORS) {
    if (known.pattern.test(head)) return { vendor: known.name, category: known.category };
  }
  for (const line of lines.slice(0, 8)) {
    const text = line.trim();
    if (text.length < 3 || text.length > 48) continue;
    if (ADDRESS_LINE.test(text) || NOISE_LINE.test(text)) continue;
    if (!/[A-Za-zÄÖÜäöüß]{3}/.test(text)) continue;
    if (datesIn(text).length) continue;
    const letters = text.replace(/[^A-Za-zÄÖÜäöüß]/g, '').length;
    if (letters / text.length < 0.5) continue;
    return { vendor: text.replace(/\s{2,}/g, ' ') };
  }
  return {};
}

export function parseReceiptText(rawText: string): ReceiptFields {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const fields: ReceiptFields = { confidence: 0, engine: 'mlkit', rawText };
  if (!lines.length) return fields;

  // ---------------------------------------------------------------- date
  const keywordDates: string[] = [];
  const otherDates: string[] = [];
  for (const line of lines) {
    const found = datesIn(line);
    if (!found.length) continue;
    (DATE_KEYWORDS.test(line) ? keywordDates : otherDates).push(...found);
  }
  const todayIso = new Date().toISOString().slice(0, 10);
  const notInFuture = (list: string[]) => list.filter((iso) => iso <= todayIso);
  const dateCandidates = notInFuture(keywordDates).length
    ? notInFuture(keywordDates)
    : keywordDates.length
      ? keywordDates
      : notInFuture(otherDates).length
        ? notInFuture(otherDates)
        : otherDates;
  if (dateCandidates.length) {
    // the most recent plausible date is the document date on almost every receipt
    fields.date = dateCandidates.sort().at(-1);
  }

  // ---------------------------------------------------------------- amounts
  const totalCandidates: number[] = [];
  const netCandidates: number[] = [];
  lines.forEach((line, index) => {
    const values = amountsIn(line);
    if (!values.length) {
      // "Summe" alone on a line, amount on the next one
      if (TOTAL_KEYWORDS.test(line) && !VAT_KEYWORDS.test(line)) {
        totalCandidates.push(...amountsIn(lines[index + 1] ?? ''));
      }
      return;
    }
    if (VAT_KEYWORDS.test(line)) return; // handled below
    if (TOTAL_KEYWORDS.test(line)) totalCandidates.push(...values);
    else if (NET_KEYWORDS.test(line)) netCandidates.push(...values);
  });

  const positive = (values: number[]) => values.filter((value) => value > 0);
  const total = positive(totalCandidates).sort((a, b) => b - a)[0];
  if (total !== undefined) {
    fields.amountGross = total;
  } else {
    const all = positive(lines.flatMap(amountsIn)).sort((a, b) => b - a);
    if (all.length) fields.amountGross = all[0];
  }

  const net = positive(netCandidates).sort((a, b) => b - a)[0];
  if (net !== undefined && fields.amountGross !== undefined && net < fields.amountGross) {
    fields.amountNet = net;
  }

  // ---------------------------------------------------------------- VAT
  for (const line of lines) {
    if (!VAT_KEYWORDS.test(line) && !/\b(19|7)\s*%/.test(line)) continue;
    const rateMatch = /\b(19|7)(?:[.,]0+)?\s*%/.exec(line);
    if (rateMatch) fields.vatRate = Number(rateMatch[1]);
    const values = positive(amountsIn(line.replace(/\b(19|7)(?:[.,]0+)?\s*%/, ' ')));
    if (values.length && fields.vatAmount === undefined) {
      const gross = fields.amountGross ?? Infinity;
      const candidate = values.filter((value) => value < gross).sort((a, b) => b - a)[0];
      if (candidate !== undefined) fields.vatAmount = candidate;
    }
    if (fields.vatRate) break;
  }
  if (fields.vatRate && fields.amountGross !== undefined && fields.amountNet === undefined) {
    const net = round2(fields.amountGross / (1 + fields.vatRate / 100));
    fields.amountNet = net;
    if (fields.vatAmount === undefined) fields.vatAmount = round2(fields.amountGross - net);
  }

  // ---------------------------------------------------------------- invoice number
  for (const line of lines) {
    if (!INVOICE_KEYWORDS.test(line)) continue;
    const match = /(?:nr|nummer)\.?\s*[:#]?\s*([A-Z0-9][A-Z0-9\-/]{2,})/i.exec(line);
    if (match) {
      fields.invoiceNumber = match[1];
      break;
    }
  }

  // ---------------------------------------------------------------- vendor
  const { vendor, category } = pickVendor(lines);
  if (vendor) fields.vendor = vendor;
  if (category) fields.category = category;

  // ---------------------------------------------------------------- confidence
  const filled = [fields.date, fields.vendor, fields.amountGross, fields.vatRate].filter(
    (value) => value !== undefined,
  ).length;
  fields.confidence = round2(filled / 4);
  return fields;
}
