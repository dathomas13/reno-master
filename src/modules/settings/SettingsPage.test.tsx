import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsPage from './SettingsPage';

const mocks = vi.hoisted(() => ({ native: false, activeExtractor: vi.fn().mockResolvedValue(null) }));
const patchDoc = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@/components/TopBar', () => ({ TopBar: () => null }));
vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({
    user: { uid: 'user-1', email: 'thomas@example.test' },
    profile: {
      email: 'thomas@example.test',
      displayName: 'Thomas',
      reminderEnabled: true,
      reminderTime: '20:00',
      fcmTokens: [],
      tz: 'Europe/Berlin',
    },
  }),
}));
vi.mock('@/firebase/auth', () => ({ signOut: vi.fn() }));
vi.mock('@/firebase/db', () => ({ patchDoc }));
vi.mock('@/offline/outbox', () => ({ listJobs: vi.fn().mockResolvedValue([]), retryAll: vi.fn() }));
vi.mock('@/platform', () => ({ isNative: () => mocks.native }));
vi.mock('@/platform/ocr', () => ({ activeExtractor: mocks.activeExtractor }));
vi.mock('@/platform/reminder', () => ({
  enableReminders: vi.fn(),
  showReminderNow: vi.fn(),
  reminderDiagnosis: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/data/useReminder', () => ({ useReminderStatus: () => ({ enabled: false, mode: 'web' }) }));
vi.mock('./ExportSection', () => ({ ExportSection: () => <h2>Archiv exportieren</h2> }));
vi.mock('./FolderExportSection', () => ({ FolderExportSection: () => <h2>Export in einen Ordner</h2> }));
vi.mock('./ModelSection', () => ({ ModelSection: () => null }));
vi.mock('./AppUpdateSection', () => ({ AppUpdateSection: () => null }));

beforeEach(() => {
  localStorage.clear();
  mocks.native = false;
  mocks.activeExtractor.mockReset().mockResolvedValue(null);
  patchDoc.mockClear();
});
afterEach(cleanup);

async function openSettings() {
  render(<SettingsPage />);
  await act(async () => {});
}

describe('settings disclosure', () => {
  it('shows only the matching export and OCR options per platform', async () => {
    await openSettings();
    expect(screen.getByRole('heading', { name: 'Archiv exportieren' })).toBeInTheDocument();
    expect(screen.queryByText('Export in einen Ordner')).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Nur ML Kit' })).not.toBeInTheDocument();
    cleanup();
    mocks.native = true;
    await openSettings();
    expect(screen.getByRole('heading', { name: 'Export in einen Ordner' })).toBeInTheDocument();
    expect(screen.queryByText('Archiv exportieren')).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Nur ML Kit' })).toBeInTheDocument();
  });

  it('reveals help on demand without changing the photo setting', async () => {
    await openSettings();
    const help = screen.getByRole('button', { name: 'Hilfe: Fotos' });
    const text = screen.getByText(/Neben der verkleinerten Fassung/);
    expect(text).not.toBeVisible();
    fireEvent.click(help);
    expect(help).toHaveAttribute('aria-expanded', 'true');
    expect(text).toBeVisible();
    expect(screen.getByRole('checkbox', { name: 'Originale mitsichern' })).not.toBeChecked();
    fireEvent.click(help);
    expect(text).not.toBeVisible();
  });

  it('shows provider settings only when needed and preserves saved values', async () => {
    await openSettings();
    expect(screen.getByLabelText('Gemini API-Key')).not.toBeVisible();
    expect(screen.getByLabelText('Claude API-Key')).not.toBeVisible();
    const engine = screen.getByRole('combobox', { name: 'Verfahren' });
    fireEvent.change(engine, { target: { value: 'gemini' } });
    expect(screen.getByLabelText('Gemini API-Key')).toBeVisible();
    expect(screen.queryByLabelText('Claude API-Key')).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('gemini-2.5-flash'), { target: { value: 'test-model' } });
    mocks.activeExtractor.mockResolvedValue({ label: 'Claude' });
    fireEvent.change(engine, { target: { value: 'claude' } });
    expect(screen.getByLabelText('Claude API-Key')).toBeVisible();
    expect(screen.queryByLabelText('Gemini API-Key')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Aktiv: Claude')).toBeInTheDocument());
    fireEvent.change(engine, { target: { value: 'off' } });
    expect(screen.queryByLabelText('Claude API-Key')).not.toBeInTheDocument();
    fireEvent.change(engine, { target: { value: 'gemini' } });
    expect(screen.getByDisplayValue('test-model')).toBeInTheDocument();
    await act(async () => {});
  });

  it('saves the reminder time immediately when it changes', async () => {
    await openSettings();

    fireEvent.change(screen.getByLabelText('Uhrzeit'), { target: { value: '18:30' } });

    expect(patchDoc).toHaveBeenCalledWith('users', 'user-1', { reminderTime: '18:30' });
  });
});

