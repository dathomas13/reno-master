/**
 * Turning Claude's answer into form fields.
 *
 * Kept free of the SDK import so it can be unit tested on its own: this is the layer
 * that decides what is allowed to reach the cost form, and a wrong number here would be
 * booked as a real expense.
 */
import { parseAmount, round2 } from '@/lib/money';
import type { ReceiptFields } from './types';

/** pulls the first JSON object out of the answer, tolerating stray prose or fences */
export function extractJson(text: string): Record<string, unknown> | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(candidate.slice(start, end + 1));
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return round2(value);
  if (typeof value === 'string') {
    const parsed = parseAmount(value);
    return parsed === null ? undefined : round2(parsed);
  }
  return undefined;
}

function asText(value: unknown, maxLength = 120): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text ? text.slice(0, maxLength) : undefined;
}

/** turns the model answer into fields, dropping anything implausible */
export function validateClaudeFields(raw: Record<string, unknown>, categories: string[] = []): ReceiptFields {
  const fields: ReceiptFields = { confidence: 0, engine: 'claude' };

  const date = asText(raw.date, 10);
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date))) fields.date = date;

  fields.vendor = asText(raw.vendor, 60);
  fields.description = asText(raw.description, 140);
  fields.invoiceNumber = asText(raw.invoiceNumber, 40);

  const gross = asNumber(raw.amountGross);
  if (gross !== undefined && gross > 0 && gross < 1_000_000) fields.amountGross = gross;

  const net = asNumber(raw.amountNet);
  if (net !== undefined && net > 0 && (fields.amountGross === undefined || net <= fields.amountGross)) {
    fields.amountNet = net;
  }

  const rate = asNumber(raw.vatRate);
  if (rate === 19 || rate === 7 || rate === 0) fields.vatRate = rate;

  const vat = asNumber(raw.vatAmount);
  if (vat !== undefined && vat >= 0 && (fields.amountGross === undefined || vat < fields.amountGross)) {
    fields.vatAmount = vat;
  }

  const category = asText(raw.category, 60);
  if (category && (categories.length === 0 || categories.includes(category))) fields.category = category;

  const confidence = asNumber(raw.confidence);
  fields.confidence =
    confidence !== undefined && confidence >= 0 && confidence <= 1
      ? confidence
      : [fields.date, fields.vendor, fields.amountGross].filter(Boolean).length / 3;

  return fields;
}
