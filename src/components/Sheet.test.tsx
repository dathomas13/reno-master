import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeTopmost } from '@/platform/backHandlers';
import { Sheet } from './Sheet';

afterEach(cleanup);

describe('sheet', () => {
  it('counts a tap beside a saving sheet as "Fertig", not as throwing the input away', () => {
    const onClose = vi.fn();
    const onDone = vi.fn();
    render(
      <Sheet open onClose={onClose} onDone={onDone} title="Aufgabe">
        <p>Inhalt</p>
      </Sheet>,
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Fertig' })[0]!);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on the back button while open, and lets back through once closed', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Sheet open onClose={onClose} title="Erfassen" doneLabel="Schließen">
        <p>Inhalt</p>
      </Sheet>,
    );
    act(() => {
      expect(closeTopmost()).toBe(true);
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(
      <Sheet open={false} onClose={onClose} title="Erfassen">
        <p>Inhalt</p>
      </Sheet>,
    );
    expect(closeTopmost()).toBe(false);
  });
});
