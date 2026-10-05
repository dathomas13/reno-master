import { TopBar } from '@/components/TopBar';

/** placeholder, replaced by the real editor */
export default function RoomMapEditor() {
  return (
    <>
      <TopBar title="Zuordnung Bestand → Planung" back="/einstellungen/voreinstellungen" />
      <p className="p-4 text-muted">Folgt</p>
    </>
  );
}
