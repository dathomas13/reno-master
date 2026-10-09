import type { ReactNode } from 'react';
import { Icon } from '@/components/Icon';

/** a settings card that starts folded, for the rarely touched sections */
export function SettingsFold({ title, summary, children }: { title: string; summary?: string; children: ReactNode }) {
  return (
    <details className="card p-4 group">
      <summary className="flex items-center gap-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <span className="flex-1 min-w-0">
          <span className="block font-semibold">{title}</span>
          {summary && <span className="block text-sm text-muted truncate">{summary}</span>}
        </span>
        <span className="text-muted transition-transform group-open:rotate-90">
          <Icon name="chevronRight" className="w-5 h-5" />
        </span>
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}
