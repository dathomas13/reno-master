/**
 * On-device text recognition through Google ML Kit (Capacitor plugin).
 *
 * Only available in the Android build. It costs nothing, works offline and never sends
 * the receipt anywhere, which is why it is the default once the APK exists. The plain
 * text it returns is turned into form fields by parseReceiptText.
 */
import { isNative } from '../index';
import { parseReceiptText } from './parseReceiptText';
import type { ExtractInput, ReceiptExtractor, ReceiptFields } from './types';

interface TextRecognitionPlugin {
  recognize(options: { path?: string; base64?: string }): Promise<{ text?: string; blocks?: { text: string }[] }>;
}

function plugin(): TextRecognitionPlugin | null {
  const plugins = (globalThis as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor?.Plugins;
  return (plugins?.TextRecognition as TextRecognitionPlugin | undefined) ?? null;
}

async function toBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export const mlkitExtractor: ReceiptExtractor = {
  id: 'mlkit',
  label: 'ML Kit (auf dem Gerät)',

  async isAvailable() {
    return isNative() && plugin() !== null;
  },

  async extract({ file, contentType }: ExtractInput): Promise<ReceiptFields> {
    const api = plugin();
    if (!api) throw new Error('Texterkennung ist nur in der App-Version verfügbar.');
    if (contentType === 'application/pdf') {
      throw new Error('PDF kann auf dem Gerät nicht gelesen werden – bitte abfotografieren.');
    }
    const result = await api.recognize({ base64: await toBase64(file) });
    const text = result.text ?? (result.blocks ?? []).map((block) => block.text).join('\n');
    return { ...parseReceiptText(text), engine: 'mlkit' };
  },
};
