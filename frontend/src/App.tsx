import React, { Suspense } from 'react';
import { createPortal } from 'react-dom';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Button } from 'antd';
import PrivateRoute from './components/PrivateRoute';
import XiaoyunPageLoader from './components/common/XiaoyunPageLoader';
import { useAuthState } from './utils/AuthContext';
import ResizableModal from './components/common/ResizableModal';
import ErrorBoundary from './components/common/ErrorBoundary';
import RouteErrorBoundary from './components/common/RouteErrorBoundary';
import { paths } from './routeConfig';
import { useViewport } from './utils/useViewport';
import CommandPalette from './components/common/CommandPalette';
import Login from './pages/Login';
import Register from './pages/Register';

import { StyleInfo, StyleInfoList, OrderManagement, DataCenter, TemplateCenter, PatternRevisionManagement, MaintenanceCenter } from './modules/basic';
import { MaterialReconciliation, PayrollOperatorSummary, FinanceCenter, ExpenseReimbursement, WagePayment, EcSalesRevenue, TaxExport } from './modules/finance';
import { CrmDashboard, ReceivableList } from './modules/crm';
import { SelectionCenter } from './modules/selection';
import { MaterialInventory, MaterialDatabase, FinishedInventory, SampleInventory, EcommerceOrders } from './modules/warehouse';
import { Dashboard } from './modules/dashboard';
import { UserList, UserApproval, RoleList, OrganizationTree, FactoryList, FactoryWorkerList, LoginLogList, SystemLogs, Profile, DictManage, Tutorial, TenantManagement, CustomerManagement, AppStore, DataImport, SystemIssueBoard, OrphanDataPage } from './modules/system';
import { IntegrationCenter } from './modules/integration';
import { AiAgentTraceCenter, CockpitPage, IntelligenceCenter, PlatformDashboard } from './modules/intelligence';
import { ProductionList, CuttingManagement, MaterialPurchase, MaterialPurchaseDetail, ProductWarehousing, InspectionDetail, OrderTransfer, OrderFlow, ProgressDetail, MaterialPicking, ExternalFactory } from './modules/production';

const NotFound = React.lazy(() => import('./pages/NotFound'));
const ShareOrderPage = React.lazy(() => import('./modules/production/pages/ShareOrderPage/index'));
const ShareOutstockPage = React.lazy(() => import('./modules/warehouse/pages/ShareOutstockPage/index'));

const RootRedirect: React.FC = () => {
  const { isAuthenticated, loading } = useAuthState();
  if (loading) {
    return <XiaoyunPageLoader message="小云正在确认要带你去哪里…" />;
  }
  return <Navigate to={isAuthenticated ? paths.dashboard : paths.login} replace />;
};

