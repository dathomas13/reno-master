/**
 * Types for the parts of the worker the app's tests import (src/data/__tests__/apiWorker.test.ts).
 * The worker itself stays plain JavaScript, so it can be pasted into the Cloudflare dashboard.
 */
export interface WorkerOptionEntry {
  id: string;
  label: string;
  archived?: boolean;
}

export const API_SCOPES: readonly string[];
export const OPTION_LABELS: Record<string, string[]>;
export function slugify(label: string): string;
export function normalizeOptions(stored: unknown): Record<string, WorkerOptionEntry[]>;
export function resolveOption(entries: readonly WorkerOptionEntry[], value: unknown, field: string): string | undefined;

declare const worker: { fetch(request: Request, env: Record<string, unknown>, ctx?: unknown): Promise<Response> };
export default worker;
