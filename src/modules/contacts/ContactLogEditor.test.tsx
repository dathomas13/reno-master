import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Contact, ContactLog } from '@/data/types';
import { ContactLogEditor } from './ContactLogSection';

const mocks = vi.hoisted(() => ({
  saveContact: vi.fn().mockResolvedValue('new-contact'),
}));

vi.mock('@/components/Pickers', () => ({ TradePicker: () => null, MultiPicker: () => null }));
vi.mock('@/data/hooks', () => ({ useCollection: () => ({ data: [], loading: false }) }));
vi.mock('@/data/useOptions', async () => {
  const options = await import('@/data/options');
  const { DEFAULT_OPTIONS: sets } = options;
  const value = {
    sets,
    label: (key: keyof typeof sets, stored: string) => options.labelOf(sets[key], stored),
    active: (key: keyof typeof sets) => options.activeEntries(sets[key]),
    add: () => '',
  };
  return { useOptions: () => value };
});
vi.mock('@/data/repos', () => ({
  emptyContact: () => ({ id: 'new-contact', name: '', tradeIds: [], roles: [] }),
  saveContact: mocks.saveContact,
  emptyContactLog: (contactId: string) => ({ id: 'new-log', contactId, at: '2026-01-01T00:00:00', text: '' }),
  saveContactLog: vi.fn(),
  deleteContactLog: vi.fn(),
}));

const contacts: Contact[] = [{ id: 'contact-1', name: 'Maler Huber', tradeIds: [], roles: [] }];
const fresh: ContactLog = { id: 'new-log', contactId: '', at: '2026-01-01T00:00:00', text: '' };

function renderEditor(onSave = vi.fn().mockResolvedValue(undefined)) {
  render(<ContactLogEditor log={fresh} contacts={contacts} isNew onClose={vi.fn()} onSave={onSave} onDelete={vi.fn()} />);
  return onSave;
}

beforeEach(() => mocks.saveContact.mockClear());
afterEach(cleanup);

describe('contact log editor', () => {
  it('saves an entry without a contact', async () => {
    const onSave = renderEditor();
    fireEvent.change(screen.getAllByRole('textbox').at(-1)!, { target: { value: 'Rückruf Fenster' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    });

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ contactId: '', text: 'Rückruf Fenster' }));
    expect(mocks.saveContact).not.toHaveBeenCalled();
  });

  it('creates a new contact by name and files the entry under it', async () => {
    const onSave = renderEditor();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '__neu__' } });
    const save = screen.getByRole('button', { name: 'Speichern' });
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('Name des neuen Kontakts'), { target: { value: ' Fliesen Meier ' } });
    await act(async () => {
      fireEvent.click(save);
    });

    expect(mocks.saveContact).toHaveBeenCalledWith(expect.objectContaining({ id: 'new-contact', name: 'Fliesen Meier' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ contactId: 'new-contact' }));
  });
});
