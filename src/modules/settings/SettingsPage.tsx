import { useEffect, useState } from 'react';
import { TopBar } from '@/components/TopBar';
import { Field } from '@/components/Fields';
import { useAuth } from '@/auth/AuthContext';
import { signOut } from '@/firebase/auth';
import { APP_VERSION, APP_SHA, BUILD_DATE } from '@/firebase/app';
import { loadSettings, saveSettings, CLAUDE_MODELS, type LocalSettings } from '@/lib/settings';
import { ExportSection } from './ExportSection';
import { FolderExportSection } from './FolderExportSection';
import { ModelSection } from './ModelSection';
import { NotionImportSection } from './NotionImportSection';
import { listJobs, retryAll, type OutboxJob } from '@/offline/outbox';
import { activeExtractor } from '@/platform/ocr';
import { patchDoc } from '@/firebase/db';
import { COL } from '@/data/types';
import { parseClock } from '@/lib/date';
import { requestPushPermission } from '@/platform/notifications';
import { formatBytes } from '@/lib/image';

export default function SettingsPage() {
  const { user, profile } = useAuth();
  const [settings, setSettings] = useState<LocalSettings>(() => loadSettings());
  const [jobs, setJobs] = useState<OutboxJob[]>([]);
  const [engine, setEngine] = useState<string>('wird geprüft…');
  const [storage, setStorage] = useState<string>('');
  const [reminderTime, setReminderTime] = useState(profile?.reminderTime ?? '20:00');
  const [pushMessage, setPushMessage] = useState<string | null>(null);

  useEffect(() => {
    void listJobs().then(setJobs);
    void activeExtractor().then((extractor) => setEngine(extractor?.label ?? 'nicht eingerichtet'));
    void navigator.storage?.estimate?.().then((estimate) => {
      if (estimate.usage) setStorage(formatBytes(estimate.usage));
    });
  }, []);

  useEffect(() => {
    if (profile?.reminderTime) setReminderTime(profile.reminderTime);
  }, [profile?.reminderTime]);

  function update(patch: Partial<LocalSettings>) {
    setSettings(saveSettings(patch));
  }

  async function updateProfile(patch: Record<string, unknown>) {
    if (!user) return;
    await patchDoc(COL.users, user.uid, patch);
  }

  return (
    <>
      <TopBar title="Einstellungen" />

      <div className="p-4 max-w-2xl flex flex-col gap-6">
        <section className="card p-4">
          <h2 className="font-semibold mb-3">Konto</h2>
          <p className="text-sm text-muted">{profile?.displayName ?? user?.email}</p>
          <p className="text-sm text-muted mb-3">{user?.email}</p>
          <button type="button" className="btn" onClick={() => void signOut()}>
            Abmelden
          </button>
        </section>

        <section className="card p-4">
          <h2 className="font-semibold mb-3">Abend-Erinnerung</h2>
          <label className="flex items-center gap-3 mb-3">
            <input
              type="checkbox"
              className="w-5 h-5 accent-[#c9a86a]"
              checked={profile?.reminderEnabled ?? false}
              onChange={(event) => void updateProfile({ reminderEnabled: event.target.checked })}
            />
            <span>Erinnern, wenn für heute noch kein Eintrag da ist</span>
          </label>
          <Field label="Uhrzeit">
            <input
              className="field w-32"
              type="time"
              value={reminderTime}
              onChange={(event) => setReminderTime(event.target.value)}
              onBlur={() => {
                if (parseClock(reminderTime) !== null) void updateProfile({ reminderTime });
              }}
            />
          </Field>
          <button
            type="button"
            className="btn"
            onClick={() =>
              void requestPushPermission().then((result) =>
                setPushMessage(
                  result.ok ? 'Benachrichtigungen sind eingerichtet.' : result.message ?? 'Nicht eingerichtet.',
                ),
              )
            }
          >
            Benachrichtigungen erlauben
          </button>
          {pushMessage && <p className="text-sm text-muted mt-2">{pushMessage}</p>}
        </section>

        <NotionImportSection />

        <FolderExportSection />

        <ExportSection />

        <section className="card p-4">
          <h2 className="font-semibold mb-3">Fotos</h2>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="w-5 h-5 accent-[#c9a86a] mt-0.5"
              checked={settings.keepOriginals}
              onChange={(event) => update({ keepOriginals: event.target.checked })}
            />
            <span>
              Originale mitsichern
              <span className="block text-sm text-muted">
                Neben der verkleinerten Fassung wird die unveränderte Datei gespeichert – nötig,
                wenn du Jahre später noch in einen Kabelverlauf hineinzoomen willst. Braucht etwa
                das Zehnfache an Speicher, deshalb am besten nur für solche Aufnahmen einschalten.
                Der Schalter steht auch direkt über der Fotoleiste im Eintrag.
              </span>
            </span>
          </label>
        </section>

        <section className="card p-4">
          <h2 className="font-semibold mb-3">Beleg-Auslesen</h2>
          <p className="text-sm text-muted mb-3">Aktiv: {engine}</p>
          <Field label="Verfahren">
            <select
              className="field"
              value={settings.ocrEngine}
              onChange={(event) => update({ ocrEngine: event.target.value as LocalSettings['ocrEngine'] })}
            >
              <option value="auto">Automatisch (ML Kit, sonst Claude)</option>
              <option value="mlkit">Nur ML Kit (nur in der App-Version)</option>
              <option value="claude">Nur Claude (online)</option>
              <option value="off">Aus</option>
            </select>
          </Field>
          <Field
            label="Claude API-Key"
            hint="Wird nur auf diesem Gerät gespeichert. Kosten pro Beleg etwa ein bis zwei Cent."
          >
            <input
              className="field"
              type="password"
              placeholder="sk-ant-…"
              value={settings.claudeApiKey}
              onChange={(event) => update({ claudeApiKey: event.target.value.trim() })}
            />
          </Field>
          <Field label="Modell">
            <select
              className="field"
              value={settings.claudeModel}
              onChange={(event) => update({ claudeModel: event.target.value })}
            >
              {CLAUDE_MODELS.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </select>
          </Field>
        </section>

        <ModelSection signedIn={!!user} />

        <section className="card p-4">
          <h2 className="font-semibold mb-3">Offline</h2>
          <p className="text-sm text-muted">Belegter Speicher: {storage || 'unbekannt'}</p>
          <p className="text-sm text-muted mb-3">Wartende Uploads: {jobs.length}</p>
          {jobs.length > 0 && (
            <button
              type="button"
              className="btn"
              onClick={() => void retryAll().then(() => void listJobs().then(setJobs))}
            >
              Jetzt hochladen
            </button>
          )}
        </section>

        <section className="card p-4">
          <h2 className="font-semibold mb-2">App</h2>
          <p className="text-sm text-muted">
            Version {APP_VERSION}
          </p>
          <p className="text-xs text-muted mt-1">
            gebaut am {BUILD_DATE} · Stand {APP_SHA}
          </p>
        </section>
      </div>
    </>
  );
}
