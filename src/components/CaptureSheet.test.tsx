import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { setOpenRoom } from '@/lib/openRoom';
import { CaptureSheet } from './CaptureSheet';

vi.mock('@/data/hooks', () => ({ useCollection: () => ({ data: [], loading: false }) }));
vi.mock('@/firebase/db', () => ({ where: vi.fn() }));
vi.mock('@/data/RoomsContext', () => ({ useRooms: () => ({ shortLabel: (id: string) => `Raum ${id}` }) }));

function Where() {
  const location = useLocation();
  return <output>{`${location.pathname}${location.search}`}</output>;
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <CaptureSheet open onClose={() => undefined} />
      <Where />
    </MemoryRouter>,
  );
}

afterEach(() => {
  setOpenRoom(null);
  cleanup();
});

describe('capture sheet', () => {
  it('takes the room of a room filter along', async () => {
    renderAt('/tagebuch?raum=eg-bad');
    expect(screen.getByText('Raum eg-bad')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Aufgabe/ }));
    });
    expect(screen.getByRole('status')).toHaveTextContent('/aufgaben?neu=1&raum=eg-bad');
  });

  it('takes the room open in 3D along when the address has none', async () => {
    setOpenRoom('og-kind');
    renderAt('/3d');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Fotos von heute/ }));
    });
    expect(screen.getByRole('status')).toHaveTextContent('/tagebuch/neu?fotos=heute&raum=og-kind');
  });

  it('goes without a room when none is open', async () => {
    renderAt('/');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Notiz/ }));
    });
    expect(screen.getByRole('status')).toHaveTextContent(/^\/notizen\?neu=1$/);
  });
});
