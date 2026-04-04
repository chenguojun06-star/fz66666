import React, { Suspense } from 'react';
import { createPortal } from 'react-dom';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Button, App as AntdApp } from 'antd';
import PrivateRoute from './components/PrivateRoute';
import XiaoyunPageLoader from './components/common/XiaoyunPageLoader';
import { useAuth } from './utils/AuthContext';
import ResizableModal from './components/common/ResizableModal';
import ErrorBoundary from './components/common/ErrorBoundary';
import { paths } from './routeConfig';
import { useViewport } from './utils/useViewport';
import WebSocketNotification from './components/common/WebSocketNotification';
import CommandPalette from './components/common/CommandPalette';
import Login from './pages/Login';
import Register from './pages/Register';
import { StyleInfo, StyleInfoList, OrderManagement, DataCenter, TemplateCenter, PatternRevisionManagement, MaintenanceCenter } from './modules/basic';
import {
  MaterialReconciliation,
  PayrollOperatorSummary,
  FinanceCenter,
  ExpenseReimbursement,
  WagePayment,
  EcSalesRevenue,
  TaxExport,
} from './modules/finance';
import { CrmDashboard, ReceivableList } from './modules/crm';

import { SelectionCenter } from './modules/selection';
import {
  // WarehouseDashboard,
  MaterialInventory,
  MaterialDatabase,
  FinishedInventory,
  SampleInventory,
  EcommerceOrders,
} from './modules/warehouse';
import { Dashboard } from './modules/dashboard';
import { UserList, UserApproval, RoleList, OrganizationTree, FactoryList, FactoryWorkerList, LoginLogList, SystemLogs, Profile, DictManage, Tutorial, TenantManagement, CustomerManagement, AppStore, DataImport, SystemIssueBoard } from './modules/system';
import { IntegrationCenter } from './modules/integration';
import { AiAgentTraceCenter, CockpitPage, IntelligenceCenter } from './modules/intelligence';
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
  MaterialPicking,
  ExternalFactory,
} from './modules/production';

// 懒加载组件
const NotFound = React.lazy(() => import('./pages/NotFound'));
// 公开页面（无需登录）
const ShareOrderPage = React.lazy(() => import('./modules/production/pages/ShareOrderPage/index'));

const RootRedirect: React.FC = () => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) {
    return <XiaoyunPageLoader message="小云正在确认要带你去哪里…" />;
  }
  return <Navigate to={isAuthenticated ? paths.dashboard : paths.login} replace />;
};

