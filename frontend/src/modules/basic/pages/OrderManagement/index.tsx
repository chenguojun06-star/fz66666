import React, { useEffect, useMemo, useState } from 'react';
import { App, AutoComplete, Button, Card, Col, Form, Input, InputNumber, Row, Select, Space, Tabs, Tag, Tooltip } from 'antd';
import { UnifiedDatePicker } from '@/components/common/UnifiedDatePicker';
import { QuestionCircleOutlined, AppstoreOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { useSync } from '@/utils/syncManager';
import UniversalCardView from '@/components/common/UniversalCardView';
import StylePrintModal from '@/components/common/StylePrintModal';

import dayjs from 'dayjs';
import Layout from '@/components/Layout';
import api, { parseProductionOrderLines, withQuery } from '@/utils/api';
import { StyleBom, StyleInfo, StyleQueryParams } from '@/types/style';
import { Factory } from '@/types/system';
import { ProductionOrder } from '@/types/production';
import { formatDateTime } from '@/utils/datetime';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { StyleAttachmentsButton, StyleCoverThumb } from '@/components/StyleAssets';
import { getMaterialTypeCategory } from '@/utils/materialType';
import { CATEGORY_CODE_OPTIONS, normalizeCategoryQuery, toCategoryCn } from '@/utils/styleCategory';
import { useViewport } from '@/utils/useViewport';
import { templateLibraryApi } from '@/services/template/templateLibraryApi';
import { generateUniqueId } from '@/utils/idGenerator';
import OrderRankingDashboard from './components/OrderRankingDashboard';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import StandardToolbar from '@/components/common/StandardToolbar';
type OrderLine = {
  id: string;
  color: string;
  size: string;
  quantity: number;
};

type PricingProcess = {
  id: string;
  processName: string;
  unitPrice: number;
};

type ProgressNode = {
  id: string;
  name: string;
  processes: PricingProcess[];
};

const defaultProgressNodes: ProgressNode[] = [
  { id: 'purchase', name: '采购', processes: [{ id: 'purchase-0', processName: '采购', unitPrice: 0 }] },
  { id: 'cutting', name: '裁剪', processes: [{ id: 'cutting-0', processName: '裁剪', unitPrice: 0 }] },
  { id: 'sewing', name: '车缝', processes: [{ id: 'sewing-0', processName: '车缝', unitPrice: 0 }] },
  { id: 'pressing', name: '大烫', processes: [{ id: 'pressing-0', processName: '大烫', unitPrice: 0 }] },
  { id: 'quality', name: '质检', processes: [{ id: 'quality-0', processName: '质检', unitPrice: 0 }] },
  { id: 'secondary-process', name: '二次工艺', processes: [{ id: 'secondary-process-0', processName: '二次工艺', unitPrice: 0 }] },
  { id: 'packaging', name: '包装', processes: [{ id: 'packaging-0', processName: '包装', unitPrice: 0 }] },
  { id: 'warehousing', name: '入库', processes: [{ id: 'warehousing-0', processName: '入库', unitPrice: 0 }] },
];

const OrderManagement: React.FC = () => {
  const { modal, message } = App.useApp();
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
    pageSize: 10,
    onlyCompleted: true,
    keyword: ''
  });
  const [styles, setStyles] = useState<StyleInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const [factories, setFactories] = useState<Factory[]>([]);
  const [factoryQuickAddName, setFactoryQuickAddName] = useState('');
  const [factoryQuickAdding, setFactoryQuickAdding] = useState(false);
  const [users, setUsers] = useState<Array<{ id: number; name: string; username: string }>>([]);

  // ===== 弹窗状态（保留原状，未迁移到 useModal）=====
  const [visible, setVisible] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<StyleInfo | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [form] = Form.useForm();

  // 视图切换状态
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');

  // ===== 打印弹窗状态 =====
  const [printModalVisible, setPrintModalVisible] = useState(false);
  const [printingRecord, setPrintingRecord] = useState<StyleInfo | null>(null);

  // ===== 详情页分页状态 =====
  const [detailQuery, setDetailQuery] = useState({ page: 1, pageSize: 20 });
  const [detailTotal, setDetailTotal] = useState(0);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailRows, setDetailRows] = useState<any[]>([]);

  const [activeTabKey, setActiveTabKey] = useState('base');
  const [bomLoading, setBomLoading] = useState(false);
  const [bomList, setBomList] = useState<StyleBom[]>([]);
  const [createdOrder, setCreatedOrder] = useState<any>(null);

  const [orderLines, setOrderLines] = useState<OrderLine[]>([]);

  const [progressNodes, setProgressNodes] = useState<ProgressNode[]>(defaultProgressNodes);

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
    } catch (e: any) {
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
    const matchedQty = getMatchedQty((record as Record<string, unknown>).color, (record as Record<string, unknown>).size);
    const usage = Number((record as Record<string, unknown>).usageAmount) || 0;
    const loss = Number((record as Record<string, unknown>).lossRate) || 0;
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
    { title: '单件用量', dataIndex: 'usageAmount', key: 'usageAmount', width: 110 },
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

  const demandColumns = [
    { title: '物料编码', dataIndex: 'materialCode', key: 'materialCode', width: 140 },
    { title: '物料名称', dataIndex: 'materialName', key: 'materialName', width: 180, ellipsis: true },
    { title: '颜色', dataIndex: 'color', key: 'color', width: 90 },
    { title: '尺码', dataIndex: 'size', key: 'size', width: 90 },
    { title: '规格', dataIndex: 'specification', key: 'specification', width: 140, ellipsis: true },
    { title: '单位', dataIndex: 'unit', key: 'unit', width: 80 },
    {
      title: '预算采购数量',
      dataIndex: 'budgetQty',
      key: 'budgetQty',
      width: 140,
      align: 'right' as const,
    },
    { title: '供应商', dataIndex: 'supplierName', key: 'supplierName', width: 140, ellipsis: true },
    {
      title: '单价',
      dataIndex: 'unitPrice',
      key: 'unitPrice',
      width: 100,
      align: 'right' as const,
    },
    {
      title: '金额',
      dataIndex: 'totalAmount',
      key: 'totalAmount',
      width: 120,
      align: 'right' as const,
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

  const demandRows = useMemo(() => {
    const grouped: Record<string, any> = {};

    for (const bom of bomList) {
      const materialType = String((bom as Record<string, unknown>).materialType || 'fabric');
      const bomColor = String((bom as Record<string, unknown>).color || '').trim();
      const bomSize = String((bom as Record<string, unknown>).size || '').trim();

      const matchedQty = getMatchedQty(bomColor, bomSize);

      if (!matchedQty) continue;

      const usage = Number((bom as Record<string, unknown>).usageAmount) || 0;
      const loss = Number((bom as Record<string, unknown>).lossRate) || 0;
      const required = usage * (1 + loss / 100) * matchedQty;
      if (!Number.isFinite(required) || required <= 0) continue;

      const key = [
        materialType,
        (bom as Record<string, unknown>).materialCode || '',
        (bom as Record<string, unknown>).specification || '',
        (bom as Record<string, unknown>).unit || '',
        bomColor,
        bomSize,
        (bom as Record<string, unknown>).supplier || '',
      ].join('|');

      if (!grouped[key]) {
        grouped[key] = {
          key,
          materialType,
          materialCode: (bom as Record<string, unknown>).materialCode,
          materialName: (bom as Record<string, unknown>).materialName,
          specification: (bom as Record<string, unknown>).specification,
          unit: (bom as Record<string, unknown>).unit,
          color: bomColor,
          size: bomSize,
          supplierName: (bom as Record<string, unknown>).supplier,
          unitPrice: Number((bom as Record<string, unknown>).unitPrice) || 0,
          budgetQty: 0,
        };
      }

      grouped[key].budgetQty += required;
    }

    return Object.values(grouped)
      .map((r: any) => {
        const budgetQty = Number(r.budgetQty.toFixed(4));
        const totalAmount = Number((budgetQty * (Number(r.unitPrice) || 0)).toFixed(2));
        return { ...r, budgetQty, totalAmount };
      })
      .sort((a: any, b: any) => String(a.materialCode || '').localeCompare(String(b.materialCode || '')));
  }, [bomList, getMatchedQty]);

  const bomByType = useMemo(() => {
    const fabric = bomList.filter((b) => getMaterialTypeCategory((b as Record<string, unknown>).materialType) === 'fabric');
    const lining = bomList.filter((b) => getMaterialTypeCategory((b as Record<string, unknown>).materialType) === 'lining');
    const accessory = bomList.filter((b) => getMaterialTypeCategory((b as Record<string, unknown>).materialType) === 'accessory');
    return { fabric, lining, accessory };
  }, [bomList]);

  const demandRowsByType = useMemo(() => {
    const fabric = demandRows.filter((r: Record<string, unknown>) => getMaterialTypeCategory(r.materialType) === 'fabric');
    const lining = demandRows.filter((r: Record<string, unknown>) => getMaterialTypeCategory(r.materialType) === 'lining');
    const accessory = demandRows.filter((r: Record<string, unknown>) => getMaterialTypeCategory(r.materialType) === 'accessory');
    return { fabric, lining, accessory };
  }, [demandRows]);

  const generateDemand = async () => {
    if (!createdOrder?.id) {
      message.error('请先下单');
      setActiveTabKey('base');
      return;
    }

    try {
      const res = await api.post<{ code: number; message: string; data: unknown[] }>('/production/purchase/demand/generate', { orderId: createdOrder.id, overwrite: false });
      if (res.code === 200) {
        const generated = Array.isArray(res.data) ? res.data.length : undefined;
        if (generated === 0) {
          message.warning('未生成采购需求：请检查BOM颜色/尺码是否与订单明细匹配');
        } else {
          message.success('已生成采购单');
        }
        navigate(withQuery('/production/material', { orderNo: createdOrder.orderNo }));
        return;
      }
      const msg = res.message || '生成采购单失败';
      if (String(msg).includes('已生成')) {
        const ok = window.confirm('该订单已存在采购单，是否覆盖重新生成？');
        if (!ok) return;
        const res2 = await api.post<{ code: number; message: string }>('/production/purchase/demand/generate', { orderId: createdOrder.id, overwrite: true });
        if (res2.code === 200) {
          message.success('已覆盖生成采购单');
          navigate(withQuery('/production/material', { orderNo: createdOrder.orderNo }));
        } else {
          message.error(res2.message || '覆盖生成失败');
        }
      } else {
        message.error(msg);
      }
    } catch (e: any) {
      message.error(e?.message || '生成采购单失败');
    }
  };

  const _watchedOrderNo = Form.useWatch('orderNo', form) as string | undefined;

  function splitOptions(value?: string) {
    if (!value) return [] as string[];
    return value
      .split(/[,/，、\s]+/)
      .map(v => v.trim())
      .filter(Boolean);
  }

  const buildCommonFiveSizes = () => {
    const preset = ['S', 'M', 'L', 'XL', 'XXL'];
    const fromStyle = splitOptions(String(selectedStyle?.size || '')).filter(Boolean);
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

  const confirmPricingReady = () =>
    new Promise<boolean>((resolve) => {
      modal.confirm({
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
    if (!raw) return '-';
    return splitOptions(raw).join('、') || raw;
  }, [selectedStyle?.color]);

  const styleSizeText = useMemo(() => {
    const raw = String(selectedStyle?.size || '').trim();
    if (!raw) return '-';
    return splitOptions(raw).join('、') || raw;
  }, [selectedStyle?.size]);

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
      } else {
        message.error(response.message || '获取款号列表失败');
      }
    } catch (error: any) {
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

  // 工厂快速新增：在选择工厂下拉框中直接添加新工厂
  const quickAddFactory = async () => {
    const name = factoryQuickAddName.trim();
    if (!name) {
      message.warning('请输入工厂名称');
      return;
    }
    setFactoryQuickAdding(true);
    try {
      const res = await api.post<{ code: number; message: string; data: Factory }>('/system/factory', { factoryName: name });
      if (res.code === 200 && res.data) {
        await fetchFactories();
        // 新增后自动选中新工厂
        form.setFieldsValue({ factoryId: res.data.id });
        setFactoryQuickAddName('');
        message.success(`已添加工厂"${name}"并自动选中`);
      } else {
        message.error(res.message || '新增工厂失败');
      }
    } catch {
      message.error('新增工厂失败，请稍后重试');
    } finally {
      setFactoryQuickAdding(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await api.get<{ code: number; data: { records: Array<{ id: number; name: string; username: string }> } }>('/system/user/list', { params: { page: 1, pageSize: 1000, status: 'enabled' } });
      if (response.code === 200) {
        setUsers(response.data.records || []);
      }
    } catch {
      // Intentionally empty
      // 忽略错误
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
  }, []);

  const selectableColors = useMemo(() => splitOptions(selectedStyle?.color), [selectedStyle?.color]);
  const selectableSizes = useMemo(() => splitOptions(selectedStyle?.size), [selectedStyle?.size]);

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

    const initColor = splitOptions(style.color)[0] || style.color || '';
    const initSize = splitOptions(style.size)[0] || style.size || '';
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

      const factory = factories.find(f => f.id === values.factoryId);

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
        color: colorLabel,
        size: sizeLabel,
        factoryId: values.factoryId,
        factoryName: factory?.factoryName || '',
        merchandiser: values.merchandiser || null, // ✅ 修复: 使用null而非undefined
        company: values.company || null, // ✅ 修复: 使用null而非undefined
        productCategory: values.productCategory || null, // ✅ 修复: 使用null而非undefined
        patternMaker: values.patternMaker || null, // ✅ 修复: 使用null而非undefined
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
    { title: '款名', dataIndex: 'styleName', key: 'styleName', ellipsis: true },
    {
      title: '品类',
      dataIndex: 'category',
      key: 'category',
      width: 120,
      render: (v: unknown) => toCategoryCn(v),
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
                  onClick={() => setViewMode(viewMode === 'table' ? 'card' : 'table')}
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
          <UniversalCardView
            dataSource={styles}
            loading={loading}
            columns={6}
            coverField="cover"
            titleField="styleNo"
            subtitleField="styleName"
            fields={[]}
            fieldGroups={[
              [{ label: '码数', key: 'size', render: (val) => val || '-' }, { label: '数量', key: 'sampleQuantity', render: (val, record) => { const qty = Number(val) || Number(record?.quantity) || 0; return qty > 0 ? `${qty}件` : '-'; } }],
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
                      <StyleCoverThumb
                        styleId={selectedStyle?.id}
                        styleNo={selectedStyle?.styleNo}
                        src={selectedStyle?.cover || null}
                        size={isMobile ? 160 : isTablet ? 200 : 240}

                      />
                      <div>
                        <StyleAttachmentsButton
                          styleId={selectedStyle?.id}
                          styleNo={selectedStyle?.styleNo}
                          buttonText="查看附件"
                          modalTitle={selectedStyle?.styleNo ? `纸样附件（${selectedStyle.styleNo}）` : '纸样附件'}
                        />
                      </div>
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
                            name="factoryId"
                            label={
                              <Space size={4}>
                                <span>加工厂</span>
                                <Tooltip
                                  color={tooltipTheme.background}
                                  title={
                                    <div style={{ fontSize: "var(--font-size-sm)", color: tooltipTheme.text }}>
                                      <div style={{ marginBottom: 8, fontWeight: 600, color: tooltipTheme.text }}>📋 加工方式说明</div>
                                      <div style={{ marginBottom: 6 }}>
                                        <span style={{ color: 'var(--primary-color-light)' }}>● 本厂生产：</span>
                                        选择"本厂"，订单完成后数据流向<strong>工资结算</strong>（按人员工序统计扫码工资）
                                      </div>
                                      <div>
                                        <span style={{ color: 'var(--error-color-light)' }}>● 加工厂生产：</span>
                                        选择其他加工厂，订单完成后数据流向<strong>订单结算</strong>（按工厂扫码结算加工费）
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
                            rules={[{ required: true, message: '请选择加工厂' }]}
                          >
                            <Select
                              placeholder="请选择加工厂（本厂或外发加工）"
                              options={factories.map(f => ({ value: f.id!, label: `${f.factoryName}（${f.factoryCode}）` }))}
                              showSearch
                              optionFilterProp="label"
                              allowClear
                              dropdownRender={(menu) => (
                                <>
                                  {menu}
                                  <div style={{ padding: '6px 8px', borderTop: '1px solid var(--color-border, #f0f0f0)' }}>
                                    <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 4 }}>找不到工厂？直接新增：</div>
                                    <Space.Compact style={{ width: '100%' }}>
                                      <Input
                                        size="small"
                                        placeholder="输入工厂名称"
                                        value={factoryQuickAddName}
                                        onChange={e => setFactoryQuickAddName(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); quickAddFactory(); } }}
                                      />
                                      <Button
                                        size="small"
                                        type="primary"
                                        loading={factoryQuickAdding}
                                        onClick={quickAddFactory}
                                      >新增</Button>
                                    </Space.Compact>
                                  </div>
                                </>
                              )}
                            />
                          </Form.Item>
                        </Col>
                      </Row>

                      <Row gutter={16}>
                        <Col xs={24} sm={12}>
                          <Form.Item name="merchandiser" label="跟单员">
                            <Select
                              placeholder="请选择跟单员（选填）"
                              allowClear
                              showSearch
                              optionFilterProp="label"
                              options={users.map(u => ({ value: u.name, label: u.name }))}
                            />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                          <Form.Item name="company" label="公司">
                            <Input placeholder="请输入公司名称（选填）" allowClear />
                          </Form.Item>
                        </Col>
                      </Row>

                      <Row gutter={16}>
                        <Col xs={24} sm={12}>
                          <Form.Item name="productCategory" label="品类">
                            <Select
                              placeholder="请选择品类（选填）"
                              allowClear
                              showSearch
                              optionFilterProp="label"
                              style={{ width: '100%' }}
                              options={CATEGORY_CODE_OPTIONS}
                            />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                          <Form.Item name="patternMaker" label="纸样师">
                            <Select
                              placeholder="请选择纸样师（选填）"
                              allowClear
                              showSearch
                              optionFilterProp="label"
                              options={users.map(u => ({ value: u.name, label: u.name }))}
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
                            label="计划完成时间"
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
                label: '面辅料与预算',
                children: (
                  <div>
                    <div style={{ marginBottom: 8, color: 'var(--neutral-text-light)' }}>
                      预算采购数量 = 匹配到的订单数量 × 单件用量 × (1 + 损耗率%)
                    </div>
                    <Tabs
                      items={[
                        {
                          key: 'fabric',
                          label: '面料',
                          children: (
                            <ResizableTable
                              rowKey={(r) => String((r as Record<string, unknown>).id ?? (r as Record<string, unknown>).materialCode)}
                              loading={bomLoading}
                              dataSource={bomByType.fabric}
                              pagination={false}
                              scroll={{ x: 'max-content' }}
                              size={isMobile ? 'small' : 'middle'}
                              columns={bomColumns}
                            />
                          )
                        },
                        {
                          key: 'lining',
                          label: '里料',
                          children: (
                            <ResizableTable
                              rowKey={(r) => String((r as Record<string, unknown>).id ?? (r as Record<string, unknown>).materialCode)}
                              loading={bomLoading}
                              dataSource={bomByType.lining}
                              pagination={false}
                              scroll={{ x: 'max-content' }}
                              size={isMobile ? 'small' : 'middle'}
                              columns={bomColumns}
                            />
                          )
                        },
                        {
                          key: 'accessory',
                          label: '辅料',
                          children: (
                            <ResizableTable
                              rowKey={(r) => String((r as Record<string, unknown>).id ?? (r as Record<string, unknown>).materialCode)}
                              loading={bomLoading}
                              dataSource={bomByType.accessory}
                              pagination={false}
                              scroll={{ x: 'max-content' }}
                              size={isMobile ? 'small' : 'middle'}
                              columns={bomColumns}
                            />
                          )
                        }
                      ]}
                    />
                  </div>
                )
              },
              {
                key: 'demand',
                label: '采购需求',
                children: (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div style={{ color: 'var(--neutral-text-light)' }}>
                        汇总条数：<span style={{ fontWeight: 600 }}>{demandRows.length}</span>
                      </div>
                      <Space>
                        <Button type="primary" onClick={generateDemand} disabled={!createdOrder?.id}>
                          生成采购单
                        </Button>
                      </Space>
                    </div>

                    <Tabs
                      items={[
                        {
                          key: 'demand-fabric',
                          label: '面料需求',
                          children: (
                            <ResizableTable
                              rowKey={(r) => String((r as Record<string, unknown>).key)}
                              dataSource={demandRowsByType.fabric as any}
                              pagination={false}
                              scroll={{ x: 'max-content' }}
                              size={isMobile ? 'small' : 'middle'}
                              columns={demandColumns}
                            />
                          )
                        },
                        {
                          key: 'demand-lining',
                          label: '里料需求',
                          children: (
                            <ResizableTable
                              rowKey={(r) => String((r as Record<string, unknown>).key)}
                              dataSource={demandRowsByType.lining as any}
                              pagination={false}
                              scroll={{ x: 'max-content' }}
                              size={isMobile ? 'small' : 'middle'}
                              columns={demandColumns}
                            />
                          )
                        },
                        {
                          key: 'demand-accessory',
                          label: '辅料需求',
                          children: (
                            <ResizableTable
                              rowKey={(r) => String((r as Record<string, unknown>).key)}
                              dataSource={demandRowsByType.accessory as any}
                              pagination={false}
                              scroll={{ x: 'max-content' }}
                              size={isMobile ? 'small' : 'middle'}
                              columns={demandColumns}
                            />
                          )
                        }
                      ]}
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
