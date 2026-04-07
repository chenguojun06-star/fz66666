import React, { useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Col, Form, Input, Row, Select, Space, Tabs, Tag, Tooltip } from 'antd';
import { UnifiedDatePicker } from '@/components/common/UnifiedDatePicker';
import { AppstoreOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { createCardSpecFieldGroups } from '@/components/common/CardSizeQuantityFieldGroups';
import UniversalCardView from '@/components/common/UniversalCardView';
import StylePrintModal from '@/components/common/StylePrintModal';
import StandardPagination from '@/components/common/StandardPagination';
import SupplierNameTooltip from '@/components/common/SupplierNameTooltip';
import { usePersistentState } from '@/hooks/usePersistentState';

import dayjs from 'dayjs';
import Layout from '@/components/Layout';
import PageLayout from '@/components/common/PageLayout';
import api from '@/utils/api';
import { StyleInfo, StyleQueryParams } from '@/types/style';
import type { StyleBom } from '@/types/style';

import { ProductionOrder } from '@/types/production';

import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import { DEFAULT_PAGE_SIZE_OPTIONS, readPageSize, savePageSize } from '@/utils/pageSizeStore';
import { useLocation } from 'react-router-dom';
import { StyleAttachmentsButton } from '@/components/StyleAssets';
import StyleCoverGallery from '@/components/common/StyleCoverGallery';
import { getMaterialTypeCategory } from '@/utils/materialType';
import { CATEGORY_CODE_OPTIONS, normalizeCategoryQuery } from '@/utils/styleCategory';
import { useDictOptions } from '@/hooks/useDictOptions';
import { useViewport } from '@/utils/useViewport';
import { useCardGridLayout } from '@/hooks/useCardGridLayout';
import { templateLibraryApi } from '@/services/template/templateLibraryApi';

import { getStyleCardSizeQuantityItems } from '@/utils/cardSizeQuantity';
import { getStyleSourceText } from '@/utils/styleSource';
import OrderRankingDashboard from './components/OrderRankingDashboard';
import OrderFactorySelector from './components/OrderFactorySelector';
import InlineField from './components/InlineField';
import OrderLearningInsightCard from './components/OrderLearningInsightCard';
import MultiColorOrderEditor from './components/MultiColorOrderEditor';
import OrderPricingMaterialPanel from './components/OrderPricingMaterialPanel';
import OrderSidebarInsights from './components/OrderSidebarInsights';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import { computeReferenceKilograms } from '@/modules/production/pages/Production/MaterialPurchase/utils';
import StandardToolbar from '@/components/common/StandardToolbar';
import SupplierSelect from '@/components/common/SupplierSelect';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import RemarkTimelineModal from '@/components/common/RemarkTimelineModal';
import OrderAnalysisTab from './components/OrderAnalysisTab';
import StyleQuotePopover from './StyleQuotePopover';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';

import { OrderLine, PricingProcess, ProgressNode, defaultProgressNodes } from './types';
import { buildOrderQtyStats, calcBomRequirementQty, getMatchedOrderQty, normalizeMatchKey } from './utils/orderBomMetrics';
import { buildOrderSubmitPayload } from './utils/buildOrderSubmitPayload';
import { analyzeOrderOrchestration, computeProcessBasedUnitPrice } from './utils/orderIntelligence';
import type { SizePriceRecord } from './utils/orderIntelligence';
import { useOrderColumns } from './hooks/useOrderColumns';
import { useOrderDataFetch } from './hooks/useOrderDataFetch';
import { useOrderIntelligence } from './hooks/useOrderIntelligence';


const OrderManagement: React.FC = () => {
  const { modal, message } = App.useApp();
  const { options: categoryOptions } = useDictOptions('category', CATEGORY_CODE_OPTIONS);

  const location = useLocation();
  const { isMobile, isTablet: _isTablet, modalWidth } = useViewport();
  const { columns: cardColumns, pageSize: _cardPageSize } = useCardGridLayout(10);
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
    page: 1,
    pageSize: readPageSize(10),
    onlyCompleted: true,
    pushedToOrderOnly: true,
    keyword: ''
  });
  const [factoryMode, setFactoryMode] = useState<'INTERNAL' | 'EXTERNAL'>('INTERNAL');

  // ===== 弹窗状态（保留原状，未迁移到 useModal）=====
  const [visible, setVisible] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<StyleInfo | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [form] = Form.useForm();

  // 视图切换状态（持久化）
  const [viewMode, setViewMode] = usePersistentState<'table' | 'card'>('order-management-view-mode', 'table');

  // ===== 打印弹窗状态 =====
  const [printModalVisible, setPrintModalVisible] = useState(false);
  const [printingRecord, setPrintingRecord] = useState<StyleInfo | null>(null);

  // ===== 备注弹窗状态 =====
  const [remarkModalOpen, setRemarkModalOpen] = useState(false);
  const [remarkStyleNo, setRemarkStyleNo] = useState('');

  const [, setActiveTabKey] = usePersistentState<string>('order-management-active-tab', 'base');
  const [_bomLoading, setBomLoading] = useState(false);
  const [bomList, setBomList] = useState<StyleBom[]>([]);
  const [sizePriceRows, setSizePriceRows] = useState<SizePriceRecord[]>([]);
  const [sizePriceLoading, setSizePriceLoading] = useState(false);
  const [pricingModeTouched, setPricingModeTouched] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<any>(null);

  const [orderLines, setOrderLines] = useState<OrderLine[]>([]);

  const [progressNodes, setProgressNodes] = useState<ProgressNode[]>(defaultProgressNodes);
  const showSmartErrorNotice = useMemo(() => isSmartFeatureEnabled('smart.production.precheck.enabled'), []);

  const { styles, total, loading, factories, factoryCapacities, departments, users, smartError, setSmartError: _setSmartError, reportSmartError: _reportSmartError, fetchStyles } = useOrderDataFetch({ queryParams, visible, showSmartErrorNotice, message });

  const modalInitialHeight = typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800;

  const normalizeSizeKey = (v: unknown) => String(v || '').trim().toUpperCase().replace(/\s+/g, '');
  const displaySizeLabel = (v: unknown) => normalizeSizeKey(v) || '-';
  const orderQtyStats = useMemo(() => buildOrderQtyStats(orderLines), [orderLines]);


  const getMatchedQty = (colorRaw: any, sizeRaw: any) => {
    return getMatchedOrderQty(orderQtyStats, colorRaw, sizeRaw);
  };

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

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const styleNo = (params.get('styleNo') || '').trim();
    const styleName = (params.get('styleName') || '').trim();
    if (styleNo || styleName) {
      const keyword = styleNo || styleName;
      setQueryParams((prev) => ({
        ...prev,
        page: 1,
        keyword,
        styleNo: undefined,
        styleName: undefined,
        category: undefined,
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
    orderLines,
    sizePriceRows,
    selectedStyle,
    normalizeSizeKey,
    displaySizeLabel,
    processBasedUnitPrice: computeProcessBasedUnitPrice(progressNodes),
  }), [bomByType.fabric, bomByType.lining, displaySizeLabel, normalizeSizeKey, orderLines, progressNodes, selectedStyle, sizePriceRows]);

  const watchedFactoryId = Form.useWatch('factoryId', form) as string | undefined;
  const watchedPricingMode = (Form.useWatch('pricingMode', form) as 'PROCESS' | 'SIZE' | 'COST' | 'QUOTE' | 'MANUAL' | undefined) || 'PROCESS';
  const watchedManualOrderUnitPrice = Number(Form.useWatch('manualOrderUnitPrice', form) || 0);

  // 当前选中工厂的产能信息（下单时即时显示）
  const selectedFactoryStat = useMemo(() => {
    if (!watchedFactoryId || !factoryCapacities.length) return null;
    const factory = factories.find(f => f.id === watchedFactoryId);
    if (!factory) return null;
    return factoryCapacities.find(c => c.factoryName === factory.factoryName) ?? null;
  }, [watchedFactoryId, factoryCapacities, factories]);

  function splitOptions(value?: string) {
    if (!value) return [] as string[];
    return value
      .split(/[,/，、\s]+/)
      .map(v => v.trim())
      .filter(Boolean);
  }

  const mergeDistinctOptions = (...groups: Array<string[] | undefined>) => {
    const result: string[] = [];
    const seen = new Set<string>();
    groups.forEach((group) => {
      (group || []).forEach((item) => {
        const text = String(item || '').trim();
        if (!text) return;
        const key = normalizeMatchKey(text);
        if (seen.has(key)) return;
        seen.add(key);
        result.push(text);
      });
    });
    return result;
  };

  const parseSizeColorConfig = (raw: unknown): { sizes: string[]; colors: string[] } => {
    const text = String(raw || '').trim();
    if (!text) return { sizes: [], colors: [] };
    try {
      const config = JSON.parse(text);
      const sizes = Array.isArray(config?.sizes)
        ? config.sizes.map((s: unknown) => String(s || '').trim()).filter(Boolean)
        : [];
      const colors = Array.isArray(config?.colors)
        ? config.colors.map((c: unknown) => String(c || '').trim()).filter(Boolean)
        : [];
      return { sizes, colors };
    } catch {
      return { sizes: [], colors: [] };
    }
  };

  const totalOrderQuantity = useMemo(() => {
    return orderLines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
  }, [orderLines]);

  const {
    deliverySuggestion, suggestionLoading, quoteReference: _quoteReference, quotationUnitPrice,
    totalCostUnitPrice, suggestedQuotationUnitPrice, orderLearningLoading,
    orderLearningRecommendation, schedulingResult: _schedulingResult, schedulingLoading, setSchedulingResult,
    processBasedUnitPrice, sizePriceBySize: _sizePriceBySize, sizeBasedUnitPrice, resolvedOrderUnitPrice,
    preferredPricingMode: _preferredPricingMode, schedulingPlans, fetchDeliverySuggestion: _fetchDeliverySuggestion, resetIntelligence: _resetIntelligence,
  } = useOrderIntelligence({
    visible, selectedStyle, totalOrderQuantity, form, factoryMode,
    watchedPricingMode, watchedManualOrderUnitPrice, selectedFactoryStat,
    orderLines, sizePriceRows, progressNodes, pricingModeTouched, normalizeSizeKey,
  });

  const confirmPricingReady = () =>
    new Promise<boolean>((resolve) => {
      modal.confirm({
        width: 560,
        title: '下单提醒',
        content: (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ color: '#595959' }}>请在提交前确认价格编排与面辅料编排都已核对完成。</div>
            <div style={{ padding: 12, borderRadius: 10, border: '1px solid #d9d9d9', background: '#fafafa' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                <span style={{ fontWeight: 600 }}>价格编排</span>
                <Tag color={orderOrchestration.pricingStatus === 'error' ? 'error' : orderOrchestration.pricingStatus === 'warning' ? 'warning' : orderOrchestration.pricingStatus === 'success' ? 'success' : 'default'}>
                  {watchedPricingMode === 'MANUAL'
                    ? '手动单价'
                    : watchedPricingMode === 'SIZE'
                      ? '尺码单价'
                      : watchedPricingMode === 'COST'
                        ? '整件成本价'
                        : watchedPricingMode === 'QUOTE'
                          ? '报价单价'
                          : '工序单价'}
                </Tag>
              </div>
              <div style={{ fontSize: 12, color: '#595959' }}>{orderOrchestration.pricingSummary}</div>
              <div style={{ marginTop: 6, fontSize: 12, color: '#1677ff' }}>下单锁定单价：¥{resolvedOrderUnitPrice.toFixed(2)} / 件</div>
            </div>
            <div style={{ padding: 12, borderRadius: 10, border: '1px solid #d9d9d9', background: '#fafafa' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                <span style={{ fontWeight: 600 }}>面辅料编排</span>
                <Tag color={orderOrchestration.scatterStatus === 'error' ? 'error' : orderOrchestration.scatterStatus === 'warning' ? 'warning' : 'success'}>
                  {orderOrchestration.scatterMode}
                </Tag>
              </div>
              <div style={{ fontSize: 12, color: '#595959' }}>{orderOrchestration.scatterSummary}</div>
            </div>
          </div>
        ),
        okText: '确认下单',
        cancelText: '取消',
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });

  const buildProgressNodesFromTemplate = (rows: any[]): ProgressNode[] => {
    return (Array.isArray(rows) ? rows : [])
      .map((n: any) => {
        const name = String(n?.name || n?.processName || '').trim();
        if (!name) return null;
        const id = String(n?.id || n?.processCode || name || '').trim() || name;
        const p = Number(n?.unitPrice);
        const unitPrice = Number.isFinite(p) && p >= 0 ? p : 0;
        // 保存完整的工序信息
        const progressStage = String(n?.progressStage || name).trim();
        const machineType = String(n?.machineType || '').trim();
        const standardTime = Number(n?.standardTime) || 0;
        return {
          id,
          name,
          progressStage,
          machineType,
          standardTime,
          processes: [{ id: `${id}-0`, processName: name, unitPrice, progressStage, machineType, standardTime }],
        } as unknown as ProgressNode;
      })
      .filter(Boolean) as ProgressNode[];
  };

  const loadProgressNodesForStyle = async (styleNo: string) => {
    const sn = String(styleNo || '').trim();
    if (!sn) return;
    try {
      const res = await templateLibraryApi.progressNodeUnitPrices(sn);
      const result = res as Record<string, unknown>;
      if (result.code !== 200) return;
      const rows = Array.isArray(result.data) ? result.data : [];
      const normalized = buildProgressNodesFromTemplate(rows);
      if (normalized.length) {
        setProgressNodes(normalized);
      }
    } catch (e) {
      console.error('[订单] 加载工序模板失败:', e);
    }
  };

  const buildProgressWorkflowJson = (nodes: ProgressNode[]) => {
    // 把所有工序扁平化存储，每个工序包含完整信息
    const allProcesses: Array<{
      id: string;
      name: string;
      unitPrice: number;
      progressStage: string;
      machineType: string;
      standardTime: number;
      sortOrder: number;
    }> = [];

    (Array.isArray(nodes) ? nodes : []).forEach((n, idx) => {
      const name = String(n?.name || '').trim();
      if (!name) return;

      const id = String(n?.id || name || '').trim() || name;
      const progressStage = String((n as any)?.progressStage || name).trim();
      const machineType = String((n as any)?.machineType || '').trim();
      const standardTime = Number((n as any)?.standardTime) || 0;

      // 从 processes 数组获取单价（所有工序价格求和，与默认节点逻辑保持一致）
      const processes = (Array.isArray(n?.processes) ? n.processes : []) as PricingProcess[];
      const unitPrice = processes.reduce((sum, p) => sum + (Number(p?.unitPrice) || 0), 0);

      allProcesses.push({
        id,
        name,
        unitPrice,
        progressStage,
        machineType,
        standardTime,
        sortOrder: idx,
      });
    });

    // 如果没有工序，使用默认值
    const ensuredProcesses = allProcesses.length > 0
      ? allProcesses
      : defaultProgressNodes.map((n, idx) => ({
        id: n.id,
        name: n.name,
        unitPrice: (Array.isArray(n.processes) ? n.processes : []).reduce((sum, p) => sum + (Number(p.unitPrice) || 0), 0),
        progressStage: n.name,
        machineType: '',
        standardTime: 0,
        sortOrder: idx,
      }));


    // 新格式：直接在 nodes 里保存所有工序的完整信息
    // processesByNode 作为兼容字段也保存一份（按 progressStage 分组）
    const processesByNode: Record<string, typeof ensuredProcesses> = {};
    for (const p of ensuredProcesses) {
      const stage = p.progressStage || p.name;
      if (!processesByNode[stage]) {
        processesByNode[stage] = [];
      }
      processesByNode[stage].push(p);
    }

    return JSON.stringify({
      nodes: ensuredProcesses,
      processesByNode,
    });
  };

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

  // data fetch logic provided by useOrderDataFetch hook

  const selectableColors = useMemo(() => {
    const parsed = parseSizeColorConfig((selectedStyle as any)?.sizeColorConfig);
    return mergeDistinctOptions(splitOptions(selectedStyle?.color), parsed.colors);
  }, [selectedStyle?.color, (selectedStyle as any)?.sizeColorConfig]);

  const selectableSizes = useMemo(() => {
    const parsed = parseSizeColorConfig((selectedStyle as any)?.sizeColorConfig);
    return mergeDistinctOptions(splitOptions(selectedStyle?.size), parsed.sizes);
  }, [selectedStyle?.size, (selectedStyle as any)?.sizeColorConfig]);

  const generateOrderNo = async () => {
    try {
      const res = await api.get<{ code: number; data: string }>('/system/serial/generate', { params: { ruleCode: 'ORDER_NO' } });
      if (res.code === 200 && typeof res.data === 'string' && res.data) {
        form.setFieldsValue({ orderNo: res.data });
      }
    } catch {
      // Intentionally empty
      // 忽略错误
    }
  };

  const fetchBom = async (styleId: string | number) => {
    setBomLoading(true);
    try {
      const res = await api.get<{ code: number; data: StyleBom[] }>(`/style/bom/list?styleId=${styleId}`);
      if (res.code === 200) {
        setBomList(res.data || []);
      } else {
        setBomList([]);
      }
    } catch {
      // Intentionally empty
      // 忽略错误
      setBomList([]);
    } finally {
      setBomLoading(false);
    }
  };

  const fetchSizePrices = async (styleId: string | number) => {
    setSizePriceLoading(true);
    try {
      const res = await api.get<{ code: number; data: SizePriceRecord[] }>('/style/size-price/list', {
        params: { styleId },
      });
      if (res.code === 200) {
        setSizePriceRows(Array.isArray(res.data) ? res.data : []);
      } else {
        setSizePriceRows([]);
      }
    } catch {
      setSizePriceRows([]);
    } finally {
      setSizePriceLoading(false);
    }
  };

  const openCreate = (style: StyleInfo) => {
    setSelectedStyle(style);
    setVisible(true);
    setActiveTabKey('base');
    setCreatedOrder(null);
    setProgressNodes(defaultProgressNodes);
    void loadProgressNodesForStyle(String(style.styleNo || '').trim());
    if (style.id !== undefined && style.id !== null && String(style.id)) {
      fetchBom(style.id);
      fetchSizePrices(style.id);
    } else {
      setBomList([]);
      setSizePriceRows([]);
    }
    setSchedulingResult(null);

    const parsedConfig = parseSizeColorConfig((style as any)?.sizeColorConfig);
    const initColors = mergeDistinctOptions(splitOptions(style.color), parsedConfig.colors);
    const initSizes = mergeDistinctOptions(splitOptions(style.size), parsedConfig.sizes);
    if (initColors.length && initSizes.length) {
      setOrderLines([]);
    } else {
      const initColor = splitOptions(style.color)[0] || style.color || parsedConfig.colors[0] || '';
      const initSize = splitOptions(style.size)[0] || style.size || parsedConfig.sizes[0] || '';
      setOrderLines([
        {
          id: String(Date.now()),
          color: initColor,
          size: initSize,
          quantity: 1,
        },
      ]);
    }
    // 智能设置默认计划时间
    const today = dayjs();
    // 默认计划周期为7天
    const plannedStartDate = today;
    const plannedEndDate = today.add(7, 'day');

    form.setFieldsValue({
      orderNo: '',
      factoryId: undefined,
      plateType: undefined,
      merchandiser: style.orderType || undefined, // 从样衣开发带入跟单员
      company: style.customer || undefined, // 从样衣开发带入公司
      productCategory: normalizeCategoryQuery(style.category) || undefined, // 从样衣开发带入品类
      patternMaker: style.sampleSupplier || undefined, // 从样衣开发带入纸样师
      orderQuantity: 1,
      pricingMode: 'PROCESS',
      manualOrderUnitPrice: undefined,
      scatterPricingMode: 'FOLLOW_ORDER',
      manualScatterUnitPrice: undefined,
      plannedStartDate: plannedStartDate,
      plannedEndDate: plannedEndDate
    });
    setPricingModeTouched(false);
    generateOrderNo();
  };

  const closeDialog = () => {
    setVisible(false);
    setSelectedStyle(null);
    setCreatedOrder(null);
    setBomList([]);
    setSizePriceRows([]);
    setSchedulingResult(null);
    setActiveTabKey('base');
    setOrderLines([]);
    setProgressNodes(defaultProgressNodes);
    setFactoryMode('INTERNAL');
    setPricingModeTouched(false);
    form.resetFields();
  };

  const handleSubmit = async () => {
    if (!selectedStyle) return;
    try {
      const confirmed = await confirmPricingReady();
      if (!confirmed) return;
      setSubmitLoading(true);

      if (!orderLines.length) {
        message.error('请至少填写一条下单数量');
        setActiveTabKey('base');
        return;
      }

      const invalid = orderLines.find(l => !String(l.color || '').trim() || !String(l.size || '').trim() || (Number(l.quantity) || 0) <= 0);
      if (invalid) {
        message.error('下单数量需填写颜色、码数且数量>0');
        setActiveTabKey('base');
        return;
      }

      const computedQty = orderLines.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);
      if (computedQty <= 0) {
        message.error('订单总数量必须大于0');
        setActiveTabKey('detail');
        return;
      }

      if (watchedPricingMode === 'SIZE' && orderOrchestration.missingPriceRecords.length > 0) {
        message.error('当前选择了尺码单价，但还有码价缺失，请补齐或改为工序单价/手动单价');
        setActiveTabKey('base');
        return;
      }

      if (resolvedOrderUnitPrice <= 0) {
        message.error('单价必须大于0');
        setActiveTabKey('base');
        return;
      }

      const values = await form.validateFields();

      let ensuredOrderNo = values.orderNo;
      if (!ensuredOrderNo) {
        const res = await api.get<{ code: number; data: string }>('/system/serial/generate', { params: { ruleCode: 'ORDER_NO' } });
        if (res.code === 200 && typeof res.data === 'string' && res.data) {
          ensuredOrderNo = res.data;
          form.setFieldsValue({ orderNo: ensuredOrderNo });
        }
      }

      let resolvedFactoryId: string | null = null;
      let resolvedOrgUnitId: string | null = null;
      let resolvedFactoryName = '';
      if (factoryMode === 'INTERNAL') {
        const dept = departments.find(d => d.id === values.orgUnitId);
        resolvedOrgUnitId = values.orgUnitId || null;
        resolvedFactoryName = dept?.nodeName || '';
      } else {
        const factory = factories.find(f => f.id === values.factoryId);
        resolvedFactoryId = values.factoryId || null;
        resolvedFactoryName = factory?.factoryName || '';
      }

      const colorLabel = orderLineColors.length ? orderLineColors.join(',') : undefined;
      const sizeLabel = orderLineSizes.length ? orderLineSizes.join(',') : undefined;
      const materialPriceSource = '物料采购系统';
      const materialPriceAcquiredAt = dayjs().toISOString();
      const materialPriceVersion = 'purchase.v1';
      if (materialPriceSource !== '物料采购系统') {
        message.error('物料价格来源必须为物料采购系统');
        return;
      }
      const { payload } = buildOrderSubmitPayload({
        values,
        selectedStyle,
        ensuredOrderNo,
        colorLabel,
        sizeLabel,
        resolvedFactoryId,
        resolvedFactoryName,
        resolvedOrgUnitId,
        factoryMode,
        orderLines,
        computedQty,
        orderOrchestration,
        materialPriceSource,
        materialPriceAcquiredAt,
        materialPriceVersion,
        processBasedUnitPrice,
        sizeBasedUnitPrice,
        totalCostUnitPrice,
        quotationUnitPrice,
        suggestedQuotationUnitPrice,
        resolvedOrderUnitPrice,
        buildProgressWorkflowJson,
        progressNodes,
      });
      const response = await api.post<{ code: number; message: string; data: ProductionOrder }>('/production/order', payload);
      if (response.code === 200) {
        setCreatedOrder(response.data || payload);
        setActiveTabKey('bom');
        message.success('已下单');
        fetchStyles();
      } else {
        message.error(response.message || '下单失败');
      }
    } catch (error: any) {
      if (error?.errorFields) {
        message.error(error.errorFields?.[0]?.errors?.[0] || '表单校验失败');
      } else {
        message.error(error?.message || '下单失败');
      }
    } finally {
      setSubmitLoading(false);
    }
  };

  const columns = useOrderColumns({ openCreate, setPrintModalVisible, setPrintingRecord, setRemarkStyleNo, setRemarkModalOpen });

  return (
    <Layout>
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
            children: (<>
        {/* 下单排行数据看板 */}
        <OrderRankingDashboard onOrderClick={openCreate} />

        <Card size="small" className="filter-card mb-sm">
          <StandardToolbar
            left={(
              <StandardSearchBar
                searchValue={String(queryParams.keyword || '')}
                onSearchChange={(value) =>
                  setQueryParams((prev) => ({
                    ...prev,
                    page: 1,
                    keyword: value,
                    styleNo: undefined,
                    styleName: undefined,
                    category: undefined,
                  }))
                }
                searchPlaceholder="搜索款号/款名/品类"
                showDate={false}
                showStatus={false}
              />
            )}
            right={(
              <Space size={12}>
                <Button
                  icon={viewMode === 'table' ? <AppstoreOutlined /> : <UnorderedListOutlined />}
                  onClick={() => {
                    const next = viewMode === 'table' ? 'card' : 'table';
                    setViewMode(next);
                    if (next === 'card') {
                      setQueryParams((prev) => ({ ...prev, page: 1 }));
                    }
                  }}
                >
                  {viewMode === 'table' ? '卡片视图' : '列表视图'}
                </Button>
                <Button type="primary" onClick={() => fetchStyles()}>
                  刷新
                </Button>
              </Space>
            )}
          />
        </Card>

        {viewMode === 'table' ? (
          <ResizableTable
            rowKey={(r) => String(r.id ?? r.styleNo)}
            columns={columns as any}
            dataSource={styles}
            loading={loading}
            stickyHeader
            scroll={{ x: 'max-content' }}
            pagination={{
              current: queryParams.page,
              pageSize: queryParams.pageSize,
              total,
              showTotal: (total) => `共 ${total} 条`,
              showSizeChanger: true,
              pageSizeOptions: [...DEFAULT_PAGE_SIZE_OPTIONS],
              onChange: (page, pageSize) => setQueryParams(prev => ({ ...prev, page, pageSize })),
            }}
          />
        ) : (
          <>
          <UniversalCardView
            dataSource={styles}
            loading={loading}
            columns={cardColumns}
            coverField="cover"
            titleField="styleNo"
            subtitleField="styleName"
            fields={[]}
            fieldGroups={[
              ...createCardSpecFieldGroups<StyleInfo>({
                colorKey: 'orderStyleCardColorLine',
                sizeKey: 'orderStyleCardSizeLine',
                quantityKey: 'orderStyleCardQuantityLine',
                getItems: (record) => getStyleCardSizeQuantityItems(record),
                getFallbackColor: (record) => String(record.color || '').trim(),
                getFallbackSize: (record) => String(record.size || '').trim(),
                getFallbackQuantity: (record) => Number(record.sampleQuantity) || Number((record as any).quantity) || 0,
              }),
              [{ label: '来源', key: 'developmentSourceType', render: (_val, record) => getStyleSourceText(record as StyleInfo) }, { label: '品类', key: 'category', render: (val) => val || '-' }],
              [{ label: '下单', key: 'latestOrderTime', render: (val) => val ? dayjs(val).format('MM-DD') : '-' }, { label: '下单人', key: 'latestOrderCreator', render: (val) => val || '-' }],
            ]}
            progressConfig={{ show: false, calculate: () => 0 }}
            actions={(record) => [
              {
                key: 'create',
                label: '下单',
                onClick: () => openCreate(record),
              },
            ]}
          />
          <StandardPagination
            current={queryParams.page}
            pageSize={queryParams.pageSize}
            total={total}
            wrapperStyle={{ paddingTop: 12, paddingBottom: 4 }}
            showQuickJumper={false}
            onChange={(page, pageSize) => {
              savePageSize(pageSize);
              setQueryParams((prev) => ({ ...prev, page, pageSize }));
            }}
          />
          </>
        )}
        </>),
        },
        {
          key: 'analysis',
          label: '数据分析',
          children: <OrderAnalysisTab />,
        },
        ]} />
      </PageLayout>

      <ResizableModal
        open={visible}
        title={selectedStyle ? `下单（${selectedStyle.styleNo}）` : '下单'}
        onCancel={closeDialog}
        footer={null}
        width={modalWidth}
        initialHeight={modalInitialHeight}
        minWidth={isMobile ? 320 : 520}
        scaleWithViewport
        tableDensity={isMobile ? 'dense' : 'auto'}
      >
        <Form form={form} layout="vertical" style={{ minWidth: 0, width: '100%' }}>
          <div
            style={
              isMobile
                ? { display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0, width: '100%', maxWidth: '100%' }
                : { display: 'flex', gap: 20, minWidth: 0, width: '100%', maxWidth: '100%' }
            }
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                minWidth: 0,
                flex: isMobile ? '1 1 100%' : '0 0 25%',
                maxWidth: isMobile ? '100%' : '220px',
              }}
            >
              <StyleQuotePopover styleNo={selectedStyle?.styleNo || ''}>
                <div>
                  <div style={{ width: '100%' }}>
                    <StyleCoverGallery
                      styleId={selectedStyle?.id}
                      styleNo={selectedStyle?.styleNo}
                      src={selectedStyle?.cover || null}
                      fit="cover"
                      borderRadius={8}
                    />
                  </div>
                  <div style={{ fontSize: 11, color: '#8c8c8c', textAlign: 'center', marginTop: 4 }}>
                    悬停查看报价参考
                  </div>
                </div>
              </StyleQuotePopover>
              <div>
                <StyleAttachmentsButton
                  styleId={selectedStyle?.id}
                  styleNo={selectedStyle?.styleNo}
                  buttonText="查看附件"
                  modalTitle={selectedStyle?.styleNo ? `纸样附件（${selectedStyle.styleNo}）` : '纸样附件'}
                />
              </div>
              <OrderSidebarInsights
                styleNo={selectedStyle?.styleNo}
                factoryName={factories.find(
                  f => String(f.id) === String(watchedFactoryId)
                )?.factoryName}
                capacityData={selectedFactoryStat}
                schedulingLoading={schedulingLoading}
                schedulingPlans={schedulingPlans}
                selectedFactoryId={watchedFactoryId}
                factories={factories}
                onSelectFactory={(factoryId) => {
                  setFactoryMode('EXTERNAL');
                  form.setFieldValue('factoryId', factoryId);
                }}
              />
            </div>

            <div
              style={{
                minWidth: 0,
                flex: isMobile ? '1 1 100%' : '1 1 75%',
                maxWidth: '100%',
                overflow: 'hidden',
                borderLeft: isMobile ? 'none' : '1px solid #f0f0f0',
                paddingLeft: isMobile ? 0 : 20,
              }}
            >
              {/* 第一行：订单号 + 工厂 */}
              <Row gutter={16} style={{ marginBottom: 12 }}>
                <Col xs={24} sm={12}>
                  <div style={{ marginBottom: 4, fontWeight: 600 }}>订单号 <span style={{ color: 'var(--color-danger)' }}>*</span></div>
                  <Form.Item
                    name="orderNo"
                    rules={[{ required: true, message: '请输入订单号' }]}
                    style={{ marginBottom: 0 }}
                  >
                    <Space.Compact style={{ width: '100%' }}>
                      <Input placeholder="例如：PO20260107001" />
                      <Button onClick={generateOrderNo}>自动生成</Button>
                    </Space.Compact>
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <OrderFactorySelector
                    factoryMode={factoryMode}
                    setFactoryMode={setFactoryMode}
                    form={form}
                    departments={departments}
                    factories={factories}
                    selectedFactoryStat={selectedFactoryStat}
                    tooltipTheme={tooltipTheme}
                  />
                </Col>
              </Row>

              {/* 第二行：下单时间 + 订单交期 + 更多选项 */}
              <Row gutter={12} style={{ marginBottom: 12 }}>
                <Col xs={24} sm={8}>
                  <InlineField label={<>下单时间 <span style={{ color: 'var(--color-danger)' }}>*</span></>}>
                    <Form.Item
                      name="plannedStartDate"
                      rules={[{ required: true, message: '请选择下单时间' }]}
                      style={{ marginBottom: 0 }}
                    >
                      <UnifiedDatePicker showTime style={{ width: '100%' }} />
                    </Form.Item>
                  </InlineField>
                </Col>
                <Col xs={24} sm={8}>
                  <InlineField label={<>订单交期 <span style={{ color: 'var(--color-danger)' }}>*</span>{deliverySuggestion && !suggestionLoading && (
                    <Tooltip title={deliverySuggestion.reason}>
                      <Tag
                        color="blue"
                        style={{ marginLeft: 4, cursor: 'pointer' }}
                        onClick={() => {
                          const d = dayjs().add(deliverySuggestion.recommendedDays, 'day').hour(18).minute(0).second(0);
                          form.setFieldValue('plannedEndDate', d);
                        }}
                      >
                        建议
                      </Tag>
                    </Tooltip>
                  )}</>}>
                    <Form.Item
                      name="plannedEndDate"
                      rules={[{ required: true, message: '请选择订单交期' }]}
                      style={{ marginBottom: 0 }}
                    >
                      <UnifiedDatePicker showTime style={{ width: '100%' }} />
                    </Form.Item>
                  </InlineField>
                </Col>
                <Col xs={24} sm={8}>
                  <InlineField label="急单">
                    <Form.Item name="urgencyLevel" initialValue="normal" style={{ marginBottom: 0 }}>
                      <Select
                        placeholder="普通"
                        allowClear
                        options={[
                          { label: ' 急单', value: 'urgent' },
                          { label: '普通', value: 'normal' },
                        ]}
                      />
                    </Form.Item>
                  </InlineField>
                </Col>
              </Row>

              <div style={{ marginBottom: 12 }}>
                <Row gutter={[12, 12]}>
                  <Col xs={24} sm={8}>
                    <InlineField label="公司">
                      <Form.Item name="company" style={{ marginBottom: 0 }}>
                        <SupplierSelect placeholder="选填" allowClear />
                      </Form.Item>
                    </InlineField>
                  </Col>
                  <Col xs={24} sm={8}>
                    <InlineField label="品类">
                      <Form.Item name="productCategory" style={{ marginBottom: 0 }}>
                        <Select placeholder="选填" allowClear showSearch optionFilterProp="label" style={{ width: '100%' }} options={categoryOptions} />
                      </Form.Item>
                    </InlineField>
                  </Col>
                  <Col xs={24} sm={8}>
                    <InlineField label="单型">
                      <Form.Item name="plateType" style={{ marginBottom: 0 }}>
                        <Select placeholder="不填自动判断" allowClear options={[{ label: '首单', value: 'FIRST' }, { label: '翻单', value: 'REORDER' }]} />
                      </Form.Item>
                    </InlineField>
                  </Col>
                  <Col xs={24} sm={8}>
                    <InlineField label="下单类型">
                      <Form.Item name="orderBizType" style={{ marginBottom: 0 }}>
                        <Select placeholder="选填" allowClear options={[
                          { label: 'FOB', value: 'FOB' },
                          { label: 'ODM', value: 'ODM' },
                          { label: 'OEM', value: 'OEM' },
                          { label: 'CMT', value: 'CMT' },
                        ]} />
                      </Form.Item>
                    </InlineField>
                  </Col>
                  <Col xs={24} sm={8}>
                    <InlineField label="纸样师">
                      <Form.Item name="patternMaker" style={{ marginBottom: 0 }}>
                        <Select placeholder="选填" allowClear showSearch optionFilterProp="label" options={users.filter(u => u.name || u.username).map(u => ({ value: u.name || u.username, label: u.name || u.username }))} />
                      </Form.Item>
                    </InlineField>
                  </Col>
                  <Col xs={24} sm={8}>
                    <InlineField label="跟单员">
                      <Form.Item name="merchandiser" style={{ marginBottom: 0 }}>
                        <Select placeholder="选填" allowClear showSearch optionFilterProp="label" options={users.filter(u => u.name || u.username).map(u => ({ value: u.name || u.username, label: u.name || u.username }))} />
                      </Form.Item>
                    </InlineField>
                  </Col>
                </Row>
              </div>

              <div style={{ marginBottom: 12 }}>
                <div style={{ marginBottom: 8 }}>
                  <span style={{ fontWeight: 600 }}> 下单数量</span>
                </div>
                <MultiColorOrderEditor
                  availableColors={selectableColors}
                  availableSizes={selectableSizes}
                  orderLines={orderLines}
                  totalQuantity={totalOrderQuantity}
                  isMobile={isMobile}
                  onChange={setOrderLines}
                />
              </div>

              <OrderPricingMaterialPanel
                sizePriceLoading={sizePriceLoading}
                sizePriceCount={sizePriceRows.length}
                processBasedUnitPrice={processBasedUnitPrice}
                sizeBasedUnitPrice={sizeBasedUnitPrice}
                totalCostUnitPrice={totalCostUnitPrice}
                quotationUnitPrice={quotationUnitPrice}
                suggestedQuotationUnitPrice={suggestedQuotationUnitPrice}
                factoryMode={factoryMode}
                watchedPricingMode={watchedPricingMode}
                resolvedOrderUnitPrice={resolvedOrderUnitPrice}
                onPricingModeChange={() => setPricingModeTouched(true)}
                orchestration={orderOrchestration}
              />

              <OrderLearningInsightCard
                loading={orderLearningLoading}
                data={orderLearningRecommendation}
              />
            </div>
          </div>

          <div className="modal-sticky-footer">
            <Button onClick={closeDialog} disabled={submitLoading}>
              关闭
            </Button>
            <Button type="primary" onClick={handleSubmit} loading={submitLoading} disabled={!!createdOrder}>
              下单
            </Button>
          </div>

        </Form>
      </ResizableModal>

      <RemarkTimelineModal
        open={remarkModalOpen}
        onClose={() => setRemarkModalOpen(false)}
        targetType="style"
        targetNo={remarkStyleNo}
      />

      {/* 打印预览弹窗 - 使用通用打印组件 */}
      <StylePrintModal
        visible={printModalVisible}
        onClose={() => {
          setPrintModalVisible(false);
          setPrintingRecord(null);
        }}
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
    </Layout>
  );
};

export default OrderManagement;
