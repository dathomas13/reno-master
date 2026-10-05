/**
 * The draft of room edits (names, Bestand → Planung mapping, new Planung rooms) and the way
 * from it to a published model.
 *
 * The draft lives in localStorage (`reno.roomDraft`), so it survives a reload and is shared
 * by every screen that shows it. Publishing applies the edits to the NEWEST house file of
 * each affected variant, builds it like an import (prepareModelImport) and publishes it the
 * same way (publishImport) - a draft started on an old version therefore never overwrites
 * what another device published in between.
 */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { COL, type Cost, type DiaryEntry, type Note, type Photo, type Task } from './types';
import { useCollection } from './hooks';
import { loadRoomMap, loadRooms, loadSource, MODEL_EVENT } from './models';
import { syncModel } from './modelSync';
import { prepareModelImport, publishImport, type PreparedImport } from './modelExchange';
import { VARIANT_LABEL } from './modelRelease';
import { applyRoomEdits, editKey, type RoomEdit, type RoomRow, type RoomVariant } from './roomEdits';
import { useOnline } from '@/offline/useOnline';

const STORAGE_KEY = 'reno.roomDraft';
const PUBLISH_TIMEOUT_MS = 20_000;

function isEdit(value: unknown): value is RoomEdit {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Record<string, unknown>;
  const str = (k: string) => typeof e[k] === 'string' && (e[k] as string).length > 0;
  if (e.op === 'rename') return str('id') && str('name') && (e.variant === 'ist' || e.variant === 'soll' || e.variant === 'aktuell');
  if (e.op === 'map') return str('from') && str('to');
  if (e.op === 'addSoll') return str('id') && str('name') && str('floor');
  return false;
}

function readDraft(): RoomEdit[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isEdit) : [];
  } catch {
    return [];
  }
}

let current: RoomEdit[] = readDraft();
const listeners = new Set<() => void>();

