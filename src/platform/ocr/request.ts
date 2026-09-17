/**
 * How a receipt is put to an online model.
 *
 * Claude and Gemini get the same instruction and the same list of fields on purpose: two
 * engines that ask differently would read the same receipt differently, and then the
 * number in the cost form would depend on a setting nobody remembers changing.
 *
 * Free of any SDK import, so both engines and the tests can use it.
 */

export const RECEIPT_SYSTEM = [
  'Du liest deutsche Rechnungen, Kassenbons und Lieferscheine einer Hausrenovierung.',
  'Gib ausschließlich ein JSON-Objekt zurück, ohne Text davor oder danach, ohne Markdown.',
  'Felder: date (YYYY-MM-DD), vendor (Firma/Händler), amountGross (Zahl, Bruttosumme),',
  'amountNet (Zahl), vatRate (19, 7 oder 0), vatAmount (Zahl), invoiceNumber (Text),',
  'description (kurz, was gekauft wurde), category (genau einer der vorgegebenen Werte),',
  'confidence (0 bis 1).',
  'Ein Feld, das du nicht sicher lesen kannst, lässt du weg. Rate nichts.',
  'Beträge als Zahl mit Punkt als Dezimaltrennzeichen, ohne Währungszeichen.',
].join(' ');

/** the user turn, naming the categories the app knows */
export function receiptInstruction(categories: readonly string[]): string {
  return categories.length
    ? `Lies diesen Beleg aus. Mögliche Kategorien: ${categories.join(', ')}.`
    : 'Lies diesen Beleg aus.';
}

/** base64 without the data: prefix; chunked, because a receipt photo blows the stack */
export async function toBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
