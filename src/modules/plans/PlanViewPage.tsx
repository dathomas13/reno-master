import { useEffect, useState, type MouseEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { Spinner } from '@/components/Fields';
import { ZoomPan } from '@/components/ZoomPan';
import { PdfViewer } from '@/components/PdfViewer';
import { useCollection } from '@/data/hooks';
import { COL, type Plan } from '@/data/types';
import { loadPlanSvg, loadRooms, modelPlans, MODEL_EVENT, type Variant } from '@/data/models';
import { resolveFileUrl } from '@/offline/fileUrls';
import { RoomPanel } from '@/modules/viewer3d/RoomPanel';
import type { Room } from '@/modules/viewer3d/houseScene';

export default function PlanViewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: uploaded } = useCollection<Plan>(COL.plans);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [roomById, setRoomById] = useState<Map<string, Room>>(new Map());
  const [room, setRoom] = useState<Room | null>(null);
  const [modelKey, setModelKey] = useState(0);
  // why a generated plan cannot be drawn - no model on this device yet
  const [missing, setMissing] = useState<string | null>(null);

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
      const generated = modelPlans().find((item) => item.id === id);
      if (!generated || !active) return;
      setPlan({ ...generated, floor: generated.floor as Plan['floor'] } as Plan);
      // the plan carries data-room-id from ITS OWN variant's room list - a Soll plan's
      // ids are Soll ids, an Ist plan's are Ist ids, never the naming setting's mix
      void loadRooms(generated.variant as Variant).then((doc) => {
        if (active) setRoomById(new Map(doc.rooms.map((r) => [r.id, r])));
      });
      try {
        const text = await loadPlanSvg(generated);
        if (active) {
          setSvg(text);
          setMissing(null);
        }
      } catch (problem) {
        if (active) setMissing(problem instanceof Error ? problem.message : 'Der Plan ließ sich nicht zeichnen.');
      }
    })();
    return () => {
      active = false;
    };
  }, [id, uploaded, modelKey]);

  // a model imported or synced while the plan is open is drawn again at once
  useEffect(() => {
    const onModel = () => setModelKey((key) => key + 1);
    window.addEventListener(MODEL_EVENT, onModel);
    return () => window.removeEventListener(MODEL_EVENT, onModel);
  }, []);

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
      <div className="flex-1 min-h-0 relative bg-bg">
        {svg && (
          <ZoomPan className="w-full h-full">
            {/* drawn by plansSvg.ts from the house file, with every text in it escaped */}
            <div className="w-full h-full" onClick={onSvgClick} dangerouslySetInnerHTML={{ __html: svg }} />
          </ZoomPan>
        )}
        {!svg && url && plan.kind === 'pdf' && <PdfViewer key={plan.path} storagePath={plan.path} />}
        {!svg && url && plan.kind === 'image' && (
          <ZoomPan className="w-full h-full">
            <div className="w-full h-full flex items-center justify-center">
              <img src={url} alt={plan.title} draggable={false} className="max-w-full max-h-full object-contain" />
            </div>
          </ZoomPan>
        )}
        {!svg && !url && (
          <div className="grid place-items-center h-full p-8 text-center text-muted text-sm">
            {missing ?? 'Diese Datei ist offline nicht verfügbar. Einmal mit Netz öffnen, dann bleibt sie gespeichert.'}
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
