import { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/auth/AuthContext';
import { RoomsProvider } from '@/data/RoomsContext';
import { AppShell } from '@/components/AppShell';
import { Spinner } from '@/components/Fields';
import { UpdateBanner } from '@/components/UpdateBanner';
import { startOutboxWorker } from '@/offline/outbox';
import { startModelSync } from '@/data/modelSync';
import { startDiagUpload } from '@/platform/diagUpload';
import { useDiaryReminder } from '@/data/useReminder';
import { useTaskReminders } from '@/data/useTaskReminders';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ToastProvider } from '@/components/Toast';
import { ConfirmProvider } from '@/components/Confirm';
import LoginPage from '@/modules/auth/LoginPage';
import HomePage from '@/modules/home/HomePage';
import DiaryListPage from '@/modules/diary/DiaryListPage';
import DiaryDetailPage from '@/modules/diary/DiaryDetailPage';
import DiaryEditorPage from '@/modules/diary/DiaryEditorPage';
import ViewerPage from '@/modules/viewer3d/ViewerPage';
import PlansPage from '@/modules/plans/PlansPage';
import PlanViewPage from '@/modules/plans/PlanViewPage';
import CostsPage from '@/modules/costs/CostsPage';
import CostEditorPage from '@/modules/costs/CostEditorPage';
import TasksPage from '@/modules/tasks/TasksPage';
import NotesPage from '@/modules/notes/NotesPage';
import ContactsPage from '@/modules/contacts/ContactsPage';
import ContactLogsPage from '@/modules/contacts/ContactLogsPage';
import SearchPage from '@/modules/search/SearchPage';
import FilesPage from '@/modules/files/FilesPage';
import PhotosPage from '@/modules/photos/PhotosPage';
import ReceiptsPage from '@/modules/receipts/ReceiptsPage';
import SettingsPage from '@/modules/settings/SettingsPage';
import PresetsPage from '@/modules/settings/presets/PresetsPage';
import HomeSettingsPage from '@/modules/settings/HomeSettingsPage';
import PresetDetailPage from '@/modules/settings/presets/PresetDetailPage';

/** the first moment before the session is known; says why if it ever takes long */
function StartupWait() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 4000);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <div>
      <Spinner label="Wird geladen…" />
      {slow && (
        <p className="text-center text-sm text-muted px-8 -mt-4">
          Das dauert länger als sonst. Ohne Netz kann die App kurz brauchen.
        </p>
      )}
    </div>
  );
}

function Protected() {
  const { user, ready } = useAuth();

  useEffect(() => (user ? startOutboxWorker() : undefined), [user]);
  // The model lives in the database, so the sync needs an account: it listens to the
  // published documents and keeps the newest model on the device for offline use.
  useEffect(() => (user ? startModelSync() : undefined), [user]);
  // the log leaves the phone now and then, so a development session can read it
  useEffect(() => (user ? startDiagUpload() : undefined), [user]);
  // the evening reminder: planned on the device, so it also fires with no connection
  useDiaryReminder();
  useTaskReminders(!!user);

  if (!ready) return <StartupWait />;

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  return (
    <RoomsProvider>
      <AppShell>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/tagebuch" element={<DiaryListPage />} />
          <Route path="/tagebuch/neu" element={<DiaryEditorPage />} />
          <Route path="/tagebuch/:id" element={<DiaryDetailPage />} />
          <Route path="/tagebuch/:id/bearbeiten" element={<DiaryEditorPage />} />
          <Route path="/3d" element={<ViewerPage />} />
          <Route path="/plaene" element={<PlansPage />} />
          <Route path="/plaene/:id" element={<PlanViewPage />} />
          <Route path="/kosten" element={<CostsPage />} />
          <Route path="/kosten/neu" element={<CostEditorPage />} />
          <Route path="/kosten/:id" element={<CostEditorPage />} />
          <Route path="/aufgaben" element={<TasksPage />} />
          <Route path="/notizen" element={<NotesPage />} />
          <Route path="/kontakte" element={<ContactsPage />} />
          <Route path="/gespraeche" element={<ContactLogsPage />} />
          <Route path="/suche" element={<SearchPage />} />
          <Route path="/dateien" element={<FilesPage />} />
          <Route path="/fotos" element={<PhotosPage />} />
          <Route path="/belege" element={<ReceiptsPage />} />
          <Route path="/einstellungen" element={<SettingsPage />} />
          <Route path="/einstellungen/startseite" element={<HomeSettingsPage />} />
          <Route path="/einstellungen/voreinstellungen" element={<PresetsPage />} />
          <Route path="/einstellungen/voreinstellungen/:key" element={<PresetDetailPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </RoomsProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <HashRouter>
          <ToastProvider>
            <ConfirmProvider>
              <UpdateBanner />
              <Protected />
            </ConfirmProvider>
          </ToastProvider>
        </HashRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}
