import React, { useEffect, useMemo, useState } from 'react';
import { App, Card, Form, Tabs } from 'antd';
import { useLocation } from 'react-router-dom';
import PageLayout from '@/components/common/PageLayout';
import StylePrintModal from '@/components/common/StylePrintModal';
import RemarkTimelineModal from '@/components/common/RemarkTimelineModal';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { usePersistentState } from '@/hooks/usePersistentState';
import { readPageSize } from '@/utils/pageSizeStore';
import { getMaterialTypeCategory } from '@/utils/materialType';
import { CATEGORY_CODE_OPTIONS } from '@/utils/styleCategory';
import { useDictOptions } from '@/hooks/useDictOptions';
import { useViewport } from '@/utils/useViewport';
import { useCardGridLayout } from '@/hooks/useCardGridLayout';
import { computeReferenceKilograms } from '@/modules/production/pages/Production/MaterialPurchase/utils';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';

import { StyleInfo, StyleQueryParams } from '@/types/style';
import type { StyleBom } from '@/types/style';

import OrderRankingDashboard from './components/OrderRankingDashboard';
import OrderAnalysisTab from './components/OrderAnalysisTab';
import OrderListContent from './components/OrderListContent';
import OrderCreateModal from './components/OrderCreateModal';

import { OrderLine, ProgressNode, defaultProgressNodes } from './types';
import { buildOrderQtyStats, calcBomRequirementQty, getMatchedOrderQty } from './utils/orderBomMetrics';
import { confirmPricingReady } from './utils/confirmPricingReady';
import { analyzeOrderOrchestration, computeProcessBasedUnitPrice } from './utils/orderIntelligence';
import type { SizePriceRecord } from './utils/orderIntelligence';
import { splitOptions, mergeDistinctOptions, parseSizeColorConfig } from './utils/orderFormHelpers';
import { getBomColumns } from './utils/orderBomColumns';
import { useOrderColumns } from './hooks/useOrderColumns';
import { useOrderDataFetch } from './hooks/useOrderDataFetch';
import { useOrderIntelligence } from './hooks/useOrderIntelligence';
import { useOrderActions } from './hooks/useOrderActions';
import { useOrderHandleSubmit } from './hooks/useOrderHandleSubmit';

