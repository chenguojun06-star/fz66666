import React, { Suspense } from 'react';
import { createPortal } from 'react-dom';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Button, Spin, App as AntdApp } from 'antd';
import PrivateRoute from './components/PrivateRoute';
import { useAuth } from './utils/AuthContext';
import ResizableModal from './components/common/ResizableModal';
import ErrorBoundary from './components/common/ErrorBoundary';
import { paths } from './routeConfig';
import { useViewport } from './utils/useViewport';
import WebSocketNotification from './components/common/WebSocketNotification';
import Login from './pages/Login';
import Register from './pages/Register';
import { StyleInfo, StyleInfoList, OrderManagement, DataCenter, TemplateCenter, PatternRevisionManagement } from './modules/basic';
import {
  MaterialReconciliation,
  PayrollOperatorSummary,
  FinanceCenter,
  ExpenseReimbursement,
  WagePayment,
} from './modules/finance';
import {
  WarehouseDashboard,
  MaterialInventory,
  MaterialDatabase,
  FinishedInventory,
  SampleInventory,
} from './modules/warehouse';
import { Dashboard } from './modules/dashboard';
import { UserList, UserApproval, RoleList, FactoryList, LoginLogList, SystemLogs, Profile, DictManage, Tutorial, TenantManagement, CustomerManagement, AppStore, DataImport, SystemIssueBoard } from './modules/system';
import { IntegrationCenter } from './modules/integration';
import { IntelligenceCenter } from './modules/intelligence';
import {
  ProductionList,
  CuttingManagement,
  MaterialPurchase,
  MaterialPurchaseDetail,
  ProductWarehousing,
  InspectionDetail,
  OrderTransfer,
  OrderFlow,
  ProgressDetail,
  PatternProduction,
  MaterialPicking,
} from './modules/production';

// 懒加载组件
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

      // 获取图片的实际尺寸（仅预加载，不再用于计算尺寸）
      setSrc(nextSrc);
      setAlt(img.getAttribute('alt') || undefined);
      setOpen(true);
    };

    document.addEventListener('click', onClickCapture, true);
    return () => document.removeEventListener('click', onClickCapture, true);
  }, []);

  if (!open || !src) return null;

  return createPortal(
    <div
      onClick={close}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(0,0,0,0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'zoom-out',
      }}
    >
      <img
        src={src}
        alt={alt || ''}
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '90vw',
          maxHeight: '90vh',
          objectFit: 'contain',
          display: 'block',
          cursor: 'default',
          borderRadius: 4,
        }}
      />
    </div>,
    document.body
  );
};

