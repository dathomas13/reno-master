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
  engine: 'mlkit' | 'claude' | 'none';
  rawText?: string;
}

export interface ExtractInput {
  file: Blob;
  contentType: string;
  /** categories the app knows, so an engine can pick one */
  categories?: string[];
}

export interface ReceiptExtractor {
  readonly id: 'mlkit' | 'claude';
  readonly label: string;
  isAvailable(): Promise<boolean>;
  extract(input: ExtractInput): Promise<ReceiptFields>;
}

export const EMPTY_FIELDS: ReceiptFields = { confidence: 0, engine: 'none' };