const LoginGate: React.FC = () => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) {
    return <XiaoyunPageLoader message="小云正在准备登录入口…" />;
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
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const routeFallback = <XiaoyunPageLoader message="小云正在展开页面内容…" inline />;

  // ⌘K / Ctrl+K 全局搜索快捷键
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen(v => !v);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

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
    return () => {
      window.removeEventListener('app:auth:logout', w.__appAuthLogoutListener);
      w.__appAuthLogoutListenerInstalled = false;
    };
  }, [navigate]);

  return (
    <>
      <WebSocketNotification />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <Routes location={backgroundLocation || location}>
        <Route path="/" element={<RootRedirect />} />
        <Route path={paths.login} element={<LoginGate />} />
        <Route path="/register" element={<Register />} />

        <Route element={<PrivateRoute />}>
          <Route path={paths.dashboard} element={<Suspense fallback={routeFallback}><Dashboard /></Suspense>} />
          <Route path={paths.styleInfoList} element={<Suspense fallback={routeFallback}><StyleInfoList /></Suspense>} />
          <Route path="/style-info/new" element={<Suspense fallback={routeFallback}><StyleInfo /></Suspense>} />
          <Route path={paths.styleInfoDetail} element={<Suspense fallback={routeFallback}><StyleInfo /></Suspense>} />
          <Route path={paths.productionList} element={<Suspense fallback={routeFallback}><ProductionList /></Suspense>} />
          <Route path={paths.cutting} element={<Suspense fallback={routeFallback}><CuttingManagement /></Suspense>} />
          <Route path={paths.cuttingTask} element={<Suspense fallback={routeFallback}><CuttingManagement /></Suspense>} />
          <Route path={paths.materialPurchase} element={<Suspense fallback={routeFallback}><MaterialPurchase /></Suspense>} />
          <Route path={paths.materialPurchaseDetail} element={<Suspense fallback={routeFallback}><MaterialPurchaseDetail /></Suspense>} />
          <Route path={paths.warehousing} element={<Suspense fallback={routeFallback}><ProductWarehousing /></Suspense>} />
          <Route path={paths.warehousingInspect} element={<Suspense fallback={routeFallback}><InspectionDetail /></Suspense>} />
          <Route path={paths.materialPicking} element={<Suspense fallback={routeFallback}><MaterialPicking /></Suspense>} />
          <Route path={paths.warehousingDetail} element={<Suspense fallback={routeFallback}><ProductWarehousing /></Suspense>} />
          <Route path={paths.orderTransfer} element={<Suspense fallback={routeFallback}><OrderTransfer /></Suspense>} />
          <Route
            path={paths.progressDetail}
            element={
              <Suspense fallback={routeFallback}>
                <ProgressDetail />
              </Suspense>
            }
          />
          <Route
            path={paths.externalFactory}
            element={
              <Suspense fallback={routeFallback}>
                <ExternalFactory />
              </Suspense>
            }
          />
          <Route path={paths.materialPurchaseDetail} element={<Suspense fallback={routeFallback}><MaterialPurchaseDetail /></Suspense>} />
          <Route path={paths.orderFlow} element={<Suspense fallback={routeFallback}><OrderFlow /></Suspense>} />
          <Route path={paths.materialReconciliation} element={<Suspense fallback={routeFallback}><MaterialReconciliation /></Suspense>} />
          <Route path={paths.payrollOperatorSummary} element={<Suspense fallback={routeFallback}><PayrollOperatorSummary /></Suspense>} />
          <Route path={paths.financeCenter} element={<Suspense fallback={routeFallback}><FinanceCenter /></Suspense>} />
          <Route path={paths.expenseReimbursement} element={<Suspense fallback={routeFallback}><ExpenseReimbursement /></Suspense>} />
          <Route path={paths.wagePayment} element={<Suspense fallback={routeFallback}><WagePayment /></Suspense>} />
          <Route path={paths.ecSalesRevenue} element={<Suspense fallback={routeFallback}><EcSalesRevenue /></Suspense>} />
          <Route path={paths.financeTaxExport} element={<Suspense fallback={routeFallback}><TaxExport /></Suspense>} />
          <Route path={paths.crm} element={<Suspense fallback={routeFallback}><CrmDashboard /></Suspense>} />
          <Route path={paths.crmReceivables} element={<Suspense fallback={routeFallback}><ReceivableList /></Suspense>} />
          <Route path={paths.selectionBatch} element={<SelectionCenter />} />

          <Route path={paths.materialInventory} element={<Suspense fallback={routeFallback}><MaterialInventory /></Suspense>} />
          <Route path={paths.materialDatabase} element={<Suspense fallback={routeFallback}><MaterialDatabase /></Suspense>} />
          <Route path={paths.finishedInventory} element={<Suspense fallback={routeFallback}><FinishedInventory /></Suspense>} />
          <Route path={paths.sampleInventory} element={<Suspense fallback={routeFallback}><SampleInventory /></Suspense>} />
          <Route path={paths.ecommerceOrders} element={<Suspense fallback={routeFallback}><EcommerceOrders /></Suspense>} />

          <Route path={paths.user} element={<Suspense fallback={routeFallback}><UserList /></Suspense>} />
          <Route path={paths.dict} element={<Suspense fallback={routeFallback}><DictManage /></Suspense>} />
          <Route path={paths.tutorial} element={<Suspense fallback={routeFallback}><Tutorial /></Suspense>} />
          <Route path={paths.userApproval} element={<Suspense fallback={routeFallback}><UserApproval /></Suspense>} />
          <Route path={paths.role} element={<Suspense fallback={routeFallback}><RoleList /></Suspense>} />
          <Route path={paths.organization} element={<Suspense fallback={routeFallback}><OrganizationTree /></Suspense>} />
          <Route path={paths.productionPartners} element={<Suspense fallback={routeFallback}><FactoryList /></Suspense>} />
          <Route path={paths.factory} element={<Suspense fallback={routeFallback}><FactoryList /></Suspense>} />
          <Route path={paths.factoryWorkers} element={<Suspense fallback={routeFallback}><FactoryWorkerList /></Suspense>} />
          <Route path={paths.loginLog} element={<Suspense fallback={routeFallback}><LoginLogList /></Suspense>} />
          <Route path={paths.systemLogs} element={<Suspense fallback={routeFallback}><SystemLogs /></Suspense>} />
          <Route path={paths.profile} element={<Suspense fallback={routeFallback}><Profile /></Suspense>} />
          <Route path={paths.tenantManagement} element={<Suspense fallback={routeFallback}><TenantManagement /></Suspense>} />
          <Route path={paths.customerManagement} element={<Suspense fallback={routeFallback}><CustomerManagement /></Suspense>} />
          <Route path={paths.systemIssues} element={<Suspense fallback={routeFallback}><SystemIssueBoard /></Suspense>} />
          <Route path={paths.appStore} element={<Suspense fallback={routeFallback}><AppStore /></Suspense>} />
          <Route path={paths.dataImport} element={<Suspense fallback={routeFallback}><DataImport /></Suspense>} />
          <Route path={paths.integrationCenter} element={<Suspense fallback={routeFallback}><IntegrationCenter /></Suspense>} />
          <Route path={paths.cockpit} element={<Suspense fallback={routeFallback}><CockpitPage /></Suspense>} />
          <Route path={paths.cockpitTrace} element={<Suspense fallback={routeFallback}><AiAgentTraceCenter /></Suspense>} />
          <Route path={paths.intelligenceCenter} element={<Suspense fallback={routeFallback}><IntelligenceCenter /></Suspense>} />
          <Route path={paths.aiAgentTraceCenter} element={<Navigate to={paths.cockpitTrace} replace />} />
          <Route path={paths.orderManagementList} element={<Suspense fallback={routeFallback}><OrderManagement /></Suspense>} />
          <Route path={paths.orderManagementDetail} element={<Suspense fallback={routeFallback}><OrderManagement /></Suspense>} />
          <Route path={paths.dataCenter} element={<Suspense fallback={routeFallback}><DataCenter /></Suspense>} />
          <Route path={paths.templateCenter} element={<Suspense fallback={routeFallback}><TemplateCenter /></Suspense>} />
          <Route path={paths.maintenanceCenter} element={<Suspense fallback={routeFallback}><MaintenanceCenter /></Suspense>} />
          <Route path={paths.patternRevision} element={<Suspense fallback={routeFallback}><PatternRevisionManagement /></Suspense>} />
        </Route>
        {/* 客户订单分享页（无需登录） */}
        <Route path="/share/:token" element={<Suspense fallback={routeFallback}><ShareOrderPage /></Suspense>} />
        <Route path="*" element={<Suspense fallback={routeFallback}><NotFound /></Suspense>} />
      </Routes>

      {backgroundLocation ? (
        <Routes>
          <Route
            path={paths.progressDetail}
            element={
              <ResizableModal
                open
                title="工序跟进"
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
                <Suspense fallback={routeFallback}>
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
