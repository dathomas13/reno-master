import { describe, expect, it } from 'vitest';
import { geminiExtractor } from '@/platform/ocr/gemini';
import { friendlyOcrError } from '@/platform/ocr/errors';

/** the two globals these engines lean on, stubbed so the test says the same everywhere */
function stubDevice(settings: Record<string, unknown>, online = true) {
  const store: Record<string, string> = { 'reno.settings': JSON.stringify(settings) };
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => void (store[key] = value),
      removeItem: (key: string) => void delete store[key],
    },
  });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    writable: true,
    value: { onLine: online },
  });
}

interface Captured {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

/** answers like the API does and records what was asked */
function stubFetch(reply: { ok: boolean; status?: number; json: unknown }): { calls: Captured[] } {
  const calls: Captured[] = [];
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    writable: true,
    value: (url: string, init: { headers: Record<string, string>; body: string }) => {
      calls.push({ url, headers: init.headers, body: JSON.parse(init.body) as Record<string, unknown> });
      return Promise.resolve({
        ok: reply.ok,
        status: reply.status ?? (reply.ok ? 200 : 500),
        json: () => Promise.resolve(reply.json),
      });
    },
  });
  return { calls };
}

function answer(json: string) {
  return { candidates: [{ content: { parts: [{ text: json }] } }] };
}

const CATEGORIES = ['Material', 'Handwerker'];

describe('geminiExtractor', () => {
  it('is only available with a key and a connection', async () => {
    stubDevice({ geminiApiKey: 'AIza-test' });
    expect(await geminiExtractor.isAvailable()).toBe(true);

    stubDevice({ geminiApiKey: '' });
    expect(await geminiExtractor.isAvailable()).toBe(false);

    stubDevice({ geminiApiKey: 'AIza-test' }, false);
    expect(await geminiExtractor.isAvailable()).toBe(false);
  });

  it('keeps the key in the header, never in the address', async () => {
    stubDevice({ geminiApiKey: 'AIza-geheim' });
    const { calls } = stubFetch({ ok: true, json: answer('{"vendor":"OBI","amountGross":12.5}') });

    await geminiExtractor.extract({ file: new Blob(['x']), contentType: 'image/jpeg', categories: CATEGORIES });

    // a key in the query string lands in logs and referrers, which is the whole point
    expect(calls[0]!.url).not.toContain('AIza-geheim');
    expect(calls[0]!.headers['x-goog-api-key']).toBe('AIza-geheim');
  });

  it('asks the configured model, and the default when none is set', async () => {
    stubDevice({ geminiApiKey: 'k', geminiModel: 'gemini-2.5-pro' });
    const pro = stubFetch({ ok: true, json: answer('{}') });
    await geminiExtractor.extract({ file: new Blob(['x']), contentType: 'image/jpeg' });
    expect(pro.calls[0]!.url).toContain('gemini-2.5-pro');

    stubDevice({ geminiApiKey: 'k', geminiModel: '   ' });
    const fallback = stubFetch({ ok: true, json: answer('{}') });
    await geminiExtractor.extract({ file: new Blob(['x']), contentType: 'image/jpeg' });
    expect(fallback.calls[0]!.url).toContain('gemini-2.5-flash');
  });

  it('asks without creativity and names the categories', async () => {
    stubDevice({ geminiApiKey: 'k' });
    const { calls } = stubFetch({ ok: true, json: answer('{}') });
    await geminiExtractor.extract({ file: new Blob(['x']), contentType: 'image/jpeg', categories: CATEGORIES });

    const body = calls[0]!.body as {
      generationConfig: { temperature: number };
      contents: { parts: { text?: string; inline_data?: { mime_type: string } }[] }[];
    };
    // reading a receipt twice must not produce two different amounts
    expect(body.generationConfig.temperature).toBe(0);
    expect(body.contents[0]!.parts[0]!.inline_data!.mime_type).toBe('image/jpeg');
    expect(body.contents[0]!.parts[1]!.text).toContain('Material');
  });

  it('sends a PDF the same way, only the type differs', async () => {
    stubDevice({ geminiApiKey: 'k' });
    const { calls } = stubFetch({ ok: true, json: answer('{}') });
    await geminiExtractor.extract({ file: new Blob(['x']), contentType: 'application/pdf' });

    const body = calls[0]!.body as { contents: { parts: { inline_data?: { mime_type: string } }[] }[] };
    expect(body.contents[0]!.parts[0]!.inline_data!.mime_type).toBe('application/pdf');
  });

  it('puts the answer through the same validation as Claude', async () => {
    stubDevice({ geminiApiKey: 'k' });
    stubFetch({
      ok: true,
      json: answer('{"vendor":"OBI","amountGross":"1.234,56","vatRate":21,"category":"Weltraumfahrt"}'),
    });

    const fields = await geminiExtractor.extract({
      file: new Blob(['x']),
      contentType: 'image/jpeg',
      categories: CATEGORIES,
    });
    expect(fields.vendor).toBe('OBI');
    expect(fields.amountGross).toBe(1234.56); // German number, read as one
    expect(fields.vatRate).toBeUndefined(); // 21 % does not exist here
    expect(fields.category).toBeUndefined(); // not one of ours, so it stays empty
  });

  it('carries the status of a refusal, so the message can name the cause', async () => {
    stubDevice({ geminiApiKey: 'falsch' });
    stubFetch({ ok: false, status: 404, json: { error: { message: 'models/quatsch is not found' } } });

    let caught: unknown;
    try {
      await geminiExtractor.extract({ file: new Blob(['x']), contentType: 'image/jpeg' });
    } catch (error) {
      caught = error;
    }
    expect((caught as { status?: number }).status).toBe(404);
    expect(friendlyOcrError(caught)).toContain('Modellnamen');
  });

  it('says so when the answer holds no JSON at all', async () => {
    stubDevice({ geminiApiKey: 'k' });
    stubFetch({ ok: true, json: answer('Tut mir leid, das kann ich nicht lesen.') });

    let caught: unknown;
    try {
      await geminiExtractor.extract({ file: new Blob(['x']), contentType: 'image/jpeg' });
    } catch (error) {
      caught = error;
    }
    expect((caught as Error).message).toContain('kein lesbares Ergebnis');
  });
});

describe('friendlyOcrError', () => {
  it('points at the key when the service refuses it', () => {
    stubDevice({}, true);
    expect(friendlyOcrError({ status: 401 })).toContain('API-Key');
    expect(friendlyOcrError({ status: 403 })).toContain('API-Key');
  });

  it('asks for patience instead of blaming the setup', () => {
    stubDevice({}, true);
    expect(friendlyOcrError({ status: 429 })).toContain('noch einmal');
    expect(friendlyOcrError({ status: 503 })).toContain('nicht erreichbar');
  });

  it('names the connection first, because that explains everything else', () => {
    stubDevice({}, false);
    expect(friendlyOcrError({ status: 401 })).toContain('nur online');
  });
});
