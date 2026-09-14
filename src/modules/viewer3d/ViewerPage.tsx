import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import { RoomPanel } from './RoomPanel';
import { loadManifest, loadRooms, loadScene, type ModelManifest, type Variant } from '@/data/models';
import { loadSettings, saveSettings } from '@/lib/settings';
import { Spinner } from '@/components/Fields';

export default function ViewerPage() {
  const [params, setParams] = useSearchParams();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const houseRef = useRef<HouseScene | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const renderRef = useRef<(() => void) | null>(null);

  const initialVariant = (params.get('variant') as Variant) ?? loadSettings().defaultModelVariant;
  const [variant, setVariant] = useState<Variant>(initialVariant === 'soll' ? 'soll' : 'ist');
  const [manifest, setManifest] = useState<ModelManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [layerState, setLayerState] = useState<Record<Layer, boolean>>({
    KG: true, EG: true, OG: true, DACH: true, GAR: true,
  });
  const [viewLabel, setViewLabel] = useState(VIEW_PRESETS[0]!.label);
  const [structural, setStructural] = useState(false);
  const [showRooms, setShowRooms] = useState(false);
  const [selected, setSelected] = useState<Picked | null>(null);
  const [room, setRoom] = useState<Room | null>(null);

  useEffect(() => {
    void loadManifest().then(setManifest).catch(() => undefined);
  }, []);

  const applyPreset = useCallback((label: string) => {
    const preset = VIEW_PRESETS.find((item) => item.label === label);
    const house = houseRef.current;
    const controls = controlsRef.current;
    if (!preset || !house || !controls) return;
    if (preset.layers) {
      const next = { ...layerState };
      for (const layer of LAYERS) {
        const visible = preset.layers[layer] ?? true;
        house.groups[layer].visible = visible;
        next[layer] = visible;
      }
      setLayerState(next);
    } else {
      const next = { ...layerState };
      for (const layer of LAYERS) {
        house.groups[layer].visible = true;
        next[layer] = true;
      }
      setLayerState(next);
    }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // keep the look of the handover viewer, which predates three's colour management
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
    function pick(clientX: number, clientY: number) {
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
    }

    void (async () => {
      try {
        const [doc, rooms] = await Promise.all([loadScene(variant), loadRooms(variant)]);
        if (disposed) return;
        const house = buildHouse(THREE, scene, doc, { rooms });
        houseRef.current = house;

        const preset = VIEW_PRESETS[0]!;
        controlsRef.current = createOrbitControls(
          canvas,
          camera,
          THREE,
          {
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

        const wanted = params.get('raum');
        if (wanted) {
          const found = rooms.rooms.find((item) => item.id === wanted);
          if (found) {
            const label = `${found.floor}-Grundriss`;
            const preset2 = VIEW_PRESETS.find((item) => item.label === label);
            if (preset2) applyPreset(preset2.label);
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
            cause instanceof Error && cause.message.includes('404')
              ? 'Modell noch nicht heruntergeladen – die App einmal mit Internet öffnen.'
              : 'Das Modell konnte nicht geladen werden.',
          );
          setLoading(false);
        }
      }
    })();

    window.addEventListener('resize', resize);
    return () => {
      disposed = true;
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
  }, [variant]);

  function toggleLayer(layer: Layer) {
    const house = houseRef.current;
    if (!house) return;
    const next = !layerState[layer];
    house.groups[layer].visible = next;
    setLayerState({ ...layerState, [layer]: next });
    renderRef.current?.();
  }

  function switchVariant(next: Variant) {
    setVariant(next);
    saveSettings({ defaultModelVariant: next });
    const nextParams = new URLSearchParams(params);
    nextParams.set('variant', next);
    setParams(nextParams, { replace: true });
  }

  const info = manifest?.[variant];

  return (
    <div className="relative h-[100dvh] md:h-screen overflow-hidden">
      <canvas ref={canvasRef} className="canvas-3d absolute inset-0 w-full h-full block" />

      {/* header */}
      <div className="absolute top-0 inset-x-0 p-2 pt-[max(0.5rem,env(safe-area-inset-top))] pointer-events-none">
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl overflow-hidden border border-line pointer-events-auto">
            {(['ist', 'soll'] as Variant[]).map((item) => (
              <button
                key={item}
                type="button"
                className={`px-4 py-2 text-sm ${variant === item ? 'bg-accent text-bg font-semibold' : 'bg-panel text-muted'}`}
                onClick={() => switchVariant(item)}
              >
                {item === 'ist' ? 'Bestand' : 'Zielzustand'}
              </button>
            ))}
          </div>
          {info && (
            <span className="text-[11px] text-muted bg-bg/70 rounded px-2 py-1">
              v{info.version} · {info.updatedAt}
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

      {/* part info */}
      {selected?.type === 'part' && (
        <div className="absolute left-2 right-2 bottom-[7.5rem] card p-3 border-l-4 border-l-accent">
          <div className="font-medium">
            {selected.prim.name} <span className="text-muted">· {LAYER_LABEL[selected.prim.layer]}</span>
          </div>
          <div className="text-xs text-muted">
            {formatDimensions(selected.prim.bb)} · {CONFIDENCE_LABEL[selected.prim.tag]}
            {selected.prim.kind === 'wall' ? (selected.prim.tragend ? ' · tragend' : ' · nicht tragend') : ''}
          </div>
        </div>
      )}

      {room && <RoomPanel room={room} onClose={() => { setRoom(null); houseRef.current?.highlightRoom(null); renderRef.current?.(); }} />}

      {/* controls */}
      <div className="absolute left-2 right-2 bottom-[calc(64px+env(safe-area-inset-bottom))] md:bottom-2 flex flex-wrap gap-1.5">
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
  );
}
