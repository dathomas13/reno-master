/** Fields an extractor tries to read from a receipt or invoice. */
export interface ReceiptFields {
  date?: string; // ISO 'YYYY-MM-DD'
  vendor?: string;
  amountGross?: number;
  amountNet?: number;
  vatRate?: number;
  vatAmount?: number;
  invoiceNumber?: string;
  description?: string;
  category?: string;
  /** 0..1, how much of the document could be interpreted */
  confidence: number;
  engine: 'mlkit' | 'claude' | 'gemini' | 'none';
  rawText?: string;
}

export interface ExtractInput {
  file: Blob;
  contentType: string;
  /** labels of the visible cost categories, so an engine can pick one; the caller maps the answer back to an id */
  categories?: string[];
}

export interface ReceiptExtractor {
  readonly id: 'mlkit' | 'claude' | 'gemini';
  readonly label: string;
  isAvailable(): Promise<boolean>;
  extract(input: ExtractInput): Promise<ReceiptFields>;
}

export const EMPTY_FIELDS: ReceiptFields = { confidence: 0, engine: 'none' };
