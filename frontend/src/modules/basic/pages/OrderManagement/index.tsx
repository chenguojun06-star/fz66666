import React, { useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Card, Col, Form, Input, Row, Select, Space, Tag, Tooltip } from 'antd';
import { UnifiedDatePicker } from '@/components/common/UnifiedDatePicker';
import { AppstoreOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { useSync } from '@/utils/syncManager';
import { createCardSpecFieldGroups } from '@/components/common/CardSizeQuantityFieldGroups';
import UniversalCardView from '@/components/common/UniversalCardView';
import StylePrintModal from '@/components/common/StylePrintModal';
import StandardPagination from '@/components/common/StandardPagination';
import SupplierNameTooltip from '@/components/common/SupplierNameTooltip';
import { usePersistentState } from '@/hooks/usePersistentState';

import dayjs from 'dayjs';
import Layout from '@/components/Layout';
import api, { parseProductionOrderLines } from '@/utils/api';
import { StyleBom, StyleInfo, StyleQueryParams } from '@/types/style';
import { Factory } from '@/types/system';
import { ProductionOrder } from '@/types/production';
import { formatDateTime } from '@/utils/datetime';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import { DEFAULT_PAGE_SIZE_OPTIONS, readPageSize, savePageSize } from '@/utils/pageSizeStore';
import RowActions from '@/components/common/RowActions';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { StyleAttachmentsButton, StyleCoverThumb } from '@/components/StyleAssets';
import StyleCoverGallery from '@/components/common/StyleCoverGallery';
import { getMaterialTypeCategory } from '@/utils/materialType';
import { CATEGORY_CODE_OPTIONS, normalizeCategoryQuery, toCategoryCn } from '@/utils/styleCategory';
import { useDictOptions } from '@/hooks/useDictOptions';
import { useViewport } from '@/utils/useViewport';
import { useCardGridLayout } from '@/hooks/useCardGridLayout';
import { templateLibraryApi } from '@/services/template/templateLibraryApi';
import { productionOrderApi, FactoryCapacityItem, intelligenceApi, DeliveryDateSuggestionResponse } from '@/services/production/productionApi';
import { SchedulingSuggestionResponse } from '@/services/intelligence/intelligenceApi';
import { generateUniqueId } from '@/utils/idGenerator';
import { getStyleCardSizeQuantityItems } from '@/utils/cardSizeQuantity';
import { getStyleSourceMeta, getStyleSourceText } from '@/utils/styleSource';
import OrderRankingDashboard from './components/OrderRankingDashboard';
import OrderFactorySelector from './components/OrderFactorySelector';
import InlineField from './components/InlineField';
import OrderLearningInsightCard from './components/OrderLearningInsightCard';
import MultiColorOrderEditor from './components/MultiColorOrderEditor';
import OrderPricingMaterialPanel from './components/OrderPricingMaterialPanel';
import OrderSidebarInsights from './components/OrderSidebarInsights';
import { buildOrderColorSummary, buildStyleSampleColorSummary } from './components/orderInfoSummaryOrchestrator';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import { computeReferenceKilograms } from '@/modules/production/pages/Production/MaterialPurchase/utils';
import StandardToolbar from '@/components/common/StandardToolbar';
import SupplierSelect from '@/components/common/SupplierSelect';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { organizationApi } from '@/services/system/organizationApi';
import StyleQuotePopover from './StyleQuotePopover';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';
import { OrderLine, PricingProcess, ProgressNode, defaultProgressNodes } from './types';
import { buildOrderQtyStats, calcBomRequirementQty, getMatchedOrderQty, normalizeMatchKey } from './utils/orderBomMetrics';
import { buildOrderSubmitPayload } from './utils/buildOrderSubmitPayload';
import { analyzeOrderOrchestration, computeProcessBasedUnitPrice, SizePriceRecord } from './utils/orderIntelligence';
import { orderLearningApi } from '@/services/intelligence/orderLearningApi';
import type { OrderLearningRecommendationResponse } from '@/services/intelligence/orderLearningApi';

const OrderManagement: React.FC = () => {
  const { modal, message } = App.useApp();
  const { options: categoryOptions } = useDictOptions('category', CATEGORY_CODE_OPTIONS);

  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const routeStyleNo = useMemo(() => {
    const raw = String((params as Record<string, unknown>)?.styleNo || '').trim();
    if (!raw) return '';
    try {
      return decodeURIComponent(raw).trim();
    } catch {
      // Intentionally empty
      // 忽略错误
      return raw;
    }
  }, [params]);
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
  const [styles, setStyles] = useState<StyleInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const [factories, setFactories] = useState<Factory[]>([]);
  const [factoryCapacities, setFactoryCapacities] = useState<FactoryCapacityItem[]>([]);

  const [factoryMode, setFactoryMode] = useState<'INTERNAL' | 'EXTERNAL'>('INTERNAL');
  const [departments, setDepartments] = useState<Array<{ id: string; nodeName: string; nodeType: string; pathNames: string }>>([]);
  const [users, setUsers] = useState<Array<{ id: number; name: string; username: string }>>([]);

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

  // ===== 详情页分页状态 =====
  const [detailQuery, setDetailQuery] = useState({ page: 1, pageSize: readPageSize(20) });
  const [detailTotal, setDetailTotal] = useState(0);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailRows, setDetailRows] = useState<any[]>([]);

  const [, setActiveTabKey] = usePersistentState<string>('order-management-active-tab', 'base');
  const [_bomLoading, setBomLoading] = useState(false);
  const [bomList, setBomList] = useState<StyleBom[]>([]);
  const [sizePriceRows, setSizePriceRows] = useState<SizePriceRecord[]>([]);
  const [sizePriceLoading, setSizePriceLoading] = useState(false);
  const [pricingModeTouched, setPricingModeTouched] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<any>(null);

  const [orderLines, setOrderLines] = useState<OrderLine[]>([]);

  const [progressNodes, setProgressNodes] = useState<ProgressNode[]>(defaultProgressNodes);
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const showSmartErrorNotice = useMemo(() => isSmartFeatureEnabled('smart.production.precheck.enabled'), []);

  const reportSmartError = (title: string, reason?: string, code?: string) => {
    if (!showSmartErrorNotice) return;
    setSmartError({ title, reason, code });
  };

  const modalInitialHeight = typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800;

  const normalizeSizeKey = (v: unknown) => String(v || '').trim().toUpperCase().replace(/\s+/g, '');
  const displaySizeLabel = (v: unknown) => normalizeSizeKey(v) || '-';
  const orderQtyStats = useMemo(() => buildOrderQtyStats(orderLines), [orderLines]);


  const fetchOrderDetailRows = async (styleNo: string) => {
    setDetailLoading(true);
    try {
      const response = await api.get<{ code: number; message: string; data: { records: ProductionOrder[]; total: number } }>('/production/order/list', {
        params: {
          page: detailQuery.page,
          pageSize: detailQuery.pageSize,
          styleNo,
        },
      });
      if (response.code !== 200) {
        reportSmartError('下单明细加载失败', response.message || '服务返回异常，请稍后重试', 'ORDER_DETAIL_LIST_FAILED');
        message.error(response.message || '获取下单明细失败');
        setDetailRows([]);
        setDetailTotal(0);
        return;
      }

      const orders = response?.data?.records || [];

      // 获取每个订单的裁剪数据
      const ordersWithCuttingData = await Promise.all(
        orders.map(async (order) => {
          try {
            const flowRes = await api.get<{ code: number; data: { cuttingBundles?: Array<{ size?: string; quantity?: number }> } }>(
              `/production/order/flow/${order.id}`
            );
            if (flowRes.code === 200) {
              return {
                ...order,
                cuttingBundles: flowRes.data?.cuttingBundles || [],
              };
            }
          } catch (e) {
            // 获取裁剪数据失败
          }
          return { ...order, cuttingBundles: [] };
        })
      );

      const rows: any[] = [];

      const list = Array.isArray(ordersWithCuttingData) ? [...ordersWithCuttingData] : [];
      list.sort((a: any, b: any) => {
        const ta = dayjs(a?.createTime);
        const tb = dayjs(b?.createTime);
        const va = ta.isValid() ? ta.valueOf() : 0;
        const vb = tb.isValid() ? tb.valueOf() : 0;
        return va - vb;
      });

      const pickOrdererName = (o: any) => {
        return (
          String(o?.orderOperatorName || '').trim() ||
          String(o?.createUserName || '').trim() ||
          String(o?.createByName || '').trim() ||
          String(o?.creatorName || '').trim() ||
          String(o?.operatorName || '').trim() ||
          '-'
        );
      };

      const joinUniq = (items: any[]) => {
        const set = new Set<string>();
        for (const it of items) {
          const t = String(it || '').trim();
          if (t) set.add(t);
        }
        return Array.from(set).join(',');
      };

      const detailSizes = ['S', 'M', 'L', 'XL', 'XXL'];

      const buildSizeQty = (lines: any[]) => {
        const sizeQty: Record<string, number> = {};
        detailSizes.forEach((s) => {
          sizeQty[s] = 0;
        });
        for (const l of lines) {
          const sizeRaw = String((l as Record<string, unknown>)?.size || '').trim();
          if (!sizeRaw) continue;
          const q = Number((l as Record<string, unknown>)?.quantity || 0) || 0;
          if (!q) continue;
          const matched = detailSizes.find((s) => normalizeMatchKey(s) === normalizeMatchKey(sizeRaw));
          if (!matched) continue;
          sizeQty[matched] = (sizeQty[matched] || 0) + q;
        }
        return sizeQty;
      };

      const buildCuttingSizeQty = (cuttingBundles: Array<{ size?: string; quantity?: number }>) => {
        const sizeQty: Record<string, number> = {};
        detailSizes.forEach((s) => {
          sizeQty[s] = 0;
        });
        for (const bundle of cuttingBundles) {
          const sizeRaw = String(bundle?.size || '').trim();
          if (!sizeRaw) continue;
          const q = Number(bundle?.quantity || 0) || 0;
          if (!q) continue;
          const matched = detailSizes.find((s) => normalizeMatchKey(s) === normalizeMatchKey(sizeRaw));
          if (!matched) continue;
          sizeQty[matched] = (sizeQty[matched] || 0) + q;
        }
        return sizeQty;
      };

      const pickCompletedQty = (o: any, fallbackOrderQty: number) => {
        const candidates = [
          (o as Record<string, unknown>)?.completedQuantity,
          (o as Record<string, unknown>)?.completedQty,
          (o as Record<string, unknown>)?.finishedQuantity,
          (o as Record<string, unknown>)?.finishQuantity,
          (o as Record<string, unknown>)?.actualQuantity,
          (o as Record<string, unknown>)?.warehousingQualifiedQuantity,
          (o as Record<string, unknown>)?.warehousingQuantity,
          (o as Record<string, unknown>)?.inStockQuantity,
        ];
        for (const c of candidates) {
          const n = Number(c);
          if (Number.isFinite(n) && n >= 0) return n;
        }
        const status = String((o as Record<string, unknown>)?.status || '').trim().toLowerCase();
        const closed = status === 'completed' || status === 'closed' || status === 'finished' || !!String((o as Record<string, unknown>)?.actualEndDate || '').trim();
        if (closed) {
          const orderQty = Number((o as Record<string, unknown>)?.orderQuantity);
          return Number.isFinite(orderQty) && orderQty >= 0 ? orderQty : fallbackOrderQty;
        }
        return 0;
      };

      const buildRow = (o: any, key: string, lines: any[], baseOverride?: Partial<any>) => {
        const base: any = {
          orderId: o?.id,
          orderNo: o?.orderNo,
          styleNo,
          orderOperatorName: pickOrdererName(o),
          orderTime: o?.createTime,
          completedTime: o?.actualEndDate,
          ...baseOverride,
        };

        const effectiveLines = lines.length ? lines : [{ color: '-', size: '-', quantity: 0 }];
        const sumQty = effectiveLines.reduce((acc, l) => acc + (Number((l as Record<string, unknown>)?.quantity || 0) || 0), 0);
        const colors = joinUniq(effectiveLines.map((l) => (l as Record<string, unknown>)?.color)) || '-';
        const sizeQty = buildSizeQty(effectiveLines);
        const cuttingSizeQty = buildCuttingSizeQty(o?.cuttingBundles || []);
        const completedQuantity = base?.completedQuantity != null ? (Number(base?.completedQuantity) || 0) : pickCompletedQty(o, sumQty);

        rows.push({
          key,
          ...base,
          color: base.color ?? colors,
          sizeQty,
          cuttingSizeQty,
          orderQuantity: sumQty,
          completedQuantity,
        });
      };

      for (const o of list) {
        const key = String(o?.id || o?.orderNo || '') ? `${String(o?.id || o?.orderNo)}-row` : `order-row-${generateUniqueId()}`;
        buildRow(o, key, parseProductionOrderLines(o));
      }

      setDetailRows(rows);
      setDetailTotal(Number(response?.data?.total || 0) || 0);
      if (showSmartErrorNotice) setSmartError(null);
    } catch (e: any) {
      reportSmartError('下单明细加载失败', e?.message || '网络异常或服务不可用，请稍后重试', 'ORDER_DETAIL_LIST_EXCEPTION');
      message.error(e?.message || '获取下单明细失败');
      setDetailRows([]);
      setDetailTotal(0);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    if (!routeStyleNo) return;
    fetchOrderDetailRows(routeStyleNo);
  }, [routeStyleNo, detailQuery.page, detailQuery.pageSize]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!routeStyleNo) return;
    const sn = String(routeStyleNo || '').trim();
    if (!sn) return;
    const id = window.setInterval(() => {
      fetchOrderDetailRows(sn);
    }, 10000);

    const onFocus = () => fetchOrderDetailRows(sn);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') fetchOrderDetailRows(sn);
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [routeStyleNo, detailQuery.page, detailQuery.pageSize]);

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

  const _bomColumns = [
    { title: '物料编码', dataIndex: 'materialCode', key: 'materialCode', width: 140 },
    { title: '物料名称', dataIndex: 'materialName', key: 'materialName', width: 180, ellipsis: true },
    { title: '颜色', dataIndex: 'color', key: 'color', width: 90 },
    { title: '规格', dataIndex: 'specification', key: 'specification', width: 140, ellipsis: true },
    { title: '尺码', dataIndex: 'size', key: 'size', width: 90 },
    { title: '单位', dataIndex: 'unit', key: 'unit', width: 90 },
    {
      title: '匹配订单数量',
      key: 'matchedQty',
      width: 130,
      align: 'right' as const,
      render: (_: any, record: StyleBom) => getMatchedQty((record as Record<string, unknown>).color, (record as Record<string, unknown>).size),
    },
    {
      title: '单件用量',
      key: 'usageAmount',
      width: 120,
      render: (_: any, record: StyleBom) => {
        const rawMap = (record as Record<string, unknown>).sizeUsageMap as string | undefined;
        if (rawMap) {
          const matchedQty = getMatchedQty(
            (record as Record<string, unknown>).color,
            (record as Record<string, unknown>).size
          );
          const loss = Number((record as Record<string, unknown>).lossRate) || 0;
          const divisor = matchedQty * (1 + loss / 100);
          if (divisor > 0) {
            const effectiveUnit = calcBomBudgetQty(record) / divisor;
            return (
              <span title="已配置码数用量，此处为加权平均值">
                {Number(effectiveUnit.toFixed(4))}<span style={{ color: 'var(--warning-color, #f7a600)', marginLeft: 2 }}></span>
              </span>
            );
          }
          return <span style={{ color: 'var(--neutral-text-light)' }}>按配比</span>;
        }
        return <span>{Number((record as Record<string, unknown>).usageAmount) || 0}</span>;
      },
    },
    { title: '损耗率(%)', dataIndex: 'lossRate', key: 'lossRate', width: 110 },
    {
      title: '需求数量(米)',
      key: 'budgetQty',
      width: 140,
      render: (_: any, record: StyleBom) => calcBomBudgetQty(record),
    },
    {
      title: '参考公斤数',
      key: 'referenceKg',
      width: 120,
      render: (_: any, record: StyleBom) => {
        const kg = calcBomReferenceKg(record);
        return kg == null ? '-' : `${kg} kg`;
      },
    },
    {
      title: '供应商',
      dataIndex: 'supplier',
      key: 'supplier',
      width: 140,
      ellipsis: true,
      render: (_: unknown, record: StyleBom) => (
        <SupplierNameTooltip
          name={record.supplier}
          contactPerson={record.supplierContactPerson}
          contactPhone={record.supplierContactPhone}
        />
      ),
    },
    { title: '单价', dataIndex: 'unitPrice', key: 'unitPrice', width: 100 },
    {
      title: '总价',
      key: 'totalPrice',
      width: 100,
      render: (_: any, record: StyleBom) => calcBomTotalPrice(record),
    },
  ];

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

  // 交货期智能建议
  const [deliverySuggestion, setDeliverySuggestion] = useState<DeliveryDateSuggestionResponse | null>(null);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [quoteReference, setQuoteReference] = useState<{ currentQuotation: number; totalCost: number; suggestedPrice: number } | null>(null);
  const quotationUnitPrice = Number(quoteReference?.currentQuotation || 0);
  const totalCostUnitPrice = Number(quoteReference?.totalCost || 0);
  const suggestedQuotationUnitPrice = Number(quoteReference?.suggestedPrice || 0);
  const [orderLearningLoading, setOrderLearningLoading] = useState(false);
  const [orderLearningRecommendation, setOrderLearningRecommendation] = useState<OrderLearningRecommendationResponse | null>(null);

  // AI 排产建议状态
  const [schedulingResult, setSchedulingResult] = useState<SchedulingSuggestionResponse | null>(null);
  const [schedulingLoading, setSchedulingLoading] = useState(false);

  const fetchDeliverySuggestion = React.useCallback(async (factoryName?: string, qty?: number) => {
    if (!factoryName && !qty) return;
    setSuggestionLoading(true);
    try {
      const res = await intelligenceApi.getDeliveryDateSuggestion(factoryName, qty);
      if ((res as any).code === 200 && (res as any).data) {
        setDeliverySuggestion((res as any).data as DeliveryDateSuggestionResponse);
      }
    } catch { /* 静默失败 */ } finally {
      setSuggestionLoading(false);
    }
  }, []);

  // 工厂或数量变化时自动重新计算交货期建议（effect 移至 totalOrderQuantity 声明之后）

  // 工厂或数量变化时自动重新计算建议（effect 移至 totalOrderQuantity 声明之后）

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

  const fetchSchedulingSuggestion = React.useCallback(async () => {
    const styleNo = selectedStyle?.styleNo || '';
    const qty = totalOrderQuantity;
    const deadline = form.getFieldValue('plannedEndDate');
    if (!qty || qty <= 0) {
      return;
    }
    const deadlineStr = deadline ? (deadline.format?.('YYYY-MM-DD') ?? String(deadline)) : '';
    const productCategory = form.getFieldValue('productCategory') || selectedStyle?.category || '';
    setSchedulingLoading(true);
    try {
      const res = await intelligenceApi.suggestScheduling({ styleNo, quantity: qty, deadline: deadlineStr, productCategory });
      if ((res as any).code === 200 && (res as any).data) {
        setSchedulingResult((res as any).data as SchedulingSuggestionResponse);
      }
    } catch { /* 静默失败 */ } finally {
      setSchedulingLoading(false);
    }
  }, [selectedStyle, totalOrderQuantity, form, message]);

  useEffect(() => {
    if (!visible || !selectedStyle?.styleNo || totalOrderQuantity <= 0) {
      return;
    }
    void fetchSchedulingSuggestion();
  }, [visible, selectedStyle?.styleNo, totalOrderQuantity, fetchSchedulingSuggestion]);

  useEffect(() => {
    if (!visible || !selectedStyle?.styleNo) {
      setQuoteReference(null);
      return;
    }
    let cancelled = false;
    Promise.all([
      intelligenceApi.getStyleQuoteSuggestion(selectedStyle.styleNo).catch(() => null),
      selectedStyle?.id ? api.get(`/style/quotation?styleId=${selectedStyle.id}`).catch(() => null) : Promise.resolve(null),
    ]).then(([quoteSuggestionRes, quotationRes]: any[]) => {
      if (cancelled) return;
      const suggestion = quoteSuggestionRes?.data || {};
      const quotation = quotationRes?.data || {};
      const derivedQuotationTotalCost = Number(quotation?.totalCost)
        || (Number(quotation?.materialCost || 0) + Number(quotation?.processCost || 0) + Number(quotation?.otherCost || 0))
        || 0;
      const fallbackTotalCost = Number(suggestion?.totalCost)
        || derivedQuotationTotalCost
        || Number((selectedStyle as any)?.totalCost)
        || 0;
      const fallbackQuotationPrice = Number(quotation?.totalPrice)
        || Number(suggestion?.currentQuotation)
        || Number((selectedStyle as any)?.totalPrice)
        || Number(selectedStyle?.price)
        || 0;
      setQuoteReference({
        currentQuotation: fallbackQuotationPrice,
        totalCost: fallbackTotalCost,
        suggestedPrice: Number(suggestion?.suggestedPrice) || 0,
      });
    }).catch(() => {
      if (!cancelled) setQuoteReference(null);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, selectedStyle]);

  const processBasedUnitPrice = useMemo(() => {
    const total = progressNodes.reduce((sum, node) => {
      const nodeTotal = (Array.isArray(node.processes) ? node.processes : []).reduce((nodeSum, process) => {
        return nodeSum + (Number(process?.unitPrice) || 0);
      }, 0);
      return sum + nodeTotal;
    }, 0);
    return Number(total.toFixed(2));
  }, [progressNodes]);

  const sizePriceBySize = useMemo(() => {
    const grouped = new Map<string, number>();
    for (const row of sizePriceRows) {
      const sizeKey = normalizeSizeKey(row.size);
      if (!sizeKey) continue;
      grouped.set(sizeKey, (grouped.get(sizeKey) || 0) + (Number(row.price) || 0));
    }
    return grouped;
  }, [normalizeSizeKey, sizePriceRows]);

  const sizeBasedUnitPrice = useMemo(() => {
    const effectiveLines = orderLines.filter((line) => (Number(line.quantity) || 0) > 0);
    const totalQty = effectiveLines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
    if (!totalQty) return 0;
    const totalAmount = effectiveLines.reduce((sum, line) => {
      const lineQty = Number(line.quantity) || 0;
      const linePrice = sizePriceBySize.get(normalizeSizeKey(line.size)) || 0;
      return sum + (linePrice * lineQty);
    }, 0);
    return Number((totalAmount / totalQty).toFixed(2));
  }, [normalizeSizeKey, orderLines, sizePriceBySize]);

  const resolvedOrderUnitPrice = useMemo(() => {
    if (watchedPricingMode === 'MANUAL') {
      return Number(watchedManualOrderUnitPrice.toFixed(2));
    }
    if (watchedPricingMode === 'COST') {
      return Number(totalCostUnitPrice.toFixed(2));
    }
    if (watchedPricingMode === 'QUOTE') {
      return Number(quotationUnitPrice.toFixed(2));
    }
    if (watchedPricingMode === 'SIZE') {
      return Number(sizeBasedUnitPrice.toFixed(2));
    }
    return Number(processBasedUnitPrice.toFixed(2));
  }, [processBasedUnitPrice, quotationUnitPrice, sizeBasedUnitPrice, totalCostUnitPrice, watchedManualOrderUnitPrice, watchedPricingMode]);

  const lastOrderLearningRequestKeyRef = useRef('');

  useEffect(() => {
    if (!visible || !selectedStyle?.styleNo) {
      lastOrderLearningRequestKeyRef.current = '';
      setOrderLearningRecommendation(null);
      return;
    }
    const requestKey = JSON.stringify({
      styleNo: selectedStyle.styleNo,
      orderQuantity: totalOrderQuantity || null,
      factoryMode: factoryMode || null,
      pricingMode: watchedPricingMode || null,
      currentUnitPrice: resolvedOrderUnitPrice || null,
    });
    if (lastOrderLearningRequestKeyRef.current === requestKey) {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      lastOrderLearningRequestKeyRef.current = requestKey;
      setOrderLearningLoading(true);
      orderLearningApi.getRecommendation({
        styleNo: selectedStyle.styleNo,
        orderQuantity: totalOrderQuantity || undefined,
        factoryMode,
        pricingMode: watchedPricingMode,
        currentUnitPrice: resolvedOrderUnitPrice || undefined,
      }).then((res: any) => {
        if (!cancelled) {
          setOrderLearningRecommendation(res?.data || null);
        }
      }).catch(() => {
        if (!cancelled) {
          setOrderLearningRecommendation(null);
        }
      }).finally(() => {
        if (!cancelled) {
          setOrderLearningLoading(false);
        }
      });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [visible, selectedStyle?.styleNo, totalOrderQuantity, factoryMode, watchedPricingMode, resolvedOrderUnitPrice]);

  const preferredPricingMode = useMemo<'PROCESS' | 'SIZE' | 'COST' | 'QUOTE' | 'MANUAL'>(() => {
    if (factoryMode === 'EXTERNAL' && totalCostUnitPrice > 0) {
      return 'COST';
    }
    if (processBasedUnitPrice > 0) {
      return 'PROCESS';
    }
    if (quotationUnitPrice > 0) {
      return 'QUOTE';
    }
    if (totalCostUnitPrice > 0) {
      return 'COST';
    }
    if (sizeBasedUnitPrice > 0) {
      return 'SIZE';
    }
    return 'MANUAL';
  }, [factoryMode, processBasedUnitPrice, quotationUnitPrice, sizeBasedUnitPrice, totalCostUnitPrice]);

  useEffect(() => {
    if (!visible || pricingModeTouched) {
      return;
    }
    form.setFieldValue('pricingMode', preferredPricingMode);
  }, [form, preferredPricingMode, pricingModeTouched, visible]);

  const schedulingPlans = schedulingResult?.plans || [];

  // 工厂或数量变化时自动重新计算交货期建议
  useEffect(() => {
    if (!selectedFactoryStat || !totalOrderQuantity) {
      setDeliverySuggestion(null);
      return;
    }
    fetchDeliverySuggestion(selectedFactoryStat.factoryName, totalOrderQuantity);
  }, [selectedFactoryStat?.factoryName, totalOrderQuantity]);

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

  const _orderSummary = useMemo(() => buildOrderColorSummary(orderLines), [orderLines]);
  const _styleSampleSummary = useMemo(() => buildStyleSampleColorSummary({
    sizeColorConfig: (selectedStyle as any)?.sizeColorConfig,
    fallbackSizeText: selectedStyle?.size,
    fallbackColorText: selectedStyle?.color,
    sampleQuantity: (selectedStyle as any)?.sampleQuantity,
  }), [(selectedStyle as any)?.sampleQuantity, selectedStyle?.color, selectedStyle?.size, (selectedStyle as any)?.sizeColorConfig]);

  useEffect(() => {
    form.setFieldsValue({ orderQuantity: totalOrderQuantity });
  }, [form, totalOrderQuantity]);

  const fetchStyles = async () => {
    setLoading(true);
    try {
      const response = await api.get<{ code: number; message: string; data: { records: StyleInfo[]; total: number } }>('/style/info/list', { params: queryParams });
      if (response.code === 200) {
        setStyles(response.data.records || []);
        setTotal(response.data.total || 0);
        if (showSmartErrorNotice) setSmartError(null);
      } else {
        reportSmartError('款号列表加载失败', response.message || '服务返回异常，请稍后重试', 'ORDER_STYLE_LIST_FAILED');
        message.error(response.message || '获取款号列表失败');
      }
    } catch (error: any) {
      reportSmartError('款号列表加载失败', error?.message || '网络异常或服务不可用，请稍后重试', 'ORDER_STYLE_LIST_EXCEPTION');
      message.error(error?.message || '获取款号列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchFactories = async () => {
    try {
      const response = await api.get<{ code: number; data: { records: Factory[] } }>('/system/factory/list', { params: { page: 1, pageSize: 1000 } });
      if (response.code === 200) {
        setFactories(response.data.records || []);
      }
    } catch {
      // Intentionally empty
      // 忽略错误
      setFactories([]);
    }
  };

  const fetchDepartments = async () => {
    try {
      const res = await api.get<{ code: number; data: Array<{ id: string; nodeName: string; nodeType: string; pathNames: string }> }>('/system/organization/departments');
      if (res.code === 200) {
        setDepartments(
          (res.data || [])
            .filter((d: any) => d.nodeType === 'DEPARTMENT')
            // 只显示生产相关部门（节点名或完整路径含"生产"）
            .filter((d: any) => {
              const name = (d.nodeName || '') as string;
              const path = (d.pathNames || '') as string;
              return name.includes('生产') || path.includes('生产');
            })
        );
      }
    } catch {
      setDepartments([]);
    }
  };



  const fetchUsers = async () => {
    try {
      // 优先从组织架构加载（含真实姓名），fallback 到系统用户列表
      const orgUsers = await organizationApi.assignableUsers();
      if (orgUsers.length > 0) {
        const mapped = orgUsers
          .filter(u => u.name || u.username)
          .map(u => ({ id: Number(u.id) || 0, name: u.name || u.username, username: u.username }));
        // 按 name 去重
        const seen = new Set<string>();
        setUsers(mapped.filter(u => {
          if (seen.has(u.name)) return false;
          seen.add(u.name);
          return true;
        }));
        return;
      }
    } catch { /* 组织成员加载失败，回退到用户列表 */ }
    try {
      const response = await api.get<{ code: number; data: { records: Array<{ id: number; name: string; username: string }> } }>('/system/user/list', { params: { page: 1, pageSize: 1000, status: 'active' } });
      if (response.code === 200) {
        setUsers(response.data.records || []);
      }
    } catch {
      setUsers([]);
    }
  };

  useEffect(() => {
    fetchStyles();
  }, [queryParams]);

  // 实时同步：60秒自动轮询更新款式列表
  useSync(
    'order-management-styles',
    async () => {
      try {
        const response = await api.get<{ code: number; data: { records: StyleInfo[]; total: number } }>('/style/info/list', { params: queryParams });
        if (response.code === 200) {
          return {
            records: response.data.records || [],
            total: response.data.total || 0
          };
        }
        return null;
      } catch (error) {
        console.error('[实时同步] 获取款式列表失败', error);
        return null;
      }
    },
    (newData, oldData) => {
      if (oldData !== null && newData) {
        setStyles(newData.records);
        setTotal(newData.total);
      }
    },
    {
      interval: 60000,
      enabled: !loading && !visible,
      pauseOnHidden: true,
      onError: (error) => console.error('[实时同步] 订单管理款式同步错误', error)
    }
  );

  useEffect(() => {
    fetchFactories();
    fetchUsers();
    void fetchDepartments();
    // 拉取工厂产能（用于下单选厂时显示负荷）
    productionOrderApi.getFactoryCapacity().then(res => {
      if (res?.data) setFactoryCapacities(res.data);
    }).catch(() => {/* 静默失败，不影响主流程 */});
  }, []);

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
        message.error('下单单价必须大于0');
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

  const columns = [
    {
      title: '图片',
      dataIndex: 'cover',
      key: 'cover',
      width: 72,
      render: (_: any, record: StyleInfo) => (
        <StyleCoverThumb styleId={(record as any).id} styleNo={record.styleNo} src={(record as any).cover || null} />
      )
    },
    {
      title: '款号',
      dataIndex: 'styleNo',
      key: 'styleNo',
      width: 140,
      render: (_: any, record: StyleInfo) => (
        <a
          style={{ cursor: 'pointer' }}
          onClick={() => {
            const sn = String((record as Record<string, unknown>)?.styleNo || '').trim();
            if (!sn) return;
            navigate(`/order-management/${encodeURIComponent(sn)}`);
          }}
        >
          {record.styleNo}
        </a>
      ),
    },
    { title: 'SKC', dataIndex: 'skc', key: 'skc', width: 140, render: (v: any) => v || '-' },
    { title: '款名', dataIndex: 'styleName', key: 'styleName', ellipsis: true },
    {
      title: '品类',
      dataIndex: 'category',
      key: 'category',
      width: 120,
      render: (v: unknown) => toCategoryCn(v),
    },
    {
      title: '来源',
      key: 'developmentSourceType',
      width: 150,
      render: (_: unknown, record: StyleInfo) => {
        const source = getStyleSourceMeta(record);
        return <Tag color={source.color}>{source.label}</Tag>;
      },
    },
    {
      title: '下单次数',
      dataIndex: 'orderCount',
      key: 'orderCount',
      width: 110,
      render: (v: unknown) => Number(v) || 0,
    },
    {
      title: '最近下单',
      dataIndex: 'latestOrderTime',
      key: 'latestOrderTime',
      width: 160,
      render: (v: string) => v ? formatDateTime(v) : '-',
    },
    {
      title: '下单人',
      dataIndex: 'latestOrderCreator',
      key: 'latestOrderCreator',
      width: 100,
      render: (v: string) => v || '-',
    },
    {
      title: '是否下单',
      key: 'hasOrder',
      width: 100,
      render: (_: any, record: StyleInfo) => {
        const c = Number((record as Record<string, unknown>)?.orderCount || 0) || 0;
        return c > 0 ? <Tag color="green">有</Tag> : <Tag>无</Tag>;
      },
    },
    {
      title: '附件',
      key: 'attachments',
      width: 100,
      render: (_: any, record: StyleInfo) => (
        <StyleAttachmentsButton
          styleId={(record as any).id}
          styleNo={record.styleNo}
          modalTitle={`纸样附件（${record.styleNo}）`}
          buttonText="附件"
        />
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_: any, record: StyleInfo) => (
        <RowActions
          actions={[
            {
              key: 'print',
              label: '打印',
              title: '打印',
              onClick: () => {
                setPrintingRecord(record);
                setPrintModalVisible(true);
              },
            },
            {
              key: 'create',
              label: '下单',
              title: '下单',
              onClick: () => openCreate(record),
              primary: true,
            },
          ]}
        />
      )
    }
  ];

  if (routeStyleNo) {
    return (
      <Layout>
        <Card className="page-card">
          {showSmartErrorNotice && smartError ? (
            <Card size="small" style={{ marginBottom: 12 }}>
              <SmartErrorNotice error={smartError} onFix={() => { void fetchOrderDetailRows(routeStyleNo); }} />
            </Card>
          ) : null}
          <div className="page-header">
            <h2 className="page-title">下单明细（{routeStyleNo}）</h2>
            <Space>
              <Button onClick={() => fetchOrderDetailRows(routeStyleNo)} loading={detailLoading}>刷新</Button>
              <Button onClick={() => navigate('/order-management')}>返回</Button>
            </Space>
          </div>

          <ResizableTable
            rowKey={(r) => String((r as Record<string, unknown>).key)}
            loading={detailLoading}
            dataSource={detailRows}
            style={{ color: 'var(--neutral-text)' }}
            stickyHeader
            scroll={{ x: 'max-content' }}
            size={isMobile ? 'small' : 'middle'}
            pagination={{
              current: detailQuery.page,
              pageSize: detailQuery.pageSize,
              total: detailTotal,
              showTotal: (total) => `共 ${total} 条`,
              showSizeChanger: true,
              pageSizeOptions: [...DEFAULT_PAGE_SIZE_OPTIONS],
              onChange: (page, pageSize) => setDetailQuery({ page, pageSize }),
            }}
            columns={[
              { title: <span style={{ color: 'var(--neutral-text)' }}>订单号</span>, dataIndex: 'orderNo', key: 'orderNo', width: 150 },
              { title: <span style={{ color: 'var(--neutral-text)' }}>款号</span>, dataIndex: 'styleNo', key: 'styleNo', width: 140 },
              { title: <span style={{ color: 'var(--neutral-text)' }}>颜色</span>, dataIndex: 'color', key: 'color', width: 140 },
              { title: <span style={{ color: 'var(--neutral-text)' }}>S</span>, dataIndex: ['sizeQty', 'S'], key: 'size_S', width: 90, align: 'right', render: (v: unknown) => Number(v) || 0 },
              { title: <span style={{ color: 'var(--neutral-text)' }}>M</span>, dataIndex: ['sizeQty', 'M'], key: 'size_M', width: 90, align: 'right', render: (v: unknown) => Number(v) || 0 },
              { title: <span style={{ color: 'var(--neutral-text)' }}>L</span>, dataIndex: ['sizeQty', 'L'], key: 'size_L', width: 90, align: 'right', render: (v: unknown) => Number(v) || 0 },
              { title: <span style={{ color: 'var(--neutral-text)' }}>XL</span>, dataIndex: ['sizeQty', 'XL'], key: 'size_XL', width: 90, align: 'right', render: (v: unknown) => Number(v) || 0 },
              { title: <span style={{ color: 'var(--neutral-text)' }}>XXL</span>, dataIndex: ['sizeQty', 'XXL'], key: 'size_XXL', width: 90, align: 'right', render: (v: unknown) => Number(v) || 0 },
              { title: <span style={{ color: 'var(--neutral-text)' }}>裁剪S</span>, dataIndex: ['cuttingSizeQty', 'S'], key: 'cutting_S', width: 90, align: 'right', render: (v: unknown) => <span style={{ color: 'var(--color-success)' }}>{Number(v) || 0}</span> },
              { title: <span style={{ color: 'var(--neutral-text)' }}>裁剪M</span>, dataIndex: ['cuttingSizeQty', 'M'], key: 'cutting_M', width: 90, align: 'right', render: (v: unknown) => <span style={{ color: 'var(--color-success)' }}>{Number(v) || 0}</span> },
              { title: <span style={{ color: 'var(--neutral-text)' }}>裁剪L</span>, dataIndex: ['cuttingSizeQty', 'L'], key: 'cutting_L', width: 90, align: 'right', render: (v: unknown) => <span style={{ color: 'var(--color-success)' }}>{Number(v) || 0}</span> },
              { title: <span style={{ color: 'var(--neutral-text)' }}>裁剪XL</span>, dataIndex: ['cuttingSizeQty', 'XL'], key: 'cutting_XL', width: 90, align: 'right', render: (v: unknown) => <span style={{ color: 'var(--color-success)' }}>{Number(v) || 0}</span> },
              { title: <span style={{ color: 'var(--neutral-text)' }}>裁剪XXL</span>, dataIndex: ['cuttingSizeQty', 'XXL'], key: 'cutting_XXL', width: 90, align: 'right', render: (v: unknown) => <span style={{ color: 'var(--color-success)' }}>{Number(v) || 0}</span> },
              { title: <span style={{ color: 'var(--neutral-text)' }}>下单数</span>, dataIndex: 'orderQuantity', key: 'orderQuantity', width: 110, align: 'right', render: (v: unknown) => Number(v) || 0 },
              { title: <span style={{ color: 'var(--neutral-text)' }}>完成数</span>, dataIndex: 'completedQuantity', key: 'completedQuantity', width: 110, align: 'right', render: (v: unknown) => Number(v) || 0 },
              { title: <span style={{ color: 'var(--neutral-text)' }}>下单人</span>, dataIndex: 'orderOperatorName', key: 'orderOperatorName', width: 140 },
              { title: <span style={{ color: 'var(--neutral-text)' }}>下单时间</span>, dataIndex: 'orderTime', key: 'orderTime', width: 170, render: (v: unknown) => formatDateTime(v) },
              { title: <span style={{ color: 'var(--neutral-text)' }}>完成时间</span>, dataIndex: 'completedTime', key: 'completedTime', width: 170, render: (v: unknown) => formatDateTime(v) },
            ] as any}
          />
        </Card>
      </Layout>
    );
  }

  return (
    <Layout>
      <Card className="page-card">
        {showSmartErrorNotice && smartError ? (
          <Card size="small" style={{ marginBottom: 12 }}>
            <SmartErrorNotice error={smartError} onFix={fetchStyles} />
          </Card>
        ) : null}
        <div className="page-header">
          <h2 className="page-title">下单管理</h2>
        </div>

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
      </Card>

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
