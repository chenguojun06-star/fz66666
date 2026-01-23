import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { App as AntApp, Button, Spin } from 'antd';
import PrivateRoute from './components/PrivateRoute';
import { useAuth } from './utils/authContext';
import ResizableModal from './components/common/ResizableModal';
import ErrorBoundary from './components/common/ErrorBoundary';
import { paths } from './routeConfig';
import { useViewport } from './utils/useViewport';
import Login from './pages/Login';
import Register from './pages/Register';

// 懒加载组件
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const StyleInfo = React.lazy(() => import('./pages/StyleInfo'));
const ProductionList = React.lazy(() => import('./pages/Production/List'));
const CuttingManagement = React.lazy(() => import('./pages/Production/Cutting'));
const MaterialPurchase = React.lazy(() => import('./pages/Production/MaterialPurchase'));
const ProductWarehousing = React.lazy(() => import('./pages/Production/ProductWarehousing'));
const OrderTransfer = React.lazy(() => import('./pages/Production/OrderTransfer'));
const OrderFlow = React.lazy(() => import('./pages/Production/OrderFlow'));
const MaterialReconciliation = React.lazy(() => import('./pages/Finance/MaterialReconciliation'));
const ShipmentReconciliationList = React.lazy(() => import('./pages/Finance/ShipmentReconciliationList'));
const PaymentApproval = React.lazy(() => import('./pages/Finance/PaymentApproval'));
const PayrollSettlement = React.lazy(() => import('./pages/Finance/PayrollSettlement'));
const PayrollOperatorSummary = React.lazy(() => import('./pages/Finance/PayrollOperatorSummary'));
const UserList = React.lazy(() => import('./pages/System/UserList'));
const UserApproval = React.lazy(() => import('./pages/System/UserApproval'));
const RoleList = React.lazy(() => import('./pages/System/RoleList'));
const FactoryList = React.lazy(() => import('./pages/System/FactoryList'));
const LoginLogList = React.lazy(() => import('./pages/System/LoginLogList'));
const Profile = React.lazy(() => import('./pages/System/Profile'));
const OrderManagement = React.lazy(() => import('./pages/OrderManagement'));
const DataCenter = React.lazy(() => import('./pages/DataCenter'));
const TemplateCenter = React.lazy(() => import('./pages/TemplateCenter'));
const ProgressDetail = React.lazy(() => import('./pages/Production/ProgressDetail'));
const NotFound = React.lazy(() => import('./pages/NotFound'));

const RootRedirect: React.FC = () => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) {
    return null;
  }
  return <Navigate to={isAuthenticated ? paths.dashboard : paths.login} replace />;
};

const LoginGate: React.FC = () => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) {
    return null;
  }
  return isAuthenticated ? <Navigate to={paths.dashboard} replace /> : <Login />;
};

const GlobalImagePreview: React.FC = () => {
  const [open, setOpen] = React.useState(false);
  const [src, setSrc] = React.useState<string | undefined>(undefined);
  const [alt, setAlt] = React.useState<string | undefined>(undefined);

  const close = React.useCallback(() => {
    setOpen(false);
    setSrc(undefined);
    setAlt(undefined);
  }, []);

  React.useEffect(() => {
    const isIgnored = (img: HTMLImageElement) => {
      const directDisable =
        img.getAttribute('data-preview') === 'false' ||
        img.getAttribute('data-no-preview') === 'true' ||
        img.getAttribute('data-no-image-preview') === 'true' ||
        img.classList.contains('no-image-preview');
      if (directDisable) return true;
      if (img.closest('[data-no-image-preview], .no-image-preview')) return true;
      if (img.closest('a[href]')) return true;
      if (img.closest('button, [role="button"], .ant-btn')) return true;
      if (img.closest('.ant-image')) return true;
      return false;
    };

    const pickSrc = (img: HTMLImageElement) => {
      const current = (img as any).currentSrc;
      if (typeof current === 'string' && current) return current;
      const s = img.getAttribute('src');
      return s || '';
    };

    const onClickCapture = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const img = target.closest('img');
      if (!(img instanceof HTMLImageElement)) return;
      if (isIgnored(img)) return;

      const nextSrc = pickSrc(img);
      if (!nextSrc) return;

      e.preventDefault();
      e.stopPropagation();
      setSrc(nextSrc);
      setAlt(img.getAttribute('alt') || undefined);
      setOpen(true);
    };

    document.addEventListener('click', onClickCapture, true);
    return () => document.removeEventListener('click', onClickCapture, true);
  }, []);

  return (
    <ResizableModal
      open={open}
      title={null}
      onCancel={close}
      footer={null}
      width={600}
      minWidth={600}
      minHeight={600}
      initialHeight={600}
      contentPadding={0}
      destroyOnHidden
      scaleWithViewport={false}
    >
      {src ? (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <img
            src={src}
            alt={alt || ''}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
            }}
          />
        </div>
      ) : null}
    </ResizableModal>
  );
};

