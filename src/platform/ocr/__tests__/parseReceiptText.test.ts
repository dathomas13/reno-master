import { describe, it, expect } from 'vitest';
import { parseReceiptText } from '@/platform/ocr/parseReceiptText';

const BAUHAUS = `
BAUHAUS Tirschenreuth
Äußere Regensburger Str. 12
95643 Tirschenreuth
Tel. 09631 700-0

Perimeterdämmung XPS 80mm      4 x 24,95     99,80
Bitumenkleber 10kg             2 x 18,50     37,00
Dichtschlämme 25kg             1 x 32,90     32,90

Summe EUR                                   169,70
MwSt 19,00 %                                 27,09
Gegeben BAR                                 200,00
Rückgeld                                     30,30

Datum 04.09.2026  14:23  Kasse 3  Bon 1471
Vielen Dank für Ihren Einkauf
`;

const HANDWERKER = `
Raiffeisen Waren GmbH
Bahnhofstraße 4
95643 Tirschenreuth

RECHNUNG
Rechnungsnr.: RE-2026-04412
Rechnungsdatum: 28.08.2026
Kundennummer: 88213

Pos  Bezeichnung                     Menge   Einzel     Gesamt
1    KG-Rohr DN 125 SN4              6 St    18,90      113,40
2    Bogen 45 Grad DN 125            4 St     7,20       28,80
3    Sand 0-2 gewaschen            1,5 t     42,00       63,00

Nettobetrag                                            205,20
zzgl. 19 % MwSt                                         38,99
Rechnungsbetrag                                        244,19

Zahlbar innerhalb 14 Tagen ohne Abzug.
`;

const SUMME_NEXT_LINE = `
toom Baumarkt
Gesamt
89,97 EUR
19% MwSt 14,36
13.09.2026
`;

const ISO_DATE = `
Amazon EU S.a.r.l.
Rechnung
Rechnungsdatum: 2026-09-01
Bosch Professional GBH 2-28 F
Zwischensumme: 268,07
Umsatzsteuer 19%: 50,93
Gesamtbetrag: 319,00
`;

describe('parseReceiptText', () => {
  it('reads a builders merchant till receipt', () => {
    const fields = parseReceiptText(BAUHAUS);
    expect(fields.date).toBe('2026-09-04');
    expect(fields.amountGross).toBe(169.7);
    expect(fields.vatRate).toBe(19);
    expect(fields.vendor).toBe('Bauhaus');
    expect(fields.category).toBe('Material allgemein');
    expect(fields.confidence).toBe(1);
  });

  it('does not mistake the cash tendered for the total', () => {
    const fields = parseReceiptText(BAUHAUS);
    expect(fields.amountGross).toBeLessThan(200);
  });

  it('reads a trade invoice with net, VAT and invoice number', () => {
    const fields = parseReceiptText(HANDWERKER);
    expect(fields.date).toBe('2026-08-28');
    expect(fields.amountGross).toBe(244.19);
    expect(fields.amountNet).toBe(205.2);
    expect(fields.vatRate).toBe(19);
    expect(fields.invoiceNumber).toBe('RE-2026-04412');
    expect(fields.vendor).toBe('Raiffeisen');
  });

  it('finds a total that sits on the line below its label', () => {
    const fields = parseReceiptText(SUMME_NEXT_LINE);
    expect(fields.amountGross).toBe(89.97);
    expect(fields.vendor).toBe('toom Baumarkt');
    expect(fields.date).toBe('2026-09-13');
  });

  it('reads ISO dates and picks the gross total over the subtotal', () => {
    const fields = parseReceiptText(ISO_DATE);
    expect(fields.date).toBe('2026-09-01');
    expect(fields.amountGross).toBe(319);
    expect(fields.amountNet).toBe(268.07);
    expect(fields.vatRate).toBe(19);
    expect(fields.vendor).toBe('Amazon');
  });

  it('computes the net amount when only gross and rate are printed', () => {
    const fields = parseReceiptText('Summe 119,00\nMwSt 19%\n01.09.2026');
    expect(fields.amountGross).toBe(119);
    expect(fields.amountNet).toBe(100);
    expect(fields.vatAmount).toBe(19);
  });

  it('ignores dates in the future', () => {
    const fields = parseReceiptText('Gültig bis 01.01.2099\nSumme 10,00\nDatum 01.09.2026');
    expect(fields.date).toBe('2026-09-01');
  });

  it('returns an empty, low confidence result for unreadable text', () => {
    const fields = parseReceiptText('....\n???\n');
    expect(fields.amountGross).toBeUndefined();
    expect(fields.date).toBeUndefined();
    expect(fields.confidence).toBe(0);
  });

  it('keeps the raw text for later inspection', () => {
    expect(parseReceiptText(BAUHAUS).rawText).toContain('BAUHAUS');
  });
});
