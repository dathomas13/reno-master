import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { Sheet } from '@/components/Sheet';
import { Field, EmptyState, Spinner } from '@/components/Fields';
import { Icon } from '@/components/Icon';
import { useToast, useUndoableDelete } from '@/components/Toast';
import { useRowActions } from '@/components/RowActions';
import { RoomPicker } from '@/components/Pickers';
import { useCollection } from '@/data/hooks';
import { COL, type Note } from '@/data/types';
import { emptyNote, saveNote, deleteNote } from '@/data/repos';
import { useRooms } from '@/data/RoomsContext';
import { AREA_TABS, SectionTabs } from '@/components/SectionTabs';

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
  const { data: notes, loading } = useCollection<Note>(COL.notes);
  const toast = useToast();
  const undoableDelete = useUndoableDelete();
  const rowActions = useRowActions();

  function removeNote(note: Note) {
    const stored = notes.find((item) => item.id === note.id);
    if (!stored) return;
    undoableDelete('Notiz gelöscht', () => deleteNote(stored.id), () => saveNote(stored));
  }

  function togglePinned(note: Note) {
    saveNote({ ...note, pinned: !note.pinned }).catch(() => toast('Die Notiz konnte nicht gespeichert werden.'));
  }
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

  // the capture button opens a new note straight away (?neu=1, with ?raum= when a room is open)
  useEffect(() => {
    if (params.get('neu') !== '1') return;
    setEditing(emptyNote(roomFilter ? [writeId(roomFilter)] : []));
    const next = new URLSearchParams(params);
    next.delete('neu');
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  function dropWanted() {
    if (!wanted) return;
    const next = new URLSearchParams(params);
    next.delete('notiz');
    setParams(next, { replace: true });
  }

  return (
    <>
      <TopBar
        title="Notizen"
        subtitle={`${visible.length} angezeigt`}
        action={
          <button
            type="button"
            className="btn btn-primary px-3 min-h-11"
            onClick={() => setEditing(emptyNote(roomFilter ? [writeId(roomFilter)] : []))}
          >
            <Icon name="plus" className="w-5 h-5" />
            Neu
          </button>
        }
      />
      <SectionTabs label="Aufgaben" tabs={AREA_TABS.tasks('notes')} />

      {roomFilter && (
        <div className="p-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="chip chip-on"
            aria-label={`Raumfilter ${roomLabel(roomFilter)} aufheben`}
            onClick={() => setParams(new URLSearchParams())}
          >
            {roomLabel(roomFilter)}
            <Icon name="close" className="w-4 h-4" />
          </button>
        </div>
      )}

      {loading && notes.length === 0 && <Spinner label="Notizen werden geladen…" />}

      {!(loading && notes.length === 0) && visible.length === 0 &&
        (roomFilter ? (
          <EmptyState
            title="Nichts gefunden"
            hint={`Zu ${roomLabel(roomFilter)} gibt es keine Notizen.`}
            action={
              <button type="button" className="btn mt-2" onClick={() => setParams(new URLSearchParams())}>
                Filter aufheben
              </button>
            }
          />
        ) : (
          <EmptyState title="Noch keine Notizen" hint="Kurze Gedanken, ohne Raum oder einem Raum zugeordnet." />
        ))}

      <ul>
        {visible.map((note) => (
          <li
            key={note.id}
            className="list-row"
            {...rowActions.bind(titleOf(note.text), [
              { label: note.pinned ? 'Lösen' : 'Anheften', icon: 'pin', onSelect: () => togglePinned(note) },
              { label: 'Löschen', icon: 'trash', danger: true, onSelect: () => removeNote(note) },
            ])}
          >
            <button type="button" className="flex-1 min-w-0 text-left" onClick={() => setEditing(note)}>
              <span className="flex items-center gap-1">
                {note.pinned && (
                  <span className="text-accent shrink-0" title="Angeheftet">
                    <Icon name="pin" className="w-4 h-4" />
                  </span>
                )}
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

      {rowActions.sheet}
      <NoteSheet
        note={editing}
        onClose={() => {
          setEditing(null);
          dropWanted();
        }}
        onSave={async (note) => {
          try {
            await saveNote(note);
          } catch {
            toast('Die Notiz konnte nicht gespeichert werden.');
            return;
          }
          setEditing(null);
          dropWanted();
        }}
        onDelete={(note) => {
          setEditing(null);
          dropWanted();
          removeNote(note);
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
  onDelete(note: Note): void;
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
        <label className="flex items-center gap-3 min-h-11 mb-4">
          <input
            type="checkbox"
            className="w-5 h-5 accent-accent"
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
            <button type="button" className="btn btn-danger" onClick={() => onDelete(draft)}>
              Löschen
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
