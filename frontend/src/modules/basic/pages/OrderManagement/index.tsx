import React, { useEffect, useMemo, useState } from 'react';
import { App, Form } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import PageLayout from '@/components/common/PageLayout';
import { usePersistentState } from '@/hooks/usePersistentState';
import { useFieldConfig } from '@/hooks/useFieldConfig';
import { readPageSize } from '@/utils/pageSizeStore';
import { CATEGORY_CODE_OPTIONS } from '@/utils/styleCategory';
import { useDictOptions } from '@/hooks/useDictOptions';
import { useViewport } from '@/utils/useViewport';
import { useCardGridLayout } from '@/hooks/useCardGridLayout';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import { useCuttingCreateTask } from '@/modules/production/pages/Production/Cutting/hooks';
import { paths } from '@/routeConfig';

import { StyleInfo, StyleQueryParams } from '@/types/style';
import type { StyleBom } from '@/types/style';

import OrderManagementHeader from './components/OrderManagementHeader';
import OrderManagementModals from './components/OrderManagementModals';
import OrderManagementTabs from './components/OrderManagementTabs';

import { OrderLine, ProgressNode, defaultProgressNodes } from './types';
import type { SizePriceRecord } from './utils/orderIntelligence';
import { confirmPricingReady } from './utils/confirmPricingReady';
import { getBomColumns } from './utils/orderBomColumns';
import { normalizeSizeKey, displaySizeLabel, useOrderBomCalc } from './hooks/useOrderBomCalc';
import { useOrderColumns } from './hooks/useOrderColumns';
import { useOrderDataFetch } from './hooks/useOrderDataFetch';
import { useOrderIntelligence } from './hooks/useOrderIntelligence';
import { useOrderActions } from './hooks/useOrderActions';
import { useOrderHandleSubmit } from './hooks/useOrderHandleSubmit';
import { useOrderPageComputed } from './hooks/useOrderPageComputed';
import { useFormDraft } from '@/hooks/useFormDraft';

import { buildTooltipTheme } from './helpers';
import { useOrderStats } from './hooks/useOrderStats';
import { useSmartFilter } from './hooks/useSmartFilter';
import { useStatCardsConfig } from './hooks/useStatCardsConfig';
import { useCreateDialog } from './hooks/useCreateDialog';

