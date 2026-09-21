import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { Contact } from '@/data/types';
import ContactsPage from './ContactsPage';

const mocks = vi.hoisted(() => ({
  contacts: [] as Contact[],
  saveContact: vi.fn().mockResolvedValue('contact-1'),
}));

vi.mock('@/components/TopBar', () => ({
  TopBar: ({ action }: { action?: React.ReactNode }) => <header>{action}</header>,
}));
vi.mock('@/components/Pickers', () => ({ TradePicker: () => null, RolePicker: () => null }));
vi.mock('@/data/hooks', () => ({
  useCollection: (name: string) => ({ data: name === 'contacts' ? mocks.contacts : [], loading: false }),
}));
vi.mock('@/data/useLists', () => ({ useLists: () => ({ lists: { contactRoles: [] }, addTo: vi.fn() }) }));
vi.mock('@/data/repos', () => ({
  emptyContact: () => ({ id: 'new-contact', name: '', tradeIds: [], roles: [] }),
  saveContact: mocks.saveContact,
  deleteContact: vi.fn(),
  emptyContactLog: (contactId: string) => ({ id: 'new-log', contactId, at: '2026-01-01T00:00:00', text: '' }),
  saveContactLog: vi.fn(),
  deleteContactLog: vi.fn(),
}));

beforeEach(() => {
  mocks.contacts = [{ id: 'contact-1', name: 'Alter Name', tradeIds: [] }];
  mocks.saveContact.mockClear();
});
afterEach(cleanup);

describe('contacts page', () => {
  it('saves the contact when using the sheet header done button', async () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ContactsPage />
      </MemoryRouter>,
    );
    await act(async () => {});

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Alter Name/ }));
    });
    const dialog = screen.getByRole('dialog', { name: 'Kontakt' });
    fireEvent.change(within(dialog).getAllByRole('textbox')[0], { target: { value: 'Neuer Name' } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Fertig' }));
    });

    expect(mocks.saveContact).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'contact-1', name: 'Neuer Name' }),
    );
  });
});
