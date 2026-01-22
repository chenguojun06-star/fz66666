import React, { useEffect, useMemo, useState } from 'react';
import { App, AutoComplete, Button, Card, Col, DatePicker, Form, Input, InputNumber, Modal, Row, Select, Space, Tabs, Tag } from 'antd';
import { ShoppingCartOutlined } from '@ant-design/icons';
import { useSync } from '../../utils/syncManager';

import dayjs from 'dayjs';
import Layout from '../../components/Layout';
import api, { parseProductionOrderLines, withQuery } from '../../utils/api';
import { StyleBom, StyleInfo, StyleQueryParams } from '../../types/style';
import { Factory } from '../../types/system';
import { formatDateTime } from '../../utils/datetime';
import ResizableModal from '../../components/common/ResizableModal';
import ResizableTable from '../../components/common/ResizableTable';
import RowActions from '../../components/common/RowActions';
import { QRCodeCanvas } from 'qrcode.react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { StyleAttachmentsButton, StyleCoverThumb } from '../../components/StyleAssets';
import { getMaterialTypeCategory } from '../../utils/materialType';
import { normalizeCategoryQuery, toCategoryCn } from '../../utils/styleCategory';
import { useViewport } from '../../utils/useViewport';
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
  { id: 'packaging', name: '包装', processes: [{ id: 'packaging-0', processName: '包装', unitPrice: 0 }] },
  { id: 'warehousing', name: '入库', processes: [{ id: 'warehousing-0', processName: '入库', unitPrice: 0 }] },
];

