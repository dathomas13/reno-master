import type { ReactNode } from 'react';

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="mb-4">
      <span className="label">{label}</span>
      {children}
      {hint && <p className="text-xs text-muted mt-1">{hint}</p>}
    </div>
  );
}

interface ChipSelectProps<T extends string> {
  options: readonly T[];
  value: T[];
  onChange(value: T[]): void;
  multiple?: boolean;
  allowEmpty?: boolean;
  onAdd?(): void;
}

/** the main way to pick things on a phone: everything visible, one tap, no dropdown */
export function ChipSelect<T extends string>({
  options,
  value,
  onChange,
  multiple = true,
  allowEmpty = true,
  onAdd,
}: ChipSelectProps<T>) {
  function toggle(option: T) {
    if (!multiple) {
      onChange(value[0] === option && allowEmpty ? [] : [option]);
      return;
    }
    onChange(value.includes(option) ? value.filter((item) => item !== option) : [...value, option]);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className={`chip ${value.includes(option) ? 'chip-on' : ''}`}
          onClick={() => toggle(option)}
        >
          {option}
        </button>
      ))}
      {onAdd && (
        <button type="button" className="chip" onClick={onAdd}>
          ＋
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-8 py-16 gap-2">
      <p className="text-ink">{title}</p>
      {hint && <p className="text-muted text-sm">{hint}</p>}
      {action}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-muted">
      <span className="w-4 h-4 rounded-full border-2 border-muted border-t-transparent animate-spin" />
      {label}
    </div>
  );
}
