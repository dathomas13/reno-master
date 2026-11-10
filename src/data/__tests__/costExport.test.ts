import { describe, expect, it } from 'vitest';
import { costExportBaseName, planCostExport, receiptsOf, COST_TABLE_NAME } from '@/data/costExport';
import type { Cost, Photo } from '@/data/types';

function cost(partial: Partial<Cost>): Cost {
  return {
    id: partial.id ?? 'c',
    date: '2026-09-01',
    vendor: 'Bauhaus',
    description: '',
    amountGross: 10,
    category: '',
    roomIds: [],
    paymentStatus: 'bezahlt',
    receiptPhotoIds: [],
    ...partial,
  };
}

function receipt(partial: Partial<Photo>): Photo {
  return {
    id: partial.id ?? 'p',
    kind: 'receipt',
    storagePath: `files/${partial.id ?? 'p'}.jpg`,
    contentType: 'image/jpeg',
    width: 1,
    height: 1,
    bytes: 100,
    roomIds: [],
    uploadState: 'uploaded',
    ...partial,
  };
}

function rows(csv: string): string[][] {
  return csv
    .replace(/^\ufeff/, '')
    .split('\r\n')
    .map((line) => line.split(';').map((cell) => cell.replace(/^"|"$/g, '').replace(/""/g, '"')));
}

describe('planCostExport', () => {
  it('numbers the table and the receipt files alike, oldest first', () => {
    const plan = planCostExport({
      costs: [
        cost({ id: 'b', date: '2026-10-02', vendor: 'Fenster Müller', amountGross: 5000, receiptPhotoIds: ['p2'] }),
        cost({ id: 'a', date: '2026-03-12', vendor: 'Hornbach', amountGross: 12.5, receiptPhotoIds: ['p1'] }),
      ],
      photos: [
        receipt({ id: 'p1', costId: 'a' }),
        receipt({ id: 'p2', costId: 'b', contentType: 'application/pdf', originalPath: 'orig/p2.pdf', originalBytes: 900 }),
        receipt({ id: 'other', costId: 'x' }),
      ],
    });

    expect(plan.files.map((file) => file.name)).toEqual([
      COST_TABLE_NAME,
      'Belege/01_2026-03-12_Hornbach.jpg',
      'Belege/02_2026-10-02_Fenster Müller.pdf',
    ]);
    // the archived original goes to the bank, not the working copy
    expect(plan.files[2]).toMatchObject({ storagePath: 'orig/p2.pdf', bytes: 900 });
    expect(plan.receiptCount).toBe(2);
    expect(plan.withoutReceipt).toBe(0);

    const table = rows(plan.files[0]!.text!);
    expect(table[1]!.slice(0, 3)).toEqual(['1', '2026-03-12', 'Hornbach']);
    expect(table[1]!.at(-1)).toBe('01_2026-03-12_Hornbach.jpg');
    expect(table[2]!.slice(0, 3)).toEqual(['2', '2026-10-02', 'Fenster Müller']);
  });

  it('writes marks by name, counts missing receipts and sums up', () => {
    const plan = planCostExport({
      costs: [
        cost({ id: 'a', amountGross: 119, amountNet: 100, vatAmount: 19, vatRate: 19, marks: ['kfw', 'absetzbar'] }),
        cost({ id: 'b', date: '2026-09-02', amountGross: 1000.5 }),
      ],
      photos: [],
    });

    expect(plan.receiptCount).toBe(0);
    expect(plan.withoutReceipt).toBe(2);
    const table = rows(plan.files[0]!.text!);
    const header = table[0]!;
    expect(table[1]![header.indexOf('Kennzeichen')]).toBe('KfW, Absetzbar');
    expect(table[1]![header.indexOf('Beleg')]).toBe('kein Beleg');
    const sum = table.at(-1)!;
    expect(sum[header.indexOf('Brutto')]).toBe('1.119,50');
    // only one of two lines has a net amount, so no net sum
    expect(sum[header.indexOf('Netto')]).toBe('');
  });

  it('gives further pages of one invoice the same number', () => {
    const invoice = cost({ id: 'a', receiptPhotoIds: ['back', 'front'] });
    const photos = [receipt({ id: 'front', costId: 'a' }), receipt({ id: 'back', costId: 'a' })];
    expect(receiptsOf(invoice, photos).map((photo) => photo.id)).toEqual(['back', 'front']);
    const names = planCostExport({ costs: [invoice], photos }).files.slice(1).map((file) => file.name);
    expect(names).toEqual(['Belege/01_2026-09-01_Bauhaus.jpg', 'Belege/01-2_2026-09-01_Bauhaus.jpg']);
  });
});

describe('costExportBaseName', () => {
  it('carries the filter in the name', () => {
    expect(costExportBaseName('2026-11-10', 'KfW')).toBe('rechnungen-kfw-2026-11-10');
    expect(costExportBaseName('2026-11-10')).toBe('rechnungen-2026-11-10');
  });
});
