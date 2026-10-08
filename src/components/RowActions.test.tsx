import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRowActions } from './RowActions';

function List({ onOpen, onDelete }: { onOpen(): void; onDelete(): void }) {
  const rowActions = useRowActions();
  return (
    <>
      <button type="button" onClick={onOpen} {...rowActions.bind('Fenster', [{ label: 'Löschen', icon: 'trash', danger: true, onSelect: onDelete }])}>
        Fenster
      </button>
      {rowActions.sheet}
    </>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('long press on a row', () => {
  it('opens the actions after holding, without also opening the row', () => {
    const onOpen = vi.fn();
    const onDelete = vi.fn();
    render(<List onOpen={onOpen} onDelete={onDelete} />);
    const row = screen.getByRole('button', { name: 'Fenster' });

    fireEvent.pointerDown(row, { clientX: 10, clientY: 10, pointerType: 'touch' });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    fireEvent.pointerUp(row);
    fireEvent.click(row);
    expect(onOpen).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Löschen' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('a short tap or a scroll stays a normal tap', () => {
    const onOpen = vi.fn();
    render(<List onOpen={onOpen} onDelete={vi.fn()} />);
    const row = screen.getByRole('button', { name: 'Fenster' });

    fireEvent.pointerDown(row, { clientX: 10, clientY: 10, pointerType: 'touch' });
    // scrolling the list: the browser takes the pointer over and cancels it
    fireEvent.pointerCancel(row);
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.queryByRole('button', { name: 'Löschen' })).not.toBeInTheDocument();
    fireEvent.click(row);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
