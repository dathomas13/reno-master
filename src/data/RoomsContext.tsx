import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { loadRooms, loadRoomMap, sortRooms } from './models';
import { MODEL_EVENT } from './modelSync';
import { buildRoomNaming, disambiguatedNames, type RoomNamingView } from './roomNaming';
import { loadSettings, SETTINGS_EVENT, type LocalSettings } from '@/lib/settings';
import { LAYER_LABEL, type Room } from '@/modules/viewer3d/houseScene';

interface RoomsValue {
  /** the rooms of the active naming (Bestand or Planung), sorted for pickers and lists */
  rooms: Room[];
  byId: Map<string, Room>;
  name(id: string): string;
  names(ids: string[]): string[];
  /** like name(), but with the floor appended when another room in this list shares the
   * name - for a comma-joined list, a filter chip or a picker's summary line, never for
   * the aufgeklappte Auswahlliste (grouped by floor already) or RoomPanel (shows the
   * floor in its own line) */
  shortLabel(id: string): string;
  shortLabels(ids: string[]): string[];
  naming: LocalSettings['roomNaming'];
  /** every stored id that counts towards the room a given id resolves to */
  idsFor(id: string): string[];
  /** true when any of a set of stored ids belongs to the room `filterId` resolves to */
  matches(roomIds: string[], filterId: string): boolean;
  /** the id a new link should store, given the id of the room the user picked */
  writeId(id: string): string;
  /** the counterpart name(s) of a room - a merged predecessor's name, or the other side of a rename */
  aliases(id: string): string[];
}

const noView: RoomNamingView<Room> = {
  rooms: [],
  roomFor: () => undefined,
  idsFor: (id) => [id],
  matches: (roomIds, filterId) => roomIds.includes(filterId),
  writeId: (id) => id,
  aliases: () => [],
};

const RoomsContext = createContext<RoomsValue>({
  rooms: [],
  byId: new Map(),
  name: (id) => id,
  names: (ids) => ids,
  shortLabel: (id) => id,
  shortLabels: (ids) => ids,
  naming: 'bestand',
  idsFor: (id) => [id],
  matches: (roomIds, filterId) => roomIds.includes(filterId),
  writeId: (id) => id,
  aliases: () => [],
});

export function RoomsProvider({ children }: { children: ReactNode }) {
  const [ist, setIst] = useState<Room[]>([]);
  const [soll, setSoll] = useState<Room[]>([]);
  const [map, setMap] = useState<Record<string, string>>({});
  const [naming, setNaming] = useState<LocalSettings['roomNaming']>(() => loadSettings().roomNaming);

  useEffect(() => {
    let active = true;
    function load() {
      void Promise.all([loadRooms('ist'), loadRooms('soll'), loadRoomMap()]).then(([istDoc, sollDoc, mapDoc]) => {
        if (!active) return;
        setIst(istDoc.rooms);
        setSoll(sollDoc.rooms);
        setMap(mapDoc.map);
      });
    }
    load();
    // RoomsProvider mounts once and stays mounted for the app's whole session (App.tsx
    // wraps the whole route tree in it), unlike ViewerPage which remounts per visit - so
    // a model that syncs in a newer release while the app is already open (modelSync's
    // background check, or another device publishing one) needs its own listener here,
    // the same MODEL_EVENT ViewerPage already reacts to. Without this, room names stay
    // stuck at whatever the session first loaded until a full page reload.
    window.addEventListener(MODEL_EVENT, load);
    return () => {
      active = false;
      window.removeEventListener(MODEL_EVENT, load);
    };
  }, []);

  // roomNaming is a device setting, changed on the settings screen while this provider
  // stays mounted for the rest of the app (App.tsx wraps the whole route tree in it) -
  // without this it would take a reload to see the switch take effect.
  useEffect(() => {
    function onSettingsChange(event: Event) {
      const detail = (event as CustomEvent<LocalSettings>).detail;
      if (detail) setNaming(detail.roomNaming);
    }
    window.addEventListener(SETTINGS_EVENT, onSettingsChange);
    return () => window.removeEventListener(SETTINGS_EVENT, onSettingsChange);
  }, []);

  const value = useMemo<RoomsValue>(() => {
    const view = ist.length || soll.length ? buildRoomNaming(ist, soll, map, naming) : noView;
    const rooms = sortRooms(view.rooms);
    const byId = new Map(rooms.map((room) => [room.id, room]));
    const short = disambiguatedNames(rooms, LAYER_LABEL);
    return {
      rooms,
      byId,
      name: (id) => view.roomFor(id)?.name ?? id,
      names: (ids) => ids.map((id) => view.roomFor(id)?.name ?? id),
      shortLabel: (id) => {
        const room = view.roomFor(id);
        return room ? (short.get(room.id) ?? room.name) : id;
      },
      shortLabels: (ids) => {
        return ids.map((id) => {
          const room = view.roomFor(id);
          return room ? (short.get(room.id) ?? room.name) : id;
        });
      },
      naming,
      idsFor: view.idsFor,
      matches: view.matches,
      writeId: view.writeId,
      aliases: view.aliases,
    };
  }, [ist, soll, map, naming]);

  return <RoomsContext.Provider value={value}>{children}</RoomsContext.Provider>;
}

export function useRooms(): RoomsValue {
  return useContext(RoomsContext);
}
