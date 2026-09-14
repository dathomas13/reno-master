/**
 * Reads a receipt with Claude when the user has stored an API key in the settings.
 *
 * Runs straight from the browser with the official SDK and the user's own key, so there
 * is no server in between. The key lives in localStorage on the phone only.
 * The model is asked for a small JSON object, which is validated here before anything
 * reaches the form - a hallucinated field must never silently become a booked amount.
 */
import Anthropic from '@anthropic-ai/sdk';
import { loadSettings } from '@/lib/settings';
import { extractJson, validateClaudeFields } from './claudeFields';
import type { ExtractInput, ReceiptExtractor, ReceiptFields } from './types';

export { extractJson, validateClaudeFields } from './claudeFields';

const SYSTEM = [
  'Du liest deutsche Rechnungen, Kassenbons und Lieferscheine einer Hausrenovierung.',
  'Gib ausschließlich ein JSON-Objekt zurück, ohne Text davor oder danach, ohne Markdown.',
  'Felder: date (YYYY-MM-DD), vendor (Firma/Händler), amountGross (Zahl, Bruttosumme),',
  'amountNet (Zahl), vatRate (19, 7 oder 0), vatAmount (Zahl), invoiceNumber (Text),',
  'description (kurz, was gekauft wurde), category (genau einer der vorgegebenen Werte),',
  'confidence (0 bis 1).',
  'Ein Feld, das du nicht sicher lesen kannst, lässt du weg. Rate nichts.',
  'Beträge als Zahl mit Punkt als Dezimaltrennzeichen, ohne Währungszeichen.',
].join(' ');

function client(): Anthropic {
  const { claudeApiKey } = loadSettings();
  if (!claudeApiKey) throw new Error('Kein Claude API-Key hinterlegt.');
  return new Anthropic({ apiKey: claudeApiKey, dangerouslyAllowBrowser: true });
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

export const claudeExtractor: ReceiptExtractor = {
  id: 'claude',
  label: 'Claude (online, eigener API-Key)',

  async isAvailable() {
    return Boolean(loadSettings().claudeApiKey) && navigator.onLine;
  },

  async extract({ file, contentType, categories = [] }: ExtractInput): Promise<ReceiptFields> {
    const settings = loadSettings();
    const data = await toBase64(file);
    const isPdf = contentType === 'application/pdf';

    const content = [
      isPdf
        ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data } }
        : {
            type: 'image' as const,
            source: {
              type: 'base64' as const,
              media_type: (contentType || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
              data,
            },
          },
      {
        type: 'text' as const,
        text: categories.length
          ? `Lies diesen Beleg aus. Mögliche Kategorien: ${categories.join(', ')}.`
          : 'Lies diesen Beleg aus.',
      },
    ];

    const response = await client().messages.create({
      model: settings.claudeModel || 'claude-opus-5',
      max_tokens: 1024,
      system: SYSTEM,
      messages: [{ role: 'user', content }],
    });

    const text = response.content
      .map((block: { type: string; text?: string }) => (block.type === 'text' ? (block.text ?? '') : ''))
      .join('\n')
      .trim();
    const raw = extractJson(text);
    if (!raw) throw new Error('Claude hat kein lesbares Ergebnis geliefert.');
    return { ...validateClaudeFields(raw, categories), rawText: text };
  },
};

export function friendlyClaudeError(error: unknown): string {
  const status = (error as { status?: number })?.status;
  if (status === 401) return 'API-Key ungültig. Bitte in den Einstellungen prüfen.';
  if (status === 429) return 'Zu viele Anfragen. Bitte gleich noch einmal versuchen.';
  if (status && status >= 500) return 'Claude ist gerade nicht erreichbar.';
  if (!navigator.onLine) return 'Beleg-Auslesen mit Claude geht nur online.';
  return error instanceof Error ? error.message : 'Auslesen fehlgeschlagen.';
}
