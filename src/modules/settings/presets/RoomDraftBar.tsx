import { useState } from 'react';
import type { RoomDraft } from '@/data/useRoomDraft';
import { RoomPublishSheet } from './RoomPublishSheet';
import { useConfirm } from '@/components/Confirm';

/** The bar at the bottom of the room screens while a draft exists: discard or publish it. */
export function RoomDraftBar({ draft }: { draft: RoomDraft }) {
  const [open, setOpen] = useState(false);
  const confirm = useConfirm();
  const count = draft.edits.length;
  if (count === 0 && !open) return null;
  return (
    <>
      {count > 0 && (
        <div
          className="sticky bottom-[calc(64px+env(safe-area-inset-bottom))] md:bottom-0 z-10 mt-4 card p-3
                     flex items-center gap-2 bg-panel shadow-lg"
        >
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{count === 1 ? '1 Änderung im Entwurf' : `${count} Änderungen im Entwurf`}</div>
            <div className="text-xs text-muted">{draft.online ? 'Noch nicht veröffentlicht' : 'Offline – Veröffentlichen später'}</div>
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() =>
              void confirm({
                title: 'Entwurf verwerfen?',
                message: 'Die Änderungen gehen verloren.',
                confirmLabel: 'Verwerfen',
                danger: true,
              }).then((go) => go && draft.discard())
            }
          >
            Verwerfen
          </button>
          <button type="button" className="btn btn-primary" disabled={!draft.online} onClick={() => setOpen(true)}>
            Veröffentlichen …
          </button>
        </div>
      )}
      <RoomPublishSheet open={open} onClose={() => setOpen(false)} draft={draft} />
    </>
  );
}
