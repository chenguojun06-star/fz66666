import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Collapse, Dropdown, Form, Input, InputNumber, Select, Space, Tag, message, Modal } from 'antd';
import { CheckOutlined, DownloadOutlined, MoreOutlined, PlusOutlined, RollbackOutlined, SearchOutlined, SendOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import ResizableModal, {
  ResizableModalFlex,
  ResizableModalFlexFill,
  useResizableModalTableScrollY,
} from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import { DeductionItem, ShipmentReconciliation, ShipmentReconQueryParams } from '@/types/finance';
import { formatDateTime } from '@/utils/datetime';
import { StyleCoverThumb } from '@/components/StyleAssets';
import api, { updateFinanceReconciliationStatus, returnFinanceReconciliation } from '@/utils/api';
import { useSync } from '@/utils/syncManager';
import { useViewport } from '@/utils/useViewport';
import {
  ModalHeaderCard,
  ModalField,
  ModalPrimaryField,
  ModalFieldRow,
  ModalFieldGrid,
} from '@/components/common/ModalContentLayout';

const { Option } = Select;

const ShipmentReconciliationList: React.FC = () => {
  const navigate = useNavigate();
  const [reconciliationList, setReconciliationList] = useState<ShipmentReconciliation[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [approvalSubmitting, setApprovalSubmitting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [visible, setVisible] = useState(false);
  const [currentRecon, setCurrentRecon] = useState<ShipmentReconciliation | null>(null);
  const [deductionItems, setDeductionItems] = useState<DeductionItem[]>([]);
  const [deductionLoading, setDeductionLoading] = useState(false);
  const [deductionSaving, setDeductionSaving] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [orderProfitByOrderNo, setOrderProfitByOrderNo] = useState<Record<string, any | null>>({});
  const [materialDetailOpen, setMaterialDetailOpen] = useState(false);
  const [materialDetailLoading, setMaterialDetailLoading] = useState(false);
  const [materialDetailProfit, setMaterialDetailProfit] = useState<any | null>(null);

  const materialDetailTableWrapRef = useRef<HTMLDivElement | null>(null);
  const materialDetailTableScrollY = useResizableModalTableScrollY({ open: materialDetailOpen, ref: materialDetailTableWrapRef });
  const [queryParams, setQueryParams] = useState<ShipmentReconQueryParams>({
    page: 1,
    pageSize: 10,
  });

  const [filterForm] = Form.useForm();

  const { modalWidth, isMobile } = useViewport();
  const modalInitialHeight = typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800;

  const escapeCsvCell = (value: unknown) => {
    const text = String(value ?? '');
    if (/[\r\n",]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const downloadTextFile = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const fileStamp = () => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  };

  const toNumberOrNull = (v: unknown) => {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const toCsvMoneyText = (v: unknown) => {
    const n = toNumberOrNull(v);
    return n == null ? '' : n.toFixed(2);
  };

  const toMoney2 = (v: unknown) => {
    const n = toNumberOrNull(v);
    return n == null ? '-' : n.toFixed(2);
  };

  const computeUnitPrice = (total: any, qty: any) => {
    const t = toNumberOrNull(total);
    const q = toNumberOrNull(qty);
    if (t == null || q == null || q <= 0) return null;
    return t / q;
  };

  const getBaseQty = (profitData: any | null, record: ShipmentReconciliation) => {
    const w = toNumberOrNull((profitData as Record<string, unknown>)?.order?.warehousingQuantity);
    if (w != null && w > 0) return w;
    const q = toNumberOrNull((record as Record<string, unknown>)?.quantity);
    if (q != null && q > 0) return q;
    const c = toNumberOrNull((profitData as Record<string, unknown>)?.summary?.calcQty);
    if (c != null && c > 0) return c;
    return 0;
  };

  const sumMaterialCostFromItems = (items: unknown[]) => {
    let total = 0;
    for (const it of items || []) {
      const qty = toNumberOrNull((it as Record<string, unknown>)?.arrivedQuantity) ?? 0;
      const unit = toNumberOrNull((it as Record<string, unknown>)?.unitPrice) ?? 0;
      total += qty * unit;
    }
    return total;
  };

  const normalizeDeductionItems = (items: DeductionItem[]) => {
    return (items || []).map((it) => {
      const deductionType = String((it as Record<string, unknown>)?.deductionType || '').trim();
      const description = String((it as Record<string, unknown>)?.description || '').trim();
      const deductionAmountRaw = (it as Record<string, unknown>)?.deductionAmount;
      const deductionAmount = typeof deductionAmountRaw === 'number' ? deductionAmountRaw : Number(deductionAmountRaw);
      return {
        id: String((it as Record<string, unknown>)?.id || '').trim() || undefined,
        reconciliationId: String((it as Record<string, unknown>)?.reconciliationId || '').trim(),
        deductionType,
        description,
        deductionAmount: Number.isFinite(deductionAmount) && deductionAmount >= 0 ? deductionAmount : 0,
      } as DeductionItem;
    });
  };

  const fetchDeductionItems = async (reconciliationId: string) => {
    const rid = String(reconciliationId || '').trim();
    if (!rid) return;
    setDeductionLoading(true);
    try {
      const res = await api.get<{ code: number; message: string; data: DeductionItem[] }>(`/finance/shipment-reconciliation/deduction-items/${rid}`);
      if (res.code === 200) {
        const rows = normalizeDeductionItems((res.data || []) as DeductionItem[]);
        setDeductionItems(rows.map((r) => ({ ...r, reconciliationId: rid })));
      } else {
        message.error(res.message || '获取扣款项失败');
        setDeductionItems([]);
      }
    } catch (e: unknown) {
      message.error(e?.message || '获取扣款项失败');
      setDeductionItems([]);
    } finally {
      setDeductionLoading(false);
    }
  };

  const reloadCurrentRecon = async (reconciliationId: string) => {
    const rid = String(reconciliationId || '').trim();
    if (!rid) return;
    try {
      const res = await api.get<{ code: number; data: ShipmentReconciliation }>(`/finance/shipment-reconciliation/${rid}`);
      if (res.code === 200) {
        setCurrentRecon(res.data || null);
      }
    } catch {
    // Intentionally empty
      // 忽略错误
    }
  };

  const saveCurrentDeductionItems = async () => {
    const rid = String((currentRecon as Record<string, unknown>)?.id || '').trim();
    if (!rid) return;
    setDeductionSaving(true);
    try {
      const payload = normalizeDeductionItems(deductionItems)
        .map((it) => ({
          reconciliationId: rid,
          deductionType: String(it.deductionType || '').trim(),
          description: String(it.description || '').trim(),
          deductionAmount: Number(it.deductionAmount || 0),
        }))
        .filter((it) => it.deductionType || it.description || (it.deductionAmount || 0) > 0);

      const res = await api.post<{ code: number; message: string }>(`/finance/shipment-reconciliation/deduction-items/${rid}`, payload);
      if (res.code === 200) {
        message.success('扣款项已保存');
        await Promise.all([fetchDeductionItems(rid), reloadCurrentRecon(rid)]);
        fetchReconciliationList();
      } else {
        message.error(res.message || '保存失败');
      }
    } catch (e: unknown) {
      message.error(e?.message || '保存失败');
    } finally {
      setDeductionSaving(false);
    }
  };

  const getMaterialTotalCost = (profitData: any | null) => {
    const direct = toNumberOrNull((profitData as Record<string, unknown>)?.summary?.materialArrivedCost);
    if (direct != null) return direct;
    const items = ((profitData as Record<string, unknown>)?.materials || []) as Record<string, unknown>[];
    return sumMaterialCostFromItems(items);
  };

  const getProcessingTotalCost = (profitData: any | null, baseQty: number) => {
    const direct = toNumberOrNull((profitData as Record<string, unknown>)?.summary?.processingCost);
    if (direct != null) return direct;
    const actualUnit = toNumberOrNull((profitData as Record<string, unknown>)?.summary?.actualUnitCost);
    if (actualUnit != null && baseQty > 0) return actualUnit * baseQty;
    return 0;
  };

  const getFinalUnitPrice = (profitData: any | null, baseQty: number) => {
    const q = toNumberOrNull((profitData as Record<string, unknown>)?.summary?.quotationUnitPrice);
    if (q != null) return q;
    const rev = toNumberOrNull((profitData as Record<string, unknown>)?.summary?.revenue);
    if (rev != null && baseQty > 0) return rev / baseQty;
    return 0;
  };

  const getProfitByFormula = (profitData: any | null, record: ShipmentReconciliation) => {
    const baseQty = getBaseQty(profitData, record);
    const finalUnit = getFinalUnitPrice(profitData, baseQty);
    const revenue = finalUnit * (baseQty || 0);
    const material = getMaterialTotalCost(profitData);
    const processing = getProcessingTotalCost(profitData, baseQty);
    return revenue - material - processing;
  };

  const escapeHtml = (value: unknown) => {
    const s = String(value ?? '');
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const fetchOrderProfitOne = async (orderNo: string) => {
    const ono = String(orderNo || '').trim();
    if (!ono) return null;
    try {
      const res = await api.get<{ code: number; data: Record<string, unknown> | null }>('/finance/reconciliation/order-profit', { params: { orderNo: ono } });
      if (res.code === 200) return (res.data || null);
      return null;
    } catch {
    // Intentionally empty
      // 忽略错误
      return null;
    }
  };

  const ensureOrderProfit = async (orderNos: string[]) => {
    const unique = Array.from(new Set(orderNos.map((x) => String(x || '').trim()).filter(Boolean)));
    const missing = unique.filter((x) => !(x in orderProfitByOrderNo));
    if (!missing.length) return { ...orderProfitByOrderNo };

    const next: Record<string, any | null> = {};
    const batchSize = 8;
    for (let i = 0; i < missing.length; i += batchSize) {
      const batch = missing.slice(i, i + batchSize);
      const settled = await Promise.allSettled(batch.map((ono) => fetchOrderProfitOne(ono)));
      settled.forEach((r, idx) => {
        const ono = batch[idx];
        next[ono] = r.status === 'fulfilled' ? (r.value as Record<string, unknown>) : null;
      });
    }
    setOrderProfitByOrderNo((prev) => ({ ...prev, ...next }));
    return { ...orderProfitByOrderNo, ...next };
  };

  const buildShipmentReconCsv = (rows: ShipmentReconciliation[], profitMap: Record<string, any | null>) => {
    const header = [
      '对账单号',
      '客户',
      '订单号',
      '款号',
      '颜色',
      '数量',
      '入库数量',
      '生产单价(元/件)',
      '面辅料总成本(元)',
      '生产总成本(元)',
      '总售价(元)',
      '利润(元)',
      '单价(元)',
      '总金额(元)',
      '对账日期',
      '状态',
    ];
    const lines = [header.map(escapeCsvCell).join(',')];
    for (const r of rows) {
      const st = getStatusConfig((r as Record<string, unknown>)?.status);
      const orderNo = String((r as Record<string, unknown>)?.orderNo || '').trim();
      const p = orderNo ? profitMap[orderNo] : null;
      const order = (p as Record<string, unknown>)?.order;
      const summary = (p as Record<string, unknown>)?.summary;
      const baseQty = getBaseQty(p, r);
      const processingUnit = computeUnitPrice((summary as Record<string, unknown>)?.processingCost, baseQty);
      const materialTotalCost = getMaterialTotalCost(p);
      const processingTotalCost = getProcessingTotalCost(p, baseQty);
      const finalUnit = getFinalUnitPrice(p, baseQty);
      const revenue = finalUnit * (baseQty || 0);
      const profit = revenue - materialTotalCost - processingTotalCost;
      const warehousingQtyText = (() => {
        const n = toNumberOrNull((order as Record<string, unknown>)?.warehousingQuantity);
        return n == null ? '' : String(n);
      })();
      const row = [
        String((r as Record<string, unknown>)?.reconciliationNo || '').trim(),
        String((r as Record<string, unknown>)?.customerName || '').trim(),
        orderNo,
        String((r as Record<string, unknown>)?.styleNo || '').trim(),
        String((order as Record<string, unknown>)?.color || (r as Record<string, unknown>)?.color || '').trim(),
        String(Number((r as Record<string, unknown>)?.quantity ?? 0) || 0),
        warehousingQtyText,
        processingUnit == null ? '' : String(processingUnit.toFixed(2)),
        String(Number(materialTotalCost || 0).toFixed(2)),
        String(Number(processingTotalCost || 0).toFixed(2)),
        String(Number(revenue || 0).toFixed(2)),
        String(Number(profit || 0).toFixed(2)),
        toCsvMoneyText((r as Record<string, unknown>)?.unitPrice),
        toCsvMoneyText((r as Record<string, unknown>)?.totalAmount),
        String(formatDateTime((r as Record<string, unknown>)?.reconciliationDate) || ''),
        String(st?.text || ''),
      ];
      lines.push(row.map(escapeCsvCell).join(','));
    }
    return `\ufeff${lines.join('\n')}`;
  };

  const buildShipmentReconExcelHtml = (rows: ShipmentReconciliation[], profitMap: Record<string, any | null>) => {
    const header = [
      '对账单号',
      '客户',
      '订单号',
      '款号',
      '颜色',
      '入库数量(件)',
      '最终报价(元/件)',
      '生产单价(元/件)',
      '面辅料总成本(元)',
      '生产总成本(元)',
      '总售价(元)',
      '利润(元)',
      '对账日期',
      '状态',
    ];

    const rowsHtml = rows
      .map((r) => {
        const st = getStatusConfig((r as Record<string, unknown>)?.status);
        const orderNo = String((r as Record<string, unknown>)?.orderNo || '').trim();
        const p = orderNo ? profitMap[orderNo] : null;
        const order = (p as Record<string, unknown>)?.order;
        const summary = (p as Record<string, unknown>)?.summary;

        const baseQty = getBaseQty(p, r);
        const finalUnit = getFinalUnitPrice(p, baseQty);
        const revenue = finalUnit * (baseQty || 0);
        const materialTotalCost = getMaterialTotalCost(p);
        const processingTotalCost = getProcessingTotalCost(p, baseQty);
        const processingUnit = computeUnitPrice((summary as Record<string, unknown>)?.processingCost, baseQty) ?? 0;
        const profit = revenue - materialTotalCost - processingTotalCost;

        const cells = [
          String((r as Record<string, unknown>)?.reconciliationNo || '').trim(),
          String((r as Record<string, unknown>)?.customerName || '').trim(),
          orderNo,
          String((r as Record<string, unknown>)?.styleNo || '').trim(),
          String((order as Record<string, unknown>)?.color || (r as Record<string, unknown>)?.color || '').trim(),
          baseQty > 0 ? String(baseQty) : '',
          Number(finalUnit || 0).toFixed(2),
          Number(processingUnit || 0).toFixed(2),
          Number(materialTotalCost || 0).toFixed(2),
          Number(processingTotalCost || 0).toFixed(2),
          Number(revenue || 0).toFixed(2),
          Number(profit || 0).toFixed(2),
          String(formatDateTime((r as Record<string, unknown>)?.reconciliationDate) || ''),
          String(st?.text || ''),
        ];

        return `<tr>${cells.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`;
      })
      .join('');

    const headerHtml = `<tr>${header.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr>`;
    return (
      `<!DOCTYPE html><html><head><meta charset="utf-8" /></head><body>` +
      `<table border="1" cellspacing="0" cellpadding="4">` +
      headerHtml +
      rowsHtml +
      `</table></body></html>`
    );
  };

  const fetchAllForExport = async () => {
    const pageSize = 200;
    let page = 1;
    let total = Infinity;
    const all: ShipmentReconciliation[] = [];
    while (all.length < total) {
      const response = await api.get<{ code: number; message: string; data: { records: ShipmentReconciliation[]; total: number } }>('/finance/shipment-reconciliation/list', {
        params: { ...queryParams, page, pageSize },
      });
      if (response.code !== 200) {
        throw new Error(response.message || '获取出货对账列表失败');
      }
      const records = (response.data?.records || []) as ShipmentReconciliation[];
      total = Number(response.data?.total ?? records.length ?? 0);
      all.push(...records);
      if (!records.length) break;
      if (records.length < pageSize) break;
      page += 1;
      if (page > 200) break;
    }
    return all;
  };

  const exportSelectedCsv = async () => {
    const picked = reconciliationList.filter((r) => selectedRowKeys.includes(String((r as Record<string, unknown>)?.id)));
    if (!picked.length) {
      message.warning('请先勾选要导出的对账单');
      return;
    }
    setExporting(true);
    try {
      const profitMap = await ensureOrderProfit(picked.map((r) => String((r as Record<string, unknown>)?.orderNo || '').trim()));
      const csv = buildShipmentReconCsv(picked, profitMap);
      downloadTextFile(`成品结算_勾选_${fileStamp()}.csv`, csv, 'text/csv;charset=utf-8');
    } catch (e: unknown) {
      message.error(e?.message || '导出失败');
    } finally {
      setExporting(false);
    }
  };

  const exportFilteredCsv = async () => {
    setExporting(true);
    try {
      const rows = await fetchAllForExport();
      if (!rows.length) {
        message.info('暂无记录可导出');
        return;
      }
      const profitMap = await ensureOrderProfit(rows.map((r) => String((r as Record<string, unknown>)?.orderNo || '').trim()));
      const csv = buildShipmentReconCsv(rows, profitMap);
      downloadTextFile(`成品结算_筛选_${fileStamp()}.csv`, csv, 'text/csv;charset=utf-8');
    } catch (e: unknown) {
      message.error(e?.message || '导出失败');
    } finally {
      setExporting(false);
    }
  };

  const exportCsv = () => {
    if (selectedRowKeys.length) {
      exportSelectedCsv();
      return;
    }
    exportFilteredCsv();
  };

  const exportSelectedExcel = async () => {
    const picked = reconciliationList.filter((r) => selectedRowKeys.includes(String((r as Record<string, unknown>)?.id)));
    if (!picked.length) {
      message.warning('请先勾选要导出的对账单');
      return;
    }
    setExporting(true);
    try {
      const profitMap = await ensureOrderProfit(picked.map((r) => String((r as Record<string, unknown>)?.orderNo || '').trim()));
      const html = buildShipmentReconExcelHtml(picked, profitMap);
      downloadTextFile(`成品结算_勾选_${fileStamp()}.xls`, html, 'application/vnd.ms-excel;charset=utf-8');
    } catch (e: unknown) {
      message.error(e?.message || '导出失败');
    } finally {
      setExporting(false);
    }
  };

  const exportFilteredExcel = async () => {
    setExporting(true);
    try {
      const rows = await fetchAllForExport();
      if (!rows.length) {
        message.info('暂无记录可导出');
        return;
      }
      const profitMap = await ensureOrderProfit(rows.map((r) => String((r as Record<string, unknown>)?.orderNo || '').trim()));
      const html = buildShipmentReconExcelHtml(rows, profitMap);
      downloadTextFile(`成品结算_筛选_${fileStamp()}.xls`, html, 'application/vnd.ms-excel;charset=utf-8');
    } catch (e: unknown) {
      message.error(e?.message || '导出失败');
    } finally {
      setExporting(false);
    }
  };

  const exportExcel = () => {
    if (selectedRowKeys.length) {
      exportSelectedExcel();
      return;
    }
    exportFilteredExcel();
  };

  const batchAudit = () => {
    const ids = reconciliationList
      .filter((r) => selectedRowKeys.includes(String(r.id)) && r.status === 'pending')
      .map((r) => String(r.id || ''));
    if (!ids.length) return;
    if (ids.length !== selectedRowKeys.length) message.warning('仅可批量审核状态为“待审核”的对账单');
    updateStatusBatch(ids.map((id) => ({ id, status: 'verified' })), '审核成功');
  };

  const batchSubmit = async () => {
    const picked = reconciliationList.filter((r) => selectedRowKeys.includes(String(r.id)));
    const eligible = picked.filter((r) => r.status === 'verified' || r.status === 'rejected');
    if (!eligible.length) return;
    if (eligible.length !== picked.length) message.warning('仅可批量提交状态为“已验证/已拒绝”的对账单');
    const pairs = eligible.map((r) => ({ id: String(r.id || ''), status: r.status === 'verified' ? 'approved' : 'pending' }));
    await updateStatusBatch(pairs, '提交成功');
    navigate('/finance/payment-approval', { state: { defaultTab: 'shipment' } });
  };

  const batchReturn = () => {
    const picked = reconciliationList.filter((r) => selectedRowKeys.includes(String(r.id)));
    const eligible = picked.filter((r) => r.status === 'verified' || r.status === 'approved' || r.status === 'paid');
    if (!eligible.length) return;
    if (eligible.length !== picked.length) message.warning('仅可批量退回状态为“已验证/已批准/已付款”的对账单');
    openReturnModal(eligible.map((r) => String(r.id || '')));
  };

  const fetchReconciliationList = async () => {
    setLoading(true);
    try {
      const response = await api.get<{ code: number; message: string; data: { records: ShipmentReconciliation[]; total: number } }>('/finance/shipment-reconciliation/list', { params: queryParams });
      if (response.code === 200) {
        setReconciliationList((response.data?.records || []) as ShipmentReconciliation[]);
        setTotal(Number(response.data?.total || 0));
      } else {
        message.error(response.message || '获取出货对账列表失败');
      }
    } catch (e: unknown) {
      message.error(e?.message || '获取出货对账列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSelectedRowKeys([]);
    fetchReconciliationList();
  }, [
    queryParams.page,
    queryParams.pageSize,
    queryParams.reconciliationNo,
    queryParams.customerName,
    queryParams.orderNo,
    queryParams.styleNo,
    queryParams.status,
    queryParams.startDate,
    queryParams.endDate,
  ]);

  // 实时同步：45秒自动轮询更新出货对账数据
  // 出货对账数据需要及时更新，防止多人操作时数据不一致
  useSync(
    'shipment-reconciliation-list',
    async () => {
      try {
        const response = await api.get<{ code: number; data: { records: ShipmentReconciliation[]; total: number } }>('/finance/shipment-reconciliation/list', { params: queryParams });
        if (response.code === 200) {
          return {
            records: (response.data?.records || []) as ShipmentReconciliation[],
            total: Number(response.data?.total || 0)
          };
        }
        return null;
      } catch (error) {
        console.error('[实时同步] 获取出货对账列表失败', error);
        return null;
      }
    },
    (newData, oldData) => {
      if (oldData !== null && newData) {
        setReconciliationList(newData.records);
        setTotal(newData.total);
        // console.log('[实时同步] 出货对账数据已更新', {
        //   oldCount: oldData.records.length,
        //   newCount: newData.records.length,
        //   oldTotal: oldData.total,
        //   newTotal: newData.total
        // });
      }
    },
    {
      interval: 45000, // 45秒轮询，财务数据中等频率
      enabled: !loading && !visible && !materialDetailOpen, // 加载中或弹窗打开时暂停
      pauseOnHidden: true, // 页面隐藏时暂停
      onError: (error) => {
        console.error('[实时同步] 出货对账数据同步错误', error);
      }
    }
  );

  useEffect(() => {
    const orderNos = reconciliationList.map((r) => String((r as Record<string, unknown>)?.orderNo || '').trim()).filter(Boolean);
    if (!orderNos.length) return;
    let cancelled = false;
    (async () => {
      const unique = Array.from(new Set(orderNos));
      const missing = unique.filter((x) => !(x in orderProfitByOrderNo));
      if (!missing.length) return;
      const next: Record<string, any | null> = {};
      const batchSize = 8;
      for (let i = 0; i < missing.length; i += batchSize) {
        const batch = missing.slice(i, i + batchSize);
        const settled = await Promise.allSettled(batch.map((ono) => fetchOrderProfitOne(ono)));
        settled.forEach((r, idx) => {
          const ono = batch[idx];
          next[ono] = r.status === 'fulfilled' ? (r.value as Record<string, unknown>) : null;
        });
      }
      if (cancelled) return;
      setOrderProfitByOrderNo((prev) => ({ ...prev, ...next }));
    })();
    return () => {
      cancelled = true;
    };
  }, [reconciliationList]);

  const openDialog = (recon?: ShipmentReconciliation) => {
    setCurrentRecon(recon || null);
    setVisible(true);
    const rid = String((recon as Record<string, unknown>)?.id || '').trim();
    setDeductionItems([]);
    if (rid) {
      fetchDeductionItems(rid);
      reloadCurrentRecon(rid);
    }
  };

  const closeDialog = () => {
    setVisible(false);
    setCurrentRecon(null);
    setDeductionItems([]);
  };

  const openMaterialDetail = async (record: ShipmentReconciliation) => {
    const orderNo = String((record as Record<string, unknown>)?.orderNo || '').trim();
    if (!orderNo) return;
    setMaterialDetailOpen(true);
    setMaterialDetailLoading(true);
    try {
      const profitMap = await ensureOrderProfit([orderNo]);
      setMaterialDetailProfit(profitMap[orderNo] || null);
    } finally {
      setMaterialDetailLoading(false);
    }
  };

  const closeMaterialDetail = () => {
    setMaterialDetailOpen(false);
    setMaterialDetailProfit(null);
    setMaterialDetailLoading(false);
  };

  const ignoreRowClick = (e: unknown) => {
    const el = e?.target as HTMLElement | null;
    if (!el) return false;
    return Boolean(
      el.closest(
        'button,a,.ant-checkbox-wrapper,.ant-checkbox,.table-actions,.ant-dropdown,.ant-select,.ant-input,.ant-picker'
      )
    );
  };

  const materialGroups = useMemo(() => {
    const items = ((materialDetailProfit as Record<string, unknown>)?.materials || []) as Record<string, unknown>[];
    const groups: Record<string, any[]> = {};
    for (const it of items || []) {
      const raw = String((it as Record<string, unknown>)?.materialType || '').trim();
      const key = raw.includes('面') ? '面料' : raw.includes('辅') ? '辅料' : raw || '其他';
      if (!groups[key]) groups[key] = [];
      groups[key].push(it);
    }
    const order = ['面料', '辅料', '其他'];
    const keys = Object.keys(groups).sort((a, b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      return a.localeCompare(b);
    });
    return keys.map((k) => ({ key: k, title: k, items: groups[k] }));
  }, [materialDetailProfit]);

  const updateStatusBatch = async (pairs: Array<{ id: string; status: string }>, successText: string) => {
    const normalized = pairs
      .map((p) => ({ id: String(p.id || '').trim(), status: String(p.status || '').trim() }))
      .filter((p) => p.id && p.status);
    if (!normalized.length) return;
    setApprovalSubmitting(true);
    try {
      const settled = await Promise.allSettled(
        normalized.map((p) => updateFinanceReconciliationStatus(p.id, p.status)),
      );
      const okCount = settled.filter((r) => r.status === 'fulfilled' && (r.value as Record<string, unknown>)?.code === 200).length;
      const failed = normalized.length - okCount;
      if (okCount <= 0) {
        message.error('操作失败');
        return;
      }
      if (failed) message.error(`部分操作失败（${failed}/${normalized.length}）`);
      else message.success(successText);
      setSelectedRowKeys([]);
      fetchReconciliationList();
    } catch (e: unknown) {
      message.error(e?.message || '操作失败');
    } finally {
      setApprovalSubmitting(false);
    }
  };

  const openReturnModal = (ids: string[]) => {
    const normalized = ids.map((id) => String(id || '').trim()).filter(Boolean);
    if (!normalized.length) return;
    let reasonValue = '';
    Modal.confirm({
      title: normalized.length > 1 ? `批量退回（${normalized.length}条）` : '退回',
      content: (
        <Form layout="vertical" onSubmitCapture={(e) => e.preventDefault()}>
          <Form.Item label="退回原因">
            <Input.TextArea
              rows={4}
              maxLength={200}
              showCount
              onChange={(e) => {
                reasonValue = e.target.value;
              }}
            />
          </Form.Item>
        </Form>
      ),
      okText: '确认退回',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        const remark = String(reasonValue || '').trim();
        if (!remark) {
          message.error('请输入退回原因');
          return Promise.reject(new Error('请输入退回原因'));
        }
        setApprovalSubmitting(true);
        try {
          const settled = await Promise.allSettled(
            normalized.map((id) => returnFinanceReconciliation(id, remark)),
          );
          const okCount = settled.filter((r) => r.status === 'fulfilled' && (r.value as Record<string, unknown>)?.code === 200).length;
          const failed = normalized.length - okCount;
          if (okCount <= 0) {
            message.error('退回失败');
            return;
          }
          if (failed) message.error(`部分退回失败（${failed}/${normalized.length}）`);
          else message.success('退回成功');
          setSelectedRowKeys([]);
          fetchReconciliationList();
        } catch (e: unknown) {
          message.error(e?.message || '退回失败');
        } finally {
          setApprovalSubmitting(false);
        }
      },
    });
  };

  const getStatusConfig = (status: ShipmentReconciliation['status'] | string | undefined | null) => {
    const statusMap: Record<string, { text: string; color: string }> = {
      pending: { text: '待审核', color: 'blue' },
      verified: { text: '已验证', color: 'green' },
      approved: { text: '已批准', color: 'cyan' },
      paid: { text: '已付款', color: 'success' },
      rejected: { text: '已拒绝', color: 'error' },
    };
    const key = String(status || '').trim();
    return statusMap[key] || { text: '未知', color: 'default' };
  };

  const columns = [
    {
      title: '图片',
      key: 'cover',
      width: 72,
      render: (_: any, record: ShipmentReconciliation) => (
        <StyleCoverThumb styleNo={(record as Record<string, unknown>).styleNo} src={(record as Record<string, unknown>).cover || null} />
      ),
    },
    {
      title: '对账单号',
      dataIndex: 'reconciliationNo',
      key: 'reconciliationNo',
      width: 140,
      render: (_: any, record: ShipmentReconciliation) => (
        <Button type="link" size="small" onClick={() => openDialog(record)} style={{ padding: 0 }}>
          {String(record.reconciliationNo || '').trim() || '-'}
        </Button>
      ),
    },
    {
      title: '客户',
      dataIndex: 'customerName',
      key: 'customerName',
      width: 140,
      ellipsis: true,
      render: (v: unknown) => String(v || '').trim() || '-',
    },
    {
      title: '订单号',
      dataIndex: 'orderNo',
      key: 'orderNo',
      width: 120,
      render: (v: unknown) => String(v || '').trim() || '-',
    },
    {
      title: '款号',
      dataIndex: 'styleNo',
      key: 'styleNo',
      width: 110,
      render: (v: unknown) => String(v || '').trim() || '-',
    },
    {
      title: '颜色',
      key: 'color',
      width: 100,
      render: (_: any, record: ShipmentReconciliation) => {
        const orderNo = String((record as Record<string, unknown>)?.orderNo || '').trim();
        const p = orderNo ? orderProfitByOrderNo[orderNo] : null;
        const c = String((p as Record<string, unknown>)?.order?.color || (record as Record<string, unknown>)?.color || '').trim();
        return c || '-';
      },
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 80,
      align: 'right' as const,
    },
    {
      title: '入库数量',
      key: 'warehousingQuantity',
      width: 100,
      align: 'right' as const,
      render: (_: any, record: ShipmentReconciliation) => {
        const orderNo = String((record as Record<string, unknown>)?.orderNo || '').trim();
        const p = orderNo ? orderProfitByOrderNo[orderNo] : null;
        const n = toNumberOrNull((p as Record<string, unknown>)?.order?.warehousingQuantity);
        return n == null ? '-' : String(n);
      },
    },
    {
      title: '生产单价(元/件)',
      key: 'processingUnitPrice',
      width: 130,
      align: 'right' as const,
      render: (_: any, record: ShipmentReconciliation) => {
        const orderNo = String((record as Record<string, unknown>)?.orderNo || '').trim();
        const p = orderNo ? orderProfitByOrderNo[orderNo] : null;
        const summary = (p as Record<string, unknown>)?.summary;
        const baseQty = getBaseQty(p, record);
        const unit = computeUnitPrice((summary as Record<string, unknown>)?.processingCost, baseQty);
        return unit == null ? '-' : unit.toFixed(2);
      },
      sorter: (a: any, b: any) => {
        const pa = (orderProfitByOrderNo[String((a as Record<string, unknown>)?.orderNo || '').trim()] || null) as Record<string, unknown>;
        const pb = (orderProfitByOrderNo[String((b as Record<string, unknown>)?.orderNo || '').trim()] || null) as Record<string, unknown>;
        const ua = computeUnitPrice(pa?.summary?.processingCost, getBaseQty(pa, a)) ?? -Infinity;
        const ub = computeUnitPrice(pb?.summary?.processingCost, getBaseQty(pb, b)) ?? -Infinity;
        return ua - ub;
      },
    },
    {
      title: '面辅料总成本(元)',
      key: 'materialTotalCost',
      width: 140,
      align: 'right' as const,
      render: (_: any, record: ShipmentReconciliation) => {
        const orderNo = String((record as Record<string, unknown>)?.orderNo || '').trim();
        const p = orderNo ? orderProfitByOrderNo[orderNo] : null;
        return toMoney2(getMaterialTotalCost(p));
      },
      sorter: (a: any, b: any) => {
        const pa = (orderProfitByOrderNo[String((a as Record<string, unknown>)?.orderNo || '').trim()] || null) as Record<string, unknown>;
        const pb = (orderProfitByOrderNo[String((b as Record<string, unknown>)?.orderNo || '').trim()] || null) as Record<string, unknown>;
        return getMaterialTotalCost(pa) - getMaterialTotalCost(pb);
      },
    },
    {
      title: '生产总成本(元)',
      key: 'processingTotalCost',
      width: 140,
      align: 'right' as const,
      render: (_: any, record: ShipmentReconciliation) => {
        const orderNo = String((record as Record<string, unknown>)?.orderNo || '').trim();
        const p = orderNo ? orderProfitByOrderNo[orderNo] : null;
        const qty = getBaseQty(p, record);
        return toMoney2(getProcessingTotalCost(p, qty));
      },
      sorter: (a: any, b: any) => {
        const pa = (orderProfitByOrderNo[String((a as Record<string, unknown>)?.orderNo || '').trim()] || null) as Record<string, unknown>;
        const pb = (orderProfitByOrderNo[String((b as Record<string, unknown>)?.orderNo || '').trim()] || null) as Record<string, unknown>;
        return getProcessingTotalCost(pa, getBaseQty(pa, a)) - getProcessingTotalCost(pb, getBaseQty(pb, b));
      },
    },
    {
      title: '利润(元)',
      key: 'profit',
      width: 120,
      align: 'right' as const,
      render: (_: any, record: ShipmentReconciliation) => {
        const orderNo = String((record as Record<string, unknown>)?.orderNo || '').trim();
        const p = orderNo ? orderProfitByOrderNo[orderNo] : null;
        const v = getProfitByFormula(p, record);
        const n = toNumberOrNull(v) ?? 0;
        const color = n > 0 ? '#389e0d' : n < 0 ? '#cf1322' : '#595959';
        return <span style={{ color, fontWeight: 600 }}>{n.toFixed(2)}</span>;
      },
      sorter: (a: any, b: any) => {
        const pa = (orderProfitByOrderNo[String((a as Record<string, unknown>)?.orderNo || '').trim()] || null) as Record<string, unknown>;
        const pb = (orderProfitByOrderNo[String((b as Record<string, unknown>)?.orderNo || '').trim()] || null) as Record<string, unknown>;
        return getProfitByFormula(pa, a) - getProfitByFormula(pb, b);
      },
    },
    {
      title: '单价(元)',
      dataIndex: 'unitPrice',
      key: 'unitPrice',
      width: 100,
      align: 'right' as const,
      render: (value: unknown) => Number(value || 0).toFixed(2),
    },
    {
      title: '总金额(元)',
      dataIndex: 'totalAmount',
      key: 'totalAmount',
      width: 120,
      align: 'right' as const,
      render: (value: unknown) => Number(value || 0).toFixed(2),
    },
    {
      title: '对账日期',
      dataIndex: 'reconciliationDate',
      key: 'reconciliationDate',
      width: 120,
      render: (value: unknown) => formatDateTime(value),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: ShipmentReconciliation['status']) => {
        const cfg = getStatusConfig(status);
        return <Tag color={cfg.color}>{cfg.text}</Tag>;
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 110,
      render: (_: any, record: ShipmentReconciliation) => {
        const id = String(record.id || '').trim();
        const st = String(record.status || '').trim();
        const canAudit = Boolean(id) && st === 'pending';
        const canSubmit = Boolean(id) && (st === 'verified' || st === 'rejected');
        const canReturn = Boolean(id) && (st === 'verified' || st === 'approved' || st === 'paid');
        return (
          <RowActions
            className="table-actions"
            maxInline={0}
            actions={[
              {
                key: 'audit',
                label: '审核',
                title: canAudit ? '审核' : '审核(不可用)',
                icon: <CheckOutlined />,
                disabled: !canAudit,
                onClick: () => updateStatusBatch([{ id, status: 'verified' }], '审核成功'),
                primary: true,
              },
              {
                key: 'submit',
                label: '提交',
                title: canSubmit ? '提交' : '提交(不可用)',
                icon: <SendOutlined />,
                disabled: !canSubmit,
                onClick: async () => {
                  const target = st === 'verified' ? 'approved' : 'pending';
                  await updateStatusBatch([{ id, status: target }], '提交成功');
                  navigate('/finance/payment-approval', { state: { defaultTab: 'shipment', defaultStatus: target } });
                },
                primary: true,
              },
              {
                key: 'return',
                label: '退回',
                title: canReturn ? '退回' : '退回(不可用)',
                icon: <RollbackOutlined />,
                disabled: !canReturn,
                onClick: () => openReturnModal([id]),
                danger: true,
              },
            ]}
          />
        );
      },
    },
  ];

  return (
    <Layout>
      <div>
        <Card className="page-card">
          <div className="page-header">
            <h2 className="page-title">成品结算</h2>
            <Space>
              <Dropdown
                trigger={['click']}
                menu={{
                  items: [
                    {
                      key: 'exportExcel',
                      label: exporting ? '导出中...' : '导出Excel',
                      icon: <DownloadOutlined />,
                      disabled: exporting,
                      onClick: exportExcel,
                    },
                    {
                      key: 'exportCsv',
                      label: exporting ? '导出中...' : '导出CSV',
                      icon: <DownloadOutlined />,
                      disabled: exporting,
                      onClick: exportCsv,
                    },
                    { type: 'divider' as const },
                    {
                      key: 'batchAudit',
                      label: approvalSubmitting ? '处理中...' : '批量审核',
                      icon: <CheckOutlined />,
                      disabled:
                        approvalSubmitting ||
                        !selectedRowKeys.length ||
                        !reconciliationList.some((r) => selectedRowKeys.includes(String(r.id)) && r.status === 'pending'),
                      onClick: batchAudit,
                    },
                    {
                      key: 'batchSubmit',
                      label: approvalSubmitting ? '处理中...' : '批量提交',
                      icon: <SendOutlined />,
                      disabled:
                        approvalSubmitting ||
                        !selectedRowKeys.length ||
                        !reconciliationList.some((r) => selectedRowKeys.includes(String(r.id)) && (r.status === 'verified' || r.status === 'rejected')),
                      onClick: batchSubmit,
                    },
                    {
                      key: 'batchReturn',
                      label: approvalSubmitting ? '处理中...' : '批量退回',
                      icon: <RollbackOutlined />,
                      disabled:
                        approvalSubmitting ||
                        !selectedRowKeys.length ||
                        !reconciliationList.some((r) => selectedRowKeys.includes(String(r.id)) && (r.status === 'verified' || r.status === 'approved' || r.status === 'paid')),
                      onClick: batchReturn,
                      danger: true,
                    },
                    { type: 'divider' as const },
                    {
                      key: 'create',
                      label: '新增成品结算',
                      icon: <PlusOutlined />,
                      onClick: () => openDialog(),
                    },
                  ],
                }}
              >
                <Button icon={<MoreOutlined />}>操作</Button>
              </Dropdown>
            </Space>
          </div>

          <Card size="small" className="filter-card mb-sm">
            <Form form={filterForm} layout="inline" size="small">
              <Form.Item label="对账单号">
                <Input
                  placeholder="请输入对账单号"
                  onChange={(e) => setQueryParams((prev) => ({ ...prev, reconciliationNo: e.target.value, page: 1 }))}
                  style={{ width: 150 }}
                  allowClear
                />
              </Form.Item>
              <Form.Item label="客户">
                <Input
                  placeholder="请输入客户"
                  onChange={(e) => setQueryParams((prev) => ({ ...prev, customerName: e.target.value, page: 1 }))}
                  style={{ width: 150 }}
                  allowClear
                />
              </Form.Item>
              <Form.Item label="订单号">
                <Input
                  placeholder="请输入订单号"
                  onChange={(e) => setQueryParams((prev) => ({ ...prev, orderNo: e.target.value, page: 1 }))}
                  style={{ width: 140 }}
                  allowClear
                />
              </Form.Item>
              <Form.Item label="款号">
                <Input
                  placeholder="请输入款号"
                  onChange={(e) => setQueryParams((prev) => ({ ...prev, styleNo: e.target.value, page: 1 }))}
                  style={{ width: 120 }}
                  allowClear
                />
              </Form.Item>
              <Form.Item label="状态">
                <Select
                  placeholder="请选择状态"
                  onChange={(value) => setQueryParams((prev) => ({ ...prev, status: value || undefined, page: 1 }))}
                  style={{ width: 120 }}
                  allowClear
                >
                  <Option value="">全部</Option>
                  <Option value="pending">待审核</Option>
                  <Option value="verified">已验证</Option>
                  <Option value="approved">已批准</Option>
                  <Option value="paid">已付款</Option>
                  <Option value="rejected">已拒绝</Option>
                </Select>
              </Form.Item>
              <Form.Item className="filter-actions">
                <Space>
                  <Button type="primary" icon={<SearchOutlined />} onClick={() => fetchReconciliationList()} loading={loading}>
                    查询
                  </Button>
                  <Button onClick={() => setQueryParams({ page: 1, pageSize: 10 })}>
                    重置
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </Card>

          <ResizableTable
            columns={columns}
            dataSource={reconciliationList}
            rowKey="id"
            loading={loading}
            allowFixedColumns
            onRow={(record) => {
              return {
                onClick: (e: unknown) => {
                  if (ignoreRowClick(e)) return;
                  openMaterialDetail(record);
                },
              } as Record<string, unknown>;
            }}
            rowSelection={{
              selectedRowKeys,
              onChange: (keys) => setSelectedRowKeys(keys),
              getCheckboxProps: (record: ShipmentReconciliation) => ({
                disabled: record.status === 'paid',
              }),
            }}
            pagination={{
              current: queryParams.page,
              pageSize: queryParams.pageSize,
              total,
              onChange: (page, pageSize) => setQueryParams((prev) => ({ ...prev, page, pageSize })),
            }}
          />
        </Card>
      </div>

      <ResizableModal
        open={visible}
        title={currentRecon ? '成品结算详情' : '新增成品结算'}
        onCancel={closeDialog}
        footer={
          <div className="modal-footer-actions">
            <Button onClick={closeDialog}>关闭</Button>
          </div>
        }
        width={modalWidth}
        initialHeight={modalInitialHeight}
        scaleWithViewport
      >
        {currentRecon ? (
          <>
            <div className="modal-detail-header">
              <div className="modal-detail-cover">
                <StyleCoverThumb styleNo={String(currentRecon.styleNo || '').trim()} size={160} borderRadius={10} />
              </div>
              <div className="modal-detail-grid">
                <div className="modal-detail-item"><span className="modal-detail-label">对账单号：</span><span className="modal-detail-value">{currentRecon.reconciliationNo}</span></div>
                <div className="modal-detail-item"><span className="modal-detail-label">客户：</span><span className="modal-detail-value">{currentRecon.customerName || '-'}</span></div>
                <div className="modal-detail-item"><span className="modal-detail-label">订单号：</span><span className="modal-detail-value">{currentRecon.orderNo}</span></div>
                <div className="modal-detail-item"><span className="modal-detail-label">款号：</span><span className="modal-detail-value">{currentRecon.styleNo}</span></div>
                <div className="modal-detail-item"><span className="modal-detail-label">数量：</span><span className="modal-detail-value">{currentRecon.quantity}</span></div>
                <div className="modal-detail-item"><span className="modal-detail-label">单价：</span><span className="modal-detail-value">{Number(currentRecon.unitPrice || 0).toFixed(2)} 元</span></div>
                <div className="modal-detail-item"><span className="modal-detail-label">总金额：</span><span className="modal-detail-value">{Number(currentRecon.totalAmount || 0).toFixed(2)} 元</span></div>
                <div className="modal-detail-item"><span className="modal-detail-label">对账日期：</span><span className="modal-detail-value">{formatDateTime(currentRecon.reconciliationDate)}</span></div>
                <div className="modal-detail-item"><span className="modal-detail-label">状态：</span><span className="modal-detail-value">{getStatusConfig(currentRecon.status).text}</span></div>
                <div className="modal-detail-item"><span className="modal-detail-label">创建时间：</span><span className="modal-detail-value">{formatDateTime(currentRecon.createTime)}</span></div>
              </div>
            </div>

            <div style={{ marginTop: 24, paddingTop: 24, borderTop: '1px solid #f0f0f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <h3 className="section-title" style={{ marginBottom: 0, fontWeight: 600 }}>扣款项</h3>
                <Space wrap>
                  <Tag color="blue">总金额：{Number((currentRecon as Record<string, unknown>)?.totalAmount || 0).toFixed(2)} 元</Tag>
                  <Tag color="orange">扣款：{Number((currentRecon as Record<string, unknown>)?.deductionAmount || 0).toFixed(2)} 元</Tag>
                  <Tag color="green">最终金额：{Number((currentRecon as Record<string, unknown>)?.finalAmount || 0).toFixed(2)} 元</Tag>
                </Space>
              </div>

              <div style={{ marginTop: 12 }}>
                <ResizableTable
                  columns={[
                    {
                      title: '扣款类型',
                      dataIndex: 'deductionType',
                      key: 'deductionType',
                      width: 180,
                      render: (_: any, record: DeductionItem, index: number) => (
                        <Input
                          value={String((record as Record<string, unknown>)?.deductionType || '')}
                          placeholder="例如：质量扣款"
                          disabled={String((currentRecon as Record<string, unknown>)?.status || '') === 'paid'}
                          onChange={(e) => {
                            const v = e.target.value;
                            setDeductionItems((prev) => {
                              const next = [...prev];
                              next[index] = { ...next[index], deductionType: v } as DeductionItem;
                              return next;
                            });
                          }}
                        />
                      ),
                    },
                    {
                      title: '扣款金额(元)',
                      dataIndex: 'deductionAmount',
                      key: 'deductionAmount',
                      width: 160,
                      align: 'right' as const,
                      render: (_: any, record: DeductionItem, index: number) => (
                        <InputNumber
                          value={Number((record as Record<string, unknown>)?.deductionAmount || 0)}
                          min={0}
                          step={0.01}
                          style={{ width: '100%' }}
                          disabled={String((currentRecon as Record<string, unknown>)?.status || '') === 'paid'}
                          onChange={(v) => {
                            const n = typeof v === 'number' ? v : Number(v);
                            setDeductionItems((prev) => {
                              const next = [...prev];
                              next[index] = { ...next[index], deductionAmount: Number.isFinite(n) && n >= 0 ? n : 0 } as DeductionItem;
                              return next;
                            });
                          }}
                        />
                      ),
                    },
                    {
                      title: '描述',
                      dataIndex: 'description',
                      key: 'description',
                      render: (_: any, record: DeductionItem, index: number) => (
                        <Input
                          value={String((record as Record<string, unknown>)?.description || '')}
                          placeholder="可选"
                          disabled={String((currentRecon as Record<string, unknown>)?.status || '') === 'paid'}
                          onChange={(e) => {
                            const v = e.target.value;
                            setDeductionItems((prev) => {
                              const next = [...prev];
                              next[index] = { ...next[index], description: v } as DeductionItem;
                              return next;
                            });
                          }}
                        />
                      ),
                    },
                    {
                      title: '操作',
                      key: 'action',
                      width: 90,
                      render: (_: any, _record: DeductionItem, index: number) => (
                        <Button
                          type="link"
                          danger
                          disabled={String((currentRecon as Record<string, unknown>)?.status || '') === 'paid'}
                          onClick={() => setDeductionItems((prev) => prev.filter((_, i) => i !== index))}
                        >
                          删除
                        </Button>
                      ),
                    },
                  ]}
                  dataSource={deductionItems}
                  rowKey={(r: any, idx?: number) => {
                    const id = String(r?.id || '').trim();
                    if (id) return id;
                    return `tmp-${typeof idx === 'number' ? idx : 0}`;
                  }}
                  pagination={false}
                  size="small"
                  loading={deductionLoading}
                  scroll={{ x: 'max-content' }}
                />
              </div>

              <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <Button
                  type="dashed"
                  disabled={String((currentRecon as Record<string, unknown>)?.status || '') === 'paid'}
                  onClick={() =>
                    setDeductionItems((prev) => [
                      ...prev,
                      {
                        reconciliationId: String((currentRecon as Record<string, unknown>)?.id || '').trim(),
                        deductionType: '',
                        description: '',
                        deductionAmount: 0,
                      } as DeductionItem,
                    ])
                  }
                >
                  + 新增扣款项
                </Button>
                <Space wrap>
                  <Button
                    onClick={() => fetchDeductionItems(String((currentRecon as Record<string, unknown>)?.id || '').trim())}
                    loading={deductionLoading}
                    disabled={!String((currentRecon as Record<string, unknown>)?.id || '').trim()}
                  >
                    刷新
                  </Button>
                  <Button
                    type="primary"
                    onClick={saveCurrentDeductionItems}
                    loading={deductionSaving}
                    disabled={String((currentRecon as Record<string, unknown>)?.status || '') === 'paid' || !String((currentRecon as Record<string, unknown>)?.id || '').trim()}
                  >
                    保存扣款项
                  </Button>
                </Space>
              </div>
            </div>

            <div className="audit-actions-section" style={{ marginTop: 24, paddingTop: 24, borderTop: '1px solid #f0f0f0' }}>
              <h3 className="section-title" style={{ marginBottom: 16, fontWeight: 600 }}>审核动作</h3>
              <Space>
                <Button
                  type="primary"
                  disabled={currentRecon.status !== 'pending'}
                  onClick={async () => {
                    try {
                      const res = await updateFinanceReconciliationStatus(String(currentRecon.id || ''), 'verified');
                      const result = res as Record<string, unknown>;
                      if (result.code === 200) {
                        message.success('已验证');
                        setVisible(false);
                        fetchReconciliationList();
                      } else {
                        message.error(result.message || '操作失败');
                      }
                    } catch (e) {
                      message.error('操作失败');
                    }
                  }}
                >
                  验证
                </Button>
                <Button
                  disabled={currentRecon.status !== 'verified'}
                  onClick={async () => {
                    try {
                      const res = await updateFinanceReconciliationStatus(String(currentRecon.id || ''), 'approved');
                      const result = res as Record<string, unknown>;
                      if (result.code === 200) {
                        message.success('已批准');
                        setVisible(false);
                        fetchReconciliationList();
                      } else {
                        message.error(result.message || '操作失败');
                      }
                    } catch (e) {
                      message.error('操作失败');
                    }
                  }}
                >
                  批准
                </Button>
                <Button
                  disabled={currentRecon.status !== 'approved'}
                  onClick={async () => {
                    try {
                      const res = await updateFinanceReconciliationStatus(String(currentRecon.id || ''), 'paid');
                      const result = res as Record<string, unknown>;
                      if (result.code === 200) {
                        message.success('已付款');
                        setVisible(false);
                        fetchReconciliationList();
                      } else {
                        message.error(result.message || '操作失败');
                      }
                    } catch (e) {
                      message.error('操作失败');
                    }
                  }}
                >
                  标记付款
                </Button>
                <Button
                  danger
                  disabled={currentRecon.status === 'rejected' || currentRecon.status === 'paid'}
                  onClick={async () => {
                    try {
                      const res = await updateFinanceReconciliationStatus(String(currentRecon.id || ''), 'rejected');
                      const result = res as Record<string, unknown>;
                      if (result.code === 200) {
                        message.success('已拒绝');
                        setVisible(false);
                        fetchReconciliationList();
                      } else {
                        message.error(result.message || '操作失败');
                      }
                    } catch (e) {
                      message.error('操作失败');
                    }
                  }}
                >
                  拒绝
                </Button>
              </Space>
            </div>
          </>
        ) : (
          <div className="recon-form" style={{ padding: 12 }}>
            <div style={{ color: '#999' }}>请在业务流程中创建成品结算单。</div>
          </div>
        )}
      </ResizableModal>

      <ResizableModal
        open={materialDetailOpen}
        title="面辅料明细"
        onCancel={closeMaterialDetail}
        footer={
          <div className="modal-footer-actions">
            <Button onClick={closeMaterialDetail}>关闭</Button>
          </div>
        }
        width={modalWidth}
        initialHeight={modalInitialHeight}
        scaleWithViewport
      >
        <ResizableModalFlex style={{ gap: 12 }}>
          <ModalHeaderCard isMobile={isMobile}>
            <ModalPrimaryField
              label="订单号"
              value={String((materialDetailProfit as Record<string, unknown>)?.order?.orderNo || '').trim() || '-'}
            />
            <ModalFieldRow gap={24}>
              <ModalField label="款号" value={String((materialDetailProfit as Record<string, unknown>)?.order?.styleNo || '').trim() || '-'} />
              <ModalField label="款名" value={String((materialDetailProfit as Record<string, unknown>)?.order?.styleName || '').trim() || '-'} />
            </ModalFieldRow>
            <ModalFieldGrid columns={2}>
              <ModalField label="入库数量" value={toNumberOrNull((materialDetailProfit as Record<string, unknown>)?.order?.warehousingQuantity) ?? 0} valueColor="#0891b2" />
              <ModalField label="面辅料总成本" value={toMoney2(getMaterialTotalCost(materialDetailProfit))} valueColor="#059669" />
            </ModalFieldGrid>
          </ModalHeaderCard>

          <ResizableModalFlexFill ref={materialDetailTableWrapRef}>
            <Collapse
              accordion={false}
              size="small"
              items={materialGroups.map((g) => {
                const data = (g.items || []) as Record<string, unknown>[];
                const groupAmount = sumMaterialCostFromItems(data);
                return {
                  key: g.key,
                  label: `${g.title}（${data.length}项，${Number(groupAmount || 0).toFixed(2)}元）`,
                  children: (
                    <ResizableTable
                      columns={[
                        {
                          title: '物料名称',
                          dataIndex: 'materialName',
                          key: 'materialName',
                          ellipsis: true,
                          render: (v: unknown) => String(v || '').trim() || '-',
                        },
                        {
                          title: '单价(元)',
                          dataIndex: 'unitPrice',
                          key: 'unitPrice',
                          width: 110,
                          align: 'right' as const,
                          render: (v: unknown) => {
                            const n = toNumberOrNull(v);
                            return n == null ? '-' : n.toFixed(2);
                          },
                          sorter: (a: any, b: any) => (toNumberOrNull(a?.unitPrice) ?? 0) - (toNumberOrNull(b?.unitPrice) ?? 0),
                        },
                        {
                          title: '用量',
                          dataIndex: 'arrivedQuantity',
                          key: 'arrivedQuantity',
                          width: 110,
                          align: 'right' as const,
                          render: (v: unknown) => {
                            const n = toNumberOrNull(v);
                            return n == null ? '-' : String(n);
                          },
                          sorter: (a: any, b: any) => (toNumberOrNull(a?.arrivedQuantity) ?? 0) - (toNumberOrNull(b?.arrivedQuantity) ?? 0),
                        },
                        {
                          title: '小计(元)',
                          key: 'amount',
                          width: 120,
                          align: 'right' as const,
                          render: (_: any, r: any) => {
                            const qty = toNumberOrNull(r?.arrivedQuantity) ?? 0;
                            const unit = toNumberOrNull(r?.unitPrice) ?? 0;
                            return (qty * unit).toFixed(2);
                          },
                          sorter: (a: any, b: any) => {
                            const qa = toNumberOrNull(a?.arrivedQuantity) ?? 0;
                            const ua = toNumberOrNull(a?.unitPrice) ?? 0;
                            const qb = toNumberOrNull(b?.arrivedQuantity) ?? 0;
                            const ub = toNumberOrNull(b?.unitPrice) ?? 0;
                            return qa * ua - qb * ub;
                          },
                        },
                      ]}
                      dataSource={data as Record<string, unknown>}
                      rowKey={(r: Record<string, unknown>) => {
                        const id = String(r?.id || '').trim();
                        if (id) return id;
                        const purchaseNo = String(r?.purchaseNo || '').trim();
                        const materialCode = String(r?.materialCode || '').trim();
                        const materialName = String(r?.materialName || '').trim();
                        const receivedTime = String(r?.receivedTime || '').trim();
                        return [purchaseNo, materialCode, materialName, receivedTime].filter(Boolean).join('|') || 'row';
                      }}
                      pagination={false}
                      expandable={{
                        expandedRowRender: (r: Record<string, unknown>) => {
                          const purchaseNo = String(r?.purchaseNo || '').trim();
                          const materialCode = String(r?.materialCode || '').trim();
                          const specifications = String(r?.specifications || '').trim();
                          const unit = String(r?.unit || '').trim();
                          const materialName = String(r?.materialName || '').trim();
                          return (
                            <div style={{ padding: '8px 4px' }}>
                              <Space wrap>
                                <Tag>采购单号：{purchaseNo || '-'}</Tag>
                                <Tag>物料编码：{materialCode || '-'}</Tag>
                                <Tag>规格：{specifications || '-'}</Tag>
                                <Tag>单位：{unit || '-'}</Tag>
                                <Tag>名称：{materialName || '-'}</Tag>
                              </Space>
                            </div>
                          );
                        },
                        rowExpandable: (r: Record<string, unknown>) =>
                          Boolean(String(r?.purchaseNo || '').trim() || String(r?.materialCode || '').trim()),
                      }}
                      scroll={{ x: 'max-content', y: materialDetailTableScrollY }}
                    />
                  ),
                };
              })}
            />
          </ResizableModalFlexFill>
        </ResizableModalFlex>
      </ResizableModal>
    </Layout>
  );
};

export default ShipmentReconciliationList;