const OrderManagement: React.FC = () => {
  const { modal, message } = App.useApp();
  const { options: categoryOptions } = useDictOptions('category', CATEGORY_CODE_OPTIONS);
  const location = useLocation();
  const { isMobile, modalWidth } = useViewport();
  const { columns: cardColumns } = useCardGridLayout(10);

  const tooltipTheme = useMemo(() => {
    const theme = typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme') : '';
    const isDark = theme === 'dark';
    return {
      background: isDark ? '#ffffff' : '#111827',
      text: isDark ? '#1f1f1f' : '#f8fafc',
      border: isDark ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.18)',
      divider: isDark ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.2)',
    };
  }, []);

  const [queryParams, setQueryParams] = useState<StyleQueryParams>({
    page: 1, pageSize: readPageSize(10),
    onlyCompleted: true, pushedToOrderOnly: true, keyword: '',
  });
  const [factoryMode, setFactoryMode] = useState<'INTERNAL' | 'EXTERNAL'>('INTERNAL');

  const [visible, setVisible] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<StyleInfo | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [form] = Form.useForm();

  const [viewMode, setViewMode] = usePersistentState<'table' | 'card'>('order-management-view-mode', 'table');

  const [printModalVisible, setPrintModalVisible] = useState(false);
  const [printingRecord, setPrintingRecord] = useState<StyleInfo | null>(null);
  const [remarkModalOpen, setRemarkModalOpen] = useState(false);
  const [remarkStyleNo, setRemarkStyleNo] = useState('');

  const [, setActiveTabKey] = usePersistentState<string>('order-management-active-tab', 'base');
  const [, setBomLoading] = useState(false);
  const [bomList, setBomList] = useState<StyleBom[]>([]);
  const [sizePriceRows, setSizePriceRows] = useState<SizePriceRecord[]>([]);
  const [sizePriceLoading, setSizePriceLoading] = useState(false);
  const [pricingModeTouched, setPricingModeTouched] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<any>(null);
  const [orderLines, setOrderLines] = useState<OrderLine[]>([]);
  const [progressNodes, setProgressNodes] = useState<ProgressNode[]>(defaultProgressNodes);

  const showSmartErrorNotice = useMemo(() => isSmartFeatureEnabled('smart.production.precheck.enabled'), []);

  const {
    styles, total, loading, factories, factoryCapacities, departments, users,
    smartError, fetchStyles,
  } = useOrderDataFetch({ queryParams, visible, showSmartErrorNotice, message });

  const modalInitialHeight = typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800;

  const normalizeSizeKey = (v: unknown) => String(v || '').trim().toUpperCase().replace(/\s+/g, '');
  const displaySizeLabel = (v: unknown) => normalizeSizeKey(v) || '-';
  const orderQtyStats = useMemo(() => buildOrderQtyStats(orderLines), [orderLines]);

  const getMatchedQty = (colorRaw: any, sizeRaw: any) => getMatchedOrderQty(orderQtyStats, colorRaw, sizeRaw);
  const calcBomBudgetQty = (record: StyleBom) => calcBomRequirementQty(record, orderQtyStats);
  const calcBomTotalPrice = (record: StyleBom) => {
    const unitPrice = Number((record as Record<string, unknown>).unitPrice) || 0;
    const budgetQty = calcBomBudgetQty(record);
    if (!Number.isFinite(budgetQty) || !Number.isFinite(unitPrice)) return 0;
    return Number((budgetQty * unitPrice).toFixed(2));
  };
  const calcBomReferenceKg = (record: StyleBom) => {
    const meters = calcBomBudgetQty(record);
    if (!Number.isFinite(meters) || meters <= 0) return null;
    return computeReferenceKilograms(meters, (record as Record<string, unknown>).conversionRate, '米');
  };
  // 保留 BOM 列定义供未来扩展使用
  void getBomColumns({ getMatchedQty, calcBomBudgetQty, calcBomTotalPrice, calcBomReferenceKg });

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const styleNo = (params.get('styleNo') || '').trim();
    const styleName = (params.get('styleName') || '').trim();
    if (styleNo || styleName) {
      const keyword = styleNo || styleName;
      setQueryParams((prev) => ({
        ...prev, page: 1, keyword,
        styleNo: undefined, styleName: undefined, category: undefined,
      }));
    }
  }, [location.search]);

  const bomByType = useMemo(() => {
    const fabric = bomList.filter((b) => getMaterialTypeCategory((b as Record<string, unknown>).materialType) === 'fabric');
    const lining = bomList.filter((b) => getMaterialTypeCategory((b as Record<string, unknown>).materialType) === 'lining');
    const accessory = bomList.filter((b) => getMaterialTypeCategory((b as Record<string, unknown>).materialType) === 'accessory');
    return { fabric, lining, accessory };
  }, [bomList]);

  const orderOrchestration = useMemo(() => analyzeOrderOrchestration({
    bomMaterialRows: [...bomByType.fabric, ...bomByType.lining],
    orderLines, sizePriceRows, selectedStyle,
    normalizeSizeKey, displaySizeLabel,
    processBasedUnitPrice: computeProcessBasedUnitPrice(progressNodes),
  }), [bomByType.fabric, bomByType.lining, orderLines, progressNodes, selectedStyle, sizePriceRows]);

  const watchedFactoryId = Form.useWatch('factoryId', form) as string | undefined;
  const watchedOrgUnitId = Form.useWatch('orgUnitId', form) as string | undefined;
  const watchedPricingMode = (Form.useWatch('pricingMode', form) as 'PROCESS' | 'SIZE' | 'COST' | 'QUOTE' | 'MANUAL' | undefined) || 'PROCESS';
  const watchedManualOrderUnitPrice = Number(Form.useWatch('manualOrderUnitPrice', form) || 0);

  const selectedFactoryStat = useMemo(() => {
    if (!factoryCapacities.length) return null;
    if (factoryMode === 'EXTERNAL' && watchedFactoryId) {
      const factory = factories.find(f => f.id === watchedFactoryId);
      if (!factory) return null;
      return factoryCapacities.find(c => c.factoryName === factory.factoryName) ?? null;
    }
    if (factoryMode === 'INTERNAL' && watchedOrgUnitId) {
      const dept = departments.find(d => d.id === watchedOrgUnitId);
      if (!dept) return null;
      const deptName = dept.nodeName || dept.pathNames || '';
      if (!deptName) return null;
      return factoryCapacities.find(c => deptName.includes(c.factoryName) || c.factoryName.includes(deptName)) ?? null;
    }
    return null;
  }, [factoryMode, watchedFactoryId, watchedOrgUnitId, factoryCapacities, factories, departments]);

  const totalOrderQuantity = useMemo(
    () => orderLines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0),
    [orderLines],
  );

  const {
    deliverySuggestion, suggestionLoading, quotationUnitPrice,
    totalCostUnitPrice, suggestedQuotationUnitPrice, orderLearningLoading,
    orderLearningRecommendation, schedulingLoading, setSchedulingResult,
    processBasedUnitPrice, sizeBasedUnitPrice, resolvedOrderUnitPrice,
    schedulingPlans,
  } = useOrderIntelligence({
    visible, selectedStyle, totalOrderQuantity, form, factoryMode,
    watchedPricingMode, watchedManualOrderUnitPrice, selectedFactoryStat,
    orderLines, sizePriceRows, progressNodes, pricingModeTouched, normalizeSizeKey,
  });

  const doConfirmPricingReady = () => confirmPricingReady(modal, orderOrchestration, watchedPricingMode, resolvedOrderUnitPrice);

  const orderLineColors = useMemo(() => {
    const set = new Set(orderLines.map(l => (l.color || '').trim()).filter(Boolean));
    return Array.from(set);
  }, [orderLines]);

  const orderLineSizes = useMemo(() => {
    const set = new Set(orderLines.map(l => (l.size || '').trim()).filter(Boolean));
    return Array.from(set);
  }, [orderLines]);

  useEffect(() => {
    form.setFieldsValue({ orderQuantity: totalOrderQuantity });
  }, [form, totalOrderQuantity]);

  const selectableColors = useMemo(() => {
    const parsed = parseSizeColorConfig((selectedStyle as any)?.sizeColorConfig);
    return mergeDistinctOptions(splitOptions(selectedStyle?.color), parsed.colors);
  }, [selectedStyle?.color, (selectedStyle as any)?.sizeColorConfig]);

  const selectableSizes = useMemo(() => {
    const parsed = parseSizeColorConfig((selectedStyle as any)?.sizeColorConfig);
    return mergeDistinctOptions(splitOptions(selectedStyle?.size), parsed.sizes);
  }, [selectedStyle?.size, (selectedStyle as any)?.sizeColorConfig]);

  const { generateOrderNo, openCreate, closeDialog } = useOrderActions({
    form,
    setSelectedStyle,
    setVisible, setActiveTabKey, setCreatedOrder, setProgressNodes,
    setOrderLines, setBomList, setBomLoading,
    setSizePriceRows, setSizePriceLoading, setSchedulingResult,
    setFactoryMode, setPricingModeTouched,
  });

  const handleSubmit = useOrderHandleSubmit({
    form, message,
    selectedStyle,
    setActiveTabKey, setCreatedOrder, setSubmitLoading, fetchStyles,
    doConfirmPricingReady,
    orderLines, watchedPricingMode, orderOrchestration, resolvedOrderUnitPrice,
    factoryMode, factories, departments,
    orderLineColors, orderLineSizes,
    processBasedUnitPrice, sizeBasedUnitPrice, totalCostUnitPrice,
    quotationUnitPrice, suggestedQuotationUnitPrice, progressNodes,
  });

  const columns = useOrderColumns({ openCreate, setPrintModalVisible, setPrintingRecord, setRemarkStyleNo, setRemarkModalOpen });

  return (
    <>
      <PageLayout
        title="下单管理"
        headerContent={showSmartErrorNotice && smartError ? (
          <Card size="small" style={{ marginBottom: 12 }}>
            <SmartErrorNotice error={smartError} onFix={fetchStyles} />
          </Card>
        ) : null}
      >
        <Tabs defaultActiveKey="list" items={[
          {
            key: 'list',
            label: '下单管理',
            children: (
              <>
                <OrderRankingDashboard onOrderClick={openCreate} />
                <OrderListContent
                  viewMode={viewMode}
                  setViewMode={setViewMode}
                  queryParams={queryParams}
                  setQueryParams={setQueryParams}
                  styles={styles}
                  total={total}
                  loading={loading}
                  columns={columns as any}
                  cardColumns={cardColumns}
                  openCreate={openCreate}
                  fetchStyles={fetchStyles}
                />
              </>
            ),
          },
          { key: 'analysis', label: '数据分析', children: <OrderAnalysisTab /> },
        ]} />
      </PageLayout>

      <OrderCreateModal
        visible={visible}
        onClose={closeDialog}
        onSubmit={handleSubmit}
        submitLoading={submitLoading}
        createdOrder={createdOrder}
        selectedStyle={selectedStyle}
        modalWidth={modalWidth}
        modalInitialHeight={modalInitialHeight}
        isMobile={isMobile}
        form={form}
        factoryMode={factoryMode}
        setFactoryMode={setFactoryMode}
        factories={factories}
        departments={departments}
        users={users}
        selectedFactoryStat={selectedFactoryStat}
        watchedFactoryId={watchedFactoryId}
        watchedOrgUnitId={watchedOrgUnitId}
        schedulingLoading={schedulingLoading}
        schedulingPlans={schedulingPlans}
        tooltipTheme={tooltipTheme}
        categoryOptions={categoryOptions}
        selectableColors={selectableColors}
        selectableSizes={selectableSizes}
        orderLines={orderLines}
        setOrderLines={setOrderLines}
        totalOrderQuantity={totalOrderQuantity}
        sizePriceLoading={sizePriceLoading}
        sizePriceCount={sizePriceRows.length}
        processBasedUnitPrice={processBasedUnitPrice}
        sizeBasedUnitPrice={sizeBasedUnitPrice}
        totalCostUnitPrice={totalCostUnitPrice}
        quotationUnitPrice={quotationUnitPrice}
        suggestedQuotationUnitPrice={suggestedQuotationUnitPrice}
        watchedPricingMode={watchedPricingMode}
        resolvedOrderUnitPrice={resolvedOrderUnitPrice}
        setPricingModeTouched={setPricingModeTouched}
        orderOrchestration={orderOrchestration}
        orderLearningLoading={orderLearningLoading}
        orderLearningRecommendation={orderLearningRecommendation}
        deliverySuggestion={deliverySuggestion}
        suggestionLoading={suggestionLoading}
        generateOrderNo={generateOrderNo}
      />

      <RemarkTimelineModal
        open={remarkModalOpen}
        onClose={() => setRemarkModalOpen(false)}
        targetType="style"
        targetNo={remarkStyleNo}
      />

      <StylePrintModal
        visible={printModalVisible}
        onClose={() => { setPrintModalVisible(false); setPrintingRecord(null); }}
        styleId={printingRecord?.id}
        styleNo={printingRecord?.styleNo}
        styleName={printingRecord?.styleName}
        cover={printingRecord?.cover}
        color={printingRecord?.color}
        quantity={printingRecord?.sampleQuantity}
        category={printingRecord?.category}
        season={printingRecord?.season}
        mode="order"
        extraInfo={{
          '交板日期': printingRecord?.deliveryDate,
          '设计师': printingRecord?.designer,
        }}
      />
    </>
  );
};

export default OrderManagement;
