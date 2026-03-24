import React, { useEffect, useMemo, useState } from 'react';
import { App, AutoComplete, Button, Card, Col, Form, Input, InputNumber, Pagination, Row, Segmented, Select, Space, Tabs, Tag, Tooltip } from 'antd';
import { UnifiedDatePicker } from '@/components/common/UnifiedDatePicker';
import { QuestionCircleOutlined, AppstoreOutlined, UnorderedListOutlined, BulbOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useSync } from '@/utils/syncManager';
import UniversalCardView from '@/components/common/UniversalCardView';
import StylePrintModal from '@/components/common/StylePrintModal';

import dayjs from 'dayjs';
import Layout from '@/components/Layout';
import api, { parseProductionOrderLines } from '@/utils/api';
import { StyleBom, StyleInfo, StyleQueryParams } from '@/types/style';
import { Factory } from '@/types/system';
import { ProductionOrder } from '@/types/production';
import { formatDateTime } from '@/utils/datetime';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import { readPageSize } from '@/utils/pageSizeStore';
import RowActions from '@/components/common/RowActions';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { StyleAttachmentsButton, StyleCoverThumb } from '@/components/StyleAssets';
import { getMaterialTypeCategory } from '@/utils/materialType';
import { CATEGORY_CODE_OPTIONS, normalizeCategoryQuery, toCategoryCn } from '@/utils/styleCategory';
import { useDictOptions } from '@/hooks/useDictOptions';
import { useViewport } from '@/utils/useViewport';
import { useCardGridLayout } from '@/hooks/useCardGridLayout';
import { templateLibraryApi } from '@/services/template/templateLibraryApi';
import { productionOrderApi, FactoryCapacityItem, intelligenceApi, DeliveryDateSuggestionResponse } from '@/services/production/productionApi';
import { SchedulingSuggestionResponse, SchedulePlan } from '@/services/intelligence/intelligenceApi';
import { generateUniqueId } from '@/utils/idGenerator';
import { getStyleSourceMeta, getStyleSourceText } from '@/utils/styleSource';
import OrderRankingDashboard from './components/OrderRankingDashboard';
import SmartStyleInsightCard from './components/SmartStyleInsightCard';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import StandardToolbar from '@/components/common/StandardToolbar';
import SupplierSelect from '@/components/common/SupplierSelect';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { organizationApi } from '@/services/system/organizationApi';
import StyleQuotePopover from './StyleQuotePopover';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';
import { OrderLine, PricingProcess, ProgressNode, defaultProgressNodes } from './types';

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
  const { isMobile, isTablet, modalWidth } = useViewport();
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
  const [viewMode, setViewMode] = useState<'table' | 'card'>(() => {
    const saved = localStorage.getItem('viewMode_orderManagement');
    return saved === 'card' ? 'card' : 'table';
  });

  // ===== 打印弹窗状态 =====
  const [printModalVisible, setPrintModalVisible] = useState(false);
  const [printingRecord, setPrintingRecord] = useState<StyleInfo | null>(null);

  // ===== 详情页分页状态 =====
  const [detailQuery, setDetailQuery] = useState({ page: 1, pageSize: readPageSize(20) });
  const [detailTotal, setDetailTotal] = useState(0);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailRows, setDetailRows] = useState<any[]>([]);

  const [activeTabKey, setActiveTabKey] = useState('base');
  const [bomLoading, setBomLoading] = useState(false);
  const [bomList, setBomList] = useState<StyleBom[]>([]);
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

  const normalizeMatchKey = (v: unknown) => String(v || '').trim().replace(/\s+/g, ' ').toLowerCase();

  const buildOptionSet = (raw: any) => {
    const list = splitOptions(String(raw || '')).map(normalizeMatchKey).filter(Boolean);
    return list.length ? new Set(list) : null;
  };

  const orderQtyStats = useMemo(() => {
    const byColor = new Map<string, number>();
    const bySize = new Map<string, number>();
    const byColorSize = new Map<string, number>();
    let total = 0;

    for (const l of orderLines) {
      const c = normalizeMatchKey(l.color);
      const s = normalizeMatchKey(l.size);
      const q = Number(l.quantity) || 0;
      if (!q) continue;
      total += q;

      if (c) byColor.set(c, (byColor.get(c) || 0) + q);
      if (s) bySize.set(s, (bySize.get(s) || 0) + q);
      if (c && s) {
        const key = `${c}|${s}`;
        byColorSize.set(key, (byColorSize.get(key) || 0) + q);
      }
    }

    return { total, byColor, bySize, byColorSize };
  }, [orderLines]);


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
    const { total, byColor, bySize, byColorSize } = orderQtyStats;

    const intersect = (source: Set<string> | null, allowed: Iterable<string>) => {
      if (!source) return null;
      const allowedSet = new Set<string>();
      for (const a of allowed) allowedSet.add(a);
      const next = new Set<string>();
      for (const v of source) {
        if (allowedSet.has(v)) next.add(v);
      }
      return next.size ? next : null;
    };

    let colorSet = buildOptionSet(colorRaw);
    let sizeSet = buildOptionSet(sizeRaw);

    colorSet = intersect(colorSet, byColor.keys());
    sizeSet = intersect(sizeSet, bySize.keys());

    if (!colorSet && !sizeSet) return total;

    if (colorSet && !sizeSet) {
      let sum = 0;
      for (const c of colorSet) sum += byColor.get(c) || 0;
      return sum;
    }

    if (!colorSet && sizeSet) {
      let sum = 0;
      for (const s of sizeSet) sum += bySize.get(s) || 0;
      return sum;
    }

    let sum = 0;
    for (const c of colorSet!) {
      for (const s of sizeSet!) {
        sum += byColorSize.get(`${c}|${s}`) || 0;
      }
    }
    return sum;
  };

  const calcBomBudgetQty = (record: StyleBom) => {
    const loss = Number((record as Record<string, unknown>).lossRate) || 0;
    const rawMap = (record as Record<string, unknown>).sizeUsageMap as string | undefined;
    // 优先使用码数用量配比（来自纸样设置），按每个码分别匹配订单数量
    if (rawMap) {
      try {
        const usageMap = JSON.parse(rawMap) as Record<string, number>;
        const { byColorSize, bySize: bySizeMap, byColor } = orderQtyStats;
        const colorRaw = (record as Record<string, unknown>).color;
        // 预判BOM颜色是否存在于订单颜色集中：
        // 若不存在（如白色里料配蓝色外套），说明是辅料自身颜色，应忽略颜色差异、按码数全量匹配
        const colorOpts = colorRaw ? buildOptionSet(colorRaw) : null;
        const bomColorInOrder = colorOpts ? Array.from(colorOpts).some(c => byColor.has(c)) : false;
        let total = 0;
        for (const [szRaw, usage] of Object.entries(usageMap)) {
          // ⚠️ 必须normalize：byColorSize/bySize的key全部是小写，JSON里的码数key可能是"XS"大写
          const sz = normalizeMatchKey(szRaw);
          let qty = 0;
          if (colorOpts && bomColorInOrder) {
            // BOM颜色存在于订单颜色中（如蓝色面料只匹配蓝色订单），精确颜色+码数匹配
            for (const c of colorOpts) qty += byColorSize.get(`${c}|${sz}`) || 0;
          } else {
            // BOM颜色不在订单颜色中（里料/辅料颜色与成品颜色不同），或无颜色约束，按码数汇总
            qty = bySizeMap.get(sz) || 0;
          }
          total += usage * (1 + loss / 100) * qty;
        }
        if (total > 0 && Number.isFinite(total)) return Number(total.toFixed(4));
      } catch { /* fall through */ }
    }
    // 兜底：使用平均单件用量
    const matchedQty = getMatchedQty((record as Record<string, unknown>).color, (record as Record<string, unknown>).size);
    const usage = Number((record as Record<string, unknown>).usageAmount) || 0;
    const required = usage * (1 + loss / 100) * matchedQty;
    if (!Number.isFinite(required)) return 0;
    return Number(required.toFixed(4));
  };

  const calcBomTotalPrice = (record: StyleBom) => {
    const unitPrice = Number((record as Record<string, unknown>).unitPrice) || 0;
    const budgetQty = calcBomBudgetQty(record);
    if (!Number.isFinite(budgetQty) || !Number.isFinite(unitPrice)) return 0;
    return Number((budgetQty * unitPrice).toFixed(2));
  };

  const bomColumns = [
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
                {Number(effectiveUnit.toFixed(4))}<span style={{ color: 'var(--warning-color, #f7a600)', marginLeft: 2 }}>★</span>
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
      title: '预算采购数量',
      key: 'budgetQty',
      width: 140,
      render: (_: any, record: StyleBom) => calcBomBudgetQty(record),
    },
    { title: '供应商', dataIndex: 'supplier', key: 'supplier', width: 140, ellipsis: true },
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

  const _watchedOrderNo = Form.useWatch('orderNo', form) as string | undefined;
  const watchedFactoryId = Form.useWatch('factoryId', form) as string | undefined;

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

  // AI 排产建议状态
  const [schedulingResult, setSchedulingResult] = useState<SchedulingSuggestionResponse | null>(null);
  const [schedulingLoading, setSchedulingLoading] = useState(false);
  const [showSchedulingPanel, setShowSchedulingPanel] = useState(false);

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

  const buildCommonFiveSizes = () => {
    const preset = ['S', 'M', 'L', 'XL', 'XXL'];
    const fromStyle = selectableSizes.filter(Boolean);
    const unique: string[] = [];
    const seen = new Set<string>();
    const push = (v: string) => {
      const s = String(v || '').trim();
      if (!s) return;
      const key = normalizeMatchKey(s);
      if (seen.has(key)) return;
      seen.add(key);
      unique.push(s);
    };

    fromStyle.forEach(push);
    preset.forEach(push);
    return unique.slice(0, 5);
  };

  const importCommonSizeTemplate = () => {
    const sizes = buildCommonFiveSizes();
    if (!sizes.length) {
      message.error('未找到可导入的尺码');
      return;
    }

    const colorFromLine = String(orderLines?.[0]?.color || '').trim();
    const colorFromStyle = splitOptions(String(selectedStyle?.color || ''))[0] || '';
    const color = colorFromLine || colorFromStyle;
    const colorKey = normalizeMatchKey(color);

    setOrderLines((prev) => {
      const existingSizeKeys = new Set(
        prev
          .filter((l) => normalizeMatchKey(l.color) === colorKey)
          .map((l) => normalizeMatchKey(l.size))
          .filter(Boolean)
      );

      const additions = sizes
        .filter((s) => !existingSizeKeys.has(normalizeMatchKey(s)))
        .map((s, idx) => ({
          id: String(Date.now() + idx),
          color,
          size: s,
          quantity: 1,
        }));

      if (!additions.length) {
        return prev;
      }

      return [...prev, ...additions];
    });
  };

  const totalOrderQuantity = useMemo(() => {
    return orderLines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
  }, [orderLines]);

  const fetchSchedulingSuggestion = React.useCallback(async () => {
    const styleNo = selectedStyle?.styleNo || '';
    const qty = totalOrderQuantity;
    const deadline = form.getFieldValue('plannedEndDate');
    if (!qty || qty <= 0) {
      message.warning('请先填写订单数量');
      return;
    }
    const deadlineStr = deadline ? (deadline.format?.('YYYY-MM-DD') ?? String(deadline)) : '';
    const productCategory = form.getFieldValue('productCategory') || selectedStyle?.category || '';
    setSchedulingLoading(true);
    setShowSchedulingPanel(true);
    try {
      const res = await intelligenceApi.suggestScheduling({ styleNo, quantity: qty, deadline: deadlineStr, productCategory });
      if ((res as any).code === 200 && (res as any).data) {
        setSchedulingResult((res as any).data as SchedulingSuggestionResponse);
      }
    } catch { /* 静默失败 */ } finally {
      setSchedulingLoading(false);
    }
  }, [selectedStyle, totalOrderQuantity, form, message]);

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
        width: '30vw',
        title: '下单提醒',
        content: '请确认单价维护已完成。',
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

  const setTotalQuantity = (value: number) => {
    const nextQty = Number(value) || 0;
    if (orderLines.length === 1) {
      setOrderLines([{ ...orderLines[0], quantity: nextQty }]);
    }
  };

  const orderLineColors = useMemo(() => {
    const set = new Set(orderLines.map(l => (l.color || '').trim()).filter(Boolean));
    return Array.from(set);
  }, [orderLines]);

  const orderLineSizes = useMemo(() => {
    const set = new Set(orderLines.map(l => (l.size || '').trim()).filter(Boolean));
    return Array.from(set);
  }, [orderLines]);

  const styleColorText = useMemo(() => {
    const raw = String(selectedStyle?.color || '').trim();
    if (raw) {
      return splitOptions(raw).join('、') || raw;
    }
    const parsed = parseSizeColorConfig((selectedStyle as any)?.sizeColorConfig);
    return parsed.colors.length ? parsed.colors.join('、') : '-';
  }, [selectedStyle?.color, (selectedStyle as any)?.sizeColorConfig]);

  const styleSizeText = useMemo(() => {
    const raw = String(selectedStyle?.size || '').trim();
    if (raw) {
      return splitOptions(raw).join('、') || raw;
    }
    const parsed = parseSizeColorConfig((selectedStyle as any)?.sizeColorConfig);
    return parsed.sizes.length ? parsed.sizes.join('、') : '-';
  }, [selectedStyle?.size, (selectedStyle as any)?.sizeColorConfig]);

  const orderColorText = useMemo(() => {
    return orderLineColors.length ? orderLineColors.join('、') : '-';
  }, [orderLineColors]);

  const orderSizeText = useMemo(() => {
    return orderLineSizes.length ? orderLineSizes.join('、') : '-';
  }, [orderLineSizes]);

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
      const response = await api.get<{ code: number; data: { records: Array<{ id: number; name: string; username: string }> } }>('/system/user/list', { params: { page: 1, pageSize: 1000, status: 'enabled' } });
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
    const fromColor = splitOptions(selectedStyle?.color);
    if (fromColor.length) return fromColor;
    return parseSizeColorConfig((selectedStyle as any)?.sizeColorConfig).colors;
  }, [selectedStyle?.color, (selectedStyle as any)?.sizeColorConfig]);

  const selectableSizes = useMemo(() => {
    const fromSize = splitOptions(selectedStyle?.size);
    if (fromSize.length) return fromSize;
    return parseSizeColorConfig((selectedStyle as any)?.sizeColorConfig).sizes;
  }, [selectedStyle?.size, (selectedStyle as any)?.sizeColorConfig]);

  // 智能添加订单行，自动填充颜色和尺码
  const addOrderLine = () => {
    let nextColor = selectableColors[0] || '';
    let nextSize = '';

    // 如果已有订单行，智能填充下一行
    if (orderLines.length > 0) {
      const lastLine = orderLines[orderLines.length - 1];
      nextColor = lastLine.color; // 自动填充上一行的颜色

      // 查找上一行尺码在可选尺码中的索引
      const lastSizeIndex = selectableSizes.indexOf(lastLine.size);
      // 自动循环填充下一个尺码
      nextSize = selectableSizes[(lastSizeIndex + 1) % selectableSizes.length] || '';
    } else {
      // 第一行，使用默认值
      nextSize = selectableSizes[0] || '';
    }

    const next: OrderLine = {
      id: `${Date.now()}-${Math.random()}`,
      color: nextColor,
      size: nextSize,
      quantity: 1,
    };
    setOrderLines(prev => [...prev, next]);
  };

  const updateOrderLine = (id: string, patch: Partial<OrderLine>) => {
    setOrderLines(prev => prev.map(l => (l.id === id ? { ...l, ...patch } : l)));
  };

  const removeOrderLine = (id: string) => {
    setOrderLines(prev => prev.filter(l => l.id !== id));
  };

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

  const openCreate = (style: StyleInfo) => {
    setSelectedStyle(style);
    setVisible(true);
    setActiveTabKey('base');
    setCreatedOrder(null);
    setProgressNodes(defaultProgressNodes);
    void loadProgressNodesForStyle(String(style.styleNo || '').trim());
    if (style.id !== undefined && style.id !== null && String(style.id)) {
      fetchBom(style.id);
    } else {
      setBomList([]);
    }

    const parsedConfig = parseSizeColorConfig((style as any)?.sizeColorConfig);
    const initColor = splitOptions(style.color)[0] || style.color || parsedConfig.colors[0] || '';
    const initSize = splitOptions(style.size)[0] || style.size || parsedConfig.sizes[0] || '';
    setOrderLines([
      {
        id: String(Date.now()),
        color: initColor,
        size: initSize,
        quantity: 1,
      }
    ]);
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
      plannedStartDate: plannedStartDate,
      plannedEndDate: plannedEndDate
    });
    generateOrderNo();
  };

  const closeDialog = () => {
    setVisible(false);
    setSelectedStyle(null);
    setCreatedOrder(null);
    setBomList([]);
    setActiveTabKey('base');
    setOrderLines([]);
    setProgressNodes(defaultProgressNodes);
    setFactoryMode('INTERNAL');
    form.resetFields();
  };

  const handleSubmit = async () => {
    if (!selectedStyle) return;
    try {
      const confirmed = await confirmPricingReady();
      if (!confirmed) return;
      setSubmitLoading(true);

      if (!orderLines.length) {
        message.error('请至少填写一条订单明细');
        setActiveTabKey('detail');
        return;
      }

      const invalid = orderLines.find(l => !String(l.color || '').trim() || !String(l.size || '').trim() || (Number(l.quantity) || 0) <= 0);
      if (invalid) {
        message.error('订单明细需填写颜色、码数且数量>0');
        setActiveTabKey('detail');
        return;
      }

      const computedQty = orderLines.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);
      if (computedQty <= 0) {
        message.error('订单总数量必须大于0');
        setActiveTabKey('detail');
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
      const orderDetails = JSON.stringify(orderLines.map(l => ({
        color: l.color,
        size: l.size,
        quantity: l.quantity,
        materialPriceSource,
        materialPriceAcquiredAt,
        materialPriceVersion,
      })));

      const payload: any = {
        orderNo: ensuredOrderNo,
        styleId: String(selectedStyle.id ?? ''),
        styleNo: selectedStyle.styleNo,
        styleName: selectedStyle.styleName,
        plateType: values.plateType || null,
        color: colorLabel,
        size: sizeLabel,
        factoryId: resolvedFactoryId,
        factoryName: resolvedFactoryName,
        orgUnitId: resolvedOrgUnitId,
        factoryType: factoryMode,
        merchandiser: values.merchandiser || null, // ✅ 修复: 使用null而非undefined
        company: values.company || null, // ✅ 修复: 使用null而非undefined
        productCategory: values.productCategory || null, // ✅ 修复: 使用null而非undefined
        patternMaker: values.patternMaker || null, // ✅ 修复: 使用null而非undefined
        urgencyLevel: values.urgencyLevel || 'normal',
        orderBizType: values.orderBizType || null,
        skc: selectedStyle?.skc || null,
        orderQuantity: computedQty,
        orderDetails,
        plannedStartDate: values.plannedStartDate ? values.plannedStartDate.format('YYYY-MM-DDTHH:mm:ss') : null,
        plannedEndDate: values.plannedEndDate ? values.plannedEndDate.format('YYYY-MM-DDTHH:mm:ss') : null,
        progressWorkflowJson: buildProgressWorkflowJson(progressNodes),
      };
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
            scroll={{ x: 'max-content' }}
            size={isMobile ? 'small' : 'middle'}
            pagination={{
              current: detailQuery.page,
              pageSize: detailQuery.pageSize,
              total: detailTotal,
              showTotal: (total) => `共 ${total} 条`,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50', '100'],
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
                    localStorage.setItem('viewMode_orderManagement', next);
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
            scroll={{ x: 'max-content' }}
            pagination={{
              current: queryParams.page,
              pageSize: queryParams.pageSize,
              total,
              showTotal: (total) => `共 ${total} 条`,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50', '100'],
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
              [{ label: '码数', key: 'size', render: (val) => val || '-' }, { label: '数量', key: 'sampleQuantity', render: (val, record) => { const qty = Number(val) || Number(record?.quantity) || 0; return qty > 0 ? `${qty}件` : '-'; } }],
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
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 0 4px' }}>
            <Pagination
              current={queryParams.page}
              pageSize={queryParams.pageSize}
              total={total}
              showTotal={(t) => `共 ${t} 条`}
              showSizeChanger
              pageSizeOptions={['10', '20', '50', '100']}
              onChange={(page, pageSize) => setQueryParams((prev) => ({ ...prev, page, pageSize }))}
            />
          </div>
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
        <Form form={form} layout="vertical" style={{ minWidth: 0 }}>
          <Tabs
            activeKey={activeTabKey}
            onChange={setActiveTabKey}
            items={[
              {
                key: 'base',
                label: '基础信息',
                children: (
                  <div
                    style={
                      isMobile
                        ? { display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0, width: '100%' }
                        : { display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20, minWidth: 0, width: '100%' }
                    }
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>图片</div>
                      <StyleQuotePopover styleNo={selectedStyle?.styleNo || ''}>
                        <div>
                          <StyleCoverThumb
                            styleId={selectedStyle?.id}
                            styleNo={selectedStyle?.styleNo}
                            src={selectedStyle?.cover || null}
                            size={isMobile ? 160 : isTablet ? 200 : 240}

                          />
                          <div style={{ fontSize: 11, color: '#8c8c8c', textAlign: 'center', marginTop: 4 }}>
                            💰 悬停查看报价参考
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
                      {/* 智能下单分析卡 — 下单频率、爆单风险、AI建议 */}
                      {selectedStyle?.styleNo && (
                        <SmartStyleInsightCard
                          styleNo={selectedStyle.styleNo}
                          factoryName={factories.find(
                            f => String(f.id) === String(watchedFactoryId)
                          )?.factoryName}
                          capacityData={selectedFactoryStat}
                        />
                      )}
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <Row gutter={16}>
                        <Col xs={24} sm={12}>
                          <div>
                            <div style={{ marginBottom: 8, fontSize: '14px', color: 'var(--neutral-text)' }}>
                              订单号<span style={{ color: 'var(--color-danger)', marginLeft: 4 }}>*</span>
                            </div>
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
                          </div>
                        </Col>
                        <Col xs={24} sm={12}>
                          <Form.Item
                            label={
                              <Space size={4}>
                                <span>生产方</span>
                                <Tooltip
                                  color={tooltipTheme.background}
                                  title={
                                    <div style={{ fontSize: "var(--font-size-sm)", color: tooltipTheme.text }}>
                                      <div style={{ marginBottom: 8, fontWeight: 600, color: tooltipTheme.text }}>📋 生产方式说明</div>
                                      <div style={{ marginBottom: 6 }}>
                                        <span style={{ color: 'var(--primary-color-light)' }}>● 内部自产：</span>
                                        选择内部车间/部门，由内部工序团队完成。数据流向<strong>工序结算</strong>（按员工工序扫码统计工资）
                                      </div>
                                      <div>
                                        <span style={{ color: 'var(--error-color-light)' }}>● 外发加工：</span>
                                        选择外发工厂，委托外厂生产。数据流向<strong>订单结算</strong>（按工厂整单结算加工费）
                                      </div>
                                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${tooltipTheme.divider}`, fontSize: "var(--font-size-xs)", opacity: 0.9 }}>
                                        💡 所有数据最终在"订单结算数据看板"统一查看
                                      </div>
                                    </div>
                                  }
                                  styles={{
                                    root: { maxWidth: 380 },
                                    body: { background: tooltipTheme.background, color: tooltipTheme.text, border: `1px solid ${tooltipTheme.border}` },
                                  } as any}
                                >
                                  <QuestionCircleOutlined style={{ color: 'var(--primary-color)', cursor: 'help' }} />
                                </Tooltip>
                              </Space>
                            }
                          >
                            <Segmented
                              value={factoryMode}
                              onChange={(v) => {
                                setFactoryMode(v as 'INTERNAL' | 'EXTERNAL');
                                form.setFieldValue('factoryId', undefined);
                                form.setFieldValue('orgUnitId', undefined);
                              }}
                              options={[
                                { label: '内部自产', value: 'INTERNAL' },
                                { label: '外发加工', value: 'EXTERNAL' },
                              ]}
                              block
                              style={{ marginBottom: 6 }}
                            />
                            {factoryMode === 'INTERNAL' ? (
                              <Form.Item name="orgUnitId" noStyle rules={[{ required: true, message: '请选择生产车间/部门' }]}>
                                <Select
                                  placeholder="请选择内部生产车间/部门"
                                  options={departments.map(d => ({ value: d.id, label: d.pathNames || d.nodeName }))}
                                  showSearch
                                  optionFilterProp="label"
                                  allowClear
                                />
                              </Form.Item>
                            ) : (
                              <Form.Item name="factoryId" noStyle rules={[{ required: true, message: '请选择外发工厂' }]}>
                                <Select
                                  placeholder="请选择外发工厂（工厂须先完成入驻）"
                                  options={factories.map(f => ({ value: f.id!, label: `${f.factoryName}（${f.factoryCode}）` }))}
                                  showSearch
                                  optionFilterProp="label"
                                  allowClear
                                />
                              </Form.Item>
                            )}
                          </Form.Item>
                          {/* 选中外发工厂后显示当前负荷（在制单数/产能数据/货期完成率/高风险数） */}
                          {factoryMode === 'EXTERNAL' && selectedFactoryStat && (
                            <div style={{
                              marginTop: -12, marginBottom: 8, padding: '6px 10px',
                              background: 'var(--color-bg-container, #fafafa)',
                              border: '1px solid var(--color-border, #e8e8e8)',
                              borderRadius: 6, fontSize: 12, lineHeight: '20px',
                              color: 'var(--color-text-secondary, #888)',
                            }}>
                              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                <span>在制 <b style={{ color: '#333' }}>{selectedFactoryStat.totalOrders}</b> 单</span>
                                <span>共 <b style={{ color: '#333' }}>{selectedFactoryStat.totalQuantity?.toLocaleString() || 0}</b> 件</span>
                                <span>货期完成率&nbsp;
                                  <b style={{ color: selectedFactoryStat.deliveryOnTimeRate < 0 ? '#888' : selectedFactoryStat.deliveryOnTimeRate >= 80 ? '#52c41a' : selectedFactoryStat.deliveryOnTimeRate >= 60 ? '#fa8c16' : '#ff4d4f' }}>
                                    {selectedFactoryStat.deliveryOnTimeRate < 0 ? '暂无' : `${selectedFactoryStat.deliveryOnTimeRate}%`}
                                  </b>
                                </span>
                                {selectedFactoryStat.atRiskCount > 0 && (
                                  <span style={{ color: '#fa8c16' }}>⚠ 高风险 <b>{selectedFactoryStat.atRiskCount}</b> 单</span>
                                )}
                                {selectedFactoryStat.overdueCount > 0 && (
                                  <span style={{ color: '#ff4d4f' }}>逾期 <b>{selectedFactoryStat.overdueCount}</b> 单</span>
                                )}
                              </div>
                              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4, paddingTop: 4, borderTop: '1px dashed var(--color-border, #e8e8e8)' }}>
                                {(selectedFactoryStat.activeWorkers > 0 || selectedFactoryStat.avgDailyOutput > 0) ? (
                                  <>
                                    {selectedFactoryStat.activeWorkers > 0 && (
                                      <span>👷 生产人数 <b style={{ color: '#333' }}>{selectedFactoryStat.activeWorkers}</b> 人</span>
                                    )}
                                    {selectedFactoryStat.avgDailyOutput > 0 && (
                                      <span>⚡ 日均产量 <b style={{ color: '#1890ff' }}>{selectedFactoryStat.avgDailyOutput}</b> 件/天</span>
                                    )}
                                    {selectedFactoryStat.estimatedCompletionDays > 0 && (
                                      <span>⏱ 预计 <b style={{ color: selectedFactoryStat.estimatedCompletionDays > 30 ? '#ff4d4f' : selectedFactoryStat.estimatedCompletionDays > 15 ? '#fa8c16' : '#52c41a' }}>
                                        {selectedFactoryStat.estimatedCompletionDays}
                                      </b> 天可完工</span>
                                    )}
                                  </>
                                ) : (
                                  <span style={{ color: '#bbb', fontStyle: 'italic' }}>暂无产能数据（该工厂近30天无扫码记录）</span>
                                )}
                              </div>
                            </div>
                          )}
                        </Col>
                      </Row>

                      {/* AI 排产建议区域 */}
                      <Row gutter={16} style={{ marginBottom: 8 }}>
                        <Col xs={24}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: showSchedulingPanel ? 8 : 0 }}>
                            <Button
                              icon={<BulbOutlined />}
                              size="small"
                              type="dashed"
                              loading={schedulingLoading}
                              onClick={() => {
                                if (showSchedulingPanel && schedulingResult) {
                                  setShowSchedulingPanel(false);
                                } else {
                                  fetchSchedulingSuggestion();
                                }
                              }}
                              style={{ color: '#1890ff', borderColor: '#1890ff' }}
                            >
                              {showSchedulingPanel && schedulingResult ? '收起排产建议' : 'AI 排产建议'}
                            </Button>
                            {!showSchedulingPanel && (
                              <span style={{ fontSize: 12, color: '#999' }}>
                                根据各工厂当前负载，智能推荐最优排产方案
                              </span>
                            )}
                          </div>

                          {showSchedulingPanel && (
                            <div style={{ border: '1px solid #e8e8e8', borderRadius: 6, padding: '10px 12px', background: '#fafcff' }}>
                              {schedulingLoading ? (
                                <div style={{ textAlign: 'center', padding: '20px 0', color: '#999', fontSize: 13 }}>⏳ 正在计算排产方案…</div>
                              ) : !schedulingResult?.plans?.length ? (
                                <div style={{ textAlign: 'center', padding: '16px 0', color: '#bbb', fontSize: 13 }}>暂无可用工厂数据</div>
                              ) : (
                                <>
                                  <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
                                    共 {schedulingResult.plans.length} 个工厂方案，按匹配度排序：
                                  </div>
                                  {/* 无真实数据时显示全局提示 */}
                                  {schedulingResult.plans.every(p => !p.hasRealData) && (
                                    <div style={{
                                      background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 4,
                                      padding: '6px 10px', marginBottom: 8, fontSize: 12, color: '#ad6800',
                                      display: 'flex', alignItems: 'center', gap: 6,
                                    }}>
                                      ⚠️ 当前无历史完成订单，以下评分均为估算参考值，请结合实际情况选择工厂
                                    </div>
                                  )}
                                  {schedulingResult.plans.map((plan: SchedulePlan, idx: number) => {
                                    const capacitySource = plan.capacitySource ?? 'default';
                                    const isFullReal = capacitySource === 'real' && plan.hasRealData;
                                    const isRealCap = capacitySource === 'real';
                                    const isEstimated = capacitySource === 'default';
                                    const scoreColor = isEstimated ? '#d4b106'
                                      : isFullReal ? (plan.matchScore >= 70 ? '#52c41a' : plan.matchScore >= 50 ? '#fa8c16' : '#ff4d4f')
                                      : '#1677ff';
                                    const badgeLabel = isEstimated ? '估算' : isFullReal ? 'AI推荐' : '实测';
                                    const totalGanttDays = plan.ganttItems?.reduce((s, g) => s + g.days, 0) || plan.estimatedDays || 1;
                                    return (
                                      <div key={idx} style={{
                                        marginBottom: idx < schedulingResult.plans.length - 1 ? 8 : 0,
                                        padding: '8px 10px',
                                        background: '#fff',
                                        border: '1px solid #e8e8e8',
                                        borderRadius: 6,
                                        position: 'relative',
                                      }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ fontWeight: 600, fontSize: 13 }}>{idx + 1}. {plan.factoryName}</span>
                                            <span style={{
                                              fontSize: 11, fontWeight: 700, padding: '1px 6px',
                                              borderRadius: 10, color: '#fff', background: scoreColor,
                                            }}>
                                              {badgeLabel} {plan.matchScore}分
                                            </span>
                                            <span style={{ fontSize: 11, color: '#888' }}>
                                              在制 {plan.currentLoad} 件 · 可用 {plan.availableCapacity.toLocaleString()} 件产能
                                              {isRealCap && plan.realDailyCapacity ? (
                                                <span style={{ color: '#52c41a', marginLeft: 3 }}>(实测{plan.realDailyCapacity}件/天)</span>
                                              ) : capacitySource === 'configured' ? (
                                                <span style={{ color: '#1677ff', marginLeft: 3 }}>(已配置)</span>
                                              ) : (
                                                <span style={{ color: '#faad14', marginLeft: 3 }}>(估算)</span>
                                              )}
                                            </span>
                                          </div>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span style={{ fontSize: 11, color: '#555' }}>
                                              建议 {plan.suggestedStart} 开始，约 <b style={{ color: '#1890ff' }}>{plan.estimatedDays}</b> 天
                                            </span>
                                            <Button
                                              size="small"
                                              type="primary"
                                              ghost
                                              icon={<CheckCircleOutlined />}
                                              style={{ fontSize: 11, height: 22 }}
                                              onClick={() => {
                                                const factory = factories.find(f => f.factoryName === plan.factoryName);
                                                if (factory) {
                                                  form.setFieldValue('factoryId', factory.id);
                                                  message.success(`已选择 ${plan.factoryName}`);
                                                  setShowSchedulingPanel(false);
                                                } else {
                                                  message.warning('请先在系统中维护该工厂');
                                                }
                                              }}
                                            >选此工厂</Button>
                                          </div>
                                        </div>
                                        {/* 甘特条 */}
                                        {plan.ganttItems?.length > 0 && (
                                          <div style={{ display: 'flex', height: 13, borderRadius: 4, overflow: 'hidden', gap: 1 }}>
                                            {plan.ganttItems.map((g, gi) => {
                                              const pct = Math.round((g.days / totalGanttDays) * 100);
                                              const colors = ['#1890ff', '#52c41a', '#fa8c16', '#722ed1', '#eb2f96', '#faad14'];
                                              return (
                                                <Tooltip key={gi} title={`${g.stage}: ${g.startDate} ~ ${g.endDate} (${g.days}天)`}>
                                                  <div style={{
                                                    width: `${pct}%`, background: colors[gi % colors.length],
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: 10, color: '#fff', overflow: 'hidden', whiteSpace: 'nowrap',
                                                    minWidth: 20, fontWeight: 600,
                                                  }}>
                                                    {pct > 8 ? g.stage : ''}
                                                  </div>
                                                </Tooltip>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </>
                              )}
                            </div>
                          )}
                        </Col>
                      </Row>

                      <Row gutter={16}>
                        <Col xs={24} sm={8}>
                          <Form.Item name="merchandiser" label="跟单员">
                            <Select
                              placeholder="请选择跟单员（选填）"
                              allowClear
                              showSearch
                              optionFilterProp="label"
                              options={users.filter(u => u.name || u.username).map(u => ({ value: u.name || u.username, label: u.name || u.username }))}
                            />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={8}>
                          <Form.Item name="company" label="公司">
                            <SupplierSelect
                              placeholder="请选择或输入公司名称（选填）"
                              allowClear
                            />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={8}>
                          <Form.Item name="urgencyLevel" label="急单" initialValue="normal">
                            <Select
                              placeholder="普通"
                              allowClear
                              options={[
                                { label: '🔴 急单', value: 'urgent' },
                                { label: '普通', value: 'normal' },
                              ]}
                            />
                          </Form.Item>
                        </Col>
                      </Row>

                      <Row gutter={16}>
                        <Col xs={24} sm={8}>
                          <Form.Item name="plateType" label="单型">
                            <Select
                              placeholder="不填自动判断"
                              allowClear
                              options={[
                                { label: '首单', value: 'FIRST' },
                                { label: '翻单', value: 'REORDER' },
                              ]}
                            />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={8}>
                          <Form.Item name="orderBizType" label="下单类型">
                            <Select
                              placeholder="选填（FOB/ODM/OEM/CMT）"
                              allowClear
                              options={[
                                { label: 'FOB — 离岸价交货', value: 'FOB' },
                                { label: 'ODM — 原创设计制造', value: 'ODM' },
                                { label: 'OEM — 代工贴牌', value: 'OEM' },
                                { label: 'CMT — 纯加工', value: 'CMT' },
                              ]}
                            />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={8}>
                          <Form.Item name="productCategory" label="品类">
                            <Select
                              placeholder="请选择品类（选填）"
                              allowClear
                              showSearch
                              optionFilterProp="label"
                              style={{ width: '100%' }}
                              options={categoryOptions}
                            />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={8}>
                          <Form.Item name="patternMaker" label="纸样师">
                            <Select
                              placeholder="请选择纸样师（选填）"
                              allowClear
                              showSearch
                              optionFilterProp="label"
                              options={users.filter(u => u.name || u.username).map(u => ({ value: u.name || u.username, label: u.name || u.username }))}
                            />
                          </Form.Item>
                        </Col>
                      </Row>

                      <Row gutter={16}>
                        <Col xs={24} sm={8}>
                          <Form.Item label="订单总数量">
                            <InputNumber
                              min={1}
                              style={{ width: '100%' }}
                              value={totalOrderQuantity}
                              disabled={orderLines.length !== 1}
                              onChange={(v) => setTotalQuantity(Number(v) || 0)}
                            />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={8}>
                          <Form.Item
                            name="plannedStartDate"
                            label="计划开始时间"
                            rules={[{ required: true, message: '请选择计划开始时间' }]}
                          >
                            <UnifiedDatePicker showTime />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={8}>
                          <Form.Item
                            name="plannedEndDate"
                            label={
                              <span>
                                计划完成时间
                                {deliverySuggestion && !suggestionLoading && (
                                  <Tooltip title={deliverySuggestion.reason}>
                                    <Tag
                                      color="blue"
                                      style={{ marginLeft: 4, cursor: 'pointer', fontSize: 11 }}
                                      onClick={() => {
                                        const d = dayjs().add(deliverySuggestion.recommendedDays, 'day').hour(18).minute(0).second(0);
                                        form.setFieldValue('plannedEndDate', d);
                                      }}
                                    >
                                      💡 建议{deliverySuggestion.recommendedDays}天
                                    </Tag>
                                  </Tooltip>
                                )}
                                {suggestionLoading && <span style={{ marginLeft: 4, color: '#1677ff', fontSize: 11 }}>⏳</span>}
                              </span>
                            }
                            rules={[{ required: true, message: '请选择计划完成时间' }]}
                          >
                            <UnifiedDatePicker showTime />
                          </Form.Item>
                        </Col>
                      </Row>

                      <div style={{ border: '1px solid var(--table-border-color)', padding: 12 }}>
                        <div style={{ fontWeight: 600, marginBottom: 10 }}>信息</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr', rowGap: 8, columnGap: 8, color: 'var(--neutral-text-light)' }}>
                          <div>款号</div>
                          <div style={{ color: 'var(--neutral-text)' }}>{selectedStyle?.styleNo || '-'}</div>
                          <div>款名</div>
                          <div style={{ color: 'var(--neutral-text)' }}>{selectedStyle?.styleName || '-'}</div>
                          <div>颜色</div>
                          <div style={{ color: 'var(--neutral-text)' }}>{styleColorText}</div>
                          <div>码数</div>
                          <div style={{ color: 'var(--neutral-text)' }}>{styleSizeText}</div>
                          <div>下单色</div>
                          <div style={{ color: 'var(--neutral-text)' }}>{orderColorText}</div>
                          <div>下单码</div>
                          <div style={{ color: 'var(--neutral-text)' }}>{orderSizeText}</div>
                        </div>
                      </div>

                    </div>
                  </div>
                )
              },
              {
                key: 'detail',
                label: '订单明细',
                children: (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div style={{ color: 'var(--neutral-text-light)' }}>
                        总数量：<span style={{ fontWeight: 600 }}>{totalOrderQuantity}</span>
                      </div>
                      <Space>
                        <Button onClick={importCommonSizeTemplate}>一键导入通用模板(5码)</Button>
                        <Button onClick={addOrderLine}>新增明细</Button>
                      </Space>
                    </div>

                    <ResizableTable
                      rowKey={(r) => r.id}
                      dataSource={orderLines}
                      pagination={false}
                      scroll={{ x: 'max-content' }}
                      size={isMobile ? 'small' : 'middle'}
                      columns={[
                        {
                          title: '颜色',
                          key: 'color',
                          width: isMobile ? 160 : 220,
                          render: (_: any, record: OrderLine) => {
                            return (
                              <AutoComplete
                                value={record.color}
                                options={selectableColors.map(v => ({ value: v }))}
                                style={{ width: '100%' }}
                                onChange={(v) => updateOrderLine(record.id, { color: String(v || '') })}
                                placeholder="例如：黑色"
                                filterOption={(inputValue, option) =>
                                  String(option?.value || '').toLowerCase().includes(String(inputValue || '').toLowerCase())
                                }
                              />
                            );
                          }
                        },
                        {
                          title: '码数',
                          key: 'size',
                          width: isMobile ? 160 : 220,
                          render: (_: any, record: OrderLine) => {
                            return (
                              <AutoComplete
                                value={record.size}
                                options={selectableSizes.map(v => ({ value: v }))}
                                style={{ width: '100%' }}
                                onChange={(v) => updateOrderLine(record.id, { size: String(v || '') })}
                                placeholder="例如：S"
                                filterOption={(inputValue, option) =>
                                  String(option?.value || '').toLowerCase().includes(String(inputValue || '').toLowerCase())
                                }
                              />
                            );
                          }
                        },
                        {
                          title: '数量',
                          key: 'quantity',
                          width: isMobile ? 120 : 160,
                          render: (_: any, record: OrderLine) => (
                            <InputNumber
                              min={1}
                              style={{ width: '100%' }}
                              value={record.quantity}
                              onChange={(v) => updateOrderLine(record.id, { quantity: Number(v) || 0 })}
                            />
                          )
                        },
                        {
                          title: '操作',
                          key: 'action',
                          width: isMobile ? 90 : 120,
                          render: (_: any, record: OrderLine) => (
                            <RowActions
                              actions={[
                                {
                                  key: 'delete',
                                  label: '删除',
                                  danger: true,
                                  disabled: orderLines.length <= 1,
                                  onClick: () => removeOrderLine(record.id)
                                }
                              ]}
                            />
                          )
                        }
                      ]}
                    />
                  </div>
                )
              },
              {
                key: 'bom',
                label: '面辅料预算',
                children: (
                  <div>
                    <div style={{ marginBottom: 12, color: 'var(--neutral-text-light)' }}>
                      预算采购数量 = 匹配到的订单数量 × 单件用量 × (1 + 损耗率%)；<span style={{ color: 'var(--warning-color, #f7a600)' }}>★</span> 表示已配置码数用量，按每码分别计算，单件用量显示加权平均值
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 13, margin: '16px 0 8px', paddingLeft: 8, borderLeft: '3px solid var(--primary-color, #1677ff)', color: 'var(--neutral-text)' }}>面料</div>
                    <ResizableTable
                      rowKey={(r) => String((r as Record<string, unknown>).id ?? (r as Record<string, unknown>).materialCode)}
                      loading={bomLoading}
                      dataSource={bomByType.fabric}
                      pagination={false}
                      scroll={{ x: 'max-content' }}
                      size={isMobile ? 'small' : 'middle'}
                      columns={bomColumns}
                    />
                    <div style={{ fontWeight: 600, fontSize: 13, margin: '16px 0 8px', paddingLeft: 8, borderLeft: '3px solid var(--primary-color, #1677ff)', color: 'var(--neutral-text)' }}>里料</div>
                    <ResizableTable
                      rowKey={(r) => String((r as Record<string, unknown>).id ?? (r as Record<string, unknown>).materialCode)}
                      loading={bomLoading}
                      dataSource={bomByType.lining}
                      pagination={false}
                      scroll={{ x: 'max-content' }}
                      size={isMobile ? 'small' : 'middle'}
                      columns={bomColumns}
                    />
                    <div style={{ fontWeight: 600, fontSize: 13, margin: '16px 0 8px', paddingLeft: 8, borderLeft: '3px solid var(--primary-color, #1677ff)', color: 'var(--neutral-text)' }}>辅料</div>
                    <ResizableTable
                      rowKey={(r) => String((r as Record<string, unknown>).id ?? (r as Record<string, unknown>).materialCode)}
                      loading={bomLoading}
                      dataSource={bomByType.accessory}
                      pagination={false}
                      scroll={{ x: 'max-content' }}
                      size={isMobile ? 'small' : 'middle'}
                      columns={bomColumns}
                    />
                  </div>
                )
              },
            ]}
          />

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
