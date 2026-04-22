import { useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import useCrmClientStore from '@/stores/crmClientStore';
import CrmDashboard from './CrmDashboard';
import CrmOrders from './CrmOrders';
import CrmOrderDetail from './CrmOrderDetail';
import CrmPurchases from './CrmPurchases';
import CrmPurchaseDetail from './CrmPurchaseDetail';
import CrmReceivables from './CrmReceivables';
import CrmReceivableDetail from './CrmReceivableDetail';
import CrmProfile from './CrmProfile';
import CrmClientTabBar from './CrmClientTabBar';

const AuthGuard = ({ children }) => {
  const isAuthenticated = useCrmClientStore((s) => s.isAuthenticated);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/crm-client/login', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  if (!isAuthenticated) return null;
  return children;
};

const CrmClientApp = () => {
  const location = useLocation();

  return (
    <div style={{ minHeight: '100vh', background: '#f5f6fa', paddingBottom: '70px' }}>
      <Routes>
        <Route path="login" element={<CrmLogin />} />
        <Route path="dashboard" element={<AuthGuard><CrmDashboard /></AuthGuard>} />
        <Route path="orders" element={<AuthGuard><CrmOrders /></AuthGuard>} />
        <Route path="orders/:orderId" element={<AuthGuard><CrmOrderDetail /></AuthGuard>} />
        <Route path="purchases" element={<AuthGuard><CrmPurchases /></AuthGuard>} />
        <Route path="purchases/:purchaseId" element={<AuthGuard><CrmPurchaseDetail /></AuthGuard>} />
        <Route path="receivables" element={<AuthGuard><CrmReceivables /></AuthGuard>} />
        <Route path="receivables/:receivableId" element={<AuthGuard><CrmReceivableDetail /></AuthGuard>} />
        <Route path="profile" element={<AuthGuard><CrmProfile /></AuthGuard>} />
        <Route path="" element={<Navigate to="dashboard" replace />} />
        <Route path="*" element={<Navigate to="dashboard" replace />} />
      </Routes>
      {!location.pathname.includes('/login') && <CrmClientTabBar />}
    </div>
  );
};

export default CrmClientApp;
