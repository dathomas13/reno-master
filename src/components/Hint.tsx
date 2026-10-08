import { useEffect, useState } from 'react';
import { hintSeen, markHintSeen } from '@/lib/hints';
import { Icon } from './Icon';

interface HintProps {
  id: string;
  children: string;
  /** set once the user did what the hint explains - it then goes away for good */
  done?: boolean;
  className?: string;
}

/** a quiet one-line hint for a gesture, shown until it was used or closed once */
export function Hint({ id, children, done = false, className = '' }: HintProps) {
  const [visible, setVisible] = useState(() => !hintSeen(id));

  useEffect(() => {
    if (!done) return;
    markHintSeen(id);
    setVisible(false);
  }, [done, id]);

  if (!visible) return null;
  return (
    <div
      role="note"
      className={`flex items-center gap-2 rounded-xl bg-panel/90 border border-line pl-3 text-xs text-muted ${className}`}
    >
      <span className="flex-1 py-2">{children}</span>
      <button
        type="button"
        className="w-11 h-9 grid place-items-center shrink-0"
        aria-label="Hinweis schließen"
        onClick={() => {
          markHintSeen(id);
          setVisible(false);
        }}
      >
        <Icon name="close" className="w-4 h-4" />
      </button>
    </div>
  );
}
