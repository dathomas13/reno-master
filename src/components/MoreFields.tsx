import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

interface MoreFieldsProps {
  /** how many of the fields inside already carry a value */
  filled: number;
  children: ReactNode;
  title?: string;
}

/**
 * The rarely needed part of a long form. It opens when something in it is filled in - a
 * value must never hide - and once the user toggled it, it stays the way they set it.
 */
export function MoreFields({ filled, children, title = 'Weitere Angaben' }: MoreFieldsProps) {
  const [open, setOpen] = useState(filled > 0);
  const [touched, setTouched] = useState(false);

  // values that arrive later (a loaded record, a read receipt) open it too - until the
  // user has opened or closed it by hand
  useEffect(() => {
    if (!touched && filled > 0) setOpen(true);
  }, [filled, touched]);
  return (
    <div className="mb-4 border-t border-line/60">
      <button
        type="button"
        className="w-full min-h-12 flex items-center gap-2 text-left"
        aria-expanded={open}
        onClick={() => {
          setTouched(true);
          setOpen(!open);
        }}
      >
        <span className="flex-1">
          <span className="font-medium">{title}</span>
          {filled > 0 && <span className="text-sm text-muted"> · {filled} ausgefüllt</span>}
        </span>
        <Icon name="chevronDown" className={`w-5 h-5 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="pt-2">{children}</div>}
    </div>
  );
}
