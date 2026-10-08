import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { Sheet } from '@/components/Sheet';
import { Field, EmptyState, Spinner } from '@/components/Fields';
import { Icon } from '@/components/Icon';
import { Segmented } from '@/components/Segmented';
import { useToast, useUndoableDelete } from '@/components/Toast';
import { RoomPicker, TradeSelect, PhaseSelect } from '@/components/Pickers';
import { useCollection } from '@/data/hooks';
import { useOptions } from '@/data/useOptions';
import { hasAssignee, isTaskDone, PRIORITY_MEDIUM, TASK_DONE, TASK_OPEN } from '@/data/options';
import { OptionChips, OptionMultiChips } from '@/components/OptionFields';
import { COL, type Task } from '@/data/types';
import { emptyTask, saveTask, toggleTaskDone, deleteTask } from '@/data/repos';
import { dueBucket, DUE_BUCKET_LABEL, formatRelativeDay, type DueBucket } from '@/lib/date';
import { useRooms } from '@/data/RoomsContext';

const BUCKETS: DueBucket[] = ['overdue', 'today', 'week', 'later', 'none'];
type Filter = 'offen' | 'alle' | 'erledigt';
const FILTERS = [
  { value: 'offen', label: 'Offen' },
  { value: 'alle', label: 'Alle' },
  { value: 'erledigt', label: 'Erledigt' },
] as const;
const PRIORITY_COLOR: Record<string, string> = {
  hoch: 'text-bad',
  mittel: 'text-warn',
  niedrig: 'text-muted',
};

function toDateTimeInput(value: string | undefined): string {
  return value?.slice(0, 16) ?? '';
}

function fromDateTimeInput(value: string): string | undefined {
  return value ? `${value}:00` : undefined;
}

function formatReminder(value: string | undefined): string {
  if (!value) return '';
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return '';
  return `${formatRelativeDay(value.slice(0, 10))} ${String(at.getHours()).padStart(2, '0')}:${String(
    at.getMinutes(),
  ).padStart(2, '0')}`;
}

