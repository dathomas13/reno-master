interface SegmentedProps<T extends string> {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange(value: T): void;
  /** read out by screen readers, e.g. 'Ansicht' */
  label: string;
  className?: string;
}

/**
 * Switching between views of the same screen (Liste | Übersicht, Offen | Alle | Erledigt).
 * It looks different from the filter and action chips on purpose: a chip adds or removes
 * something, this picks exactly one.
 */
export function Segmented<T extends string>({ options, value, onChange, label, className = '' }: SegmentedProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`grid rounded-xl border border-line overflow-hidden bg-panel/60 ${className}`}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          className={`min-h-10 px-2 text-sm truncate ${
            value === option.value ? 'bg-accent/15 text-accent font-semibold' : 'text-muted'
          }`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
