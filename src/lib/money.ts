/** Money helpers for German input and output. Amounts are numbers in euro. */

const FORMATTER = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const PLAIN = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** '1.234,56 €' */
export function formatEuro(amount: number): string {
  return FORMATTER.format(amount);
}

/** '1.234,56' - for CSV and input fields */
export function formatAmount(amount: number): string {
  return PLAIN.format(amount);
}

/** compact euro for tiles: '1.234 €', '12,3k €' */
export function formatEuroShort(amount: number): string {
  if (Math.abs(amount) >= 100_000) {
    return `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(Math.round(amount / 1000))}k €`;
  }
  return `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(Math.round(amount))} €`;
}

/**
 * Parses German and English amount notation:
 * '1.234,56' -> 1234.56 · '1,234.56' -> 1234.56 · '12,34 €' -> 12.34 · '1234' -> 1234
 * Returns null when nothing numeric is found.
 */
export function parseAmount(input: string): number | null {
  if (typeof input !== 'string') return null;
  let text = input.replace(/[€\s ]/g, '').replace(/^EUR/i, '');
  if (!text) return null;
  const negative = /^-/.test(text) || /-$/.test(text);
  text = text.replace(/-/g, '');
  if (!/[\d]/.test(text)) return null;

  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    // the rightmost separator is the decimal one
    if (lastComma > lastDot) text = text.replace(/\./g, '').replace(',', '.');
    else text = text.replace(/,/g, '');
  } else if (lastComma >= 0) {
    // a single comma: decimal separator unless it groups thousands ('1,234')
    const decimals = text.length - lastComma - 1;
    text = decimals === 3 && /^\d{1,3},\d{3}$/.test(text) ? text.replace(',', '') : text.replace(',', '.');
  } else if (lastDot >= 0) {
    const decimals = text.length - lastDot - 1;
    if (decimals === 3 && /^\d{1,3}(\.\d{3})+$/.test(text)) text = text.replace(/\./g, '');
  }

  const value = Number(text);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** net and VAT from a gross amount */
export function splitGross(gross: number, vatRate: number): { net: number; vat: number } {
  const net = round2(gross / (1 + vatRate / 100));
  return { net, vat: round2(gross - net) };
}
