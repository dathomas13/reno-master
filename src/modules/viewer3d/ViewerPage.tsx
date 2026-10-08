import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as THREE from 'three';
import {
  buildHouse,
  isVisible,
  LAYERS,
  LAYER_SHORT,
  LAYER_LABEL,
  CONFIDENCE_LABEL,
  formatDimensions,
  type HouseScene,
  type Layer,
  type Picked,
  type Room,
} from './houseScene';
import { createOrbitControls, VIEW_PRESETS, type OrbitControls } from './orbitControls';
import { lastViewerState, rememberViewerState, type ViewerState } from './viewerState';
import { RoomPanel } from './RoomPanel';
import { activeRelease, clearPreview, loadRoomMap, loadRooms, loadScene, NO_MODEL_MESSAGE, previewOf, type Variant } from '@/data/models';
import { resolveInVariant } from '@/data/roomNaming';
import { VARIANT_LABEL, VARIANTS, type ReleaseInfo } from '@/data/modelRelease';
import { MODEL_EVENT, type SyncResult } from '@/data/modelSync';
import { loadSettings } from '@/lib/settings';
import { Spinner } from '@/components/Fields';
import { newId } from '@/lib/ids';
import { debugLog } from '@/platform/debugLog';
import { deleteFurnitureItem, readModelFile, saveFurnitureItem } from '@/data/furniture';
import { createFurnitureLayer, type FurnitureLayer } from '@/modules/furniture/furnitureScene';
import {
  FLOOR_Z,
  FURNITURE_FLOORS,
  newItem,
  roomAt,
  roomCentre,
  snapPosition,
  sticksOut,
  type FurnitureFloor,
  type FurnitureItem,
  type FurnitureModel,
  type FurnitureState,
} from '@/modules/furniture/placement';
import { useFurniture } from '@/modules/furniture/useFurniture';
import { FurnitureCatalog } from '@/modules/furniture/FurnitureCatalog';
import { FurnitureItemPanel } from '@/modules/furniture/FurnitureItemPanel';

/** one step the editor can take back: the piece before and after, null where there was none */
interface UndoStep {
  before: FurnitureItem | null;
  after: FurnitureItem | null;
}
const UNDO_LIMIT = 50;

