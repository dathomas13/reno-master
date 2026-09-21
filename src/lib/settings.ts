/**
 * Device local settings. These never leave the phone: the API keys in particular are
 * stored here and nowhere else, so they are not in the repo and not in Firestore.
 */
export interface LocalSettings {
  claudeApiKey: string;
  claudeModel: string;
  geminiApiKey: string;
  /** free text, not a list: which Gemini models exist changes faster than this app */
  geminiModel: string;
  ocrEngine: 'auto' | 'mlkit' | 'claude' | 'gemini' | 'off';
  defaultModelVariant: 'ist' | 'soll';
  /** ob Tagebuch, Kosten, Aufgaben, Notizen, Fotos und Suche die Bestands- oder die
   * Planungsnamen der Räume zeigen; wirkt nicht auf 3D und Pläne, die zeigen immer die
   * Namen ihrer eigenen Modellvariante */
  roomNaming: 'bestand' | 'planung';
  /**
   * Upload the untouched photo next to the 1600 px copy. Off by default because it
   * costs roughly ten times the storage; on for the pictures that have to stay
   * readable years later - cable runs, pipes, anything that disappears behind a wall.
   */
  keepOriginals: boolean;
  /** open this app's own camera view instead of the system camera app */
  useCustomCamera: boolean;
  /** a specific lens, remembered so the device is not asked to enumerate every time; '' = automatic */
  cameraDeviceId: string;
  /** the lenses found last time, kept so the settings screen does not have to search again */
  cameraDevices: { deviceId: string; label: string }[];
  /** experiments against a logical camera that switches to a broken physical lens */
  cameraLockZoom: boolean;
  cameraFixedFocus: boolean;
  cameraResolution: 'auto' | 'hd' | 'max';
}

const KEY = 'reno.settings';

export const DEFAULT_SETTINGS: LocalSettings = {
  claudeApiKey: '',
  claudeModel: 'claude-opus-5',
  geminiApiKey: '',
  geminiModel: 'gemini-2.5-flash',
  ocrEngine: 'auto',
  defaultModelVariant: 'ist',
  roomNaming: 'bestand',
  keepOriginals: false,
  useCustomCamera: false,
  cameraDeviceId: '',
  cameraDevices: [],
  cameraLockZoom: false,
  cameraFixedFocus: false,
  cameraResolution: 'auto',
};

export const CLAUDE_MODELS = [
  { id: 'claude-opus-5', label: 'Opus 5 – beste Erkennung' },
  { id: 'claude-sonnet-5', label: 'Sonnet 5 – günstiger' },
] as const;

export function loadSettings(): LocalSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<LocalSettings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** fired after every saveSettings() call, so a persistently mounted context (RoomsContext
 * reading roomNaming) picks up a change made on a different screen without a reload */
export const SETTINGS_EVENT = 'reno:settings';

export function saveSettings(settings: Partial<LocalSettings>): LocalSettings {
  const next = { ...loadSettings(), ...settings };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // private mode or storage full - settings simply do not persist
  }
  window.dispatchEvent(new CustomEvent<LocalSettings>(SETTINGS_EVENT, { detail: next }));
  return next;
}
