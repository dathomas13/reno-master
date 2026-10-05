import { useMemo, useState } from 'react';
import { TopBar } from '@/components/TopBar';
import { useCollection } from '@/data/hooks';
import { COL, type Phase } from '@/data/types';
import { createPhase, swapPhaseOrder } from '@/data/repos';
import { findDuplicate, normalizeEntry } from '@/data/presetLists';
import { usePhaseUsage } from '@/data/phaseUsage';
import { useOptions } from '@/data/useOptions';
import { formatDate } from '@/lib/date';
import PhaseSheet from './PhaseSheet';

function byOrder(a: Phase, b: Phase): number {
  return (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, 'de');
}

function period(phase: Phase): string | null {
  if (phase.start && phase.end) return `${formatDate(phase.start)}–${formatDate(phase.end)}`;
  if (phase.start) return `ab ${formatDate(phase.start)}`;
  if (phase.end) return `bis ${formatDate(phase.end)}`;
  return null;
}

export default function PhasesEditor() {
  const { data: phases } = useCollection<Phase>(COL.phases);
  const usage = usePhaseUsage();
  const { label } = useOptions();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [editId, setEditId] = useState<string | null>(null);

  const active = useMemo(() => phases.filter((p) => !p.archived).sort(byOrder), [phases]);
  const hidden = useMemo(() => phases.filter((p) => p.archived).sort(byOrder), [phases]);
  const editing = phases.find((p) => p.id === editId) ?? null;

  function add() {
    const name = normalizeEntry(draft, 80);
    if (!name) return;
    if (findDuplicate(phases.map((p) => p.name), name)) {
      setError('Diese Phase gibt es schon.');
      return;
    }
    const next = phases.reduce((max, p) => Math.max(max, p.order ?? 0), -1) + 1;
    createPhase(name, next);
    setDraft('');
    setError('');
  }

  function move(index: number, delta: -1 | 1) {
    const first = active[delta < 0 ? index - 1 : index];
    const second = active[delta < 0 ? index : index + 1];
    if (first && second) swapPhaseOrder(first, second);
  }

  function row(phase: Phase, index: number, muted: boolean) {
    const parts = [label('phaseStatus', phase.status), period(phase), `${usage.get(phase.id) ?? 0}×`].filter(Boolean);
    const arrow = 'w-11 h-11 shrink-0 flex items-center justify-center text-muted hover:text-ink disabled:opacity-30';
    return (
      <div key={phase.id} className="flex items-center border-b border-line/60 last:border-0">
        <button
          type="button"
          className={`list-row flex-1 min-w-0 text-left min-h-14 ${muted ? 'text-muted' : ''}`}
          aria-label={`Phase ${phase.name} bearbeiten`}
          onClick={() => setEditId(phase.id)}
        >
          <span className="flex-1 min-w-0">
            <span className="block truncate">{phase.name}</span>
            <span className="block text-xs text-muted truncate">{parts.join(' · ')}</span>
          </span>
        </button>
        {!muted && (
          <>
            <button
              type="button"
              className={arrow}
              aria-label={`${phase.name} nach oben`}
              disabled={index === 0}
              onClick={() => move(index, -1)}
            >
              ↑
            </button>
            <button
              type="button"
              className={arrow}
              aria-label={`${phase.name} nach unten`}
              disabled={index === active.length - 1}
              onClick={() => move(index, 1)}
            >
              ↓
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      <TopBar
        title="Phasen"
        subtitle={`${active.length} aktiv · ${hidden.length} ausgeblendet`}
        back="/einstellungen/voreinstellungen"
      />
      <form
        className="flex gap-2 p-3"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <input
          className="field flex-1"
          aria-label="Neue Phase"
          placeholder="Neue Phase …"
          value={draft}
          maxLength={80}
          onChange={(event) => {
            setDraft(event.target.value);
            setError('');
          }}
        />
        <button type="submit" className="btn btn-primary min-h-11 min-w-11" aria-label="Phase hinzufügen">
          ＋
        </button>
      </form>
      {error && (
        <p role="alert" className="px-3 pb-2 text-sm text-bad">
          {error}
        </p>
      )}
      <div>{active.map((phase, index) => row(phase, index, false))}</div>
      {hidden.length > 0 && (
        <>
          <div className="section-title">AUSGEBLENDET</div>
          <div>{hidden.map((phase, index) => row(phase, index, true))}</div>
        </>
      )}
      <PhaseSheet
        key={editing?.id ?? 'none'}
        phase={editing}
        phases={phases}
        usage={editing ? (usage.get(editing.id) ?? 0) : 0}
        onClose={() => setEditId(null)}
      />
    </div>
  );
}
