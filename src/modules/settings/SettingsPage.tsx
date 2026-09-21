import { useEffect, useMemo, useState } from 'react';
import { TopBar } from '@/components/TopBar';
import { SettingsField as Field, SettingsHeading } from './SettingsHelp';
import { useAuth } from '@/auth/AuthContext';
import { signOut } from '@/firebase/auth';
import { APP_VERSION, APP_SHA, BUILD_DATE } from '@/firebase/app';
import { loadSettings, saveSettings, CLAUDE_MODELS, type LocalSettings } from '@/lib/settings';
import { cameraOptionsFromSettings, listCameraDevices } from '@/platform/camera';
import { clearCameraLog, noteUnfinishedCameraSession, readCameraLog } from '@/platform/cameraLog';
import {
  clearNativeCameraDiagnosis,
  nativeCameraSupported,
  readNativeCameraDiagnosis,
  runNativeCameraDiagnosis,
} from '@/platform/nativeCamera';
import { CameraCapture } from '@/components/CameraCapture';
import { ExportSection } from './ExportSection';
import { FolderExportSection } from './FolderExportSection';
import { ModelSection } from './ModelSection';
import { listJobs, retryAll, type OutboxJob } from '@/offline/outbox';
import { activeExtractor } from '@/platform/ocr';
import { patchDoc } from '@/firebase/db';
import { COL } from '@/data/types';
import { parseClock } from '@/lib/date';
import { enableReminders, reminderDiagnosis, showReminderNow } from '@/platform/reminder';
import { describeDiagnosis, describeReminder, type ReminderDiagnosis } from '@/platform/reminderPlan';
import { useReminderStatus } from '@/data/useReminder';
import { formatBytes } from '@/lib/image';
import { isNative } from '@/platform';

