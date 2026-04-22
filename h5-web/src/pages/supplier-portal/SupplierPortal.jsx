import { useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import useSupplierStore from '@/stores/supplierStore';
import SupplierLogin from './SupplierLogin';
import SupplierDashboard from './SupplierDashboard';
import SupplierPurchases from './SupplierPurchases';
import SupplierPurchaseDetail from './SupplierPurchaseDetail';
import SupplierInventory from './SupplierInventory';
import SupplierPayables from './SupplierPayables';
import SupplierReconciliations from './SupplierReconciliations';
import SupplierProfile from './SupplierProfile';
import SupplierTabBar from './SupplierTabBar';

const AuthGuard = ({ children }) => {
  const isAuthenticated = useSupplierStore((s) => s.isAuthenticated);
  const navigate = useNavigate();
  useEffect(() => {
    if (!isAuthenticated) navigate('/supplier-portal/login', { replace: true });
  }, [isAuthenticated, navigate]);
  if (!isAuthenticated) return null;
  return children;
};

const SupplierPortal = () => {
  const location = useLocation();
  return (
    <div style={{ minHeight: '100vh', background: '#f5f6fa', paddingBottom: '70px' }}>
      <Routes>
        <Route path="login" element={<SupplierLogin />} />
        <Route path="dashboard" element={<AuthGuard><SupplierDashboard /></AuthGuard>} />
        <Route path="purchases" element={<AuthGuard><SupplierPurchases /></AuthGuard>} />
        <Route path="purchases/:purchaseId" element={<AuthGuard><SupplierPurchaseDetail /></AuthGuard>} />
        <Route path="inventory" element={<AuthGuard><SupplierInventory /></AuthGuard>} />
        <Route path="payables" element={<AuthGuard><SupplierPayables /></AuthGuard>} />
        <Route path="reconciliations" element={<AuthGuard><SupplierReconciliations /></AuthGuard>} />
        <Route path="profile" element={<AuthGuard><SupplierProfile /></AuthGuard>} />
        <Route path="" element={<Navigate to="dashboard" replace />} />
        <Route path="*" element={<Navigate to="dashboard" replace />} />
      </Routes>
      {!location.pathname.includes('/login') && <SupplierTabBar />}
    </div>
  );
};

export default SupplierPortal;
