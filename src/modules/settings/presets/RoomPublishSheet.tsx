import { useEffect, useState } from 'react';
import { Sheet } from '@/components/Sheet';
import { VARIANT_LABEL } from '@/data/modelRelease';
import type { RoomDraft } from '@/data/useRoomDraft';
import { ModelChangeList } from '../ModelChangeList';

/**
 * Prepares the draft against the newest house files, shows what the models will change and
 * publishes on the second tap - never with an error in it, never offline.
 */
export function RoomPublishSheet({ open, onClose, draft }: { open: boolean; onClose(): void; draft: RoomDraft }) {
  const { prepared, busy, error, online, prepare, publish, closePrepared } = draft;
  const [confirmed, setConfirmed] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setConfirmed(false);
    setDone(null);
    void prepare();
    return () => closePrepared();
    // runs once per opening
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const items = prepared?.items ?? [];
  const failed = items.some((item) => !item.result.ok);
  const changing = items.filter((item) => item.result.ok && !item.unchanged);
  const removed = changing.flatMap((item) => (item.result.ok ? item.result.removedRoomIds : []));
  const canPublish = !done && changing.length > 0 && !failed && online && busy === null && (removed.length === 0 || confirmed);

  async function run() {
    const versions = changing.flatMap((item) => (item.result.ok
      ? [`${VARIANT_LABEL[item.result.variant]} v${item.result.version}`]
      : []));
    if (await publish()) setDone(`${versions.join(', ')} veröffentlicht. Die anderen Geräte holen es beim nächsten Sync.`);
  }

  return (
    <Sheet open={open} onClose={onClose} title="Raumänderungen veröffentlichen" doneLabel="Schließen">
      <div className="p-4 flex flex-col gap-3 text-sm">
        {busy === 'prepare' && <p className="text-muted">Wird geprüft und gebaut…</p>}

        {done && <p>{done}</p>}

        {!done && items.map((item) => {
          const { result } = item;
          return (
            <div key={item.fileName} className="card p-3">
              <div className="font-medium">{result.variant ? VARIANT_LABEL[result.variant] : item.fileName}</div>
              {!result.ok && (
                <>
                  <p className="text-bad mt-1">Nicht übernommen:</p>
                  <ul className="list-disc pl-5 text-bad text-xs mt-1 space-y-0.5">
                    {result.errors.map((line) => <li key={line}>{line}</li>)}
                  </ul>
                </>
              )}
              {result.ok && item.unchanged && <p className="text-muted mt-1">Keine Änderung gegenüber dem Modell in Gebrauch.</p>}
              {result.ok && !item.unchanged && (
                <>
                  <p className="text-xs text-muted mt-1">wird v{result.version} · beruht auf v{result.basedOn}</p>
                  <ModelChangeList changes={result.changes} />
                </>
              )}
              {result.warnings.length > 0 && (
                <ul className="list-disc pl-5 text-warn text-xs mt-2 space-y-0.5">
                  {result.warnings.map((line) => <li key={line}>{line}</li>)}
                </ul>
              )}
            </div>
          );
        })}

        {!done && prepared && prepared.dropped.length > 0 && (
          <p className="text-xs text-warn">
            {prepared.dropped.length} Änderung(en) passen nicht mehr zum neuesten Modell (Raum nicht mehr vorhanden) und
            werden nicht übernommen.
          </p>
        )}

        {!done && prepared && items.length === 0 && (
          <p className="text-muted">Es gibt nichts zu veröffentlichen.</p>
        )}

        {!done && removed.length > 0 && (
          <label className="flex gap-2 items-start text-xs min-h-[44px]">
            <input type="checkbox" className="w-5 h-5" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
            <span>
              Räume entfallen ({removed.join(', ')}). Einträge, die daran hängen, verlieren ihre Raum-Zuordnung.
            </span>
          </label>
        )}

        {error && <p className="text-bad">{error}</p>}
        {!online && !done && <p className="text-xs text-muted">Offline – Veröffentlichen geht nur mit Netz. Der Entwurf bleibt erhalten.</p>}

        <div className="flex gap-2 justify-end">
          <button type="button" className="btn btn-ghost" onClick={onClose}>{done ? 'Fertig' : 'Abbrechen'}</button>
          {!done && (
            <button type="button" className="btn btn-primary" disabled={!canPublish} onClick={() => void run()}>
              {busy === 'publish' ? 'Wird veröffentlicht…' : 'Veröffentlichen'}
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
