import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router';
import { PublicOnlyRoute } from './routes/PublicOnlyRoute';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { AuthProvider } from './context/AuthProvider';
import { ActivityProvider } from './context/ActivityProvider';
import { WorkspaceSessionProvider } from './context/WorkspaceSessionContext';
import { WorkspaceAwareHome } from './routes/WorkspaceAwareHome';
// import FullscreenGate from './components/FullscreenGate';
import LoginPage from './pages/LoginPage/LoginPage';
import ProfilePage from './pages/ProfilePage';
import DashboardPage from './pages/DashboardPage';
import DayOverviewPage from './pages/DayOverviewPage';
import TaskPageSkeleton from './components/TaskPageSkeleton';
import NotFoundPage from './pages/NotFoundPage';
import TypingTestPage from './pages/TypingTestPage/TypingTestPage';
import JournalPage from './pages/JournalPage';
import ResourcesPage from './pages/ResourcesPage/ResourcesPage';
import LeaveRequestsPage from './pages/LeaveRequestsPage';
import HelpPage from './pages/HelpPage';
import ReferencePage from './pages/ReferencePage';
import { useParams } from 'react-router';
import { RoleRoute } from './routes/RoleRoute';
import LoaderOverlay from './components/Common/LoadingState';
import CertificatePage from './pages/CertificatePage';
import CertificateVerificationPage from './pages/CertificateVerificationPage/CertificateVerificationPage';

const TaskPage = lazy(() => import('./pages/TaskPage'));
const AdminTraineesPage = lazy(() => import('./pages/AdminTraineesPage'));
const AdminTraineePage = lazy(() => import('./pages/AdminTraineePage'));
const StaffLeaveRequestsPage = lazy(() => import('./pages/StaffLeaveRequestsPage'));
const ManagerPage = lazy(() => import('./pages/ManagerPage'));

function ReferenceRoute() {
  const { dayId } = useParams();

  if (!dayId) {
    return null;
  }

  return <ReferencePage dayId={dayId} />;
}
export default function App() {
  console.log(import.meta.env.PORT);
  return (
    <AuthProvider>
      {/* <FullscreenGate> */}
      <ActivityProvider>
        <WorkspaceSessionProvider>
          <Routes>
            <Route element={<ProtectedRoute />}>
              <Route element={<RoleRoute role="trainee" />}>
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/help" element={<HelpPage />}></Route>
                <Route
                  path="/"
                  element={
                    <WorkspaceAwareHome>
                      <DashboardPage />
                    </WorkspaceAwareHome>
                  }
                />
                <Route path="/typing-test" element={<TypingTestPage />} />
                <Route path="/journal" element={<JournalPage />} />
                <Route path="/resources" element={<ResourcesPage />} />
                <Route path="/leave-requests" element={<LeaveRequestsPage />} />
                <Route path="/certificates/:courseId" element={<CertificatePage />} />
                <Route
                  path="/tasks/:taskId"
                  element={
                    <Suspense fallback={<TaskPageSkeleton />}>
                      <TaskPage />
                    </Suspense>
                  }
                />
                <Route path="/days/:dayId" element={<DayOverviewPage />} />
                <Route path="/days/:dayId/references" element={<ReferenceRoute />} />
              </Route>

              <Route element={<RoleRoute role="mentor" />}>
                <Route
                  path="/admin"
                  element={
                    <Suspense fallback={<LoaderOverlay fullPage />}>
                      <AdminTraineesPage />
                    </Suspense>
                  }
                ></Route>

                <Route
                  path="/admin/trainees/:traineeId"
                  element={
                    <Suspense fallback={<LoaderOverlay fullPage />}>
                      <AdminTraineePage />
                    </Suspense>
                  }
                ></Route>

                <Route
                  path="/admin/leave-requests"
                  element={
                    <Suspense fallback={<LoaderOverlay fullPage />}>
                      <StaffLeaveRequestsPage area="admin" />
                    </Suspense>
                  }
                />
                <Route path="/admin/verify-certificate" element={<CertificateVerificationPage />} />
              </Route>

              <Route element={<RoleRoute role="manager" />}>
                <Route
                  path="/manager"
                  element={
                    <Suspense fallback={<LoaderOverlay fullPage />}>
                      <ManagerPage />
                    </Suspense>
                  }
                />
                <Route
                  path="/manager/leave-requests"
                  element={
                    <Suspense fallback={<LoaderOverlay fullPage />}>
                      <StaffLeaveRequestsPage area="manager" />
                    </Suspense>
                  }
                />
                <Route
                  path="/manager/verify-certificate"
                  element={<CertificateVerificationPage />}
                />
              </Route>
            </Route>
            <Route element={<PublicOnlyRoute />}>
              <Route path="/login" element={<LoginPage />} />
            </Route>
            <Route path="/verify-certificate" element={<CertificateVerificationPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </WorkspaceSessionProvider>
      </ActivityProvider>
      {/* </FullscreenGate> */}
    </AuthProvider>
  );
}
