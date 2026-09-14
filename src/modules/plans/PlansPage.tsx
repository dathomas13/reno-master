import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { Sheet } from '@/components/Sheet';
import { Field, EmptyState } from '@/components/Fields';
import { useCollection } from '@/data/hooks';
import { COL, type Plan } from '@/data/types';
import { savePlan, deletePlan } from '@/data/repos';
import { loadBundledPlans, type BundledPlan } from '@/data/models';
import { pickFiles } from '@/platform/photos';
import { enqueue } from '@/offline/outbox';
import { newId } from '@/lib/ids';
import { formatBytes } from '@/lib/image';

const GROUP_LABEL: Record<string, string> = {
  original: 'Originalpläne 1967',
  ist: 'Bestand (aus dem Modell)',
  soll: 'Zielzustand',
};

export default function PlansPage() {
  const { data: uploaded } = useCollection<Plan>(COL.plans);
  const [bundled, setBundled] = useState<BundledPlan[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [draft, setDraft] = useState<{ title: string; variant: Plan['variant']; floor: string; file: File | null }>({
    title: '',
    variant: 'original',
    floor: '',
    file: null,
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadBundledPlans().then((result) => setBundled(result.plans));
  }, []);

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

  const groups = ['original', 'ist', 'soll'] as const;

  async function upload() {
    if (!draft.file) return;
    setBusy(true);
    try {
      const id = newId();
      const extension = draft.file.name.split('.').pop()?.toLowerCase() ?? 'pdf';
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
          <button type="button" className="btn btn-primary px-3 min-h-0 py-2" onClick={() => setUploadOpen(true)}>
            Hochladen
          </button>
        }
      />

      {all.length === 0 && <EmptyState title="Noch keine Pläne" hint="Die Originalpläne als PDF hochladen." />}

      {groups.map((group) => {
        const rows = all.filter((plan) => plan.variant === group).sort((a, b) => a.order - b.order);
        if (!rows.length) return null;
        return (
          <section key={group}>
            <div className="section-title">{GROUP_LABEL[group]}</div>
            <ul>
              {rows.map((plan) => (
                <li key={plan.id}>
                  <Link to={`/plaene/${plan.id}`} className="list-row">
                    <span className="w-10 h-10 rounded-lg bg-panel2 grid place-items-center text-xs text-muted">
                      {plan.kind === 'pdf' ? 'PDF' : plan.kind === 'svg' ? 'SVG' : 'IMG'}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block truncate">{plan.title}</span>
                      <span className="block text-xs text-muted">
                        {plan.floor ?? ''} {plan.bytes ? `· ${formatBytes(plan.bytes)}` : ''}
                      </span>
                    </span>
                    {plan.source === 'upload' && (
                      <button
                        type="button"
                        className="text-muted text-xs px-2"
                        onClick={(event) => {
                          event.preventDefault();
                          if (confirm('Plan löschen?')) void deletePlan(plan.id);
                        }}
                      >
                        löschen
                      </button>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <Sheet open={uploadOpen} onClose={() => setUploadOpen(false)} title="Plan hochladen">
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
              <option value="soll">Zielzustand</option>
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
