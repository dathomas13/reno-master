import { useMemo, useState } from 'react';
import { Sheet } from '@/components/Sheet';
import { Segmented } from '@/components/Segmented';
import { useToast } from '@/components/Toast';
import { handOverFile } from '@/platform/shareFile';
import { debugLog } from '@/platform/debugLog';
import { buildPlanPdf, choosePlanLayout, PAPER_FORMATS, planPdfName, planSize, type PaperFormat, type PlanPdfLayout } from './planPdf';

const PAPER_KEY = 'reno.planPdf.paper';

function rememberedPaper(): PaperFormat {
  try {
    const value = localStorage.getItem(PAPER_KEY);
    if (value && (PAPER_FORMATS as string[]).includes(value)) return value as PaperFormat;
  } catch {
    // no storage (private window) - A4 it is
  }
  return 'A4';
}

/**
 * "Als PDF": the generated plan true to scale on a sheet, handed over like the model
 * export (download in the browser, share sheet in the app).
 */
export function PlanPdfSheet({ open, onClose, svg, title }: { open: boolean; onClose(): void; svg: string; title: string }) {
  const toast = useToast();
  const [paper, setPaper] = useState<PaperFormat>(rememberedPaper);
  const [busy, setBusy] = useState(false);

  const layouts = useMemo(() => {
    const out: Partial<Record<PaperFormat, PlanPdfLayout | null>> = {};
    try {
      const [w, h] = planSize(svg);
      for (const format of PAPER_FORMATS) out[format] = choosePlanLayout(w, h, format);
    } catch {
      // not a generated plan - the button says so
    }
    return out;
  }, [svg]);
  const layout = layouts[paper] ?? null;

  function choose(format: PaperFormat) {
    setPaper(format);
    try {
      localStorage.setItem(PAPER_KEY, format);
    } catch {
      // only a convenience
    }
  }

  async function create() {
    setBusy(true);
    try {
      const created = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const { bytes } = buildPlanPdf(svg, { paper, title, footer: `erstellt am ${created} mit Reno Master` });
      const how = await handOverFile(planPdfName(svg), bytes, 'application/pdf', 'Plan weitergeben');
      if (how === 'cancelled') return;
      onClose();
      if (how === 'download') toast('PDF heruntergeladen.');
      if (how === 'folder') toast('PDF im Ordner gespeichert.');
    } catch (problem) {
      const message = problem instanceof Error ? problem.message : String(problem);
      debugLog('plan-pdf', `PDF fehlgeschlagen: ${message}`);
      toast(`Das PDF ließ sich nicht erstellen: ${message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Als PDF" doneLabel="Abbrechen">
      <div className="p-4 space-y-4">
        <Segmented
          label="Papierformat"
          options={PAPER_FORMATS.map((format) => ({ value: format, label: format }))}
          value={paper}
          onChange={choose}
        />
        <p className="text-sm text-muted">
          {layout
            ? `Maßstab 1:${layout.scale}, ${layout.landscape ? 'Querformat' : 'Hochformat'}. Ausdrucken in Originalgröße, nicht „an Seite anpassen“, dann stimmt der Maßstab.`
            : `Der Plan passt auf ${paper} in keinem üblichen Maßstab.`}
        </p>
        <button type="button" className="btn btn-primary w-full" onClick={() => void create()} disabled={!layout || busy}>
          {busy ? 'Wird erstellt…' : 'PDF erstellen'}
        </button>
      </div>
    </Sheet>
  );
}