export default function ViewerPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const houseRef = useRef<HouseScene | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const renderRef = useRef<(() => void) | null>(null);

  const initialVariant = (params.get('variant') as Variant) ?? loadSettings().defaultModelVariant;
  const [variant, setVariant] = useState<Variant>(VARIANTS.includes(initialVariant) ? initialVariant : 'ist');
  // how the screen looked when it was last left; null on the very first visit
  const [saved] = useState(() => lastViewerState());
  const [release, setRelease] = useState<ReleaseInfo | null>(null);
  // bumped when the sync stored a newer model, which rebuilds the scene
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [layerState, setLayerState] = useState<Record<Layer, boolean>>(
    saved?.layers ?? { KG: true, EG: true, OG: true, DG: true, STUHL: true, DACH: true, GAR: true },
  );
  const [viewLabel, setViewLabel] = useState(saved?.viewLabel || VIEW_PRESETS[0]!.label);
  const [structural, setStructural] = useState(saved?.structural ?? false);
  const [showRooms, setShowRooms] = useState(saved?.showRooms ?? false);
  const [selected, setSelected] = useState<Picked | null>(null);
  const [room, setRoom] = useState<Room | null>(null);

  // ---------------------------------------------------------------- furniture (Plan only)
  const isPlan = variant === 'soll';
  const furniture = useFurniture(isPlan);
  const furnitureRef = useRef<FurnitureState>(furniture);
  furnitureRef.current = furniture;
  const furnitureLayerRef = useRef<FurnitureLayer | null>(null);
  /** the rooms of the scene on screen, which the furniture snaps to */
  const roomsRef = useRef<Room[]>([]);
  const [showFurniture, setShowFurniture] = useState(true);
  const showFurnitureRef = useRef(showFurniture);
  showFurnitureRef.current = showFurniture;
  const [editing, setEditing] = useState(false);
  const [pieceId, setPieceId] = useState<string | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const undoRef = useRef<UndoStep[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  /** the piece under the finger, moved locally until it is let go */
  const dragRef = useRef<{ before: FurnitureItem; current: FurnitureItem; dx: number; dy: number } | null>(null);
  /** set below, once commit exists; the drag handlers live in the scene effect and call it from there */
  const commitRef = useRef<(before: FurnitureItem | null, after: FurnitureItem | null) => void>(() => undefined);
  const editRef = useRef({ editing, pieceId });
  editRef.current = { editing, pieceId };
  const piece = furniture.items.find((item) => item.id === pieceId) ?? null;

  /**
   * What the switches say right now. The scene effect only runs again on a variant
   * change, so its cleanup - where the view is saved - would otherwise read the values
   * of the render it was created in.
   */
  const ui = useRef({ layerState, structural, showRooms, viewLabel, roomId: room?.id });
  ui.current = { layerState, structural, showRooms, viewLabel, roomId: room?.id };

  /** the current view, ready to be stored; null while no scene is up */
  const snapshot = useCallback((): ViewerState | null => {
    const controls = controlsRef.current;
    if (!controls) return null;
    const { theta, phi, distance, target } = controls.state;
    return {
      camera: { theta, phi, distance, target: [target.x, target.y, target.z] },
      layers: ui.current.layerState,
      structural: ui.current.structural,
      showRooms: ui.current.showRooms,
      viewLabel: ui.current.viewLabel,
      roomId: ui.current.roomId,
    };
  }, []);

  // Leaving the app is not the same as leaving the screen: Android may put it away
  // without unmounting anything, and the cleanup below would never run.
  useEffect(() => {
    const keep = () => {
      const state = snapshot();
      if (state) rememberViewerState(state);
    };
    window.addEventListener('pagehide', keep);
    document.addEventListener('visibilitychange', keep);
    return () => {
      window.removeEventListener('pagehide', keep);
      document.removeEventListener('visibilitychange', keep);
    };
  }, [snapshot]);

  useEffect(() => {
    void activeRelease(variant).then(setRelease).catch(() => undefined);
  }, [variant, reloadKey]);

  // a model published from the other device arrives while the viewer is open
  useEffect(() => {
    const onModel = (event: Event) => {
      const result = (event as CustomEvent<SyncResult>).detail;
      if (result?.variant === variant) setReloadKey((key) => key + 1);
    };
    window.addEventListener(MODEL_EVENT, onModel);
    return () => window.removeEventListener(MODEL_EVENT, onModel);
  }, [variant]);

  const applyPreset = useCallback((label: string) => {
    const preset = VIEW_PRESETS.find((item) => item.label === label);
    const house = houseRef.current;
    const controls = controlsRef.current;
    if (!preset || !house || !controls) return;

    // build the next visibility from the preset itself, never from a captured state
    const next = {} as Record<Layer, boolean>;
    for (const layer of LAYERS) {
      const visible = preset.layers ? (preset.layers[layer] ?? false) : true;
      house.groups[layer].visible = visible;
      next[layer] = visible;
    }
    setLayerState(next);

    const rooms = preset.rooms ?? false;
    house.setRoomsVisible(rooms);
    setShowRooms(rooms);
    controls.set({
      theta: preset.theta,
      phi: preset.phi,
      distance: preset.distance,
      target: new THREE.Vector3(...preset.target),
    });
    setViewLabel(label);
  }, []);

  // build the scene; runs again when the variant changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    setLoading(true);
    setError(null);
    setSelected(null);
    setRoom(null);

    // Keep the look of the handover viewer, which predates three's colour management:
    // with it enabled every material colour is converted from sRGB into the linear
    // working space, and with a linear output nothing converts it back - the model came
    // out noticeably darker than the one in Haus_3D.html. Off plus linear output is
    // exactly what the old viewer did. Must be set before any colour is created.
    if ('ColorManagement' in THREE) THREE.ColorManagement.enabled = false;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1d2126);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);

    let needsRender = true;
    const invalidate = () => {
      needsRender = true;
    };
    renderRef.current = invalidate;

    let frame = 0;
    const loop = () => {
      if (needsRender) {
        renderer.render(scene, camera);
        needsRender = false;
      }
      frame = requestAnimationFrame(loop);
    };

    const resize = () => {
      const width = canvas.clientWidth || window.innerWidth;
      const height = canvas.clientHeight || window.innerHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      invalidate();
    };

    const raycaster = new THREE.Raycaster();
    const pick = (clientX: number, clientY: number) => {
      const house = houseRef.current;
      if (!house) return;
      const rect = canvas.getBoundingClientRect();
      raycaster.setFromCamera(
        new THREE.Vector2(
          ((clientX - rect.left) / rect.width) * 2 - 1,
          -((clientY - rect.top) / rect.height) * 2 + 1,
        ),
        camera,
      );
      const layer = furnitureLayerRef.current;
      const furnitureTargets = layer ? layer.pickables.filter(isVisible) : [];
      const targets = [...furnitureTargets, ...house.roomPickables.filter(isVisible), ...house.pickables.filter(isVisible)];
      const hits = raycaster.intersectObjects(targets, false);
      const pieceHit = hits.length && layer ? layer.resolve(hits[0]!.object) : null;
      setPieceId(pieceHit);
      if (pieceHit) {
        house.setSelected(null);
        house.highlightRoom(null);
        setSelected(null);
        setRoom(null);
        invalidate();
        return;
      }
      const found = hits.length ? house.resolve(hits[0]!.object) : null;
      house.setSelected(found?.type === 'part' ? hits[0]!.object : null);
      house.highlightRoom(found?.type === 'room' ? found.room.id : null);
      setSelected(found);
      setRoom(found?.type === 'room' ? found.room : null);
      invalidate();
    };

    /** where a ray through the screen point meets the horizontal plane at `heightMm` - model mm */
    const planePoint = (clientX: number, clientY: number, heightMm: number) => {
      const rect = canvas.getBoundingClientRect();
      raycaster.setFromCamera(
        new THREE.Vector2(
          ((clientX - rect.left) / rect.width) * 2 - 1,
          -((clientY - rect.top) / rect.height) * 2 + 1,
        ),
        camera,
      );
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -heightMm * 0.001);
      const hit = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
      return hit ? { x: hit.x / 0.001, y: -hit.z / 0.001 } : null;
    };

    // only the chosen piece can be dragged, and only in the editor - anywhere else one
    // finger turns the house as always
    const grab = (clientX: number, clientY: number): boolean => {
      const layer = furnitureLayerRef.current;
      const { editing: isEditing, pieceId: chosen } = editRef.current;
      if (!layer || !isEditing || !chosen) return false;
      const rect = canvas.getBoundingClientRect();
      raycaster.setFromCamera(
        new THREE.Vector2(
          ((clientX - rect.left) / rect.width) * 2 - 1,
          -((clientY - rect.top) / rect.height) * 2 + 1,
        ),
        camera,
      );
      const hits = raycaster.intersectObjects(layer.pickables.filter(isVisible), false);
      if (!hits.length || layer.resolve(hits[0]!.object) !== chosen) return false;
      const item = furnitureRef.current.items.find((candidate) => candidate.id === chosen);
      if (!item) return false;
      const at = planePoint(clientX, clientY, FLOOR_Z[item.floor] + item.z);
      if (!at) return false;
      dragRef.current = { before: item, current: item, dx: item.x - at.x, dy: item.y - at.y };
      return true;
    };

    const drag = (clientX: number, clientY: number) => {
      const state = dragRef.current;
      const layer = furnitureLayerRef.current;
      if (!state || !layer) return;
      const item = state.before;
      const at = planePoint(clientX, clientY, FLOOR_Z[item.floor] + item.z);
      if (!at) return;
      const target = snapPosition(item, at.x + state.dx, at.y + state.dy, roomsRef.current);
      state.current = { ...item, x: target.x, y: target.y };
      layer.move(state.current);
      layer.select(item.id, sticksOut(state.current, roomsRef.current));
      invalidate();
    };

    const release = (moved: boolean) => {
      const state = dragRef.current;
      dragRef.current = null;
      if (!state || !moved) return;
      if (state.current.x === state.before.x && state.current.y === state.before.y) return;
      commitRef.current(state.before, state.current);
    };

    void (async () => {
      try {
        const [doc, rooms, roomMap] = await Promise.all([loadScene(variant), loadRooms(variant), loadRoomMap()]);
        if (disposed) return;
        const house = buildHouse(THREE, scene, doc, { rooms });
        houseRef.current = house;
        roomsRef.current = rooms.rooms;

        // the furniture belongs to the plan; the other models stay as they are. Whatever
        // goes wrong with it must not cost the house itself.
        if (variant === 'soll') {
          try {
            const layer = createFurnitureLayer(THREE, house.groups, { readModel: readModelFile, onChange: invalidate });
            furnitureLayerRef.current = layer;
            layer.sync(furnitureRef.current.items, furnitureRef.current.models);
            layer.setVisible(showFurnitureRef.current);
          } catch (cause) {
            debugLog('moebel', `Möbel nicht aufgebaut: ${cause instanceof Error ? cause.message : String(cause)}`);
          }
        }

        // the view the user left behind wins over the default one; on a variant change
        // this is the view of a moment ago, so the house does not jump under the finger
        const keptView = lastViewerState();
        const preset = VIEW_PRESETS[0]!;
        controlsRef.current = createOrbitControls(
          canvas,
          camera,
          THREE,
          keptView
            ? {
                theta: keptView.camera.theta,
                phi: keptView.camera.phi,
                distance: keptView.camera.distance,
                target: new THREE.Vector3(...keptView.camera.target),
              }
            : {
                theta: preset.theta,
                phi: preset.phi,
                distance: preset.distance,
                target: new THREE.Vector3(...preset.target),
              },
          { onChange: invalidate, onTap: pick, onGrab: grab, onDrag: drag, onRelease: release },
        );

        house.setStructuralMode(structural);
        house.setRoomsVisible(showRooms);
        for (const layer of LAYERS) house.groups[layer].visible = layerState[layer];

        // a link with ?raum= means "show me this room": it sets the floor view and wins
        // over whatever was kept. Without it the room whose panel was open comes back.
        // The id may come from the other variant's naming (Soll id opened here on Ist,
        // or vice versa) - resolveInVariant finds this variant's own room for it.
        const wanted = params.get('raum');
        if (wanted) {
          // Aktuell has the Bestand's room ids, so it resolves like the Bestand
          const found = resolveInVariant(wanted, variant === 'soll' ? 'soll' : 'ist', rooms.rooms, roomMap.map);
          if (found) {
            const label = `${found.floor}-Grundriss`;
            const preset2 = VIEW_PRESETS.find((item) => item.label === label);
            if (preset2) applyPreset(preset2.label);
            house.highlightRoom(found.id);
            setRoom(found);
          }
        } else if (keptView?.roomId) {
          const found = resolveInVariant(keptView.roomId, variant === 'soll' ? 'soll' : 'ist', rooms.rooms, roomMap.map);
          if (found) {
            house.highlightRoom(found.id);
            setRoom(found);
          }
        }

        resize();
        loop();
        setLoading(false);
      } catch (cause) {
        if (!disposed) {
          setError(
            cause instanceof Error && cause.message === NO_MODEL_MESSAGE
              ? NO_MODEL_MESSAGE
              : 'Das Modell konnte nicht geladen werden.',
          );
          setLoading(false);
        }
      }
    })();

    window.addEventListener('resize', resize);
    return () => {
      disposed = true;
      // first remember, then tear down: the camera lives in the controls
      const state = snapshot();
      if (state) rememberViewerState(state);
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      controlsRef.current?.dispose();
      controlsRef.current = null;
      furnitureLayerRef.current?.dispose();
      furnitureLayerRef.current = null;
      dragRef.current = null;
      houseRef.current?.dispose();
      houseRef.current = null;
      renderer.dispose();
    };
    // rebuilding on variant change is the point; the other values are applied imperatively
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant, reloadKey]);

  function toggleLayer(layer: Layer) {
    const house = houseRef.current;
    if (!house) return;
    setLayerState((current) => {
      const visible = !current[layer];
      house.groups[layer].visible = visible;
      renderRef.current?.();
      return { ...current, [layer]: visible };
    });
  }

  // ---------------------------------------------------------------- furniture

  // the stored furniture changed (here, on the other phone, or by undo)
  useEffect(() => {
    const layer = furnitureLayerRef.current;
    if (!layer) return;
    try {
      layer.sync(furniture.items, furniture.models);
      // a piece being dragged keeps following the finger, whatever arrived meanwhile
      if (dragRef.current) layer.move(dragRef.current.current);
    } catch (cause) {
      debugLog('moebel', `Möbel nicht aktualisiert: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
    renderRef.current?.();
  }, [furniture]);

  useEffect(() => {
    const layer = furnitureLayerRef.current;
    if (!layer) return;
    layer.select(piece?.id ?? null, piece ? sticksOut(piece, roomsRef.current) : false);
    renderRef.current?.();
  }, [piece]);

  const pushUndo = (step: UndoStep) => {
    undoRef.current = [...undoRef.current.slice(-(UNDO_LIMIT - 1)), step];
    setUndoCount(undoRef.current.length);
  };

  /** stores a changed piece; null `before` adds it, null `after` removes it */
  const commit = (before: FurnitureItem | null, after: FurnitureItem | null) => {
    if (after) saveFurnitureItem(after);
    else if (before) deleteFurnitureItem(before.id);
    pushUndo({ before, after });
  };
  commitRef.current = commit;

  function undo() {
    const step = undoRef.current.pop();
    setUndoCount(undoRef.current.length);
    if (!step) return;
    if (step.before) saveFurnitureItem(step.before);
    else if (step.after) deleteFurnitureItem(step.after.id);
    setPieceId(step.before?.id ?? null);
  }

  /** the storey a new piece goes on: the highest of the storeys on screen, else the open room's */
  function targetFloor(): FurnitureFloor {
    for (const layer of ['OG', 'EG', 'KG'] as const) if (layerState[layer]) return layer;
    if (room && (FURNITURE_FLOORS as readonly string[]).includes(room.floor)) return room.floor as FurnitureFloor;
    return 'EG';
  }

  function addPiece(type: string, model?: FurnitureModel) {
    setCatalogOpen(false);
    const floor = targetFloor();
    const target = controlsRef.current?.state.target;
    let at = target ? { x: target.x / 0.001, y: -target.z / 0.001 } : { x: 6500, y: 5900 };
    const inRoom = room?.floor === floor ? room : roomAt(roomsRef.current, floor, at.x, at.y);
    const centre = inRoom ? roomCentre(inRoom) : null;
    if (centre) at = centre;
    const dims = model ? { w: model.w, d: model.d, h: model.h } : undefined;
    const item = newItem(newId(), type, floor, at, dims, model?.id);
    commit(null, item);
    setPieceId(item.id);
    setEditing(true);
    setShowFurniture(true);
    furnitureLayerRef.current?.setVisible(true);
  }

  function changePiece(next: FurnitureItem) {
    if (!piece) return;
    commit(piece, next);
  }

  function duplicatePiece() {
    if (!piece) return;
    const copy: FurnitureItem = { ...piece, id: newId(), x: piece.x + 200, y: piece.y - 200 };
    commit(null, copy);
    setPieceId(copy.id);
  }

  function deletePiece() {
    if (!piece) return;
    commit(piece, null);
    setPieceId(null);
  }

  function toggleFurniture() {
    const next = !showFurniture;
    setShowFurniture(next);
    furnitureLayerRef.current?.setVisible(next);
    if (!next) {
      setEditing(false);
      setPieceId(null);
    }
    renderRef.current?.();
  }

  // only this view: the Bestand/Plan setting (which also names the rooms in all
  // forms) stays as it is - it is changed in the settings, nowhere else
  function switchVariant(next: Variant) {
    setVariant(next);
    setEditing(false);
    setPieceId(null);
    setCatalogOpen(false);
    const nextParams = new URLSearchParams(params);
    nextParams.set('variant', next);
    setParams(nextParams, { replace: true });
  }

  // an imported model that is looked at before it is published; reloadKey follows it
  const preview = previewOf(variant);

  // the bottom navigation takes the lowest 64 pixels on the phone
  const bottomOffset = 'bottom-[calc(64px+env(safe-area-inset-bottom))] md:bottom-2';
  const containerHeight = 'h-[100dvh] md:h-screen';

  return (
    <div className={`relative ${containerHeight} overflow-hidden`}>
      <canvas ref={canvasRef} className="canvas-3d absolute inset-0 w-full h-full block" />

      {/* header */}
      <div className="absolute top-0 inset-x-0 p-2 pt-[max(0.5rem,env(safe-area-inset-top))] pointer-events-none">
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl overflow-hidden border border-line pointer-events-auto">
            {VARIANTS.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={variant === item}
                className={`px-3 min-h-10 text-sm ${variant === item ? 'bg-accent text-bg font-semibold' : 'bg-panel text-muted'}`}
                onClick={() => switchVariant(item)}
              >
                {VARIANT_LABEL[item]}
              </button>
            ))}
          </div>
          {preview && (
            <span className="text-[11px] text-bg bg-warn rounded px-2 py-1 pointer-events-auto flex items-center gap-2">
              Vorschau v{preview.version} · nicht veröffentlicht
              <button
                type="button"
                className="underline"
                onClick={() => {
                  clearPreview(variant);
                  // the import is still waiting in the settings - publish or discard it there
                  navigate('/einstellungen#import');
                }}
              >
                zurück zum Import
              </button>
            </span>
          )}
          {release && !preview && (
            <span className="text-[11px] text-muted bg-bg/70 rounded px-2 py-1">
              v{release.version} · {release.updatedAt}
            </span>
          )}
        </div>
      </div>

      {loading && (
        <div className="absolute inset-0 grid place-items-center">
          <Spinner label="Modell wird geladen…" />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 grid place-items-center p-8">
          <p className="card p-4 text-sm text-warn">{error}</p>
        </div>
      )}

      {/*
        Everything at the bottom is one stack, not three overlays with their own offsets.
        On the phone the navigation bar takes the lowest 64 pixels, and the chips below
        wrap into two rows - a panel placed at `bottom-2` ends up behind both of them.
        Stacked, the panel is always above the controls and the whole stack keeps its
        distance from the navigation in exactly one place.
      */}
      <div
        className={`absolute left-2 right-2 ${bottomOffset} z-20 flex flex-col gap-2
                    pointer-events-none`}
      >
        {selected?.type === 'part' && (
          <div className="card p-3 border-l-4 border-l-accent pointer-events-auto">
            <div className="font-medium">
              {selected.prim.name} <span className="text-muted">· {LAYER_LABEL[selected.prim.layer]}</span>
            </div>
            <div className="text-xs text-muted">
              {formatDimensions(selected.prim.bb)} · {CONFIDENCE_LABEL[selected.prim.tag]}
              {selected.prim.kind === 'wall' ? (selected.prim.tragend ? ' · tragend' : ' · nicht tragend') : ''}
            </div>
          </div>
        )}

        {piece && (
          <FurnitureItemPanel
            item={piece}
            models={furniture.models}
            rooms={roomsRef.current}
            editing={editing}
            onChange={changePiece}
            onDuplicate={duplicatePiece}
            onDelete={deletePiece}
            onEdit={() => setEditing(true)}
            onClose={() => setPieceId(null)}
          />
        )}

        {room && !piece && (
          <RoomPanel
            room={room}
            onClose={() => {
              setRoom(null);
              houseRef.current?.highlightRoom(null);
              renderRef.current?.();
            }}
          />
        )}

        {editing && (
          <div className="card p-2 pointer-events-auto">
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className="chip chip-on" onClick={() => setCatalogOpen(true)}>
                + Möbel
              </button>
              <button type="button" className="chip" disabled={undoCount === 0} onClick={undo}>
                Rückgängig
              </button>
              <button
                type="button"
                className="chip ml-auto"
                onClick={() => {
                  setEditing(false);
                  setPieceId(null);
                }}
              >
                Fertig
              </button>
            </div>
            <p className="text-xs text-muted mt-1.5">
              {piece
                ? 'Das gewählte Möbel mit einem Finger ziehen – an Wänden rastet es ein.'
                : 'Ein Möbel antippen, um es zu wählen. Neue kommen in den offenen Raum oder die Mitte der Ansicht.'}
            </p>
          </div>
        )}

        {/* controls */}
        <div className="flex flex-wrap gap-1.5 pointer-events-auto">
          {LAYERS.map((layer) => (
            <button
              key={layer}
              type="button"
              className={`chip ${layerState[layer] ? 'chip-on' : ''}`}
              aria-pressed={!!layerState[layer]}
              onClick={() => toggleLayer(layer)}
            >
              {LAYER_SHORT[layer]}
            </button>
          ))}
          <button
            type="button"
            className={`chip ${structural ? 'border-bad text-bad' : ''}`}
            aria-pressed={structural}
            onClick={() => {
              const next = !structural;
              setStructural(next);
              houseRef.current?.setStructuralMode(next);
              renderRef.current?.();
            }}
          >
            Tragwände
          </button>
          {isPlan && (
            <button type="button" className={`chip ${showFurniture ? 'chip-on' : ''}`} aria-pressed={showFurniture} onClick={toggleFurniture}>
              Möbel
            </button>
          )}
          {isPlan && !editing && (
            <button
              type="button"
              className="chip"
              onClick={() => {
                setEditing(true);
                if (!showFurniture) toggleFurniture();
              }}
            >
              Einrichten
            </button>
          )}
          <button
            type="button"
            className={`chip ${showRooms ? 'chip-on' : ''}`}
            aria-pressed={showRooms}
            onClick={() => {
              const next = !showRooms;
              setShowRooms(next);
              houseRef.current?.setRoomsVisible(next);
              renderRef.current?.();
            }}
          >
            Räume
          </button>
          <select
            className="chip bg-panel"
            value={viewLabel}
            onChange={(event) => applyPreset(event.target.value)}
          >
            {VIEW_PRESETS.map((preset) => (
              <option key={preset.label} value={preset.label}>
                Ansicht: {preset.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <FurnitureCatalog
        open={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        models={furniture.models}
        items={furniture.items}
        onPick={addPiece}
      />
    </div>
  );
}