const AppRoutes: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { modalWidth } = useViewport();
  const backgroundLocation = (location.state as any)?.backgroundLocation;

  React.useEffect(() => {
    const _w = window as any;
    (window as any).__appAuthLogoutNavigate = () => navigate(paths.login, { replace: true });
  }, [navigate]);

  React.useEffect(() => {
    const w = window as any;
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
        // Intentionally empty
        // 忽略错误
      }
    };
    window.addEventListener('app:auth:logout', w.__appAuthLogoutListener);
  }, [navigate]);

  return (
    <>
      <WebSocketNotification />
      <Routes location={backgroundLocation || location}>
        <Route path="/" element={<RootRedirect />} />
        <Route path={paths.login} element={<LoginGate />} />
        <Route path="/register" element={<Register />} />

        <Route element={<PrivateRoute />}>
          <Route path={paths.dashboard} element={<Suspense fallback={<Spin />}><Dashboard /></Suspense>} />
          <Route path={paths.styleInfoList} element={<Suspense fallback={<Spin />}><StyleInfoList /></Suspense>} />
          <Route path="/style-info/new" element={<Suspense fallback={<Spin />}><StyleInfo /></Suspense>} />
          <Route path={paths.styleInfoDetail} element={<Suspense fallback={<Spin />}><StyleInfo /></Suspense>} />
          <Route path={paths.patternProduction} element={<Suspense fallback={<Spin />}><PatternProduction /></Suspense>} />
          <Route path={paths.productionList} element={<Suspense fallback={<Spin />}><ProductionList /></Suspense>} />
          <Route path={paths.cutting} element={<Suspense fallback={<Spin />}><CuttingManagement /></Suspense>} />
          <Route path={paths.cuttingTask} element={<Suspense fallback={<Spin />}><CuttingManagement /></Suspense>} />
          <Route path={paths.materialPurchase} element={<Suspense fallback={<Spin />}><MaterialPurchase /></Suspense>} />
          <Route path={paths.materialPurchaseDetail} element={<Suspense fallback={<Spin />}><MaterialPurchaseDetail /></Suspense>} />
          <Route path={paths.warehousing} element={<Suspense fallback={<Spin />}><ProductWarehousing /></Suspense>} />
          <Route path={paths.warehousingInspect} element={<Suspense fallback={<Spin />}><InspectionDetail /></Suspense>} />
          <Route path={paths.materialPicking} element={<Suspense fallback={<Spin />}><MaterialPicking /></Suspense>} />
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
          <Route path={paths.materialPurchaseDetail} element={<Suspense fallback={<Spin />}><MaterialPurchaseDetail /></Suspense>} />
          <Route path={paths.orderFlow} element={<Suspense fallback={<Spin />}><OrderFlow /></Suspense>} />
          <Route path={paths.materialReconciliation} element={<Suspense fallback={<Spin />}><MaterialReconciliation /></Suspense>} />
          <Route path={paths.payrollOperatorSummary} element={<Suspense fallback={<Spin />}><PayrollOperatorSummary /></Suspense>} />
          <Route path={paths.financeCenter} element={<Suspense fallback={<Spin />}><FinanceCenter /></Suspense>} />
          <Route path={paths.expenseReimbursement} element={<Suspense fallback={<Spin />}><ExpenseReimbursement /></Suspense>} />
          <Route path={paths.wagePayment} element={<Suspense fallback={<Spin />}><WagePayment /></Suspense>} />

          <Route path={paths.warehouseDashboard} element={<Suspense fallback={<Spin />}><WarehouseDashboard /></Suspense>} />
          <Route path={paths.materialInventory} element={<Suspense fallback={<Spin />}><MaterialInventory /></Suspense>} />
          <Route path={paths.materialDatabase} element={<Suspense fallback={<Spin />}><MaterialDatabase /></Suspense>} />
          <Route path={paths.finishedInventory} element={<Suspense fallback={<Spin />}><FinishedInventory /></Suspense>} />
          <Route path={paths.sampleInventory} element={<Suspense fallback={<Spin />}><SampleInventory /></Suspense>} />

          <Route path={paths.user} element={<Suspense fallback={<Spin />}><UserList /></Suspense>} />
          <Route path={paths.dict} element={<Suspense fallback={<Spin />}><DictManage /></Suspense>} />
          <Route path={paths.tutorial} element={<Suspense fallback={<Spin />}><Tutorial /></Suspense>} />
          <Route path={paths.userApproval} element={<Suspense fallback={<Spin />}><UserApproval /></Suspense>} />
          <Route path={paths.role} element={<Suspense fallback={<Spin />}><RoleList /></Suspense>} />
          <Route path={paths.factory} element={<Suspense fallback={<Spin />}><FactoryList /></Suspense>} />
          <Route path={paths.loginLog} element={<Suspense fallback={<Spin />}><LoginLogList /></Suspense>} />
          <Route path={paths.systemLogs} element={<Suspense fallback={<Spin />}><SystemLogs /></Suspense>} />
          <Route path={paths.profile} element={<Suspense fallback={<Spin />}><Profile /></Suspense>} />
          <Route path={paths.tenantManagement} element={<Suspense fallback={<Spin />}><TenantManagement /></Suspense>} />
          <Route path={paths.customerManagement} element={<Suspense fallback={<Spin />}><CustomerManagement /></Suspense>} />
          <Route path={paths.systemIssues} element={<Suspense fallback={<Spin />}><SystemIssueBoard /></Suspense>} />
          <Route path={paths.appStore} element={<Suspense fallback={<Spin />}><AppStore /></Suspense>} />
          <Route path={paths.dataImport} element={<Suspense fallback={<Spin />}><DataImport /></Suspense>} />
          <Route path={paths.integrationCenter} element={<Suspense fallback={<Spin />}><IntegrationCenter /></Suspense>} />
          <Route path={paths.intelligenceCenter} element={<Suspense fallback={<Spin />}><IntelligenceCenter /></Suspense>} />
          <Route path={paths.orderManagementList} element={<Suspense fallback={<Spin />}><OrderManagement /></Suspense>} />
          <Route path={paths.orderManagementDetail} element={<Suspense fallback={<Spin />}><OrderManagement /></Suspense>} />
          <Route path={paths.dataCenter} element={<Suspense fallback={<Spin />}><DataCenter /></Suspense>} />
          <Route path={paths.templateCenter} element={<Suspense fallback={<Spin />}><TemplateCenter /></Suspense>} />
          <Route path={paths.patternRevision} element={<Suspense fallback={<Spin />}><PatternRevisionManagement /></Suspense>} />
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
      <AntdApp>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AppRoutes />
        </BrowserRouter>
      </AntdApp>
    </ErrorBoundary>
  );
};

export default App;
