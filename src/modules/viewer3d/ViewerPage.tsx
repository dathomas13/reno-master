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
    saved?.layers ?? { KG: true, EG: true, OG: true, DACH: true, GAR: true },
  );
  const [viewLabel, setViewLabel] = useState(saved?.viewLabel || VIEW_PRESETS[0]!.label);
  const [structural, setStructural] = useState(saved?.structural ?? false);
  const [showRooms, setShowRooms] = useState(saved?.showRooms ?? false);
  const [selected, setSelected] = useState<Picked | null>(null);
  const [room, setRoom] = useState<Room | null>(null);

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
      const targets = [...house.roomPickables.filter(isVisible), ...house.pickables.filter(isVisible)];
      const hits = raycaster.intersectObjects(targets, false);
      const found = hits.length ? house.resolve(hits[0]!.object) : null;
      house.setSelected(found?.type === 'part' ? hits[0]!.object : null);
      house.highlightRoom(found?.type === 'room' ? found.room.id : null);
      setSelected(found);
      setRoom(found?.type === 'room' ? found.room : null);
      invalidate();
    };

    void (async () => {
      try {
        const [doc, rooms, roomMap] = await Promise.all([loadScene(variant), loadRooms(variant), loadRoomMap()]);
        if (disposed) return;
        const house = buildHouse(THREE, scene, doc, { rooms });
        houseRef.current = house;

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
          { onChange: invalidate, onTap: pick },
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

  // only this view: the Bestand/Plan setting (which also names the rooms in all
  // forms) stays as it is - it is changed in the settings, nowhere else
  function switchVariant(next: Variant) {
    setVariant(next);
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
                className={`px-3 py-2 text-sm ${variant === item ? 'bg-accent text-bg font-semibold' : 'bg-panel text-muted'}`}
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

        {room && (
          <RoomPanel
            room={room}
            onClose={() => {
              setRoom(null);
              houseRef.current?.highlightRoom(null);
              renderRef.current?.();
            }}
          />
        )}

        {/* controls */}
        <div className="flex flex-wrap gap-1.5 pointer-events-auto">
          {LAYERS.map((layer) => (
            <button
              key={layer}
              type="button"
              className={`chip ${layerState[layer] ? 'chip-on' : ''}`}
              onClick={() => toggleLayer(layer)}
            >
              {LAYER_SHORT[layer]}
            </button>
          ))}
          <button
            type="button"
            className={`chip ${structural ? 'border-bad text-bad' : ''}`}
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
            className={`chip ${showRooms ? 'chip-on' : ''}`}
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
    </div>
  );
}
