import { useState } from 'react';
import { Link } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { Sheet } from '@/components/Sheet';
import { Field, EmptyState, Spinner } from '@/components/Fields';
import { Icon } from '@/components/Icon';
import { useUndoableDelete } from '@/components/Toast';
import { useRowActions } from '@/components/RowActions';
import { useCollection } from '@/data/hooks';
import { COL, type Plan } from '@/data/types';
import { savePlan, deletePlan } from '@/data/repos';
import { modelPlans } from '@/data/models';
import { pickFiles } from '@/platform/photos';
import { enqueue } from '@/offline/outbox';
import { newId } from '@/lib/ids';
import { safeExtension } from '@/lib/storagePath';
import { formatBytes } from '@/lib/image';
import { isAuthenticated } from '@/firebase/auth';
import { AREA_TABS, SectionTabs } from '@/components/SectionTabs';

const GROUP_LABEL: Record<string, string> = {
  original: 'Originalpläne 1967',
  ist: 'Bestand (aus dem Modell)',
  aktuell: 'Aktuell (aus dem Modell)',
  soll: 'Plan (aus dem Modell)',
};

export default function PlansPage() {
  const { data: uploaded, loading } = useCollection<Plan>(COL.plans);
  const undoableDelete = useUndoableDelete();
  const rowActions = useRowActions();

  function removePlan(id: string) {
    const stored = uploaded.find((item) => item.id === id);
    if (!stored) return;
    undoableDelete(`„${stored.title}“ gelöscht`, () => deletePlan(stored.id), () => savePlan(stored));
  }
  // generated from the model in use; loadPlanSvg draws them when one is opened
  const [bundled] = useState(modelPlans);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [draft, setDraft] = useState<{ title: string; variant: Plan['variant']; floor: string; file: File | null }>({
    title: '',
    variant: 'original',
    floor: '',
    file: null,
  });
  const [busy, setBusy] = useState(false);

  const all: Plan[] = [
    ...bundled.map((plan) => ({
      id: plan.id,
      title: plan.title,
      floor: plan.floor as Plan['floor'],
      variant: plan.variant,
      kind: 'svg' as const,
      source: 'bundled' as const,
      path: plan.path,
      order: plan.order,
    })),
    ...uploaded,
  ];

  const groups = ['original', 'ist', 'aktuell', 'soll'] as const;

  async function upload() {
    if (!draft.file) return;
    setBusy(true);
    try {
      const id = newId();
      const extension = safeExtension(draft.file.name, draft.file.type);
      const path = `plans/${id}.${extension}`;
      const plan: Plan = {
        id,
        title: draft.title.trim() || draft.file.name,
        variant: draft.variant,
        floor: (draft.floor || undefined) as Plan['floor'],
        kind: draft.file.type === 'application/pdf' ? 'pdf' : 'image',
        source: 'upload',
        path,
        bytes: draft.file.size,
        order: 100,
        offline: true,
      };
      await savePlan(plan);
      await enqueue({
        id,
        storagePath: path,
        contentType: draft.file.type || 'application/pdf',
        blob: draft.file,
      });
      setUploadOpen(false);
      setDraft({ title: '', variant: 'original', floor: '', file: null });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TopBar
        title="Pläne"
        subtitle={`${all.length} Pläne`}
        action={
          isAuthenticated() ? (
            <button type="button" className="btn btn-primary px-3 min-h-11" onClick={() => setUploadOpen(true)}>
              <Icon name="plus" className="w-5 h-5" />
              Hochladen
            </button>
          ) : undefined
        }
      />
      <SectionTabs label="Haus" tabs={AREA_TABS.house('plans')} />

      {loading && all.length === 0 && <Spinner label="Pläne werden geladen…" />}
      {!loading && all.length === 0 && (
        <EmptyState title="Noch keine Pläne" hint="Die Originalpläne als PDF hochladen." />
      )}

      {groups.map((group) => {
        const rows = all.filter((plan) => plan.variant === group).sort((a, b) => a.order - b.order);
        if (!rows.length) return null;
        return (
          <section key={group}>
            <div className="section-title">{GROUP_LABEL[group]}</div>
            <ul>
              {rows.map((plan) => (
                <li
                  key={plan.id}
                  {...(plan.source === 'upload'
                    ? rowActions.bind(plan.title, [
                        { label: 'Löschen', icon: 'trash', danger: true, onSelect: () => removePlan(plan.id) },
                      ])
                    : {})}
                >
                  <Link to={`/plaene/${plan.id}`} className="list-row">
                    <span className="w-10 h-10 rounded-lg bg-panel2 grid place-items-center text-muted shrink-0">
                      <Icon name={plan.kind === 'pdf' ? 'files' : plan.kind === 'svg' ? 'plan' : 'photo'} className="w-5 h-5" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block truncate">{plan.title}</span>
                      <span className="block text-xs text-muted">
                        {[plan.kind === 'pdf' ? 'PDF' : plan.kind === 'svg' ? 'aus dem Modell' : 'Bild', plan.floor, plan.bytes ? formatBytes(plan.bytes) : '']
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {rowActions.sheet}
      <Sheet open={uploadOpen} onClose={() => setUploadOpen(false)} title="Plan hochladen" doneLabel="Abbrechen">
        <div className="p-4">
          <Field label="Datei">
            <button
              type="button"
              className="btn w-full"
              onClick={() =>
                void pickFiles('application/pdf,image/*').then((files) =>
                  setDraft((current) => ({ ...current, file: files[0] ?? null, title: current.title || (files[0]?.name ?? '') })),
                )
              }
            >
              {draft.file ? draft.file.name : 'PDF oder Bild wählen'}
            </button>
          </Field>
          <Field label="Titel">
            <input
              className="field"
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            />
          </Field>
          <Field label="Art">
            <select
              className="field"
              value={draft.variant}
              onChange={(event) => setDraft({ ...draft, variant: event.target.value as Plan['variant'] })}
            >
              <option value="original">Originalplan 1967</option>
              <option value="ist">Bestand</option>
              <option value="aktuell">Aktuell</option>
              <option value="soll">Plan</option>
            </select>
          </Field>
          <Field label="Geschoss">
            <select className="field" value={draft.floor} onChange={(event) => setDraft({ ...draft, floor: event.target.value })}>
              <option value="">alle / unbestimmt</option>
              <option value="KG">Keller</option>
              <option value="EG">Erdgeschoss</option>
              <option value="OG">Obergeschoss</option>
              <option value="DACH">Dach</option>
              <option value="GESAMT">Gesamt / Schnitt</option>
            </select>
          </Field>
          <button type="button" className="btn btn-primary w-full" onClick={() => void upload()} disabled={!draft.file || busy}>
            {busy ? 'Wird gespeichert…' : 'Hochladen'}
          </button>
          <p className="text-xs text-muted mt-3">
            Die Datei wird sofort gespeichert und geladen, sobald Netz da ist. Sie bleibt danach offline verfügbar.
          </p>
        </div>
      </Sheet>
    </>
  );
}
