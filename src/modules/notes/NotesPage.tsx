import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { Sheet } from '@/components/Sheet';
import { Field, EmptyState } from '@/components/Fields';
import { RoomPicker } from '@/components/Pickers';
import { useCollection } from '@/data/hooks';
import { COL, type Note } from '@/data/types';
import { emptyNote, saveNote, deleteNote } from '@/data/repos';
import { useRooms } from '@/data/RoomsContext';

function formatWhen(at: string): string {
  const [date, time] = at.split('T');
  const [y, m, d] = date.split('-');
  return `${d}.${m}.${y}${time ? ` ${time.slice(0, 5)}` : ''}`;
}

/** the first line stands in for a title, so there is nothing extra to fill in */
function titleOf(text: string): string {
  return text.split('\n')[0].trim() || 'Notiz';
}

export default function NotesPage() {
  const [params, setParams] = useSearchParams();
  const { data: notes } = useCollection<Note>(COL.notes);
  const { shortLabel: roomLabel, shortLabels, matches, writeId } = useRooms();
  const [editing, setEditing] = useState<Note | null>(null);

  const roomFilter = params.get('raum');
  const wanted = params.get('notiz');

  const visible = useMemo(() => {
    const rows = roomFilter ? notes.filter((note) => matches(note.roomIds, roomFilter)) : notes;
    return [...rows].sort(
      (a, b) => Number(b.pinned) - Number(a.pinned) || b.at.localeCompare(a.at),
    );
  }, [notes, roomFilter, matches]);

  // a search result links straight to one note: open its sheet as soon as it is loaded
  useEffect(() => {
    if (!wanted) return;
    const note = notes.find((item) => item.id === wanted);
    if (note) setEditing(note);
  }, [wanted, notes]);

  function dropWanted() {
    if (!wanted) return;
    const next = new URLSearchParams(params);
    next.delete('notiz');
    setParams(next, { replace: true });
  }

  return (
    <>
      <TopBar title="Notizen" subtitle={`${visible.length} angezeigt`} />

      <div className="p-3 flex flex-col gap-3">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setEditing(emptyNote(roomFilter ? [writeId(roomFilter)] : []))}
        >
          + Neue Notiz
        </button>
        {roomFilter && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="chip chip-on" onClick={() => setParams(new URLSearchParams())}>
              {roomLabel(roomFilter)} ×
            </button>
          </div>
        )}
      </div>

      {visible.length === 0 && (
        <EmptyState title="Noch keine Notizen" hint="Kurze Gedanken, ohne Raum oder einem Raum zugeordnet." />
      )}

      <ul>
        {visible.map((note) => (
          <li key={note.id} className="list-row">
            <button type="button" className="flex-1 min-w-0 text-left" onClick={() => setEditing(note)}>
              <span className="flex items-center gap-1">
                {note.pinned && <span aria-hidden="true">📌</span>}
                <span className="block truncate font-medium">{titleOf(note.text)}</span>
              </span>
              <span className="block text-xs text-muted truncate">
                {formatWhen(note.at)}
                {note.roomIds.length > 0 && ` · ${shortLabels(note.roomIds).join(', ')}`}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <NoteSheet
        note={editing}
        onClose={() => {
          setEditing(null);
          dropWanted();
        }}
        onSave={async (note) => {
          await saveNote(note);
          setEditing(null);
          dropWanted();
        }}
        onDelete={async (note) => {
          await deleteNote(note.id);
          setEditing(null);
          dropWanted();
        }}
      />
    </>
  );
}

function NoteSheet({
  note,
  onClose,
  onSave,
  onDelete,
}: {
  note: Note | null;
  onClose(): void;
  onSave(note: Note): Promise<void>;
  onDelete(note: Note): Promise<void>;
}) {
  const [draft, setDraft] = useState<Note | null>(note);

  useEffect(() => {
    if (!note) {
      setDraft(null);
      return;
    }
    setDraft((current) => (!current || current.id !== note.id ? note : current));
  }, [note]);

  if (!note || !draft) return null;

  const update = (patch: Partial<Note>) => setDraft({ ...draft, ...patch });
  const canSave = draft.text.trim().length > 0;
  const saveDraft = () => void onSave({ ...draft, text: draft.text.trim() });
  const isNew = !note.text;

  return (
    <Sheet open onClose={onClose} onDone={canSave ? saveDraft : onClose} title="Notiz">
      <div className="p-4">
        <Field label="Text">
          <textarea
            className="field min-h-[8rem]"
            autoFocus={isNew}
            value={draft.text}
            onChange={(event) => update({ text: event.target.value })}
          />
        </Field>
        <Field label="Räume">
          <RoomPicker value={draft.roomIds} onChange={(value) => update({ roomIds: value })} />
        </Field>
        <label className="flex items-center gap-2 mb-4">
          <input
            type="checkbox"
            checked={draft.pinned}
            onChange={(event) => update({ pinned: event.target.checked })}
          />
          <span>Angeheftet</span>
        </label>
        <div className="flex gap-3">
          <button type="button" className="btn btn-primary flex-1" onClick={saveDraft} disabled={!canSave}>
            Speichern
          </button>
          {!isNew && (
            <button type="button" className="btn btn-danger" onClick={() => void onDelete(draft)}>
              Löschen
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
