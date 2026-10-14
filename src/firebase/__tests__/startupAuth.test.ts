import { describe, expect, it, vi } from 'vitest';
import { skipSessionCheckWhileRestoring } from '../startupAuth';

const LOOKUP = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=k';

describe('start-up without waiting for the server', () => {
  it('fails the session check at once while the session is restored, like offline', async () => {
    const real = vi.fn().mockResolvedValue({});
    const target = { fetch: real as unknown as typeof fetch };
    skipSessionCheckWhileRestoring(target, new Promise(() => undefined));

    await expect(target.fetch(LOOKUP, { method: 'POST' })).rejects.toBeInstanceOf(TypeError);
    expect(real).not.toHaveBeenCalled();

    await target.fetch('https://firestore.googleapis.com/x');
    expect(real).toHaveBeenCalledWith('https://firestore.googleapis.com/x', undefined);
  });

  it('lets the check through again once the session is restored', async () => {
    const real = vi.fn().mockResolvedValue({});
    const target = { fetch: real as unknown as typeof fetch };
    let restored!: () => void;
    skipSessionCheckWhileRestoring(target, new Promise<void>((resolve) => { restored = resolve; }));

    restored();
    await Promise.resolve();
    await target.fetch(LOOKUP);
    expect(real).toHaveBeenCalledWith(LOOKUP, undefined);
  });
});