const OrderManagement: React.FC = () => {
  const { modal, message } = App.useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const routeStyleNo = useMemo(() => {
    const raw = String((params as any)?.styleNo || '').trim();
    if (!raw) return '';
    try {
      return decodeURIComponent(raw).trim();
    } catch {
      return raw;
    }
  }, [params]);
  const { isMobile, isTablet, modalWidth } = useViewport();
  const [queryParams, setQueryParams] = useState<StyleQueryParams>({
    page: 1,
    pageSize: 10,
    onlyCompleted: true
  });
  const [styles, setStyles] = useState<StyleInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const [factories, setFactories] = useState<Factory[]>([]);

  const [visible, setVisible] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<StyleInfo | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [form] = Form.useForm();

  const [detailLoading, setDetailLoading] = useState(false);
  const [detailRows, setDetailRows] = useState<any[]>([]);
  const [detailTotal, setDetailTotal] = useState(0);
  const [detailQuery, setDetailQuery] = useState({ page: 1, pageSize: 20 });

  const [activeTabKey, setActiveTabKey] = useState('base');
  const [bomLoading, setBomLoading] = useState(false);
  const [bomList, setBomList] = useState<StyleBom[]>([]);
  const [createdOrder, setCreatedOrder] = useState<any>(null);

  const [orderLines, setOrderLines] = useState<OrderLine[]>([]);

  const [progressNodes, setProgressNodes] = useState<ProgressNode[]>(defaultProgressNodes);

  const modalInitialHeight = 720;

  const normalizeMatchKey = (v: any) => String(v || '').trim().replace(/\s+/g, ' ').toLowerCase();

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
      const response = await api.get<any>('/production/order/list', {
        params: {
          page: detailQuery.page,
          pageSize: detailQuery.pageSize,
          styleNo,
        },
      });
      const result = response as any;
      if (result.code !== 200) {
        message.error(result.message || '获取下单明细失败');
        setDetailRows([]);
        setDetailTotal(0);
        return;
      }

      const orders = result?.data?.records || [];
      const rows: any[] = [];

      const list = Array.isArray(orders) ? [...orders] : [];
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
          const sizeRaw = String((l as any)?.size || '').trim();
          if (!sizeRaw) continue;
          const q = Number((l as any)?.quantity || 0) || 0;
          if (!q) continue;
          const matched = detailSizes.find((s) => normalizeMatchKey(s) === normalizeMatchKey(sizeRaw));
          if (!matched) continue;
          sizeQty[matched] = (sizeQty[matched] || 0) + q;
        }
        return sizeQty;
      };

      const pickCompletedQty = (o: any, fallbackOrderQty: number) => {
        const candidates = [
          (o as any)?.completedQuantity,
          (o as any)?.completedQty,
          (o as any)?.finishedQuantity,
          (o as any)?.finishQuantity,
          (o as any)?.actualQuantity,
          (o as any)?.warehousingQualifiedQuantity,
          (o as any)?.warehousingQuantity,
          (o as any)?.inStockQuantity,
        ];
        for (const c of candidates) {
          const n = Number(c);
          if (Number.isFinite(n) && n >= 0) return n;
        }
        const status = String((o as any)?.status || '').trim().toLowerCase();
        const closed = status === 'completed' || status === 'closed' || status === 'finished' || !!String((o as any)?.actualEndDate || '').trim();
        if (closed) {
          const orderQty = Number((o as any)?.orderQuantity);
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
        const sumQty = effectiveLines.reduce((acc, l) => acc + (Number((l as any)?.quantity || 0) || 0), 0);
        const colors = joinUniq(effectiveLines.map((l) => (l as any)?.color)) || '-';
        const sizeQty = buildSizeQty(effectiveLines);
        const completedQuantity = base?.completedQuantity != null ? (Number(base?.completedQuantity) || 0) : pickCompletedQty(o, sumQty);

        rows.push({
          key,
          ...base,
          color: base.color ?? colors,
          sizeQty,
          orderQuantity: sumQty,
          completedQuantity,
        });
      };

      for (const o of list) {
        const key = String(o?.id || o?.orderNo || '') ? `${String(o?.id || o?.orderNo)}-row` : `order-row-${Math.random()}`;
        buildRow(o, key, parseProductionOrderLines(o));
      }

      setDetailRows(rows);
      setDetailTotal(Number(result?.data?.total || 0) || 0);
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
    const matchedQty = getMatchedQty((record as any).color, (record as any).size);
    const usage = Number((record as any).usageAmount) || 0;
    const loss = Number((record as any).lossRate) || 0;
    const required = usage * (1 + loss / 100) * matchedQty;
    if (!Number.isFinite(required)) return 0;
    return Number(required.toFixed(4));
  };

  const calcBomTotalPrice = (record: StyleBom) => {
    const unitPrice = Number((record as any).unitPrice) || 0;
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
      render: (_: any, record: StyleBom) => getMatchedQty((record as any).color, (record as any).size),
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
      setQueryParams((prev) => ({
        ...prev,
        page: 1,
        styleNo: styleNo || prev.styleNo,
        styleName: styleName || prev.styleName,
      }));
    }
  }, [location.search]);

  const demandRows = useMemo(() => {
    const grouped: Record<string, any> = {};

    for (const bom of bomList) {
      const materialType = String((bom as any).materialType || 'fabric');
      const bomColor = String((bom as any).color || '').trim();
      const bomSize = String((bom as any).size || '').trim();

      const matchedQty = getMatchedQty(bomColor, bomSize);

      if (!matchedQty) continue;

      const usage = Number((bom as any).usageAmount) || 0;
      const loss = Number((bom as any).lossRate) || 0;
      const required = usage * (1 + loss / 100) * matchedQty;
      if (!Number.isFinite(required) || required <= 0) continue;

      const key = [
        materialType,
        (bom as any).materialCode || '',
        (bom as any).specification || '',
        (bom as any).unit || '',
        bomColor,
        bomSize,
        (bom as any).supplier || '',
      ].join('|');

      if (!grouped[key]) {
        grouped[key] = {
          key,
          materialType,
          materialCode: (bom as any).materialCode,
          materialName: (bom as any).materialName,
          specification: (bom as any).specification,
          unit: (bom as any).unit,
          color: bomColor,
          size: bomSize,
          supplierName: (bom as any).supplier,
          unitPrice: Number((bom as any).unitPrice) || 0,
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
    const fabric = bomList.filter((b) => getMaterialTypeCategory((b as any).materialType) === 'fabric');
    const lining = bomList.filter((b) => getMaterialTypeCategory((b as any).materialType) === 'lining');
    const accessory = bomList.filter((b) => getMaterialTypeCategory((b as any).materialType) === 'accessory');
    return { fabric, lining, accessory };
  }, [bomList]);

  const demandRowsByType = useMemo(() => {
    const fabric = demandRows.filter((r: any) => getMaterialTypeCategory(r.materialType) === 'fabric');
    const lining = demandRows.filter((r: any) => getMaterialTypeCategory(r.materialType) === 'lining');
    const accessory = demandRows.filter((r: any) => getMaterialTypeCategory(r.materialType) === 'accessory');
    return { fabric, lining, accessory };
  }, [demandRows]);

  const generateDemand = async () => {
    if (!createdOrder?.id) {
      message.error('请先下单');
      setActiveTabKey('base');
      return;
    }

    try {
      const res = await api.post<any>('/production/purchase/demand/generate', { orderId: createdOrder.id, overwrite: false });
      const result = res as any;
      if (result.code === 200) {
        const generated = Array.isArray(result.data) ? result.data.length : undefined;
        if (generated === 0) {
          message.warning('未生成采购需求：请检查BOM颜色/尺码是否与订单明细匹配');
        } else {
          message.success('已生成采购单');
        }
        navigate(withQuery('/production/material', { orderNo: createdOrder.orderNo }));
        return;
      }
      const msg = result.message || '生成采购单失败';
      if (String(msg).includes('已生成')) {
        const ok = window.confirm('该订单已存在采购单，是否覆盖重新生成？');
        if (!ok) return;
        const res2 = await api.post<any>('/production/purchase/demand/generate', { orderId: createdOrder.id, overwrite: true });
        const result2 = res2 as any;
        if (result2.code === 200) {
          message.success('已覆盖生成采购单');
          navigate(withQuery('/production/material', { orderNo: createdOrder.orderNo }));
        } else {
          message.error(result2.message || '覆盖生成失败');
        }
      } else {
        message.error(msg);
      }
    } catch (e: any) {
      message.error(e?.message || '生成采购单失败');
    }
  };

  const watchedOrderNo = Form.useWatch('orderNo', form) as string | undefined;

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
        content: '请确认单价流程维护已完成。',
        okText: '确认下单',
        cancelText: '取消',
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });

  const buildProgressWorkflowJson = (nodes: ProgressNode[]) => {
    const normalizedNodes = (Array.isArray(nodes) ? nodes : [])
      .map((n) => {
        const name = String(n?.name || '').trim();
        const id = String(n?.id || name || '').trim() || name;
        const processes = (Array.isArray(n?.processes) ? (n as any).processes : []) as PricingProcess[];
        const safeProcesses = processes
          .map((p) => {
            const pname = String((p as any)?.processName || '').trim();
            const pid = String((p as any)?.id || `${id}-${pname}` || '').trim() || `${id}-${Date.now()}`;
            const unitPrice = Number((p as any)?.unitPrice);
            return {
              id: pid,
              processName: pname,
              unitPrice: Number.isFinite(unitPrice) && unitPrice >= 0 ? unitPrice : 0,
            };
          })
          .filter((p) => p.processName);
        const unitPrice = safeProcesses.reduce((sum, p) => sum + (Number(p.unitPrice) || 0), 0);
        return {
          id,
          name,
          unitPrice,
          processes: safeProcesses,
        };
      })
      .filter((n) => n.name);

    const ensuredNodes = normalizedNodes.length
      ? normalizedNodes
      : defaultProgressNodes.map((n) => ({
        id: n.id,
        name: n.name,
        unitPrice: (Array.isArray(n.processes) ? n.processes : []).reduce((sum, p) => sum + (Number(p.unitPrice) || 0), 0),
        processes: n.processes,
      }));
    const processesByNode: Record<string, { id: string; name: string; unitPrice: number }[]> = {};
    for (const n of ensuredNodes) {
      processesByNode[String(n.id)] = (Array.isArray((n as any).processes) ? (n as any).processes : []).map((p: any) => ({
        id: String(p.id),
        name: String(p.processName || '').trim(),
        unitPrice: Number(p.unitPrice) || 0,
      }));
    }
    return JSON.stringify({
      nodes: ensuredNodes.map((n) => ({ id: n.id, name: n.name, unitPrice: n.unitPrice })),
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
      const response = await api.get<any>('/style/info/list', { params: queryParams });
      const result = response as any;
      if (result.code === 200) {
        setStyles(result.data.records || []);
        setTotal(result.data.total || 0);
      } else {
        message.error(result.message || '获取款号列表失败');
      }
    } catch (error: any) {
      message.error(error?.message || '获取款号列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchFactories = async () => {
    try {
      const response = await api.get<any>('/system/factory/list', { params: { page: 1, pageSize: 1000 } });
      const result = response as any;
      if (result.code === 200) {
        setFactories(result.data.records || []);
      }
    } catch {
      setFactories([]);
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
        const response = await api.get<any>('/style/info/list', { params: queryParams });
        const result = response as any;
        if (result.code === 200) {
          return {
            records: result.data.records || [],
            total: result.data.total || 0
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
        console.log('[实时同步] 订单管理款式数据已更新', { oldCount: oldData.records.length, newCount: newData.records.length });
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
      const res = await api.get<any>('/system/serial/generate', { params: { ruleCode: 'ORDER_NO' } });
      const result = res as any;
      if (result.code === 200 && typeof result.data === 'string' && result.data) {
        form.setFieldsValue({ orderNo: result.data });
      }
    } catch {
    }
  };

  const fetchBom = async (styleId: string | number) => {
    setBomLoading(true);
    try {
      const res = await api.get<any>(`/style/bom/list?styleId=${styleId}`);
      const result = res as any;
      if (result.code === 200) {
        setBomList(result.data || []);
      } else {
        setBomList([]);
      }
    } catch {
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
        const res = await api.get<any>('/system/serial/generate', { params: { ruleCode: 'ORDER_NO' } });
        const result = res as any;
        if (result.code === 200 && typeof result.data === 'string' && result.data) {
          ensuredOrderNo = result.data;
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
        orderQuantity: computedQty,
        orderDetails,
        plannedStartDate: values.plannedStartDate ? values.plannedStartDate.format('YYYY-MM-DDTHH:mm:ss') : undefined,
        plannedEndDate: values.plannedEndDate ? values.plannedEndDate.format('YYYY-MM-DDTHH:mm:ss') : undefined,
        progressWorkflowJson: buildProgressWorkflowJson(progressNodes),
      };
      const response = await api.post<any>('/production/order', payload);
      const result = response as any;
      if (result.code === 200) {
        setCreatedOrder(result.data || payload);
        setActiveTabKey('bom');
        message.success('已下单');
        fetchStyles();
      } else {
        message.error(result.message || '下单失败');
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
            const sn = String((record as any)?.styleNo || '').trim();
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
      render: (v: any) => toCategoryCn(v),
    },
    {
      title: '下单次数',
      dataIndex: 'orderCount',
      key: 'orderCount',
      width: 110,
      render: (v: any) => Number(v) || 0,
    },
    {
      title: '是否下单',
      key: 'hasOrder',
      width: 100,
      render: (_: any, record: StyleInfo) => {
        const c = Number((record as any)?.orderCount || 0) || 0;
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
          modalTitle={`附件（${record.styleNo}）`}
        />
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 110,
      render: (_: any, record: StyleInfo) => (
        <RowActions
          actions={[
            {
              key: 'create',
              label: '下单',
              title: '下单',
              icon: <ShoppingCartOutlined />,
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
            rowKey={(r) => String((r as any).key)}
            loading={detailLoading}
            dataSource={detailRows}
            style={{ color: '#000' }}
            scroll={{ x: 'max-content', y: isMobile ? 360 : 560 }}
            size={isMobile ? 'small' : 'middle'}
            pagination={{
              current: detailQuery.page,
              pageSize: detailQuery.pageSize,
              total: detailTotal,
              showSizeChanger: true,
              onChange: (page, pageSize) => setDetailQuery({ page, pageSize }),
            }}
            columns={[
              { title: <span style={{ color: '#000' }}>订单号</span>, dataIndex: 'orderNo', key: 'orderNo', width: 150 },
              { title: <span style={{ color: '#000' }}>款号</span>, dataIndex: 'styleNo', key: 'styleNo', width: 140 },
              { title: <span style={{ color: '#000' }}>颜色</span>, dataIndex: 'color', key: 'color', width: 140 },
              { title: <span style={{ color: '#000' }}>S</span>, dataIndex: ['sizeQty', 'S'], key: 'size_S', width: 90, align: 'right', render: (v: any) => Number(v) || 0 },
              { title: <span style={{ color: '#000' }}>M</span>, dataIndex: ['sizeQty', 'M'], key: 'size_M', width: 90, align: 'right', render: (v: any) => Number(v) || 0 },
              { title: <span style={{ color: '#000' }}>L</span>, dataIndex: ['sizeQty', 'L'], key: 'size_L', width: 90, align: 'right', render: (v: any) => Number(v) || 0 },
              { title: <span style={{ color: '#000' }}>XL</span>, dataIndex: ['sizeQty', 'XL'], key: 'size_XL', width: 90, align: 'right', render: (v: any) => Number(v) || 0 },
              { title: <span style={{ color: '#000' }}>XXL</span>, dataIndex: ['sizeQty', 'XXL'], key: 'size_XXL', width: 90, align: 'right', render: (v: any) => Number(v) || 0 },
              { title: <span style={{ color: '#000' }}>下单数</span>, dataIndex: 'orderQuantity', key: 'orderQuantity', width: 110, align: 'right', render: (v: any) => Number(v) || 0 },
              { title: <span style={{ color: '#000' }}>完成数</span>, dataIndex: 'completedQuantity', key: 'completedQuantity', width: 110, align: 'right', render: (v: any) => Number(v) || 0 },
              { title: <span style={{ color: '#000' }}>下单人</span>, dataIndex: 'orderOperatorName', key: 'orderOperatorName', width: 140 },
              { title: <span style={{ color: '#000' }}>下单时间</span>, dataIndex: 'orderTime', key: 'orderTime', width: 170, render: (v: any) => formatDateTime(v) },
              { title: <span style={{ color: '#000' }}>完成时间</span>, dataIndex: 'completedTime', key: 'completedTime', width: 170, render: (v: any) => formatDateTime(v) },
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
          <Button type="primary" onClick={() => fetchStyles()}>
            刷新
          </Button>
        </div>

        <Card size="small" className="filter-card mb-sm">
          <Space wrap>
            <Input
              placeholder="款号"
              style={{ width: 180 }}
              onChange={(e) => setQueryParams(prev => ({ ...prev, styleNo: e.target.value, page: 1 }))}
            />
            <Input
              placeholder="款名"
              style={{ width: 220 }}
              onChange={(e) => setQueryParams(prev => ({ ...prev, styleName: e.target.value, page: 1 }))}
            />
            <Input
              placeholder="品类"
              style={{ width: 180 }}
              onChange={(e) =>
                setQueryParams((prev) => ({ ...prev, category: normalizeCategoryQuery(e.target.value), page: 1 }))
              }
            />
          </Space>
        </Card>

        <ResizableTable
          rowKey={(r) => String(r.id ?? r.styleNo)}
          columns={columns as any}
          dataSource={styles}
          loading={loading}
          scroll={{ x: 'max-content', y: isMobile ? 360 : 560 }}
          pagination={{
            current: queryParams.page,
            pageSize: queryParams.pageSize,
            total,
            showSizeChanger: true,
            onChange: (page, pageSize) => setQueryParams(prev => ({ ...prev, page, pageSize })),
          }}
        />
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
                        borderRadius={8}
                      />
                      <div>
                        <StyleAttachmentsButton
                          styleId={selectedStyle?.id}
                          styleNo={selectedStyle?.styleNo}
                          buttonText="查看附件"
                          modalTitle={selectedStyle?.styleNo ? `附件（${selectedStyle.styleNo}）` : '附件'}
                        />
                      </div>
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <Row gutter={16}>
                        <Col xs={24} sm={12}>
                          <Form.Item
                            name="orderNo"
                            label="订单号"
                            rules={[{ required: true, message: '请输入订单号' }]}
                          >
                            <Space.Compact style={{ width: '100%' }}>
                              <Input placeholder="例如：PO20260107001" />
                              <Button onClick={generateOrderNo}>自动生成</Button>
                            </Space.Compact>
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                          <Form.Item name="factoryId" label="加工厂" rules={[{ required: true, message: '请选择加工厂' }]}>
                            <Select
                              placeholder="请选择加工厂"
                              options={factories.map(f => ({ value: f.id!, label: `${f.factoryName}（${f.factoryCode}）` }))}
                              showSearch
                              optionFilterProp="label"
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
                            <DatePicker showTime style={{ width: '100%' }} />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={8}>
                          <Form.Item
                            name="plannedEndDate"
                            label="计划完成时间"
                            rules={[{ required: true, message: '请选择计划完成时间' }]}
                          >
                            <DatePicker showTime style={{ width: '100%' }} />
                          </Form.Item>
                        </Col>
                      </Row>

                      <div style={{ border: '1px solid rgba(0,0,0,0.06)', borderRadius: 10, padding: 12 }}>
                        <div style={{ fontWeight: 600, marginBottom: 10 }}>信息</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr', rowGap: 8, columnGap: 8, color: 'rgba(0,0,0,0.65)' }}>
                          <div>款号</div>
                          <div style={{ color: 'rgba(0,0,0,0.88)' }}>{selectedStyle?.styleNo || '-'}</div>
                          <div>款名</div>
                          <div style={{ color: 'rgba(0,0,0,0.88)' }}>{selectedStyle?.styleName || '-'}</div>
                          <div>颜色</div>
                          <div style={{ color: 'rgba(0,0,0,0.88)' }}>{styleColorText}</div>
                          <div>码数</div>
                          <div style={{ color: 'rgba(0,0,0,0.88)' }}>{styleSizeText}</div>
                          <div>下单色</div>
                          <div style={{ color: 'rgba(0,0,0,0.88)' }}>{orderColorText}</div>
                          <div>下单码</div>
                          <div style={{ color: 'rgba(0,0,0,0.88)' }}>{orderSizeText}</div>
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
                      <div style={{ color: 'rgba(0,0,0,0.65)' }}>
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
                      scroll={{ x: 'max-content', y: isMobile ? 260 : 360 }}
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
                            <Button danger type="link" onClick={() => removeOrderLine(record.id)} disabled={orderLines.length <= 1}>
                              删除
                            </Button>
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
                    <div style={{ marginBottom: 8, color: 'rgba(0,0,0,0.65)' }}>
                      预算采购数量 = 匹配到的订单数量 × 单件用量 × (1 + 损耗率%)
                    </div>
                    <Tabs
                      items={[
                        {
                          key: 'fabric',
                          label: '面料',
                          children: (
                            <ResizableTable
                              rowKey={(r) => String((r as any).id ?? (r as any).materialCode)}
                              loading={bomLoading}
                              dataSource={bomByType.fabric}
                              pagination={false}
                              scroll={{ x: 'max-content', y: isMobile ? 260 : 360 }}
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
                              rowKey={(r) => String((r as any).id ?? (r as any).materialCode)}
                              loading={bomLoading}
                              dataSource={bomByType.lining}
                              pagination={false}
                              scroll={{ x: 'max-content', y: isMobile ? 260 : 360 }}
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
                              rowKey={(r) => String((r as any).id ?? (r as any).materialCode)}
                              loading={bomLoading}
                              dataSource={bomByType.accessory}
                              pagination={false}
                              scroll={{ x: 'max-content', y: isMobile ? 260 : 360 }}
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
                      <div style={{ color: 'rgba(0,0,0,0.65)' }}>
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
                              rowKey={(r) => String((r as any).key)}
                              dataSource={demandRowsByType.fabric as any}
                              pagination={false}
                              scroll={{ x: 'max-content', y: isMobile ? 260 : 360 }}
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
                              rowKey={(r) => String((r as any).key)}
                              dataSource={demandRowsByType.lining as any}
                              pagination={false}
                              scroll={{ x: 'max-content', y: isMobile ? 260 : 360 }}
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
                              rowKey={(r) => String((r as any).key)}
                              dataSource={demandRowsByType.accessory as any}
                              pagination={false}
                              scroll={{ x: 'max-content', y: isMobile ? 260 : 360 }}
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
              {
                key: 'qr',
                label: '二维码',
                children: (
                  <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexDirection: isMobile ? 'column' : 'row', minWidth: 0 }}>
                    <div style={{ border: '1px solid rgba(0,0,0,0.06)', borderRadius: 8, padding: 12 }}>
                      <QRCodeCanvas value={(createdOrder?.qrCode || ' ') as string} size={220} />
                    </div>
                    <div style={{ lineHeight: 1.8, minWidth: 0, maxWidth: '100%', wordBreak: 'break-all', overflowWrap: 'anywhere' }}>
                      <div>订单号：{createdOrder?.orderNo || watchedOrderNo || '-'}</div>
                      <div>二维码内容：{createdOrder?.qrCode || '-'}</div>
                      <div>款号：{selectedStyle?.styleNo || '-'}</div>
                      <div>颜色：{createdOrder?.color || (orderLineColors.length ? orderLineColors.join(',') : '-')}</div>
                      <div>码数：{createdOrder?.size || (orderLineSizes.length ? orderLineSizes.join(',') : '-')}</div>
                      <div>数量：{createdOrder?.orderQuantity ?? totalOrderQuantity}</div>
                    </div>
                  </div>
                )
              }
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
    </Layout>
  );
};

export default OrderManagement;