const AppRoutes: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { modalWidth } = useViewport();
  const backgroundLocation = (location.state as any)?.backgroundLocation;

  React.useEffect(() => {
    (window as any).__appAuthLogoutNavigate = () => navigate(paths.login, { replace: true });
  }, [navigate]);

  React.useEffect(() => {
    const w: any = window as any;
    if (w.__appAuthLogoutListenerInstalled) {
      return;
    }
    w.__appAuthLogoutListenerInstalled = true;
    w.__appAuthLogoutListener = () => {
      try {
        if (typeof w.__appAuthLogoutNavigate === 'function') {
          w.__appAuthLogoutNavigate();
        }
      } catch {
      }
    };
    window.addEventListener('app:auth:logout', w.__appAuthLogoutListener);
  }, [navigate]);

  return (
    <>
      <Routes location={backgroundLocation || location}>
        <Route path="/" element={<RootRedirect />} />
        <Route path={paths.login} element={<LoginGate />} />
        <Route path="/register" element={<Register />} />

        <Route element={<PrivateRoute />}>
          <Route path={paths.dashboard} element={<Suspense fallback={<Spin />}><Dashboard /></Suspense>} />
          <Route path={paths.styleInfoList} element={<Suspense fallback={<Spin />}><StyleInfo /></Suspense>} />
          <Route path={paths.styleInfoDetail} element={<Suspense fallback={<Spin />}><StyleInfo /></Suspense>} />
          <Route path={paths.productionList} element={<Suspense fallback={<Spin />}><ProductionList /></Suspense>} />
          <Route path={paths.cutting} element={<Suspense fallback={<Spin />}><CuttingManagement /></Suspense>} />
          <Route path={paths.cuttingTask} element={<Suspense fallback={<Spin />}><CuttingManagement /></Suspense>} />
          <Route path={paths.materialPurchase} element={<Suspense fallback={<Spin />}><MaterialPurchase /></Suspense>} />
          <Route path={paths.warehousing} element={<Suspense fallback={<Spin />}><ProductWarehousing /></Suspense>} />
          <Route path={paths.warehousingDetail} element={<Suspense fallback={<Spin />}><ProductWarehousing /></Suspense>} />
          <Route path={paths.orderTransfer} element={<Suspense fallback={<Spin />}><OrderTransfer /></Suspense>} />
          <Route
            path={paths.progressDetail}
            element={
              <Suspense fallback={<Spin />}>
                <ProgressDetail />
              </Suspense>
            }
          />
          <Route path={paths.orderFlow} element={<Suspense fallback={<Spin />}><OrderFlow /></Suspense>} />
          <Route path={paths.materialReconciliation} element={<Suspense fallback={<Spin />}><MaterialReconciliation /></Suspense>} />
          <Route path={paths.shipmentReconciliation} element={<Suspense fallback={<Spin />}><ShipmentReconciliationList /></Suspense>} />
          <Route path={paths.paymentApproval} element={<Suspense fallback={<Spin />}><PaymentApproval /></Suspense>} />
          <Route path={paths.payrollSettlement} element={<Suspense fallback={<Spin />}><PayrollSettlement /></Suspense>} />
          <Route path={paths.payrollOperatorSummary} element={<Suspense fallback={<Spin />}><PayrollOperatorSummary /></Suspense>} />
          <Route path={paths.user} element={<Suspense fallback={<Spin />}><UserList /></Suspense>} />
          <Route path={paths.userApproval} element={<Suspense fallback={<Spin />}><UserApproval /></Suspense>} />
          <Route path={paths.role} element={<Suspense fallback={<Spin />}><RoleList /></Suspense>} />
          <Route path={paths.factory} element={<Suspense fallback={<Spin />}><FactoryList /></Suspense>} />
          <Route path={paths.loginLog} element={<Suspense fallback={<Spin />}><LoginLogList /></Suspense>} />
          <Route path={paths.profile} element={<Suspense fallback={<Spin />}><Profile /></Suspense>} />
          <Route path={paths.orderManagementList} element={<Suspense fallback={<Spin />}><OrderManagement /></Suspense>} />
          <Route path={paths.orderManagementDetail} element={<Suspense fallback={<Spin />}><OrderManagement /></Suspense>} />
          <Route path={paths.dataCenter} element={<Suspense fallback={<Spin />}><DataCenter /></Suspense>} />
          <Route path={paths.templateCenter} element={<Suspense fallback={<Spin />}><TemplateCenter /></Suspense>} />
        </Route>
        <Route path="*" element={<Suspense fallback={<Spin />}><NotFound /></Suspense>} />
      </Routes>

      {backgroundLocation ? (
        <Routes>
          <Route
            path={paths.progressDetail}
            element={
              <ResizableModal
                open
                title="生产进度"
                onCancel={() => navigate(-1)}
                footer={
                  <div className="modal-footer-actions">
                    <Button onClick={() => navigate(-1)}>关闭</Button>
                  </div>
                }
                width={modalWidth}
                initialHeight={typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800}
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

      <GlobalImagePreview />
    </>
  );
};

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <AntApp>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AppRoutes />
        </BrowserRouter>
      </AntApp>
    </ErrorBoundary>
  );
};

export default App;
