import { Sheet } from '@/components/Sheet';

interface RenameSpreadSheetProps {
  open: boolean;
  from: string;
  to: string;
  /** how many entries carry the old value */
  count: number;
  onEverywhere(): void;
  onListOnly(): void;
  onClose(): void;
}

/** asks whether a renamed value is carried into the entries that already use it */
export function RenameSpreadSheet({ open, from, to, count, onEverywhere, onListOnly, onClose }: RenameSpreadSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title="Umbenennen" doneLabel="Abbrechen">
      <div className="p-4 flex flex-col gap-3">
        <p>
          „{from}“ steht in {count} {count === 1 ? 'Eintrag' : 'Einträgen'}. Dort auch in „{to}“ ändern?
        </p>
        <button type="button" className="btn btn-primary" onClick={onEverywhere}>
          Überall umbenennen
        </button>
        <button type="button" className="btn" onClick={onListOnly}>
          Nur in der Liste
        </button>
        <p className="text-xs text-muted">Ohne Nachziehen zeigen die alten Einträge weiter „{from}“.</p>
      </div>
    </Sheet>
  );
}
