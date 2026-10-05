import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PresetListEditor, type PresetListEditorProps } from './PresetListEditor';

afterEach(cleanup);

function setup(over: Partial<PresetListEditorProps> = {}) {
  const props: PresetListEditorProps = {
    setKey: 'people',
    entries: [
      { id: 'thomas', label: 'Thomas' },
      { id: 'sarah', label: 'Sarah' },
      { id: 'matze', label: 'Matze' },
      { id: 'jonas', label: 'Jonas', archived: true },
    ],
    usage: new Map([['matze', 14]]),
    singular: 'Person',
    placeholder: 'Person hinzufügen …',
    onAdd: vi.fn().mockReturnValue('neu'),
    onRename: vi.fn(),
    onArchive: vi.fn().mockReturnValue(2),
    onUnarchive: vi.fn(),
    onMove: vi.fn(),
    onSortAlpha: vi.fn(),
    onReset: vi.fn(),
    ...over,
  };
  render(<PresetListEditor {...props} />);
  return props;
}

describe('PresetListEditor', () => {
  it('adds a trimmed name and refuses a visible duplicate', () => {
    const props = setup();
    const input = screen.getByPlaceholderText('Person hinzufügen …');
    fireEvent.change(input, { target: { value: '  sarah ' } });
    fireEvent.submit(input.closest('form')!);
    expect(props.onAdd).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('„Sarah“ steht schon in der Liste.');

    fireEvent.change(input, { target: { value: ' Paul ' } });
    fireEvent.submit(input.closest('form')!);
    expect(props.onAdd).toHaveBeenCalledWith('Paul');
  });

  it('lets a hidden name through, the add shows it again', () => {
    const props = setup();
    const input = screen.getByPlaceholderText('Person hinzufügen …');
    fireEvent.change(input, { target: { value: 'jonas' } });
    fireEvent.submit(input.closest('form')!);
    expect(props.onAdd).toHaveBeenCalledWith('jonas');
  });

  it('renames by id without any question, even for a used entry', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Matze umbenennen' }));
    const field = screen.getByRole('textbox', { name: 'Matze umbenennen' });
    fireEvent.change(field, { target: { value: 'Matthias' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(props.onRename).toHaveBeenCalledWith('matze', 'Matthias');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('hides at once and offers undo', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Matze ausblenden' }));
    expect(props.onArchive).toHaveBeenCalledWith('matze');
    const bar = screen.getByRole('status');
    expect(bar).toHaveTextContent('„Matze“ ausgeblendet.');
    fireEvent.click(within(bar).getByRole('button', { name: 'Rückgängig' }));
    expect(props.onUnarchive).toHaveBeenCalledWith('matze');
  });

  it('lists hidden entries apart and shows them again', () => {
    const props = setup();
    expect(screen.getByText('AUSGEBLENDET')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Jonas wieder anzeigen' }));
    expect(props.onUnarchive).toHaveBeenCalledWith('jonas');
  });

  it('sorts the visible entries with the arrows, and alphabetically from the menu', () => {
    const props = setup({ menuOpen: true });
    fireEvent.click(screen.getByRole('button', { name: 'Alphabetisch sortieren' }));
    expect(props.onSortAlpha).toHaveBeenCalled();
    cleanup();
    const second = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Sortieren' }));
    expect(screen.queryByRole('button', { name: 'Jonas nach oben' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sarah nach oben' }));
    expect(second.onMove).toHaveBeenCalledWith('sarah', -1);
  });

  it('resets a free list only after a confirmation', () => {
    const props = setup({ menuOpen: true });
    fireEvent.click(screen.getByRole('button', { name: 'Auf Standard zurücksetzen …' }));
    expect(props.onReset).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Zurücksetzen' }));
    expect(props.onReset).toHaveBeenCalled();
  });

  it('a fixed set can be renamed but neither extended nor hidden', () => {
    const props = setup({
      setKey: 'taskStatus',
      entries: [
        { id: 'offen', label: 'Offen' },
        { id: 'erledigt', label: 'Erledigt' },
      ],
      usage: undefined,
      menuOpen: true,
    });
    expect(screen.getByText(/Die App braucht diese Zustände/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Person hinzufügen …')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Offen ausblenden' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Auf Standard zurücksetzen …' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Standardnamen wiederherstellen' }));
    expect(props.onReset).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Offen umbenennen' })).toBeInTheDocument();
  });

  it('offers the defaults when the list is empty', () => {
    const props = setup({ entries: [] });
    expect(screen.getByText('Noch keine Einträge')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Standardwerte übernehmen' }));
    expect(props.onReset).toHaveBeenCalled();
  });
});
