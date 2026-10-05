import { useEffect, useState } from 'react';
import { Sheet } from '@/components/Sheet';
import { Field } from '@/components/Fields';
import { OptionChips } from '@/components/OptionFields';
import type { Phase } from '@/data/types';
import { deletePhase, savePhase, setPhaseArchived } from '@/data/repos';
import { findDuplicate, normalizeEntry } from '@/data/presetLists';

interface PhaseSheetProps {
  phase: Phase | null;
  /** all phases, for the duplicate check */
  phases: Phase[];
  usage: number;
  onClose(): void;
}

/** edit one phase; "Fertig" saves, hiding and deleting act at once */
export default function PhaseSheet({ phase, phases, usage, onClose }: PhaseSheetProps) {
  const [name, setName] = useState('');
  const [status, setStatus] = useState<string | undefined>('geplant');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!phase) return;
    setName(phase.name);
    setStatus(phase.status);
    setStart(phase.start ?? '');
    setEnd(phase.end ?? '');
    setError('');
    // only when another phase is opened, not on every snapshot of the same one
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase?.id]);

  if (!phase) return null;

  function save() {
    if (!phase) return;
    const clean = normalizeEntry(name, 80);
    if (!clean) {
      setError('Der Name darf nicht leer sein.');
      return;
    }
    const others = phases.filter((other) => other.id !== phase.id).map((other) => other.name);
    if (findDuplicate(others, clean)) {
      setError('Diese Phase gibt es schon.');
      return;
    }
    if (start && end && end < start) {
      setError('Das Ende liegt vor dem Start.');
      return;
    }
    savePhase(phase.id, {
      name: clean,
      status: status ?? phase.status,
      start: start || undefined,
      end: end || undefined,
    });
    onClose();
  }

  function toggleArchived() {
    if (!phase) return;
    setPhaseArchived(phase.id, !phase.archived);
    onClose();
  }

  function remove() {
    if (!phase || usage > 0) return;
    if (!window.confirm(`„${phase.name}“ endgültig löschen?`)) return;
    deletePhase(phase.id);
    onClose();
  }

  return (
    <Sheet open onClose={onClose} onDone={save} title="Phase">
      <div className="space-y-4 pb-4">
        <Field label="Name">
          <input
            className="field"
            aria-label="Name der Phase"
            value={name}
            maxLength={80}
            onChange={(event) => {
              setName(event.target.value);
              setError('');
            }}
          />
        </Field>
        {error && (
          <p role="alert" className="text-sm text-bad">
            {error}
          </p>
        )}
        <Field label="Status">
          <OptionChips setKey="phaseStatus" value={status} allowEmpty={false} onChange={setStatus} />
        </Field>
        <div className="flex gap-3">
          <div className="flex-1">
            <Field label="Start">
              <input
                type="date"
                className="field"
                aria-label="Start der Phase"
                value={start}
                onChange={(event) => {
                  setStart(event.target.value);
                  setError('');
                }}
              />
            </Field>
          </div>
          <div className="flex-1">
            <Field label="Ende">
              <input
                type="date"
                className="field"
                aria-label="Ende der Phase"
                value={end}
                onChange={(event) => {
                  setEnd(event.target.value);
                  setError('');
                }}
              />
            </Field>
          </div>
        </div>
        <div className="pt-2 space-y-2">
          <button type="button" className="btn w-full min-h-11" onClick={toggleArchived}>
            {phase.archived ? 'Wieder anzeigen' : 'Ausblenden'}
          </button>
          {usage === 0 ? (
            <button type="button" className="btn btn-danger w-full min-h-11" onClick={remove}>
              Löschen
            </button>
          ) : (
            <p className="text-xs text-muted">Wird {usage}× verwendet und kann nur ausgeblendet werden.</p>
          )}
        </div>
      </div>
    </Sheet>
  );
}
