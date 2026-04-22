import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import useCrmClientStore from '@/stores/crmClientStore';
import CrmClientTabBar from './CrmClientTabBar';
import './CrmClientApp.css';

const CrmDashboard = lazy(() => import('./CrmDashboard'));
const CrmOrders = lazy(() => import('./CrmOrders'));
const CrmOrderDetail = lazy(() => import('./CrmOrderDetail'));
const CrmPurchases = lazy(() => import('./CrmPurchases'));
const CrmPurchaseDetail = lazy(() => import('./CrmPurchaseDetail'));
const CrmReceivables = lazy(() => import('./CrmReceivables'));
const CrmReceivableDetail = lazy(() => import('./CrmReceivableDetail'));
const CrmProfile = lazy(() => import('./CrmProfile'));

const Loading = () => (
  <div style={{ 
    display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', color: 'var(--color-text-secondary)' }}>
    加载中...
  </div>
);

export default function CrmClientApp() {
  const navigate = useNavigate();
  const isAuthenticated = useCrmClientStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/crm-client/login');
    }
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: '#f5f7fa'
      }}>
        正在跳转...
      </div>
    );
  }

  return (
    <div className="crm-client-app">
      <div className="crm-client-main">
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/dashboard" element={<CrmDashboard />} />
            <Route path="/orders" element={<CrmOrders />} />
            <Route path="/orders/:orderId" element={<CrmOrderDetail />} />
            <Route path="/purchases" element={<CrmPurchases />} />
            <Route path="/purchases/:purchaseId" element={<CrmPurchaseDetail />} />
            <Route path="/receivables" element={<CrmReceivables />} />
            <Route path="/receivables/:receivableId" element={<CrmReceivableDetail />} />
            <Route path="/profile" element={<CrmProfile />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
      </div>
      <CrmClientTabBar />
    </div>
  );
}
