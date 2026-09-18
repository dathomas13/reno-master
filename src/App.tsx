import { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/auth/AuthContext';
import { RoomsProvider } from '@/data/RoomsContext';
import { AppShell } from '@/components/AppShell';
import { Spinner } from '@/components/Fields';
import { UpdateBanner } from '@/components/UpdateBanner';
import { startOutboxWorker } from '@/offline/outbox';
import { startModelSync } from '@/data/modelSync';
import { useDiaryReminder } from '@/data/useReminder';
import { useTaskReminders } from '@/data/useTaskReminders';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { PreviewBanner } from '@/components/PreviewBanner';
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
import SearchPage from '@/modules/search/SearchPage';
import FilesPage from '@/modules/files/FilesPage';
import PhotosPage from '@/modules/photos/PhotosPage';
import ReceiptsPage from '@/modules/receipts/ReceiptsPage';
import SettingsPage from '@/modules/settings/SettingsPage';

function Protected() {
  const { user, ready } = useAuth();

  useEffect(() => (user ? startOutboxWorker() : undefined), [user]);
  // Runs without an account too: the site channel needs no database, and the 3D preview
  // should show the published model, not the one this build happens to carry. Only the
  // listener for a released model waits for the login.
  useEffect(() => startModelSync({ watchPublished: !!user }), [user]);
  // the evening reminder: planned on the device, so it also fires with no connection
  useDiaryReminder();
  useTaskReminders(!!user);

  if (!ready) return <Spinner label="Wird geladen…" />;

  // Without an account the model and the generated plans are still worth showing: they
  // ship with the app and need no database. Everything that touches real data does not.
  if (!user) {
    return (
      <RoomsProvider>
        <Routes>
          <Route
            path="/3d"
            element={
              <>
                <PreviewBanner />
                <ViewerPage />
              </>
            }
          />
          <Route
            path="/plaene"
            element={
              <>
                <PreviewBanner />
                <PlansPage />
              </>
            }
          />
          <Route
            path="/plaene/:id"
            element={
              <>
                <PreviewBanner />
                <PlanViewPage />
              </>
            }
          />
          <Route path="*" element={<LoginPage />} />
        </Routes>
      </RoomsProvider>
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
          <Route path="/suche" element={<SearchPage />} />
          <Route path="/dateien" element={<FilesPage />} />
          <Route path="/fotos" element={<PhotosPage />} />
          <Route path="/belege" element={<ReceiptsPage />} />
          <Route path="/einstellungen" element={<SettingsPage />} />
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
          <UpdateBanner />
          <Protected />
        </HashRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}
