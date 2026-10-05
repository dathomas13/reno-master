import { useMemo } from 'react';
import { useOptions } from '@/data/useOptions';
import type { OptionEntry, OptionSetKey } from '@/data/options';
import { MultiPicker } from './Pickers';

/**
 * What a picker offers for one option set: the visible entries plus whatever the record
 * already holds that is hidden or unknown, so a stored value never silently vanishes from
 * the form.
 */
function useChoices(setKey: OptionSetKey, stored: readonly string[]) {
  const { active, label, add } = useOptions();
  const visible = active(setKey);
  const extra: OptionEntry[] = [];
  for (const id of stored) {
    if (visible.some((entry) => entry.id === id) || extra.some((entry) => entry.id === id)) continue;
    extra.push({ id, label: label(setKey, id), archived: true });
  }
  return { choices: [...visible, ...extra], selected: [...stored], add: (name: string) => add(setKey, name) };
}

interface OptionChipsProps {
  setKey: OptionSetKey;
  value: string | undefined;
  onChange(value: string | undefined): void;
  allowEmpty?: boolean;
}

/** one value out of an option set, as chips; writes the id */
export function OptionChips({ setKey, value, onChange, allowEmpty = true }: OptionChipsProps) {
  const stored = useMemo(() => (value ? [value] : []), [value]);
  const { choices, selected } = useChoices(setKey, stored);
  const current = selected[0];
  return (
    <div className="flex flex-wrap gap-2">
      {choices.map((entry) => (
        <button
          key={entry.id}
          type="button"
          aria-pressed={current === entry.id}
          className={`chip ${current === entry.id ? 'chip-on' : ''} ${entry.archived ? 'opacity-70' : ''}`}
          onClick={() => onChange(current === entry.id && allowEmpty ? undefined : entry.id)}
        >
          {entry.label}
        </button>
      ))}
    </div>
  );
}

interface OptionMultiChipsProps {
  setKey: OptionSetKey;
  value: readonly string[];
  onChange(value: string[]): void;
}

/** several values out of an option set, as chips; writes ids */
export function OptionMultiChips({ setKey, value, onChange }: OptionMultiChipsProps) {
  const { choices, selected } = useChoices(setKey, value);
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  }
  return (
    <div className="flex flex-wrap gap-2">
      {choices.map((entry) => (
        <button
          key={entry.id}
          type="button"
          aria-pressed={selected.includes(entry.id)}
          className={`chip ${selected.includes(entry.id) ? 'chip-on' : ''} ${entry.archived ? 'opacity-70' : ''}`}
          onClick={() => toggle(entry.id)}
        >
          {entry.label}
        </button>
      ))}
    </div>
  );
}

interface OptionSelectProps {
  setKey: OptionSetKey;
  value: string | undefined;
  onChange(value: string | undefined): void;
  emptyLabel?: string;
  className?: string;
  ariaLabel?: string;
}

/** one value out of an option set as a native select (long lists); writes the id */
export function OptionSelect({ setKey, value, onChange, emptyLabel = '–', className = 'field', ariaLabel }: OptionSelectProps) {
  const stored = useMemo(() => (value ? [value] : []), [value]);
  const { choices, selected } = useChoices(setKey, stored);
  return (
    <select
      className={className}
      aria-label={ariaLabel}
      value={selected[0] ?? ''}
      onChange={(event) => onChange(event.target.value || undefined)}
    >
      <option value="">{emptyLabel}</option>
      {choices.map((entry) => (
        <option key={entry.id} value={entry.id}>
          {entry.label}
        </option>
      ))}
    </select>
  );
}

interface OptionMultiPickerProps {
  setKey: OptionSetKey;
  label: string;
  value: readonly string[];
  onChange(value: string[]): void;
  emptyLabel?: string;
  /** offers „＋“ that adds a new entry to the set (by prompt) and selects it */
  addLabel?: string;
}

/** several values out of a (long) option set behind a sheet, e.g. people or roles; writes ids */
export function OptionMultiPicker({ setKey, label, value, onChange, emptyLabel, addLabel }: OptionMultiPickerProps) {
  const { choices, selected, add } = useChoices(setKey, value);
  function addNew() {
    const name = window.prompt(addLabel ?? `${label} hinzufügen`)?.trim();
    if (!name) return;
    const id = add(name);
    if (id && !selected.includes(id)) onChange([...selected, id]);
  }
  return (
    <MultiPicker
      label={label}
      value={selected}
      onChange={onChange}
      options={choices.map((entry) => ({ id: entry.id, name: entry.label }))}
      emptyLabel={emptyLabel}
      onAdd={addLabel ? addNew : undefined}
      addLabel={addLabel}
    />
  );
}
