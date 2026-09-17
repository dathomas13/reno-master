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
import { extractJson, validateReceiptFields } from './receiptFields';
import { RECEIPT_SYSTEM, receiptInstruction, toBase64 } from './request';
import type { ExtractInput, ReceiptExtractor, ReceiptFields } from './types';

export { extractJson, validateReceiptFields } from './receiptFields';

function client(): Anthropic {
  const { claudeApiKey } = loadSettings();
  if (!claudeApiKey) throw new Error('Kein Claude API-Key hinterlegt.');
  return new Anthropic({ apiKey: claudeApiKey, dangerouslyAllowBrowser: true });
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

    // PDF document blocks are accepted by the API but are not in the type definitions of
    // the pinned SDK version, so the block list is assembled loosely and handed over as
    // the parameter type. Drop the cast once the SDK is bumped.
    const content = [
      isPdf
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
        : {
            type: 'image',
            source: { type: 'base64', media_type: contentType || 'image/jpeg', data },
          },
      { type: 'text', text: receiptInstruction(categories) },
    ] as unknown as Anthropic.MessageParam['content'];

    const response = await client().messages.create({
      model: settings.claudeModel || 'claude-opus-5',
      max_tokens: 1024,
      system: RECEIPT_SYSTEM,
      messages: [{ role: 'user', content }],
    });

    const text = response.content
      .map((block: { type: string; text?: string }) => (block.type === 'text' ? (block.text ?? '') : ''))
      .join('\n')
      .trim();
    const raw = extractJson(text);
    if (!raw) throw new Error('Claude hat kein lesbares Ergebnis geliefert.');
    return { ...validateReceiptFields(raw, 'claude', categories), rawText: text };
  },
};
