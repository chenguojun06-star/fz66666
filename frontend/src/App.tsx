import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Spin } from 'antd';
import Dashboard from './pages/Dashboard';
import StyleInfo from './pages/StyleInfo';
import ProductionList from './pages/Production/List';
import CuttingManagement from './pages/Production/Cutting';
import MaterialPurchase from './pages/Production/MaterialPurchase';
import ProductWarehousing from './pages/Production/ProductWarehousing';
import OrderFlow from './pages/Production/OrderFlow';
import FactoryReconciliationList from './pages/Finance/FactoryReconciliationList';
import MaterialReconciliation from './pages/Finance/MaterialReconciliation';
import ShipmentReconciliationList from './pages/Finance/ShipmentReconciliationList';
import PaymentApproval from './pages/Finance/PaymentApproval';
import UserList from './pages/System/UserList';
import RoleList from './pages/System/RoleList';
import FactoryList from './pages/System/FactoryList';
import LoginLogList from './pages/System/LoginLogList';
import Profile from './pages/System/Profile';
import Login from './pages/Login';
import PrivateRoute from './components/PrivateRoute';
import OrderManagement from './pages/OrderManagement';
import DataCenter from './pages/DataCenter';
import TemplateCenter from './pages/TemplateCenter';
import { useAuth } from './utils/authContext';
import ResizableModal from './components/ResizableModal';

const ProgressDetail = React.lazy(() => import('./pages/Production/ProgressDetail'));

const RootRedirect: React.FC = () => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) {
    return null;
  }
  return <Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />;
};

const LoginGate: React.FC = () => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) {
    return null;
  }
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />;
};

const AppRoutes: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const backgroundLocation = (location.state as any)?.backgroundLocation;

  return (
    <>
      <Routes location={backgroundLocation || location}>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<LoginGate />} />

        <Route element={<PrivateRoute />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/style-info" element={<StyleInfo />} />
          <Route path="/style-info/:id" element={<StyleInfo />} />
          <Route path="/production" element={<ProductionList />} />
          <Route path="/production/cutting" element={<CuttingManagement />} />
          <Route path="/production/cutting/task/:orderNo" element={<CuttingManagement />} />
          <Route path="/production/material" element={<MaterialPurchase />} />
          <Route path="/production/warehousing" element={<ProductWarehousing />} />
          <Route
            path="/production/progress-detail"
            element={
              <Suspense fallback={<Spin />}>
                <ProgressDetail />
              </Suspense>
            }
          />
          <Route path="/production/order-flow" element={<OrderFlow />} />
          <Route path="/finance/factory-reconciliation" element={<FactoryReconciliationList />} />
          <Route path="/finance/material-reconciliation" element={<MaterialReconciliation />} />
          <Route path="/finance/shipment-reconciliation" element={<ShipmentReconciliationList />} />
          <Route path="/finance/payment-approval" element={<PaymentApproval />} />
          <Route path="/system/user" element={<UserList />} />
          <Route path="/system/role" element={<RoleList />} />
          <Route path="/system/factory" element={<FactoryList />} />
          <Route path="/system/login-log" element={<LoginLogList />} />
          <Route path="/system/profile" element={<Profile />} />
          <Route path="/order-management" element={<OrderManagement />} />
          <Route path="/order-management/:styleNo" element={<OrderManagement />} />
          <Route path="/data-center" element={<DataCenter />} />
          <Route path="/basic/template-center" element={<TemplateCenter />} />
        </Route>
      </Routes>

      {backgroundLocation ? (
        <Routes>
          <Route
            path="/production/progress-detail"
            element={
              <ResizableModal
                open
                title="生产进度"
                onCancel={() => navigate(-1)}
                footer={null}
                width="64vw"
                scaleWithViewport
                destroyOnHidden
              >
                <Suspense fallback={<Spin />}>
                  <ProgressDetail embedded />
                </Suspense>
              </ResizableModal>
            }
          />
        </Routes>
      ) : null}
    </>
  );
};

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
};

export default App;
