/**
 * Picks the receipt extractor to use.
 *
 * 'auto' walks a fixed order: ML Kit first, because it runs on the device, costs nothing
 * and works without a connection; then Gemini, then Claude, each only when its key is
 * stored. The order is fixed rather than clever so the same receipt is read the same way
 * tomorrow - and whoever wants a particular engine names it in the settings.
 */
import { loadSettings } from '@/lib/settings';
import { mlkitExtractor } from './mlkit';
import { claudeExtractor } from './claude';
import { geminiExtractor } from './gemini';
import { EMPTY_FIELDS, type ExtractInput, type ReceiptExtractor, type ReceiptFields } from './types';

export * from './types';
export { parseReceiptText } from './parseReceiptText';
export { friendlyOcrError } from './errors';
export { mlkitExtractor, claudeExtractor, geminiExtractor };

/** the order 'auto' tries, and the order the settings screen explains */
const AUTO_ORDER: ReceiptExtractor[] = [mlkitExtractor, geminiExtractor, claudeExtractor];

export async function activeExtractor(): Promise<ReceiptExtractor | null> {
  const { ocrEngine } = loadSettings();
  if (ocrEngine === 'off') return null;

  if (ocrEngine !== 'auto') {
    const chosen = AUTO_ORDER.find((extractor) => extractor.id === ocrEngine);
    return chosen && (await chosen.isAvailable()) ? chosen : null;
  }

  for (const extractor of AUTO_ORDER) {
    if (await extractor.isAvailable()) return extractor;
  }
  return null;
}

export async function extractReceipt(input: ExtractInput): Promise<ReceiptFields> {
  const extractor = await activeExtractor();
  if (!extractor) return { ...EMPTY_FIELDS };
  return extractor.extract(input);
}
