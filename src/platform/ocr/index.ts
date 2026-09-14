/**
 * Picks the receipt extractor to use.
 *
 * 'auto' means: on-device ML Kit when the app runs natively, otherwise Claude when a key
 * is stored, otherwise nothing and the user fills the form by hand.
 */
import { loadSettings } from '@/lib/settings';
import { mlkitExtractor } from './mlkit';
import { claudeExtractor } from './claude';
import { EMPTY_FIELDS, type ExtractInput, type ReceiptExtractor, type ReceiptFields } from './types';

export * from './types';
export { parseReceiptText } from './parseReceiptText';
export { mlkitExtractor, claudeExtractor };

export async function activeExtractor(): Promise<ReceiptExtractor | null> {
  const { ocrEngine } = loadSettings();
  if (ocrEngine === 'off') return null;
  if (ocrEngine === 'mlkit') return (await mlkitExtractor.isAvailable()) ? mlkitExtractor : null;
  if (ocrEngine === 'claude') return (await claudeExtractor.isAvailable()) ? claudeExtractor : null;
  if (await mlkitExtractor.isAvailable()) return mlkitExtractor;
  if (await claudeExtractor.isAvailable()) return claudeExtractor;
  return null;
}

export async function extractReceipt(input: ExtractInput): Promise<ReceiptFields> {
  const extractor = await activeExtractor();
  if (!extractor) return { ...EMPTY_FIELDS };
  return extractor.extract(input);
}
