import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PresetListEditor, type PresetListEditorProps } from './PresetListEditor';

afterEach(cleanup);

function setup(over: Partial<PresetListEditorProps> = {}) {
  const props: PresetListEditorProps = {
    items: ['Thomas', 'Sarah', 'Matze'],
    usage: new Map([['Matze', 14]]),
    singular: 'Person',
    placeholder: 'Person hinzufügen …',
    seedCount: 16,
    onAdd: vi.fn(),
    onRename: vi.fn(),
    onRemove: vi.fn().mockResolvedValue(1),
    onRestore: vi.fn(),
    onReorder: vi.fn(),
    onReset: vi.fn(),
    ...over,
  };
  render(<PresetListEditor {...props} />);
  return props;
}

describe('PresetListEditor', () => {
  it('adds a trimmed value and refuses a duplicate', () => {
    const props = setup();
    const input = screen.getByPlaceholderText('Person hinzufügen …');
    fireEvent.change(input, { target: { value: '  sarah ' } });
    fireEvent.submit(input.closest('form')!);
    expect(props.onAdd).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('„Sarah“ steht schon in der Liste.');

    fireEvent.change(input, { target: { value: ' Jonas ' } });
    fireEvent.submit(input.closest('form')!);
    expect(props.onAdd).toHaveBeenCalledWith('Jonas');
  });

  it('renames without a question when nothing uses the value', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Thomas umbenennen' }));
    const field = screen.getByRole('textbox', { name: 'Thomas umbenennen' });
    fireEvent.change(field, { target: { value: 'Tom' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(props.onRename).toHaveBeenCalledWith('Thomas', 'Tom', false);
  });

  it('asks before renaming a value that entries use', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Matze umbenennen' }));
    const field = screen.getByRole('textbox', { name: 'Matze umbenennen' });
    fireEvent.change(field, { target: { value: 'Matthias' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(props.onRename).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('„Matze“ steht in 14 Einträgen.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Überall umbenennen' }));
    expect(props.onRename).toHaveBeenCalledWith('Matze', 'Matthias', true);
  });

  it('removes at once and offers undo', async () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Matze löschen' }));
    const bar = await screen.findByRole('status');
    expect(bar).toHaveTextContent('„Matze“ entfernt. 14 Einträge behalten den Wert.');
    fireEvent.click(within(bar).getByRole('button', { name: 'Rückgängig' }));
    expect(props.onRestore).toHaveBeenCalledWith('Matze', 1);
  });

  it('sorts with the arrows and alphabetically', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Sortieren' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sarah nach oben' }));
    expect(props.onReorder).toHaveBeenCalledWith(['Sarah', 'Thomas', 'Matze']);
    fireEvent.click(screen.getByRole('button', { name: 'Alphabetisch sortieren' }));
    expect(props.onReorder).toHaveBeenLastCalledWith(['Matze', 'Sarah', 'Thomas']);
  });

  it('offers the defaults when the list is empty', () => {
    const props = setup({ items: [] });
    expect(screen.getByText('Noch keine Einträge')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Standardwerte übernehmen' }));
    expect(props.onReset).toHaveBeenCalled();
  });
});
