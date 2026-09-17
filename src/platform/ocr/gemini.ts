/**
 * Reads a receipt with Google Gemini when a key is stored in the settings.
 *
 * Same shape as the Claude engine: the request goes straight from the device with the
 * user's own key, the answer is the same small JSON object, and it goes through the same
 * validation before a single number reaches the cost form.
 *
 * Plain `fetch` against the REST endpoint instead of a client library - one request is
 * not worth another dependency in the bundle, and it keeps the app installable without
 * the npm registry. The key travels in the `x-goog-api-key` header rather than the query
 * string, so it cannot end up in a log or a referrer.
 */
import { loadSettings } from '@/lib/settings';
import { extractJson, validateReceiptFields } from './receiptFields';
import { RECEIPT_SYSTEM, receiptInstruction, toBase64 } from './request';
import type { ExtractInput, ReceiptExtractor, ReceiptFields } from './types';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

/** the bits of the answer this module reads */
interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  error?: { message?: string; status?: string };
}

export const geminiExtractor: ReceiptExtractor = {
  id: 'gemini',
  label: 'Gemini (online, eigener API-Key)',

  async isAvailable() {
    return Boolean(loadSettings().geminiApiKey) && navigator.onLine;
  },

  async extract({ file, contentType, categories = [] }: ExtractInput): Promise<ReceiptFields> {
    const { geminiApiKey, geminiModel } = loadSettings();
    if (!geminiApiKey) throw new Error('Kein Gemini API-Key hinterlegt.');

    const data = await toBase64(file);
    const model = geminiModel.trim() || DEFAULT_GEMINI_MODEL;

    const response = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiApiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: RECEIPT_SYSTEM }] },
        contents: [
          {
            role: 'user',
            parts: [
              // a PDF rides in the same field as a photo, only the type differs
              { inline_data: { mime_type: contentType || 'image/jpeg', data } },
              { text: receiptInstruction(categories) },
            ],
          },
        ],
        // temperature 0: reading a receipt is not a creative task, and a second run
        // should not produce a second amount
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
      }),
    });

    const body = (await response.json().catch(() => null)) as GeminiResponse | null;
    if (!response.ok) {
      const error = new Error(body?.error?.message ?? `Gemini antwortete mit ${response.status}.`);
      // carried like the Claude SDK does it, so one error helper can serve both
      (error as { status?: number }).status = response.status;
      throw error;
    }

    const text = (body?.candidates?.[0]?.content?.parts ?? [])
      .map((part) => part.text ?? '')
      .join('\n')
      .trim();
    const raw = extractJson(text);
    if (!raw) throw new Error('Gemini hat kein lesbares Ergebnis geliefert.');
    return { ...validateReceiptFields(raw, categories), rawText: text };
  },
};