export default function TasksPage() {
  const [params, setParams] = useSearchParams();
  const { data: tasks, loading } = useCollection<Task>(COL.tasks);
  const toast = useToast();
  const undoableDelete = useUndoableDelete();
  const { sets, label } = useOptions();
  const { shortLabel: roomLabel, matches, writeId } = useRooms();
  const [filter, setFilter] = useState<Filter>('offen');
  const [assignee, setAssignee] = useState<string | null>(null);
  const [quick, setQuick] = useState('');
  const [editing, setEditing] = useState<Task | null>(null);
  const [pendingTasks, setPendingTasks] = useState<Record<string, Partial<Task>>>({});

  const roomFilter = params.get('raum');
  const wanted = params.get('aufgabe');
  const viewTasks = useMemo(
    () => tasks.map((task) => ({ ...task, ...pendingTasks[task.id] })),
    [tasks, pendingTasks],
  );

  // a search result links straight to one task: open its sheet as soon as it is loaded
  useEffect(() => {
    if (!wanted) return;
    const task = viewTasks.find((item) => item.id === wanted);
    if (task) setEditing(task);
  }, [wanted, viewTasks]);

  useEffect(() => {
    setPendingTasks((current) => {
      const next = { ...current };
      for (const task of tasks) {
        if (next[task.id]?.status === task.status) delete next[task.id];
      }
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [tasks]);

  function dropWanted() {
    if (!wanted) return;
    const next = new URLSearchParams(params);
    next.delete('aufgabe');
    setParams(next, { replace: true });
  }

  // the people who appear in tasks, as filter chips
  const assigneeChips = useMemo(
    () =>
      sets.people
        .filter((person) => tasks.some((task) => hasAssignee(task, person.id)))
        .map((person) => ({ id: person.id, label: person.label })),
    [tasks, sets.people],
  );

  const visible = useMemo(() => {
    return viewTasks.filter((task) => {
      if (roomFilter && !matches(task.roomIds, roomFilter)) return false;
      if (assignee && !hasAssignee(task, assignee)) return false;
      if (filter === 'offen') return !isTaskDone(task);
      if (filter === 'erledigt') return isTaskDone(task);
      return true;
    });
  }, [viewTasks, filter, assignee, roomFilter, matches]);

  const grouped = useMemo(() => {
    const map = new Map<DueBucket, Task[]>();
    for (const task of visible) {
      const bucket = isTaskDone(task) ? 'none' : dueBucket(task.due);
      map.set(bucket, [...(map.get(bucket) ?? []), task]);
    }
    for (const [, rows] of map) {
      rows.sort(
        (a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.title.localeCompare(b.title, 'de'),
      );
    }
    return map;
  }, [visible]);

  function newTask() {
    setEditing({ ...emptyTask(), roomIds: roomFilter ? [writeId(roomFilter)] : [] });
  }

  async function addQuick() {
    const title = quick.trim();
    if (!title) {
      // no text typed: open the editor for a new task instead of doing nothing
      newTask();
      return;
    }
    setQuick('');
    // a task added while a room filter is active must land in that room, or it vanishes from view
    try {
      await saveTask({ ...emptyTask(), title, roomIds: roomFilter ? [writeId(roomFilter)] : [] });
    } catch {
      setQuick(title);
      toast('Die Aufgabe konnte nicht gespeichert werden.');
    }
  }

  async function toggleDone(task: Task) {
    const nextStatus = isTaskDone(task) ? TASK_OPEN : TASK_DONE;
    setPendingTasks((current) => ({ ...current, [task.id]: { status: nextStatus } }));
    setEditing((current) => (current?.id === task.id ? { ...current, status: nextStatus } : current));
    try {
      await toggleTaskDone(task);
    } catch {
      setPendingTasks((current) => {
        const next = { ...current };
        delete next[task.id];
        return next;
      });
      toast('Konnte nicht gespeichert werden.');
    }
  }

  const filtered = !!roomFilter || !!assignee;
  const emptyTitle = filtered
    ? 'Nichts gefunden'
    : filter === 'erledigt'
      ? 'Noch nichts erledigt'
      : filter === 'offen'
        ? 'Nichts offen'
        : 'Noch keine Aufgaben';
  const emptyHint = filtered
    ? 'Mit diesem Filter gibt es keine Aufgaben.'
    : filter === 'offen'
      ? 'Alles erledigt oder noch nichts angelegt.'
      : 'Oben eine Aufgabe eintragen.';

  return (
    <>
      <TopBar
        title="Aufgaben"
        subtitle={`${visible.length} angezeigt`}
        action={
          <button type="button" className="btn btn-primary px-3 min-h-11" onClick={newTask}>
            <Icon name="plus" className="w-5 h-5" />
            Neu
          </button>
        }
      />

      <div className="p-3 flex flex-col gap-3">
        <div className="flex gap-2">
          <input
            className="field"
            placeholder="Neue Aufgabe…"
            value={quick}
            onChange={(event) => setQuick(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void addQuick();
            }}
          />
          <button
            type="button"
            className="btn btn-primary px-3"
            aria-label={quick.trim() ? 'Aufgabe hinzufügen' : 'Neue Aufgabe mit allen Feldern'}
            onClick={() => void addQuick()}
          >
            <Icon name="plus" />
          </button>
        </div>

        <Segmented<Filter> label="Anzeigen" options={FILTERS} value={filter} onChange={setFilter} />

        {(assigneeChips.length > 0 || roomFilter) && (
          <div className="flex flex-wrap gap-2">
            {assigneeChips.map((person) => (
              <button
                key={person.id}
                type="button"
                aria-pressed={assignee === person.id}
                className={`chip ${assignee === person.id ? 'chip-on' : ''}`}
                onClick={() => setAssignee(assignee === person.id ? null : person.id)}
              >
                {person.label}
              </button>
            ))}
            {roomFilter && (
              <button
                type="button"
                className="chip chip-on"
                aria-label={`Raumfilter ${roomLabel(roomFilter)} aufheben`}
                onClick={() => setParams(new URLSearchParams())}
              >
                {roomLabel(roomFilter)}
                <Icon name="close" className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {loading && tasks.length === 0 && <Spinner label="Aufgaben werden geladen…" />}

      {!(loading && tasks.length === 0) && visible.length === 0 && (
        <EmptyState
          title={emptyTitle}
          hint={emptyHint}
          action={
            filtered && (
              <button
                type="button"
                className="btn mt-2"
                onClick={() => {
                  setAssignee(null);
                  if (roomFilter) setParams(new URLSearchParams());
                }}
              >
                Filter aufheben
              </button>
            )
          }
        />
      )}

      {BUCKETS.map((bucket) => {
        const rows = grouped.get(bucket);
        if (!rows?.length) return null;
        return (
          <section key={bucket}>
            <div className="section-title">{DUE_BUCKET_LABEL[bucket]}</div>
            <ul>
              {rows.map((task) => (
                <li key={task.id} className="list-row">
                  {/* the box stays small, the tap area is the full 44 px a thumb needs */}
                  <button
                    type="button"
                    aria-label={isTaskDone(task) ? `Wieder öffnen: ${task.title}` : `Erledigt: ${task.title}`}
                    aria-pressed={isTaskDone(task)}
                    className="w-11 h-11 -m-2.5 shrink-0 grid place-items-center"
                    onClick={() => void toggleDone(task)}
                  >
                    <span
                      className={`w-6 h-6 rounded-md border grid place-items-center ${
                        isTaskDone(task) ? 'bg-accent border-accent text-bg' : 'border-muted'
                      }`}
                    >
                      {isTaskDone(task) && <Icon name="check" className="w-4 h-4" strokeWidth={2.5} />}
                    </span>
                  </button>
                  <button type="button" className="flex-1 min-w-0 text-left" onClick={() => setEditing(task)}>
                    <span
                      className={`block truncate ${isTaskDone(task) ? 'line-through text-muted' : ''}`}
                    >
                      {task.title}
                    </span>
                    <span className="block text-xs text-muted truncate">
                      <span className={PRIORITY_COLOR[task.priority] ?? 'text-muted'}>
                        {label('priority', task.priority)}
                      </span>
                      {task.area ? ` · ${label('taskAreas', task.area)}` : ''}
                      {task.assignees.length
                        ? ` · ${task.assignees.map((person) => label('people', person)).join(', ')}`
                        : ''}
                      {task.due ? ` · ${formatRelativeDay(task.due)}` : ''}
                      {task.reminderAt ? ` · Erinnerung ${formatReminder(task.reminderAt)}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <TaskSheet
        task={editing}
        onClose={() => {
          setEditing(null);
          dropWanted();
        }}
        onSave={async (task) => {
          try {
            await saveTask(task);
          } catch {
            toast('Die Aufgabe konnte nicht gespeichert werden.');
            return;
          }
          setEditing(null);
          dropWanted();
        }}
        onDelete={(task) => {
          const stored = tasks.find((item) => item.id === task.id);
          setEditing(null);
          dropWanted();
          if (!stored) return;
          undoableDelete(
            `„${stored.title}“ gelöscht`,
            () => deleteTask(stored.id),
            () => saveTask(stored),
          );
        }}
        isNew={(task) => !tasks.some((item) => item.id === task.id)}
      />
    </>
  );
}

function TaskSheet({
  task,
  onClose,
  onSave,
  onDelete,
  isNew,
}: {
  task: Task | null;
  onClose(): void;
  onSave(task: Task): Promise<void>;
  onDelete(task: Task): void;
  isNew(task: Task): boolean;
}) {
  const [draft, setDraft] = useState<Task | null>(task);

  useEffect(() => {
    if (!task) {
      setDraft(null);
      return;
    }
    setDraft((current) => (!current || current.id !== task.id ? task : current));
  }, [task]);

  if (!task || !draft) return null;

  const update = (patch: Partial<Task>) => setDraft({ ...draft, ...patch });
  const canSave = draft.title.trim().length > 0;
  const saveDraft = () => void onSave({ ...draft, title: draft.title.trim() });

  return (
    <Sheet open onClose={onClose} onDone={canSave ? saveDraft : onClose} title="Aufgabe">
      <div className="p-4">
        <Field label="Titel">
          <input
            className="field"
            value={draft.title}
            onChange={(event) => update({ title: event.target.value })}
          />
        </Field>
        <Field label="Notizen">
          <textarea
            className="field min-h-[5rem]"
            value={draft.notes ?? ''}
            onChange={(event) => update({ notes: event.target.value })}
          />
        </Field>
        <Field label="Status">
          <OptionChips
            setKey="taskStatus"
            value={draft.status}
            allowEmpty={false}
            onChange={(value) => update({ status: value ?? TASK_OPEN })}
          />
        </Field>
        <Field label="Priorität">
          <OptionChips
            setKey="priority"
            value={draft.priority}
            allowEmpty={false}
            onChange={(value) => update({ priority: value ?? PRIORITY_MEDIUM })}
          />
        </Field>
        <Field label="Zuständig">
          <OptionMultiChips
            setKey="people"
            value={draft.assignees}
            onChange={(value) => update({ assignees: value })}
          />
        </Field>
        <Field label="Fällig am">
          <input
            className="field"
            type="date"
            value={draft.due ?? ''}
            onChange={(event) => update({ due: event.target.value || undefined })}
          />
        </Field>
        <Field label="Erinnerung">
          <input
            className="field"
            type="datetime-local"
            value={toDateTimeInput(draft.reminderAt)}
            onChange={(event) => update({ reminderAt: fromDateTimeInput(event.target.value) })}
          />
          <p className="text-xs text-muted mt-1">
            Kommt zuverlässig in der Android-App. In der Benachrichtigung kannst du die Aufgabe direkt als
            erledigt markieren.
          </p>
        </Field>
        <Field label="Bereich">
          <OptionChips setKey="taskAreas" value={draft.area} onChange={(value) => update({ area: value })} />
        </Field>
        <Field label="Gewerk">
          <TradeSelect value={draft.tradeId} onChange={(value) => update({ tradeId: value })} />
        </Field>
        <Field label="Phase">
          <PhaseSelect value={draft.phaseId} onChange={(value) => update({ phaseId: value })} />
        </Field>
        <Field label="Räume">
          <RoomPicker value={draft.roomIds} onChange={(value) => update({ roomIds: value })} />
        </Field>
        <div className="flex gap-3">
          <button type="button" className="btn btn-primary flex-1" onClick={saveDraft} disabled={!canSave}>
            Speichern
          </button>
          {!isNew(draft) && (
            <button type="button" className="btn btn-danger" onClick={() => onDelete(draft)}>
              Löschen
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
