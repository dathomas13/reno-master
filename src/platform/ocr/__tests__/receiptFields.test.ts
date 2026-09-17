import { describe, it, expect } from 'vitest';
import { extractJson, validateReceiptFields } from '@/platform/ocr/receiptFields';

const CATEGORIES = ['Material allgemein', 'Werkzeug', 'Dach'];

describe('extractJson', () => {
  it('reads a plain JSON answer', () => {
    expect(extractJson('{"vendor":"Bauhaus"}')).toEqual({ vendor: 'Bauhaus' });
  });

  it('reads JSON out of a fenced block', () => {
    expect(extractJson('```json\n{"vendor":"OBI"}\n```')).toEqual({ vendor: 'OBI' });
  });

  it('reads JSON with prose around it', () => {
    expect(extractJson('Hier das Ergebnis:\n{"amountGross": 12.5}\nViel Erfolg!')).toEqual({
      amountGross: 12.5,
    });
  });

  it('returns null for unusable answers', () => {
    expect(extractJson('Ich kann den Beleg nicht lesen.')).toBeNull();
    expect(extractJson('{kaputt')).toBeNull();
  });
});

describe('validateReceiptFields', () => {
  it('keeps plausible values', () => {
    const fields = validateReceiptFields(
      {
        date: '2026-09-04',
        vendor: 'Bauhaus Tirschenreuth',
        amountGross: 169.7,
        amountNet: 142.61,
        vatRate: 19,
        vatAmount: 27.09,
        invoiceNumber: 'RE-1',
        category: 'Material allgemein',
        confidence: 0.9,
      },
      CATEGORIES,
    );
    expect(fields.date).toBe('2026-09-04');
    expect(fields.amountGross).toBe(169.7);
    expect(fields.vatRate).toBe(19);
    expect(fields.category).toBe('Material allgemein');
    expect(fields.confidence).toBe(0.9);
    expect(fields.engine).toBe('claude');
  });

  it('accepts German amount strings', () => {
    const fields = validateReceiptFields({ amountGross: '1.234,56' }, CATEGORIES);
    expect(fields.amountGross).toBe(1234.56);
  });

  it('drops an invalid date', () => {
    expect(validateReceiptFields({ date: '04.09.2026' }, CATEGORIES).date).toBeUndefined();
    expect(validateReceiptFields({ date: '2026-13-45' }, CATEGORIES).date).toBeUndefined();
  });

  it('drops a VAT rate that does not exist in Germany', () => {
    expect(validateReceiptFields({ vatRate: 21 }, CATEGORIES).vatRate).toBeUndefined();
    expect(validateReceiptFields({ vatRate: 7 }, CATEGORIES).vatRate).toBe(7);
  });

  it('drops a net amount above the gross amount', () => {
    const fields = validateReceiptFields({ amountGross: 100, amountNet: 120 }, CATEGORIES);
    expect(fields.amountNet).toBeUndefined();
  });

  it('drops a category the app does not know', () => {
    expect(validateReceiptFields({ category: 'Weltraumfahrt' }, CATEGORIES).category).toBeUndefined();
  });

  it('drops absurd amounts', () => {
    expect(validateReceiptFields({ amountGross: -5 }, CATEGORIES).amountGross).toBeUndefined();
    expect(validateReceiptFields({ amountGross: 9_000_000 }, CATEGORIES).amountGross).toBeUndefined();
  });

  it('derives a confidence when the model gives none', () => {
    const fields = validateReceiptFields({ vendor: 'OBI', amountGross: 10 }, CATEGORIES);
    expect(fields.confidence).toBeCloseTo(2 / 3, 2);
  });

  it('survives a nonsense object', () => {
    const fields = validateReceiptFields({ vendor: 42, amountGross: 'viel' }, CATEGORIES);
    expect(fields.vendor).toBeUndefined();
    expect(fields.amountGross).toBeUndefined();
    expect(fields.confidence).toBe(0);
  });
});