const LoginGate: React.FC = () => {
  const { isAuthenticated, loading } = useAuthState();
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

  React.useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

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
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <Routes location={backgroundLocation || location}>
        <Route path="/" element={<RootRedirect />} />
        <Route path={paths.login} element={<LoginGate />} />
        <Route path={paths.register} element={<Register />} />

        <Route element={<PrivateRoute />}>
          <Route path={paths.dashboard} element={<RouteErrorBoundary pageName="仪表盘"><Suspense fallback={routeFallback}><Dashboard /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.styleInfoList} element={<RouteErrorBoundary pageName="款号列表"><Suspense fallback={routeFallback}><StyleInfoList /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.styleInfoNew} element={<RouteErrorBoundary pageName="新建款号"><Suspense fallback={routeFallback}><StyleInfo /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.styleInfoDetail} element={<RouteErrorBoundary pageName="款号详情"><Suspense fallback={routeFallback}><StyleInfo /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.productionList} element={<RouteErrorBoundary pageName="生产订单"><Suspense fallback={routeFallback}><ProductionList /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.cutting} element={<RouteErrorBoundary pageName="裁床管理"><Suspense fallback={routeFallback}><CuttingManagement /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.cuttingTask} element={<RouteErrorBoundary pageName="裁床任务"><Suspense fallback={routeFallback}><CuttingManagement /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.materialPurchase} element={<RouteErrorBoundary pageName="面辅料采购"><Suspense fallback={routeFallback}><MaterialPurchase /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.materialPurchaseDetail} element={<RouteErrorBoundary pageName="采购详情"><Suspense fallback={routeFallback}><MaterialPurchaseDetail /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.warehousing} element={<RouteErrorBoundary pageName="成品入库"><Suspense fallback={routeFallback}><ProductWarehousing /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.warehousingInspect} element={<RouteErrorBoundary pageName="质检详情"><Suspense fallback={routeFallback}><InspectionDetail /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.materialPicking} element={<RouteErrorBoundary pageName="领料出库"><Suspense fallback={routeFallback}><MaterialPicking /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.warehousingDetail} element={<RouteErrorBoundary pageName="入库详情"><Suspense fallback={routeFallback}><ProductWarehousing /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.orderTransfer} element={<RouteErrorBoundary pageName="订单转交"><Suspense fallback={routeFallback}><OrderTransfer /></Suspense></RouteErrorBoundary>} />
          <Route
            path={paths.progressDetail}
            element={
              <RouteErrorBoundary pageName="工序跟进">
                <Suspense fallback={routeFallback}>
                  <ProgressDetail />
                </Suspense>
              </RouteErrorBoundary>
            }
          />
          <Route
            path={paths.externalFactory}
            element={
              <RouteErrorBoundary pageName="外发工厂">
                <Suspense fallback={routeFallback}>
                  <ExternalFactory />
                </Suspense>
              </RouteErrorBoundary>
            }
          />
          <Route path={paths.orderFlow} element={<RouteErrorBoundary pageName="订单流程"><Suspense fallback={routeFallback}><OrderFlow /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.materialReconciliation} element={<RouteErrorBoundary pageName="物料对账"><Suspense fallback={routeFallback}><MaterialReconciliation /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.payrollOperatorSummary} element={<RouteErrorBoundary pageName="工资汇总"><Suspense fallback={routeFallback}><PayrollOperatorSummary /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.financeCenter} element={<RouteErrorBoundary pageName="财务中心"><Suspense fallback={routeFallback}><FinanceCenter /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.expenseReimbursement} element={<RouteErrorBoundary pageName="报销管理"><Suspense fallback={routeFallback}><ExpenseReimbursement /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.wagePayment} element={<RouteErrorBoundary pageName="收付款中心"><Suspense fallback={routeFallback}><WagePayment /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.ecSalesRevenue} element={<RouteErrorBoundary pageName="电商销售"><Suspense fallback={routeFallback}><EcSalesRevenue /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.financeTaxExport} element={<RouteErrorBoundary pageName="税务导出"><Suspense fallback={routeFallback}><TaxExport /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.crm} element={<RouteErrorBoundary pageName="CRM"><Suspense fallback={routeFallback}><CrmDashboard /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.crmReceivables} element={<RouteErrorBoundary pageName="应收管理"><Suspense fallback={routeFallback}><ReceivableList /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.selectionBatch} element={<RouteErrorBoundary pageName="选品中心"><Suspense fallback={routeFallback}><SelectionCenter /></Suspense></RouteErrorBoundary>} />

          <Route path={paths.materialInventory} element={<RouteErrorBoundary pageName="物料库存"><Suspense fallback={routeFallback}><MaterialInventory /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.materialDatabase} element={<RouteErrorBoundary pageName="物料库"><Suspense fallback={routeFallback}><MaterialDatabase /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.finishedInventory} element={<RouteErrorBoundary pageName="成品库存"><Suspense fallback={routeFallback}><FinishedInventory /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.sampleInventory} element={<RouteErrorBoundary pageName="样衣库存"><Suspense fallback={routeFallback}><SampleInventory /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.ecommerceOrders} element={<RouteErrorBoundary pageName="电商订单"><Suspense fallback={routeFallback}><EcommerceOrders /></Suspense></RouteErrorBoundary>} />

          <Route path={paths.user} element={<RouteErrorBoundary pageName="用户管理"><Suspense fallback={routeFallback}><UserList /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.dict} element={<RouteErrorBoundary pageName="字典管理"><Suspense fallback={routeFallback}><DictManage /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.tutorial} element={<RouteErrorBoundary pageName="教程"><Suspense fallback={routeFallback}><Tutorial /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.userApproval} element={<RouteErrorBoundary pageName="用户审批"><Suspense fallback={routeFallback}><UserApproval /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.role} element={<RouteErrorBoundary pageName="角色管理"><Suspense fallback={routeFallback}><RoleList /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.organization} element={<RouteErrorBoundary pageName="组织架构"><Suspense fallback={routeFallback}><OrganizationTree /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.productionPartners} element={<RouteErrorBoundary pageName="生产伙伴"><Suspense fallback={routeFallback}><FactoryList /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.factory} element={<RouteErrorBoundary pageName="工厂管理"><Suspense fallback={routeFallback}><FactoryList /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.factoryWorkers} element={<RouteErrorBoundary pageName="工厂员工"><Suspense fallback={routeFallback}><FactoryWorkerList /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.loginLog} element={<RouteErrorBoundary pageName="登录日志"><Suspense fallback={routeFallback}><LoginLogList /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.systemLogs} element={<RouteErrorBoundary pageName="系统日志"><Suspense fallback={routeFallback}><SystemLogs /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.profile} element={<RouteErrorBoundary pageName="个人设置"><Suspense fallback={routeFallback}><Profile /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.tenantManagement} element={<RouteErrorBoundary pageName="租户管理"><Suspense fallback={routeFallback}><TenantManagement /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.customerManagement} element={<RouteErrorBoundary pageName="客户管理"><Suspense fallback={routeFallback}><CustomerManagement /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.systemIssues} element={<RouteErrorBoundary pageName="问题反馈"><Suspense fallback={routeFallback}><SystemIssueBoard /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.orphanData} element={<RouteErrorBoundary pageName="孤儿数据"><Suspense fallback={routeFallback}><OrphanDataPage /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.appStore} element={<RouteErrorBoundary pageName="应用商店"><Suspense fallback={routeFallback}><AppStore /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.dataImport} element={<RouteErrorBoundary pageName="数据导入"><Suspense fallback={routeFallback}><DataImport /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.integrationCenter} element={<RouteErrorBoundary pageName="集成中心"><Suspense fallback={routeFallback}><IntegrationCenter /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.cockpit} element={<RouteErrorBoundary pageName="智能驾驶舱"><Suspense fallback={routeFallback}><CockpitPage /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.cockpitTrace} element={<RouteErrorBoundary pageName="执行轨迹"><Suspense fallback={routeFallback}><AiAgentTraceCenter /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.intelligenceCenter} element={<RouteErrorBoundary pageName="智能中心"><Suspense fallback={routeFallback}><IntelligenceCenter /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.aiAgentTraceCenter} element={<Navigate to={paths.cockpitTrace} replace />} />
          <Route path={paths.platformDashboard} element={<RouteErrorBoundary pageName="平台AI面板"><Suspense fallback={routeFallback}><PlatformDashboard /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.orderManagementList} element={<RouteErrorBoundary pageName="订单管理"><Suspense fallback={routeFallback}><OrderManagement /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.dataCenter} element={<RouteErrorBoundary pageName="数据中心"><Suspense fallback={routeFallback}><DataCenter /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.templateCenter} element={<RouteErrorBoundary pageName="模板中心"><Suspense fallback={routeFallback}><TemplateCenter /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.maintenanceCenter} element={<RouteErrorBoundary pageName="维护中心"><Suspense fallback={routeFallback}><MaintenanceCenter /></Suspense></RouteErrorBoundary>} />
          <Route path={paths.patternRevision} element={<RouteErrorBoundary pageName="纸样修改"><Suspense fallback={routeFallback}><PatternRevisionManagement /></Suspense></RouteErrorBoundary>} />
        </Route>
        {/* 客户订单分享页（无需登录） */}
        <Route path="/share/:token" element={<Suspense fallback={routeFallback}><ShareOrderPage /></Suspense>} />
        <Route path="/share/outstock/:token" element={<Suspense fallback={routeFallback}><ShareOutstockPage /></Suspense>} />
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
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppRoutes />
      </BrowserRouter>
    </ErrorBoundary>
  );
};

export default App;