const OrderManagement: React.FC = () => {
  const { modal, message } = App.useApp();
  const { options: categoryOptions } = useDictOptions('category', CATEGORY_CODE_OPTIONS);
  const location = useLocation();
  const navigate = useNavigate();
  const { isMobile } = useViewport();
  const { columns: cardColumns } = useCardGridLayout(10);

  // ===== 扩展字段配置 =====
  const { fields: orderFieldConfigs } = useFieldConfig({ bizType: 'order', platform: 'pc' });
  const { fields: styleFieldConfigs } = useFieldConfig({ bizType: 'style', platform: 'pc' });
  const orderCustomFields = useMemo(
    () => orderFieldConfigs.filter(f => f.isSystem === 0),
    [orderFieldConfigs]
  );
  const goToStyleFieldConfig = () => {
    navigate(`${paths.fieldConfig}?bizType=style`);
  };

  const cuttingCreateTask = useCuttingCreateTask({ message, navigate, fetchTasks: async () => {} });

  const tooltipTheme = useMemo(() => buildTooltipTheme(), []);

  const [queryParams, setQueryParams] = useState<StyleQueryParams>({
    page: 1, pageSize: readPageSize(20),
    onlyCompleted: true, pushedToOrderOnly: true, keyword: '',
  });
  const [factoryMode, setFactoryMode] = useState<'INTERNAL' | 'EXTERNAL'>('INTERNAL');

  const { orderStats, loadOrderStats, activeStatFilter, setActiveStatFilter } = useOrderStats();

  const [visible, setVisible] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<StyleInfo | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [form] = Form.useForm();
  const orderDraft = useFormDraft('order-create', { debounceMs: 300 });

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

  // ===== BOM 计算（复用已有 useOrderBomCalc Hook） =====
  const { orderQtyStats, getMatchedQty, calcBomBudgetQty, calcBomTotalPrice, calcBomReferenceKg } = useOrderBomCalc(orderLines);
  // 保留 BOM 列定义供未来扩展使用
  void getBomColumns({ getMatchedQty, calcBomBudgetQty, calcBomTotalPrice, calcBomReferenceKg });

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const styleNo = (params.get('styleNo') || '').trim();
    const styleName = (params.get('styleName') || '').trim();
    const autoOpenCreate = params.get('autoOpenCreate') === '1';

    if (autoOpenCreate) {
      setVisible(true);
    }

    if (styleNo || styleName) {
      const keyword = styleNo || styleName;
      setQueryParams((prev) => ({
        ...prev, page: 1, keyword,
        styleNo: undefined, styleName: undefined, category: undefined,
      }));
    }
    // 加载顶部统计卡片数据
    loadOrderStats();
  }, [location.search, loadOrderStats]);

  const {
    bomByType,
    watchedFactoryId,
    watchedOrgUnitId,
    watchedPricingMode,
    watchedManualOrderUnitPrice,
    selectedFactoryStat,
    totalOrderQuantity,
    orderOrchestration,
    orderLineColors,
    orderLineSizes,
    selectableColors,
    selectableSizes,
  } = useOrderPageComputed({
    bomList,
    orderLines,
    sizePriceRows,
    selectedStyle,
    progressNodes,
    form,
    factoryMode,
    factories,
    departments,
    factoryCapacities,
  });

  // ===== 智能筛选（已延期/临近交期） =====
  const {
    smartFilter, setSmartFilter, overdueStyles, warningStyles, displayStyles,
    handleSmartFilterClick, handleClearSmartFilter,
  } = useSmartFilter(styles);

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

  useEffect(() => {
    form.setFieldsValue({ orderQuantity: totalOrderQuantity });
  }, [form, totalOrderQuantity]);

  useEffect(() => {
    if (!visible) return;
    const allValues = form.getFieldsValue(true);
    orderDraft.saveDraftDebounced({
      formValues: allValues,
      orderLines,
      factoryMode,
    });
  }, [form, orderLines, factoryMode, visible, orderDraft]);

  useEffect(() => {
    if (createdOrder) {
      orderDraft.clearDraft();
    }
  }, [createdOrder, orderDraft]);

  const { generateOrderNo, openCreate: openCreateInternal, closeDialog: closeDialogInternal } = useOrderActions({
    form,
    setSelectedStyle,
    setVisible,
    setActiveTabKey,
    setCreatedOrder,
    setProgressNodes,
    setOrderLines,
    setBomList,
    setBomLoading,
    setSizePriceRows,
    setSizePriceLoading,
    setSchedulingResult,
    setFactoryMode,
    setPricingModeTouched,
  });

  const { openCreate, closeDialog } = useCreateDialog({
    form,
    modal,
    orderDraft,
    openCreateInternal,
    closeDialogInternal,
    setOrderLines,
    setFactoryMode,
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
    customFields: orderCustomFields,
  });

  const columns = useOrderColumns({ openCreate, setPrintModalVisible, setPrintingRecord, setRemarkStyleNo, setRemarkModalOpen });

  // ===== 统计卡片配置 =====
  const { cards, hints, onClearHints } = useStatCardsConfig({
    orderStats,
    activeStatFilter,
    setActiveStatFilter,
    setQueryParams,
    setSmartFilter,
    smartFilter,
    overdueStyles,
    warningStyles,
    handleSmartFilterClick,
    handleClearSmartFilter,
  });

  return (
    <>
      <PageLayout
        title="下单管理"
        headerContent={
          <OrderManagementHeader
            showSmartErrorNotice={showSmartErrorNotice}
            smartError={smartError}
            fetchStyles={fetchStyles}
            activeStatFilter={activeStatFilter}
            cards={cards}
            hints={hints}
            onClearHints={onClearHints}
          />
        }
      >
        <OrderManagementTabs
          viewMode={viewMode}
          setViewMode={setViewMode}
          queryParams={queryParams}
          setQueryParams={setQueryParams}
          styles={displayStyles}
          total={total}
          loading={loading}
          columns={columns as any}
          cardColumns={cardColumns}
          openCreate={openCreate}
          fetchStyles={fetchStyles}
          onNoDataOrder={cuttingCreateTask.openCreateTask}
          styleFieldConfigs={styleFieldConfigs}
          onGoToFieldConfig={goToStyleFieldConfig}
        />
      </PageLayout>

      <OrderManagementModals
        visible={visible}
        onClose={closeDialog}
        onSubmit={handleSubmit}
        submitLoading={submitLoading}
        createdOrder={createdOrder}
        selectedStyle={selectedStyle}
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
        customFields={orderCustomFields}
        remarkModalOpen={remarkModalOpen}
        setRemarkModalOpen={setRemarkModalOpen}
        remarkStyleNo={remarkStyleNo}
        printModalVisible={printModalVisible}
        setPrintModalVisible={setPrintModalVisible}
        printingRecord={printingRecord}
        setPrintingRecord={setPrintingRecord}
        cuttingCreateTask={cuttingCreateTask}
      />
    </>
  );
};

export default OrderManagement;
