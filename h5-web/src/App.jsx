import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import AppShell from '@/components/AppShell';

const LoginPage = lazy(() => import('@/pages/LoginPage'));
const HomePage = lazy(() => import('@/pages/HomePage'));
const WorkPage = lazy(() => import('@/pages/WorkPage'));
const ScanPage = lazy(() => import('@/pages/ScanPage'));
const AdminPage = lazy(() => import('@/pages/AdminPage'));
const RegisterPage = lazy(() => import('@/pages/RegisterPage'));
const InboxPage = lazy(() => import('@/pages/InboxPage'));
const AiAssistantPage = lazy(() => import('@/pages/AiAssistantPage'));
const BundleSplitPage = lazy(() => import('@/pages/BundleSplitPage'));
const ScanHistoryPage = lazy(() => import('@/pages/ScanHistoryPage'));
const ScanPatternPage = lazy(() => import('@/pages/ScanPatternPage'));
const ScanRescanPage = lazy(() => import('@/pages/ScanRescanPage'));
const ScanResultPage = lazy(() => import('@/pages/ScanResultPage'));
const ScanConfirmPage = lazy(() => import('@/pages/ScanConfirmPage'));
const ScanQualityPage = lazy(() => import('@/pages/ScanQualityPage'));
const PayrollPage = lazy(() => import('@/pages/PayrollPage'));
const UserApprovalPage = lazy(() => import('@/pages/UserApprovalPage'));
const ChangePasswordPage = lazy(() => import('@/pages/ChangePasswordPage'));
const FeedbackPage = lazy(() => import('@/pages/FeedbackPage'));
const InvitePage = lazy(() => import('@/pages/InvitePage'));
const WarehouseMaterialScanPage = lazy(() => import('@/pages/WarehouseMaterialScanPage'));
const WarehouseSampleScanActionPage = lazy(() => import('@/pages/WarehouseSampleScanActionPage'));
const PrivacyPage = lazy(() => import('@/pages/PrivacyPage'));
const PrivacyServicePage = lazy(() => import('@/pages/PrivacyServicePage'));
const CuttingTaskListPage = lazy(() => import('@/pages/CuttingTaskListPage'));
const CuttingTaskDetailPage = lazy(() => import('@/pages/CuttingTaskDetailPage'));
const ProcurementTaskDetailPage = lazy(() => import('@/pages/ProcurementTaskDetailPage'));
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));

const Loading = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', color: 'var(--color-text-secondary)' }}>
    加载中...
  </div>
);

function ProtectedRoute({ children }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

const TAB_PATHS = ['/home', '/work', '/scan', '/admin'];

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="*" element={
          <ProtectedRoute>
            <AppShell>
              <Suspense fallback={<Loading />}>
                <Routes>
                  <Route path="/home" element={<HomePage />} />
                  <Route path="/work" element={<WorkPage />} />
                  <Route path="/scan" element={<ScanPage />} />
                  <Route path="/admin" element={<AdminPage />} />
                  <Route path="/register" element={<RegisterPage />} />
                  <Route path="/work/inbox" element={<InboxPage />} />
                  <Route path="/work/ai-assistant" element={<AiAssistantPage />} />
                  <Route path="/work/bundle-split" element={<BundleSplitPage />} />
                  <Route path="/scan/history" element={<ScanHistoryPage />} />
                  <Route path="/scan/pattern" element={<ScanPatternPage />} />
                  <Route path="/scan/rescan" element={<ScanRescanPage />} />
                  <Route path="/scan/scan-result" element={<ScanResultPage />} />
                  <Route path="/scan/confirm" element={<ScanConfirmPage />} />
                  <Route path="/scan/quality" element={<ScanQualityPage />} />
                  <Route path="/payroll/payroll" element={<PayrollPage />} />
                  <Route path="/admin/user-approval" element={<UserApprovalPage />} />
                  <Route path="/admin/change-password" element={<ChangePasswordPage />} />
                  <Route path="/admin/feedback" element={<FeedbackPage />} />
                  <Route path="/admin/invite" element={<InvitePage />} />
                  <Route path="/warehouse/material/scan" element={<WarehouseMaterialScanPage />} />
                  <Route path="/warehouse/sample/scan-action" element={<WarehouseSampleScanActionPage />} />
                  <Route path="/privacy" element={<PrivacyPage />} />
                  <Route path="/privacy/service" element={<PrivacyServicePage />} />
                  <Route path="/cutting/task-list" element={<CuttingTaskListPage />} />
                  <Route path="/cutting/task-detail" element={<CuttingTaskDetailPage />} />
                  <Route path="/procurement/task-detail" element={<ProcurementTaskDetailPage />} />
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="*" element={<Navigate to="/home" replace />} />
                </Routes>
              </Suspense>
            </AppShell>
          </ProtectedRoute>
        } />
      </Routes>
    </Suspense>
  );
}
