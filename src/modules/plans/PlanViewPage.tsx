import { useEffect, useRef, useState, type MouseEvent, type RefObject } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { Spinner } from '@/components/Fields';
import { useCollection } from '@/data/hooks';
import { COL, type Plan } from '@/data/types';
import { loadBundledPlans, loadRooms, type Variant } from '@/data/models';
import { resolveFileUrl } from '@/offline/fileUrls';
import { RoomPanel } from '@/modules/viewer3d/RoomPanel';
import type { Room } from '@/modules/viewer3d/houseScene';

/** pinch to zoom, drag to pan - the same gestures as the 3D view */
function usePanZoom(target: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const element = target.current;
    if (!element) return;
    let scale = 1;
    let x = 0;
    let y = 0;
    const pointers = new Map<number, { x: number; y: number }>();
    let lastPinch = 0;

    const apply = () => {
      const content = element.firstElementChild as HTMLElement | null;
      if (content) content.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    };
    const down = (event: PointerEvent) => {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      element.setPointerCapture(event.pointerId);
    };
    const up = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      lastPinch = 0;
    };

    const move = (event: PointerEvent) => {
      const previous = pointers.get(event.pointerId);
      if (!previous) return;
      const dx = event.clientX - previous.x;
      const dy = event.clientY - previous.y;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 1) {
        x += dx;
        y += dy;
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        if (a && b) {
          const pinch = Math.hypot(a.x - b.x, a.y - b.y);
          if (lastPinch) scale = Math.min(Math.max(scale * (pinch / lastPinch), 0.5), 8);
          lastPinch = pinch;
        }
      }
      apply();
    };
    const wheel = (event: WheelEvent) => {
      scale = Math.min(Math.max(scale * (1 - event.deltaY * 0.001), 0.5), 8);
      apply();
    };

    element.addEventListener('pointerdown', down);
    element.addEventListener('pointerup', up);
    element.addEventListener('pointercancel', up);
    element.addEventListener('pointermove', move);
    element.addEventListener('wheel', wheel, { passive: true });
    return () => {
      element.removeEventListener('pointerdown', down);
      element.removeEventListener('pointerup', up);
      element.removeEventListener('pointercancel', up);
      element.removeEventListener('pointermove', move);
      element.removeEventListener('wheel', wheel);
    };
  }, [target]);
}

export default function PlanViewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: uploaded } = useCollection<Plan>(COL.plans);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [roomById, setRoomById] = useState<Map<string, Room>>(new Map());
  const [room, setRoom] = useState<Room | null>(null);
  const container = useRef<HTMLDivElement>(null);
  usePanZoom(container);

  useEffect(() => {
    let active = true;
    void (async () => {
      const fromUpload = uploaded.find((item) => item.id === id);
      if (fromUpload) {
        if (!active) return;
        setPlan(fromUpload);
        setUrl(await resolveFileUrl(fromUpload.path));
        return;
      }
      const { plans } = await loadBundledPlans();
      const bundled = plans.find((item) => item.id === id);
      if (!bundled || !active) return;
      setPlan({ ...bundled, floor: bundled.floor as Plan['floor'] } as Plan);
      // the plan carries data-room-id from ITS OWN variant's room list - a Soll plan's
      // ids are Soll ids, an Ist plan's are Ist ids, never the naming setting's mix
      void loadRooms(bundled.variant as Variant).then((doc) => {
        if (active) setRoomById(new Map(doc.rooms.map((r) => [r.id, r])));
      });
      const response = await fetch(`${import.meta.env.BASE_URL}${bundled.path}`);
      if (active) setSvg(await response.text());
    })();
    return () => {
      active = false;
    };
  }, [id, uploaded]);

  /** the generated plans carry data-room-id, so a tap opens the same panel as in 3D */
  function onSvgClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    const roomId = target.closest('[data-room-id]')?.getAttribute('data-room-id');
    if (roomId) setRoom(roomById.get(roomId) ?? null);
  }

  if (!plan) return <Spinner />;

  return (
    <div className="h-[100dvh] md:h-screen flex flex-col">
      <TopBar title={plan.title} back="/plaene" />
      <div ref={container} className="flex-1 overflow-hidden relative bg-bg touch-none">
        {svg && (
          // the SVG comes from our own build output under public/plans, never from a user
          <div className="origin-top-left w-full h-full" onClick={onSvgClick} dangerouslySetInnerHTML={{ __html: svg }} />
        )}
        {!svg && url && plan.kind === 'pdf' && (
          <iframe title={plan.title} src={url} className="w-full h-full border-0 bg-white" />
        )}
        {!svg && url && plan.kind === 'image' && (
          <img src={url} alt={plan.title} className="origin-top-left max-w-none" />
        )}
        {!svg && !url && (
          <div className="grid place-items-center h-full p-8 text-center text-muted text-sm">
            Diese Datei ist offline nicht verfügbar. Einmal mit Netz öffnen, dann bleibt sie gespeichert.
          </div>
        )}
        {room && <RoomPanel room={room} onClose={() => setRoom(null)} />}
      </div>
      <button type="button" className="btn btn-ghost m-2" onClick={() => navigate('/plaene')}>
        Zurück zur Übersicht
      </button>
    </div>
  );
}