function setDraft(next: RoomEdit[]): void {
  current = next;
  try {
    if (next.length === 0) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // storage blocked: the draft then only lives until the app is closed
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** pure part of `add`: the newer edit replaces an earlier one about the same thing */
export function addEdit(edits: RoomEdit[], edit: RoomEdit): RoomEdit[] {
  // naming a room that only exists in the draft changes that room's own entry
  if (edit.op === 'rename' && edit.variant === 'soll') {
    const own = edits.find((e) => e.op === 'addSoll' && e.id === edit.id);
    if (own && own.op === 'addSoll') {
      return edits.map((e) => (e === own ? { ...own, name: edit.name } : e));
    }
  }
  const key = editKey(edit);
  return [...edits.filter((e) => editKey(e) !== key), edit];
}

/** the variants whose house file an edit changes */
function variantsOf(edits: RoomEdit[]): RoomVariant[] {
  const out = new Set<RoomVariant>();
  for (const edit of edits) {
    if (edit.op === 'rename') {
      out.add(edit.variant);
      // a renamed Bestand room is renamed in the state of the works as well, if it is there
      if (edit.variant === 'ist') out.add('aktuell');
    } else out.add('soll');
  }
  return (['ist', 'aktuell', 'soll'] as const).filter((v) => out.has(v));
}

export interface PreparedDraft {
  items: PreparedImport[];
  /** edits that no longer fit the newest house file (the room is gone) */
  dropped: RoomEdit[];
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error('Das Veröffentlichen hat zu lange gedauert. Der Entwurf bleibt erhalten – bitte noch einmal versuchen.')),
      ms,
    );
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export interface RoomDraft {
  edits: RoomEdit[];
  add(edit: RoomEdit): void;
  discard(): void;
  online: boolean;
  busy: 'prepare' | 'publish' | null;
  error: string | null;
  prepared: PreparedDraft | null;
  prepare(): Promise<void>;
  publish(): Promise<boolean>;
  /** forgets a prepared result without touching the draft */
  closePrepared(): void;
}

export function useRoomDraft(): RoomDraft {
  const edits = useSyncExternalStore(subscribe, () => current);
  const online = useOnline();
  const [busy, setBusy] = useState<RoomDraft['busy']>(null);
  const [error, setError] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<PreparedDraft | null>(null);

  const add = useCallback((edit: RoomEdit) => {
    setPrepared(null);
    setDraft(addEdit(current, edit));
  }, []);

  const discard = useCallback(() => {
    setPrepared(null);
    setError(null);
    setDraft([]);
  }, []);

  const closePrepared = useCallback(() => {
    setPrepared(null);
    setError(null);
  }, []);

  const prepare = useCallback(async () => {
    setBusy('prepare');
    setError(null);
    setPrepared(null);
    try {
      const items: PreparedImport[] = [];
      const dropped: RoomEdit[] = [];
      for (const variant of variantsOf(current)) {
        // the newest house file: ask the other channels before reading it
        await syncModel(variant).catch(() => null);
        const source = await loadSource(variant);
        if (!source) {
          if (variant === 'aktuell') continue;
          throw new Error(`Für ${VARIANT_LABEL[variant]} ist auf diesem Gerät kein Modell mit Hausdatei. `
            + 'Einmal angemeldet und online öffnen.');
        }
        // a Bestand rename counts for the state of the works too (when the room is there)
        const forThis = variant === 'aktuell'
          ? current.flatMap((e): RoomEdit[] => (e.op === 'rename' && e.variant !== 'soll' ? [{ ...e, variant: 'aktuell' }] : []))
          : current;
        const result = applyRoomEdits(source.text, forThis, variant);
        if (variant !== 'aktuell') dropped.push(...result.dropped);
        if (result.applied.length === 0) continue;
        // one frame for the busy state before the build blocks the thread
        await new Promise((resolve) => window.setTimeout(resolve, 30));
        items.push(await prepareModelImport(`Räume ${VARIANT_LABEL[variant]}`, result.text));
      }
      setPrepared({ items, dropped });
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Die Änderungen ließen sich nicht vorbereiten.');
    } finally {
      setBusy(null);
    }
  }, []);

  const publish = useCallback(async (): Promise<boolean> => {
    if (!prepared) return false;
    if (!navigator.onLine) {
      setError('Ohne Netz lässt sich nicht veröffentlichen. Der Entwurf bleibt erhalten.');
      return false;
    }
    setBusy('publish');
    setError(null);
    try {
      for (const item of prepared.items) {
        if (!item.result.ok || item.unchanged) continue;
        await withTimeout(publishImport(item.result), PUBLISH_TIMEOUT_MS);
      }
      setPrepared(null);
      setDraft([]);
      return true;
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Das Veröffentlichen ist fehlgeschlagen.');
      return false;
    } finally {
      setBusy(null);
    }
  }, [prepared]);

  return { edits, add, discard, online, busy, error, prepared, prepare, publish, closePrepared };
}

export interface RoomTables {
  ist: RoomRow[];
  soll: RoomRow[];
  /** Bestand id → Planung id, as published */
  map: Record<string, string>;
  loaded: boolean;
}

/** the published rooms of Bestand and Planung and the mapping, reloaded when a model arrives */
export function useRoomTables(): RoomTables {
  const [tables, setTables] = useState<RoomTables>({ ist: [], soll: [], map: {}, loaded: false });
  useEffect(() => {
    let active = true;
    function load() {
      void Promise.all([loadRooms('ist'), loadRooms('soll'), loadRoomMap()])
        .then(([ist, soll, map]) => {
          if (active) setTables({ ist: ist.rooms, soll: soll.rooms, map: map.map, loaded: true });
        })
        .catch(() => {
          if (active) setTables((t) => ({ ...t, loaded: true }));
        });
    }
    load();
    window.addEventListener(MODEL_EVENT, load);
    return () => {
      active = false;
      window.removeEventListener(MODEL_EVENT, load);
    };
  }, []);
  return tables;
}

/** how many entries (diary, photos, costs, tasks, notes) are linked to any of a set of room ids */
export function useRoomUsage(): (ids: string[]) => number {
  const diary = useCollection<DiaryEntry>(COL.diary);
  const photos = useCollection<Photo>(COL.photos);
  const costs = useCollection<Cost>(COL.costs);
  const tasks = useCollection<Task>(COL.tasks);
  const notes = useCollection<Note>(COL.notes);
  const lists = useMemo<string[][]>(
    () => [diary.data, photos.data, costs.data, tasks.data, notes.data]
      .flatMap((docs) => (docs as { roomIds?: string[] }[]).map((doc) => doc.roomIds ?? [])),
    [diary.data, photos.data, costs.data, tasks.data, notes.data],
  );
  return useCallback((ids: string[]) => lists.filter((roomIds) => roomIds.some((id) => ids.includes(id))).length, [lists]);
}