export default function SettingsPage() {
  const { user, profile } = useAuth();
  const [settings, setSettings] = useState<LocalSettings>(() => loadSettings());
  const [jobs, setJobs] = useState<OutboxJob[]>([]);
  const [engine, setEngine] = useState<string>('wird geprüft…');
  const [storage, setStorage] = useState<string>('');
  const [reminderTime, setReminderTime] = useState(profile?.reminderTime ?? '20:00');
  const [pushMessage, setPushMessage] = useState<string | null>(null);
  const reminder = useReminderStatus();
  const [diagnosis, setDiagnosis] = useState<ReminderDiagnosis | null>(null);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraTestOpen, setCameraTestOpen] = useState(false);
  const [cameraTestShot, setCameraTestShot] = useState<{ url: string; width: number; height: number; bytes: number } | null>(null);
  const [cameraLogLines, setCameraLogLines] = useState<string[]>([]);
  const [cameraLogCopied, setCameraLogCopied] = useState(false);
  const [nativeCamera, setNativeCamera] = useState(false);
  const [cameraCheckRunning, setCameraCheckRunning] = useState(false);
  const [cameraReport, setCameraReport] = useState('');
  const cameraOptions = useMemo(() => cameraOptionsFromSettings(settings), [settings]);

  useEffect(() => {
    // a camera session that never closed means the app died with the camera open
    noteUnfinishedCameraSession();
    setCameraLogLines(readCameraLog());
    void nativeCameraSupported().then(setNativeCamera);
    // survives a restart of the phone, unlike the protocol above - so it is worth showing
    // again on every visit, not just right after a run
    void readNativeCameraDiagnosis().then(setCameraReport).catch(() => undefined);
  }, []);

  useEffect(() => {
    void listJobs().then(setJobs);
    void navigator.storage?.estimate?.().then((estimate) => {
      if (estimate.usage) setStorage(formatBytes(estimate.usage));
    });
  }, []);

  useEffect(() => {
    let current = true;
    void activeExtractor()
      .then((extractor) => {
        if (current) setEngine(extractor?.label ?? 'nicht eingerichtet');
      })
      .catch(() => {
        if (current) setEngine('nicht verfügbar');
      });
    return () => {
      current = false;
    };
  }, [settings]);

  useEffect(() => {
    if (profile?.reminderTime) setReminderTime(profile.reminderTime);
  }, [profile?.reminderTime]);

  useEffect(() => {
    void reminderDiagnosis().then(setDiagnosis);
  }, []);

  function update(patch: Partial<LocalSettings>) {
    setSettings(saveSettings(patch));
  }

  async function updateProfile(patch: Record<string, unknown>) {
    if (!user) return;
    await patchDoc(COL.users, user.uid, patch);
  }

  function updateReminderTime(value: string) {
    setReminderTime(value);
    if (parseClock(value) !== null) void updateProfile({ reminderTime: value });
  }

  async function loadCameraDevices() {
    setCameraLoading(true);
    setCameraError(null);
    try {
      const devices = await listCameraDevices();
      // kept in the settings, so coming back to this screen does not mean searching again
      if (devices.length) update({ cameraDevices: devices });
      else setCameraError('Keine Kamera gefunden, oder der Zugriff wurde verweigert.');
    } catch (cause) {
      setCameraError(cause instanceof Error ? cause.message : 'Kameras konnten nicht gelesen werden.');
    } finally {
      setCameraLoading(false);
      setCameraLogLines(readCameraLog());
    }
  }

  function closeCameraTest() {
    setCameraTestOpen(false);
    // the closing effect writes its last line after this render; read it on the next tick
    window.setTimeout(() => setCameraLogLines(readCameraLog()), 50);
  }

  function handleCameraTestShot(blob: Blob) {
    closeCameraTest();
    if (cameraTestShot) URL.revokeObjectURL(cameraTestShot.url);
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => setCameraTestShot({ url, width: image.naturalWidth, height: image.naturalHeight, bytes: blob.size });
    image.onerror = () => setCameraTestShot({ url, width: 0, height: 0, bytes: blob.size });
    image.src = url;
  }

  async function runFullCameraCheck() {
    setCameraCheckRunning(true);
    setCameraError(null);
    try {
      setCameraReport(await runNativeCameraDiagnosis());
    } catch (cause) {
      setCameraError(cause instanceof Error ? cause.message : 'Die Vollprüfung ist gescheitert.');
      // the run may have died without returning; the file knows more than the exception does
      setCameraReport(await readNativeCameraDiagnosis().catch(() => ''));
    } finally {
      setCameraLogLines(readCameraLog());
      setCameraCheckRunning(false);
    }
  }

  async function copyCameraReport() {
    try {
      await navigator.clipboard.writeText(cameraReport);
      setCameraLogCopied(true);
      window.setTimeout(() => setCameraLogCopied(false), 2000);
    } catch {
      setCameraError('Kopieren nicht möglich – bitte den Text markieren.');
    }
  }

  async function copyCameraLog() {
    try {
      await navigator.clipboard.writeText(cameraLogLines.join('\n'));
      setCameraLogCopied(true);
      window.setTimeout(() => setCameraLogCopied(false), 2000);
    } catch {
      setCameraError('Kopieren nicht möglich – bitte den Text markieren.');
    }
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
              onChange={(event) => updateReminderTime(event.target.value)}
            />
          </Field>

          <p className="text-sm text-muted">
            {!reminder.enabled
              ? 'Aus – es kommt keine Erinnerung.'
              : reminder.next
                ? `${reminder.writtenToday ? 'Für heute steht schon ein Eintrag. Nächste Erinnerung: ' : 'Nächste Erinnerung: '}${describeReminder(reminder.next)}.`
                : 'Für die nächsten zwei Wochen ist nichts offen.'}
          </p>
          <p className="text-xs text-muted mt-1">
            {reminder.mode === 'native'
              ? 'Die Erinnerung stellt das Telefon selbst – sie kommt auch ohne Netz und ohne offene App.'
              : 'Im Browser erinnert die App nur, solange sie offen ist. Zuverlässig ist die Erinnerung in der App-Version.'}
          </p>
          {reminder.enabled && diagnosis !== null && diagnosis.permission !== 'granted' && (
            // without this the line above promises a reminder the device will never show
            <p className="text-sm text-warn mt-2">
              Dieses Gerät lässt noch keine Benachrichtigungen zu. Einmal auf „Benachrichtigungen erlauben“
              tippen.
            </p>
          )}

          <div className="flex flex-wrap gap-2 mt-3">
            <button
              type="button"
              className="btn"
              onClick={() =>
                void enableReminders().then((result) => {
                  setPushMessage(result.message);
                  void reminderDiagnosis().then(setDiagnosis);
                  if (result.ok && !profile?.reminderEnabled) void updateProfile({ reminderEnabled: true });
                })
              }
            >
              Benachrichtigungen erlauben
            </button>
            <button
              type="button"
              className="btn"
              onClick={() =>
                void showReminderNow().then((result) => {
                  setPushMessage(result.message);
                  void reminderDiagnosis().then(setDiagnosis);
                })
              }
            >
              Testbenachrichtigung
            </button>
          </div>
          {pushMessage && <p className="text-sm text-muted mt-2">{pushMessage}</p>}

          {/* Das Telefon liegt woanders. Kommt nichts an, ist das hier der einzige Weg
              herauszufinden, woran es liegt, statt zu raten. */}
          <details className="mt-3">
            <summary className="text-sm text-muted cursor-pointer">Diagnose</summary>
            <ul className="text-xs text-muted mt-2 flex flex-col gap-1">
              {diagnosis === null ? (
                <li>wird abgefragt…</li>
              ) : (
                describeDiagnosis(diagnosis).map((line) => <li key={line}>{line}</li>)
              )}
            </ul>
          </details>
        </section>

        <section className="card p-4">
          <SettingsHeading title="Fotos">
            Neben der verkleinerten Fassung wird die unveränderte Datei gespeichert. Das braucht deutlich mehr
            Speicher, erhält aber Details zum späteren Vergrößern. Der Schalter steht auch direkt über der
            Fotoleiste im Eintrag.
          </SettingsHeading>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="w-5 h-5 accent-[#c9a86a] mt-0.5"
              checked={settings.keepOriginals}
              onChange={(event) => update({ keepOriginals: event.target.checked })}
            />
            <span>Originale mitsichern</span>
          </label>
        </section>

        <section className="card p-4">
          <SettingsHeading title="Kamera">
            Hilfreich, wenn die Systemkamera beim Start abstürzt, weil sie eine defekte Linse prüft: hier
            lässt sich eine bestimmte Linse fest auswählen, statt die Systemkamera zu öffnen.
          </SettingsHeading>
          <label className="flex items-start gap-3 mb-3">
            <input
              type="checkbox"
              className="w-5 h-5 accent-[#c9a86a] mt-0.5"
              checked={settings.useCustomCamera}
              onChange={(event) => update({ useCustomCamera: event.target.checked })}
            />
            <span>Eigene Kamera-Ansicht statt der Systemkamera verwenden</span>
          </label>
          {settings.useCustomCamera && (
            <>
              {nativeCamera && (
                <p className="text-sm text-muted mb-3">
                  Diese App-Fassung spricht die Kamera direkt an und sucht sich die Linse selbst – von der
                  Hauptlinse abwärts, bis eine ein Bild liefert. Die Liste hier und die beiden Schalter
                  darunter gelten nur für die Browser-Fassung. Welche Linse gewählt wurde, steht in der
                  Diagnose.
                </p>
              )}
              <button
                type="button"
                className="btn mb-3"
                onClick={() => void loadCameraDevices()}
                disabled={cameraLoading}
              >
                {cameraLoading ? 'Suche…' : 'Kameras suchen'}
              </button>
              {cameraError && <p className="text-sm text-warn mb-2">{cameraError}</p>}
              {settings.cameraDevices.length > 0 && (
                <div className="flex flex-col gap-2 mb-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="camera-device"
                      checked={!settings.cameraDeviceId}
                      onChange={() => update({ cameraDeviceId: '' })}
                    />
                    <span>Automatisch (Rückseite)</span>
                  </label>
                  {settings.cameraDevices.map((device) => (
                    <label key={device.deviceId} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="camera-device"
                        checked={settings.cameraDeviceId === device.deviceId}
                        onChange={() => update({ cameraDeviceId: device.deviceId })}
                      />
                      <span className="truncate">{device.label}</span>
                    </label>
                  ))}
                </div>
              )}

              <SettingsHeading title="Experimente gegen den Absturz">
                Samsungs „camera2 0“ ist eine logische Kamera, die beim Fokussieren im Nahbereich oder bei
                Zoom unter 1× still auf das Ultraweitwinkel umschaltet. Ist das die defekte Linse, reißt der
                Wechsel die Kamera nach ein paar Sekunden mit. Diese Schalter versuchen, Zoom und Fokus
                festzuhalten, damit der Wechsel nie stattfindet. Was das Gerät davon annimmt, steht in der
                Diagnose.
              </SettingsHeading>
              <label className="flex items-start gap-3 mb-2">
                <input
                  type="checkbox"
                  className="w-5 h-5 accent-[#c9a86a] mt-0.5"
                  checked={settings.cameraLockZoom}
                  onChange={(event) => update({ cameraLockZoom: event.target.checked })}
                />
                <span>Zoom auf 1× festhalten</span>
              </label>
              <label className="flex items-start gap-3 mb-3">
                <input
                  type="checkbox"
                  className="w-5 h-5 accent-[#c9a86a] mt-0.5"
                  checked={settings.cameraFixedFocus}
                  onChange={(event) => update({ cameraFixedFocus: event.target.checked })}
                />
                <span>Fokus festhalten (kein Autofokus)</span>
              </label>
              <Field label="Auflösung" hint="„Automatisch“ lässt das Gerät wählen – meist nur 640×480. Eine andere Wahl kann einen anderen Kamerapfad im Gerät treffen.">
                <select
                  className="input"
                  value={settings.cameraResolution}
                  onChange={(event) => update({ cameraResolution: event.target.value as LocalSettings['cameraResolution'] })}
                >
                  <option value="auto">Automatisch</option>
                  <option value="hd">Full HD (1920×1080)</option>
                  <option value="max">Höchste (bis 4096×3072)</option>
                </select>
              </Field>

              <div className="flex flex-wrap items-center gap-3 mb-3">
                <button type="button" className="btn" onClick={() => setCameraTestOpen(true)}>
                  Kamera testen
                </button>
                {cameraTestShot && (
                  <span className="flex items-center gap-2 text-sm text-muted">
                    <img src={cameraTestShot.url} alt="Testbild" className="h-12 w-12 object-cover rounded border border-line" />
                    Testbild {cameraTestShot.width}×{cameraTestShot.height}, {formatBytes(cameraTestShot.bytes)}
                  </span>
                )}
              </div>

              <details className="mt-1" open>
                <summary className="text-sm text-muted cursor-pointer">Diagnose</summary>
                <div className="mt-2 flex flex-wrap gap-2 mb-2">
                  <button type="button" className="btn text-sm" onClick={() => setCameraLogLines(readCameraLog())}>
                    Aktualisieren
                  </button>
                  <button type="button" className="btn text-sm" onClick={() => void copyCameraLog()} disabled={!cameraLogLines.length}>
                    {cameraLogCopied ? 'Kopiert' : 'Kopieren'}
                  </button>
                  <button
                    type="button"
                    className="btn text-sm"
                    onClick={() => {
                      clearCameraLog();
                      setCameraLogLines([]);
                    }}
                    disabled={!cameraLogLines.length}
                  >
                    Protokoll löschen
                  </button>
                </div>
                {nativeCamera && (
                  <div className="mb-4 border-t border-line pt-3">
                    <p className="text-sm mb-2">
                      <strong>Vollprüfung.</strong> Probiert jede Kamera des Geräts in jeder Betriebsart
                      durch und schreibt jeden Schritt sofort auf die Platte – vor dem Zugriff, nicht danach.
                      Startet das Gerät dabei neu, steht hinterher genau drin, bei welcher Einstellung es
                      passiert ist, und der nächste Lauf überspringt sie.
                    </p>
                    <p className="text-sm text-warn mb-2">
                      Achtung: Beim ersten Versuch hat das dieses Gerät neu gestartet. Nichts Ungesichertes
                      offen lassen.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn text-sm"
                        onClick={() => void runFullCameraCheck()}
                        disabled={cameraCheckRunning}
                      >
                        {cameraCheckRunning ? 'Läuft… (gut eine Minute)' : 'Vollprüfung starten'}
                      </button>
                      <button
                        type="button"
                        className="btn text-sm"
                        onClick={() => void copyCameraReport()}
                        disabled={!cameraReport}
                      >
                        {cameraLogCopied ? 'Kopiert' : 'Bericht kopieren'}
                      </button>
                      <button
                        type="button"
                        className="btn text-sm"
                        onClick={() => void clearNativeCameraDiagnosis().then(() => setCameraReport(''))}
                        disabled={!cameraReport}
                      >
                        Bericht löschen
                      </button>
                    </div>
                    {cameraReport && (
                      <pre className="mt-2 text-[11px] leading-snug font-mono whitespace-pre-wrap break-all max-h-80 overflow-y-auto bg-black/20 rounded p-2">
                        {cameraReport}
                      </pre>
                    )}
                  </div>
                )}
                {cameraLogLines.length === 0 ? (
                  <p className="text-sm text-muted">Noch kein Protokoll. Es entsteht, sobald die Kamera geöffnet wird.</p>
                ) : (
                  <pre className="text-[11px] leading-snug font-mono whitespace-pre-wrap break-all max-h-80 overflow-y-auto bg-black/20 rounded p-2">
                    {cameraLogLines.join('\n')}
                  </pre>
                )}
              </details>
            </>
          )}
        </section>

        {cameraTestOpen && (
          <CameraCapture options={cameraOptions} onCapture={handleCameraTestShot} onClose={closeCameraTest} />
        )}

        <section className="card p-4">
          <h2 className="font-semibold mb-3">Beleg-Auslesen</h2>
          <p className="text-sm text-muted mb-3">Aktiv: {engine}</p>
          <Field
            label="Verfahren"
            hint={
              isNative()
                ? 'Automatisch prüft ML Kit, dann Gemini, dann Claude und nutzt das erste verfügbare Verfahren. Schlüssel bleiben nur auf diesem Gerät.'
                : 'Automatisch prüft Gemini, dann Claude und nutzt das erste eingerichtete Verfahren. Schlüssel bleiben nur in diesem Browser.'
            }
          >
            <select
              className="field"
              value={settings.ocrEngine}
              onChange={(event) => update({ ocrEngine: event.target.value as LocalSettings['ocrEngine'] })}
            >
              <option value="auto">Automatisch</option>
              {isNative() && <option value="mlkit">Nur ML Kit</option>}
              <option value="gemini">Nur Gemini (online)</option>
              <option value="claude">Nur Claude (online)</option>
              <option value="off">Aus</option>
            </select>
          </Field>

          {(settings.ocrEngine === 'auto' || settings.ocrEngine === 'gemini') && (
            <details
              key={`gemini-${settings.ocrEngine}`}
              open={settings.ocrEngine === 'gemini'}
              className="mt-3"
            >
              <summary className="font-medium cursor-pointer py-2">
                Gemini
                {settings.ocrEngine === 'auto'
                  ? settings.geminiApiKey
                    ? ' · eingerichtet'
                    : ' · nicht eingerichtet'
                  : ''}
              </summary>
              <Field
                label="Gemini API-Key"
                hint="Wird nur auf diesem Gerät gespeichert, nie in der Datenbank. Zu holen unter aistudio.google.com."
              >
                <input
                  className="field"
                  type="password"
                  placeholder="AIza…"
                  value={settings.geminiApiKey}
                  onChange={(event) => update({ geminiApiKey: event.target.value.trim() })}
                />
              </Field>
              <Field
                label="Modell"
                hint="Freies Textfeld, weil sich die Modellnamen bei Google schneller ändern als diese App. gemini-2.5-flash ist schnell und günstig, gemini-2.5-pro liest schwierige Belege besser."
              >
                <input
                  className="field"
                  type="text"
                  placeholder="gemini-2.5-flash"
                  value={settings.geminiModel}
                  onChange={(event) => update({ geminiModel: event.target.value.trim() })}
                />
              </Field>
            </details>
          )}

          {(settings.ocrEngine === 'auto' || settings.ocrEngine === 'claude') && (
            <details
              key={`claude-${settings.ocrEngine}`}
              open={settings.ocrEngine === 'claude'}
              className="mt-3"
            >
              <summary className="font-medium cursor-pointer py-2">
                Claude
                {settings.ocrEngine === 'auto'
                  ? settings.claudeApiKey
                    ? ' · eingerichtet'
                    : ' · nicht eingerichtet'
                  : ''}
              </summary>
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
            </details>
          )}
        </section>

        {isNative() ? <FolderExportSection /> : <ExportSection />}

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
          <p className="text-sm text-muted">Version {APP_VERSION}</p>
          <p className="text-xs text-muted mt-1">
            gebaut am {BUILD_DATE} · Stand {APP_SHA}
          </p>
        </section>
      </div>
    </>
  );
}
