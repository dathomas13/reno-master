import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import * as THREE from 'three';
import {
  buildHouse,
  isVisible,
  LAYERS,
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
import { createMeasureLayer, type MeasureLayer } from './measureLayer';
import {
  formatMetres,
  formatMillimetres,
  fromWorld,
  loupePlacement,
  measure,
  nearestWithin,
  type ModelPoint,
} from './measure';
import { useBackClose } from '@/platform/backHandlers';
import { activeRelease, clearPreview, loadRoomMap, loadRooms, loadScene, NO_MODEL_MESSAGE, previewOf, type Variant } from '@/data/models';
import { resolveInVariant } from '@/data/roomNaming';
import { VARIANT_LABEL, VARIANTS, type ReleaseInfo } from '@/data/modelRelease';
import { MODEL_EVENT, type SyncResult } from '@/data/modelSync';
import { loadSettings } from '@/lib/settings';
import { Spinner } from '@/components/Fields';
import { Icon } from '@/components/Icon';
import { Hint } from '@/components/Hint';
import { Sheet } from '@/components/Sheet';
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
import { setOpenRoom } from '@/lib/openRoom';

/** one step the editor can take back: the piece before and after, null where there was none */
interface UndoStep {
  before: FurnitureItem | null;
  after: FurnitureItem | null;
}
const UNDO_LIMIT = 50;

/** how close (screen px) a point has to come to a corner to snap onto it */
const SNAP_PX = { mouse: 10, touch: 22, drag: 14 };
/** how close a finger or the mouse has to come to a set point to move it */
const GRAB_PX = { mouse: 12, touch: 32 };
const LOUPE_PX = 132;
const LOUPE_ZOOM = 3;

/** top to bottom as the house is built; the garage stands apart at the end */
const RAIL_ORDER: Layer[] = ['DACH', 'STUHL', 'DG', 'OG', 'EG', 'KG', 'GAR'];
const RAIL_LABEL: Record<Layer, string> = {
  DACH: 'Dach',
  STUHL: 'Stuhl',
  DG: 'DG',
  OG: 'OG',
  EG: 'EG',
  KG: 'KG',
  GAR: 'Gar.',
};

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
  const [viewOpen, setViewOpen] = useState(false);
  const [structural, setStructural] = useState(saved?.structural ?? false);
  const [showRooms, setShowRooms] = useState(saved?.showRooms ?? false);
  const [selected, setSelected] = useState<Picked | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  // the capture button files new entries under the room shown here
  useEffect(() => {
    setOpenRoom(room?.id ?? null);
    return () => setOpenRoom(null);
  }, [room]);

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

  // ---------------------------------------------------------------- tape measure
  const [measuring, setMeasuring] = useState(false);
  const measuringRef = useRef(measuring);
  measuringRef.current = measuring;
  /** the placed points in world coordinates (at most two) and the hovered one, if any */
  const measureRef = useRef<{ points: THREE.Vector3[]; hover: THREE.Vector3 | null }>({ points: [], hover: null });
  const measureLayerRef = useRef<MeasureLayer | null>(null);
  /** the same points in model mm, for the panel */
  const [measurePoints, setMeasurePoints] = useState<ModelPoint[]>([]);
  /** redraws the measure from measureRef; set by the scene effect */
  const refreshMeasureRef = useRef<() => void>(() => undefined);
  const labelRef = useRef<HTMLDivElement>(null);
  const loupeRef = useRef<HTMLDivElement>(null);
  const coarse = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;

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

    const measureLayer = createMeasureLayer(THREE, scene);
    measureLayerRef.current = measureLayer;
    measureRef.current = { points: [], hover: null };
    setMeasurePoints([]);
    /** the finger moving a measure point, in canvas pixels - the magnifier follows it */
    let loupeAt: { x: number; y: number } | null = null;
    const loupeCamera = new THREE.PerspectiveCamera();

    /** the two points the line runs between: both placed, or the first and the hovered one */
    const shownPair = (): [THREE.Vector3, THREE.Vector3] | null => {
      const { points, hover } = measureRef.current;
      if (points.length === 2) return [points[0]!, points[1]!];
      if (points.length === 1 && hover) return [points[0]!, hover];
      return null;
    };

    const refreshMeasure = () => {
      const pair = shownPair();
      const { points } = measureRef.current;
      measureLayer.setPoints(points[0] ?? null, pair ? pair[1] : null);
      invalidate();
    };
    refreshMeasureRef.current = refreshMeasure;

    /** the distance label sits on the middle of the line, the magnifier above the finger */
    const placeOverlays = () => {
      const label = labelRef.current;
      if (label) {
        const pair = shownPair();
        const mid = pair ? pair[0].clone().lerp(pair[1], 0.5).project(camera) : null;
        if (pair && mid && mid.z < 1) {
          const x = ((mid.x + 1) / 2) * canvas.clientWidth;
          const y = ((1 - mid.y) / 2) * canvas.clientHeight;
          label.textContent = formatMetres(measure(fromWorld(pair[0]), fromWorld(pair[1])).total);
          label.style.transform = `translate(${x}px, ${y}px) translate(-50%, -140%)`;
          label.style.visibility = 'visible';
        } else {
          label.style.visibility = 'hidden';
        }
      }
      const frameEl = loupeRef.current;
      if (frameEl) {
        if (loupeAt) {
          const at = loupePlacement(loupeAt, LOUPE_PX, canvas.clientWidth, canvas.clientHeight);
          frameEl.style.transform = `translate(${at.x}px, ${at.y}px)`;
          frameEl.style.visibility = 'visible';
        } else {
          frameEl.style.visibility = 'hidden';
        }
      }
    };

    /** the spot under the moving finger, enlarged, in a square above it */
    const renderLoupe = () => {
      if (!loupeAt) return;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const at = loupePlacement(loupeAt, LOUPE_PX, width, height);
      const span = LOUPE_PX / LOUPE_ZOOM;
      loupeCamera.copy(camera);
      loupeCamera.setViewOffset(width, height, loupeAt.x - span / 2, loupeAt.y - span / 2, span, span);
      renderer.setScissorTest(true);
      renderer.setScissor(at.x, height - at.y - LOUPE_PX, LOUPE_PX, LOUPE_PX);
      renderer.setViewport(at.x, height - at.y - LOUPE_PX, LOUPE_PX, LOUPE_PX);
      renderer.render(scene, loupeCamera);
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, width, height);
    };

    let frame = 0;
    const loop = () => {
      if (needsRender) {
        renderer.render(scene, camera);
        renderLoupe();
        placeOverlays();
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

    /** the pointer of the last press: a finger needs bigger targets than the mouse */
    let touch = false;
    const notePointer = (event: PointerEvent) => {
      touch = event.pointerType !== 'mouse';
    };
    canvas.addEventListener('pointerdown', notePointer, { capture: true });

    /** a world point in client pixels */
    const toScreen = (world: THREE.Vector3, rect: DOMRect) => {
      const ndc = world.clone().project(camera);
      return { x: rect.left + ((ndc.x + 1) / 2) * rect.width, y: rect.top + ((1 - ndc.y) / 2) * rect.height };
    };

    /**
     * The point of the model under the screen point. Within `snapPx` of a corner of the
     * face it hits, it jumps onto that corner - the corners are where measurements start.
     */
    const surfaceAt = (clientX: number, clientY: number, snapPx: number) => {
      const house = houseRef.current;
      if (!house) return null;
      const rect = canvas.getBoundingClientRect();
      raycaster.setFromCamera(
        new THREE.Vector2(
          ((clientX - rect.left) / rect.width) * 2 - 1,
          -((clientY - rect.top) / rect.height) * 2 + 1,
        ),
        camera,
      );
      // not the room overlay: it floats a little above the floor and would cost that much
      const layer = furnitureLayerRef.current;
      const targets = [...(layer ? layer.pickables.filter(isVisible) : []), ...house.pickables.filter(isVisible)];
      const hit = raycaster.intersectObjects(targets, false)[0];
      if (!hit) return null;
      const geometry = (hit.object as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
      const position = geometry?.getAttribute('position');
      if (snapPx > 0 && hit.face && position) {
        const corners = [hit.face.a, hit.face.b, hit.face.c].map((index) =>
          new THREE.Vector3().fromBufferAttribute(position, index).applyMatrix4(hit.object.matrixWorld),
        );
        const index = nearestWithin(
          corners.map((corner) => toScreen(corner, rect)),
          { x: clientX, y: clientY },
          snapPx,
        );
        if (index >= 0) return { point: corners[index]!, snapped: true };
      }
      return { point: hit.point.clone(), snapped: false };
    };

    /** the measure point under the finger, while it is moved */
    let measureDrag: number | null = null;
    /** a press on a point that did not move it is not a tap that sets a new one */
    let skipTap = false;
    /** held Alt sets a point freely, without snapping to a corner */
    let altKey = false;

    /** the placed points changed: the panel shows them in model mm */
    const publishMeasure = () => {
      setMeasurePoints(measureRef.current.points.map(fromWorld));
      refreshMeasure();
    };

    /** a third point starts a new measurement */
    const measureTap = (clientX: number, clientY: number) => {
      const hit = surfaceAt(clientX, clientY, touch ? SNAP_PX.touch : altKey ? 0 : SNAP_PX.mouse);
      if (!hit) return;
      const state = measureRef.current;
      if (state.points.length >= 2) state.points = [];
      state.points.push(hit.point);
      state.hover = null;
      measureLayer.setCursor(null, false);
      publishMeasure();
    };

    const grabMeasure = (clientX: number, clientY: number): boolean => {
      const { points } = measureRef.current;
      if (!points.length) return false;
      const rect = canvas.getBoundingClientRect();
      const index = nearestWithin(
        points.map((point) => toScreen(point, rect)),
        { x: clientX, y: clientY },
        touch ? GRAB_PX.touch : GRAB_PX.mouse,
      );
      if (index < 0) return false;
      measureDrag = index;
      return true;
    };

    const dragMeasure = (clientX: number, clientY: number) => {
      if (measureDrag === null) return;
      const rect = canvas.getBoundingClientRect();
      const hit = surfaceAt(clientX, clientY, touch ? SNAP_PX.drag : altKey ? 0 : SNAP_PX.mouse);
      if (touch) loupeAt = { x: clientX - rect.left, y: clientY - rect.top };
      if (hit) {
        measureRef.current.points[measureDrag] = hit.point;
        measureLayer.setCursor(hit.point, hit.snapped);
        publishMeasure();
      } else {
        measureLayer.setCursor(null, false);
        invalidate();
      }
    };

    const releaseMeasure = (moved: boolean) => {
      measureDrag = null;
      loupeAt = null;
      skipTap = !moved;
      measureLayer.setCursor(null, false);
      invalidate();
    };

    // the mouse shows where a click would land, and with one point set the line follows it
    const hover = (event: PointerEvent) => {
      altKey = event.altKey;
      if (!measuringRef.current || event.pointerType !== 'mouse' || event.buttons !== 0) return;
      const hit = surfaceAt(event.clientX, event.clientY, event.altKey ? 0 : SNAP_PX.mouse);
      measureLayer.setCursor(hit?.point ?? null, hit?.snapped ?? false);
      measureRef.current.hover = measureRef.current.points.length === 1 ? (hit?.point ?? null) : null;
      refreshMeasure();
    };
    const leave = () => {
      if (!measuringRef.current) return;
      measureLayer.setCursor(null, false);
      measureRef.current.hover = null;
      refreshMeasure();
    };
    canvas.addEventListener('pointermove', hover);
    canvas.addEventListener('pointerleave', leave);

    const pick = (clientX: number, clientY: number) => {
      const house = houseRef.current;
      if (!house) return;
      if (measuringRef.current) {
        if (skipTap) skipTap = false;
        else measureTap(clientX, clientY);
        return;
      }
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
      skipTap = false;
      if (measuringRef.current) return grabMeasure(clientX, clientY);
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
      if (measureDrag !== null) {
        dragMeasure(clientX, clientY);
        return;
      }
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
      if (measureDrag !== null) {
        releaseMeasure(moved);
        return;
      }
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
      canvas.removeEventListener('pointerdown', notePointer, { capture: true });
      canvas.removeEventListener('pointermove', hover);
      canvas.removeEventListener('pointerleave', leave);
      measureLayer.dispose();
      measureLayerRef.current = null;
      refreshMeasureRef.current = () => undefined;
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

  // ---------------------------------------------------------------- tape measure

  function startMeasuring() {
    setMeasuring(true);
    setEditing(false);
    setPieceId(null);
    setSelected(null);
    setRoom(null);
    houseRef.current?.setSelected(null);
    houseRef.current?.highlightRoom(null);
    renderRef.current?.();
  }

  function clearMeasure() {
    measureRef.current = { points: [], hover: null };
    setMeasurePoints([]);
    refreshMeasureRef.current();
  }

  function stopMeasuring() {
    setMeasuring(false);
    clearMeasure();
    measureLayerRef.current?.setCursor(null, false);
    renderRef.current?.();
  }

  useBackClose(measuring, stopMeasuring);

  // Escape takes back the last point, and with none left ends measuring
  useEffect(() => {
    if (!measuring) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (!measureRef.current.points.length) {
        stopMeasuring();
        return;
      }
      measureRef.current.points.pop();
      measureRef.current.hover = null;
      setMeasurePoints(measureRef.current.points.map(fromWorld));
      refreshMeasureRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // stopMeasuring only touches refs and setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measuring]);

  const measured = measurePoints.length === 2 ? measure(measurePoints[0]!, measurePoints[1]!) : null;
  const measureHint = coarse
    ? ['Ersten Punkt antippen – an Ecken rastet er ein.', 'Zweiten Punkt antippen.', 'Einen Punkt mit dem Finger ziehen setzt ihn genau, die Lupe zeigt wohin. Neu antippen beginnt von vorn.']
    : ['Ersten Punkt anklicken – an Ecken rastet er ein, mit Alt nicht.', 'Zweiten Punkt anklicken.', 'Punkte lassen sich ziehen. Ein neuer Klick beginnt von vorn, Esc nimmt den letzten Punkt zurück.'];

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

      {/* placed every frame by the render loop, never through React - see placeOverlays */}
      <div
        ref={labelRef}
        aria-hidden
        className={`absolute left-0 top-0 z-[5] pointer-events-none rounded-md bg-bg/85 border border-accent/70
                    px-1.5 py-0.5 text-xs font-semibold text-accent tabular-nums whitespace-nowrap ${measuring ? '' : 'hidden'}`}
        style={{ visibility: 'hidden' }}
      />
      <div
        ref={loupeRef}
        aria-hidden
        className="absolute left-0 top-0 z-[5] pointer-events-none rounded-lg border-2 border-accent shadow-lg"
        style={{ width: LOUPE_PX, height: LOUPE_PX, visibility: 'hidden' }}
      >
        <div className="absolute left-1/2 top-2 bottom-2 w-px -translate-x-1/2 bg-accent/70" />
        <div className="absolute top-1/2 left-2 right-2 h-px -translate-y-1/2 bg-accent/70" />
      </div>

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
        {measuring && (
          <div className="card p-3 border-l-4 border-l-accent pointer-events-auto">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                {measured ? (
                  <>
                    <div className="text-2xl font-semibold text-accent tabular-nums leading-tight">
                      {formatMetres(measured.total)}
                      <span className="text-xs text-muted font-normal ml-2">{formatMillimetres(measured.total)}</span>
                    </div>
                    <div className="text-xs text-muted tabular-nums">
                      waagrecht {formatMetres(measured.horizontal)} · Höhe {formatMetres(measured.dz)}
                    </div>
                    <div className="text-xs text-muted tabular-nums">
                      Ost–West {formatMetres(measured.dx)} · Nord–Süd {formatMetres(measured.dy)}
                    </div>
                  </>
                ) : (
                  <div className="font-medium">Maßband</div>
                )}
                <p className="text-xs text-muted mt-1">{measureHint[Math.min(measurePoints.length, 2)]}</p>
              </div>
              <div className="flex flex-col gap-1.5 shrink-0">
                <button type="button" className="chip" disabled={!measurePoints.length} onClick={clearMeasure}>
                  Neu
                </button>
                <button type="button" className="chip" onClick={stopMeasuring}>
                  Fertig
                </button>
              </div>
            </div>
          </div>
        )}

        {!measuring && selected?.type === 'part' && (
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

        {/* while furnishing only the room's name matters - it says where new pieces go */}
        {room && !piece && !editing && !measuring && (
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
                ? 'Möbel mit einem Finger ziehen – an Wänden rastet es ein.'
                : room
                  ? `Neue Möbel kommen in: ${room.name}`
                  : 'Neue Möbel kommen in die Bildmitte.'}
            </p>
          </div>
        )}

        {!loading && !error && !measuring && (
          <Hint id="raum-antippen" done={!!room} className="pointer-events-auto">
            Einen Raum antippen zeigt, was dort passiert ist.
          </Hint>
        )}

        {/* overlays: one quiet row - floors and views have their own rail at the right edge */}
        {/* on its own panel like the floor rail: gold text alone is unreadable on a light model */}
        <div className="self-start flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-panel/80 backdrop-blur border border-line pointer-events-auto">
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
          <button
            type="button"
            className={`chip ${structural ? 'border-bad text-bad bg-bad/10' : ''}`}
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
          <button
            type="button"
            className={`chip ${measuring ? 'chip-on' : ''}`}
            aria-pressed={measuring}
            onClick={() => (measuring ? stopMeasuring() : startMeasuring())}
          >
            Messen
          </button>
          {isPlan && (
            <button type="button" className={`chip ${showFurniture ? 'chip-on' : ''}`} aria-pressed={showFurniture} onClick={toggleFurniture}>
              Möbel
            </button>
          )}
          {isPlan && !editing && (
            <button
              type="button"
              className="chip border-accent text-accent"
              onClick={() => {
                if (measuring) stopMeasuring();
                setEditing(true);
                if (!showFurniture) toggleFurniture();
              }}
            >
              Einrichten
            </button>
          )}
        </div>
      </div>

      {/* the tabs of the area "Haus", small on the left so the model keeps the room */}
      <nav
        aria-label="Haus"
        className="absolute left-2 top-[calc(3.5rem+env(safe-area-inset-top))] z-10 flex rounded-xl overflow-hidden
                   border border-line bg-panel/80 backdrop-blur text-sm"
      >
        <span aria-current="page" className="px-3 min-h-9 grid place-items-center bg-accent/15 text-accent font-semibold">
          3D
        </span>
        <Link to="/plaene" replace className="px-3 min-h-9 grid place-items-center text-muted">
          Pläne
        </Link>
      </nav>

      {/* the floors, stacked like the house itself: roof on top, cellar at the bottom */}
      <div
        role="group"
        aria-label="Geschosse"
        className="absolute right-2 top-[calc(3.5rem+env(safe-area-inset-top))] z-10 flex flex-col gap-1 p-1
                   rounded-xl bg-panel/80 backdrop-blur border border-line"
      >
        {RAIL_ORDER.map((layer) => (
          <button
            key={layer}
            type="button"
            aria-pressed={!!layerState[layer]}
            aria-label={LAYER_LABEL[layer]}
            title={LAYER_LABEL[layer]}
            className={`w-12 h-9 rounded-lg text-xs border ${layer === 'GAR' ? 'mt-2' : ''} ${
              layerState[layer]
                ? 'bg-accent/15 text-accent border-accent/60 font-semibold'
                : 'text-muted border-line/60'
            }`}
            onClick={() => toggleLayer(layer)}
          >
            {RAIL_LABEL[layer]}
          </button>
        ))}
        {/* a view sets floors and camera together, so it belongs with the floors */}
        <button
          type="button"
          className="w-12 mt-2 py-1.5 rounded-lg border border-line/60 text-muted flex flex-col items-center gap-0.5"
          aria-label={`Ansicht: ${viewLabel} – ändern`}
          title={`Ansicht: ${viewLabel}`}
          onClick={() => setViewOpen(true)}
        >
          <Icon name="eye" className="w-5 h-5" />
          <span className="text-[10px] leading-none">Ansicht</span>
        </button>
      </div>

      <Sheet open={viewOpen} onClose={() => setViewOpen(false)} title="Ansicht" doneLabel="Abbrechen">
        <ul className="pb-2">
          {VIEW_PRESETS.map((preset) => (
            <li key={preset.label}>
              <button
                type="button"
                className={`list-row w-full text-left ${preset.label === viewLabel ? 'text-accent' : ''}`}
                aria-pressed={preset.label === viewLabel}
                onClick={() => {
                  applyPreset(preset.label);
                  setViewOpen(false);
                }}
              >
                <span className="flex-1">{preset.label}</span>
                {preset.label === viewLabel && <Icon name="check" className="w-5 h-5" />}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>

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
