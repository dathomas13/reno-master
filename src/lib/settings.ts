/**
 * Device local settings. These never leave the phone: the Claude API key in particular
 * is stored here and nowhere else, so it is not in the repo and not in Firestore.
 */
export interface LocalSettings {
  claudeApiKey: string;
  claudeModel: string;
  ocrEngine: 'auto' | 'mlkit' | 'claude' | 'off';
  defaultModelVariant: 'ist' | 'soll';
  showRoomsInPlanViews: boolean;
}

const KEY = 'reno.settings';

export const DEFAULT_SETTINGS: LocalSettings = {
  claudeApiKey: '',
  claudeModel: 'claude-opus-5',
  ocrEngine: 'auto',
  defaultModelVariant: 'ist',
  showRoomsInPlanViews: true,
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

export function saveSettings(settings: Partial<LocalSettings>): LocalSettings {
  const next = { ...loadSettings(), ...settings };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // private mode or storage full - settings simply do not persist
  }
  return next;
}
