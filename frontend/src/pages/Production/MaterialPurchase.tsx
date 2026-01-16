import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Input, Select, Space, Tag, Form, Row, Col, InputNumber, message, Segmented, Modal, Dropdown } from 'antd';
import { PlusOutlined, SearchOutlined, EyeOutlined, EditOutlined } from '@ant-design/icons';
import Layout from '../../components/Layout';
import ResizableModal from '../../components/ResizableModal';
import ResizableTable from '../../components/ResizableTable';
import RowActions from '../../components/RowActions';
import { MaterialPurchase as MaterialPurchaseType, MaterialQueryParams } from '../../types/production';
import api, { ensureProductionOrderUnlocked, primeProductionOrderFrozenCache } from '../../utils/api';
import { getMaterialTypeCategory, getMaterialTypeLabel, getMaterialTypeSortKey, normalizeMaterialType } from '../../utils/materialType';
import { StyleAttachmentsButton, StyleCoverThumb } from '../../components/StyleAssets';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../utils/authContext';
import './styles.css';

const { Option } = Select;

const MaterialPurchase: React.FC = () => {
  const location = useLocation();
  const { user } = useAuth();
  const [viewportWidth, setViewportWidth] = useState<number>(() => (typeof window === 'undefined' ? 1200 : window.innerWidth));
  const [visible, setVisible] = useState(false);
  const [currentPurchase, setCurrentPurchase] = useState<MaterialPurchaseType | null>(null);
  const [dialogMode, setDialogMode] = useState<'view' | 'edit' | 'create' | 'preview'>('view');
  const [previewList, setPreviewList] = useState<MaterialPurchaseType[]>([]);
  const [previewOrderId, setPreviewOrderId] = useState<string>('');
  const [queryParams, setQueryParams] = useState<MaterialQueryParams>({
    page: 1,
    pageSize: 10,
    materialType: 'fabric'
  });
  const [form] = Form.useForm();

  // 真实数据状态
  const [purchaseList, setPurchaseList] = useState<MaterialPurchaseType[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [submitLoading, setSubmitLoading] = useState(false);

  const [returnConfirmOpen, setReturnConfirmOpen] = useState(false);
  const [returnConfirmTargets, setReturnConfirmTargets] = useState<MaterialPurchaseType[]>([]);
  const [returnConfirmSubmitting, setReturnConfirmSubmitting] = useState(false);
  const [returnResetOpen, setReturnResetOpen] = useState(false);
  const [returnResetTarget, setReturnResetTarget] = useState<MaterialPurchaseType | null>(null);
  const [returnResetSubmitting, setReturnResetSubmitting] = useState(false);
  const [returnConfirmForm] = Form.useForm();
  const [returnResetForm] = Form.useForm();

  const [detailOrder, setDetailOrder] = useState<any>(null);
  const [detailOrderLines, setDetailOrderLines] = useState<Array<{ color: string; size: string; quantity: number }>>([]);
  const [detailPurchases, setDetailPurchases] = useState<MaterialPurchaseType[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const orderFrozenCacheRef = useRef<Map<string, boolean>>(new Map());
  const [orderFrozenVersion, setOrderFrozenVersion] = useState(0);

  const watchedUnitPrice = Form.useWatch('unitPrice', form);
  const watchedArrivedQuantity = Form.useWatch('arrivedQuantity', form);
  const watchedStyleCover = Form.useWatch('styleCover', form);

  const isMobile = viewportWidth < 768;
  const isTablet = viewportWidth >= 768 && viewportWidth < 1024;
  const modalWidth = isMobile ? '98vw' : isTablet ? '69vw' : '60vw';
  const modalInitialHeight = typeof window === 'undefined' ? 720 : Math.round(window.innerHeight * (isMobile ? 0.92 : 0.86));

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (dialogMode === 'preview') return;
    const qty = Number(watchedArrivedQuantity || 0);
    const price = Number(watchedUnitPrice || 0);
    if (!Number.isFinite(qty) || !Number.isFinite(price)) return;
    const next = Number((qty * price).toFixed(2));
    form.setFieldsValue({ totalAmount: next });
  }, [dialogMode, form, watchedArrivedQuantity, watchedUnitPrice]);

  const parseOrderLines = (order: any) => {
    const detailsRaw = order?.orderDetails;
    const normalizeLine = (l: any) => {
      const color = String(l?.color ?? l?.colour ?? l?.colorName ?? '').trim();
      const size = String(l?.size ?? l?.sizeName ?? l?.spec ?? '').trim();
      const quantity = Number(l?.quantity ?? l?.qty ?? l?.count ?? l?.num ?? 0) || 0;
      return { color, size, quantity };
    };

    let parsed: any = null;
    if (detailsRaw) {
      try {
        parsed = typeof detailsRaw === 'string' ? JSON.parse(detailsRaw) : detailsRaw;
      } catch {
        parsed = null;
      }
    }

    let list: any[] = [];
    if (Array.isArray(parsed)) {
      list = parsed;
    } else if (parsed && typeof parsed === 'object') {
      const candidate = (parsed as any).lines || (parsed as any).items || (parsed as any).details || (parsed as any).list;
      if (Array.isArray(candidate)) list = candidate;
      else list = [parsed];
    }

    const normalized = list.map(normalizeLine).filter((l) => l.color || l.size || l.quantity);
    if (normalized.length) return normalized;

    const fallbackColor = String(order?.color || '').trim();
    const fallbackSize = String(order?.size || '').trim();
    const fallbackQty = Number(order?.orderQuantity || 0) || 0;
    if (fallbackColor || fallbackSize || fallbackQty) {
      return [{ color: fallbackColor, size: fallbackSize, quantity: fallbackQty }];
    }
    return [{ color: '-', size: '-', quantity: 0 }];
  };

  const getOrderQtyTotal = (lines: Array<{ color: string; size: string; quantity: number }>) => {
    return lines.reduce((sum, l) => sum + (Number(l?.quantity || 0) || 0), 0);
  };

  const toNumber = (v: any, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  const sizeSortKey = (name: string) => {
    const t = String(name || '').trim();
    const order = ['XXXS', 'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL'];
    const upper = t.toUpperCase();
    const idx = order.indexOf(upper);
    if (idx >= 0) return { group: 0, a: idx, b: upper };
    const m = upper.match(/^(\d+(?:\.\d+)?)(?:\s*[-~–—]\s*(\d+(?:\.\d+)?))?([A-Z]*)$/);
    if (m) {
      const a = toNumber(m[1], 0);
      const b = toNumber(m[2], a);
      const unit = m[3] || '';
      return { group: 1, a, b, unit };
    }
    return { group: 2, a: 0, b: upper };
  };

  const sortSizes = (sizes: string[]) => {
    const list = [...sizes];
    list.sort((a, b) => {
      const ka: any = sizeSortKey(a);
      const kb: any = sizeSortKey(b);
      if (ka.group !== kb.group) return ka.group - kb.group;
      if (ka.a !== kb.a) return ka.a - kb.a;
      if (ka.b !== kb.b) return ka.b < kb.b ? -1 : 1;
      const ua = ka.unit || '';
      const ub = kb.unit || '';
      if (ua !== ub) return ua < ub ? -1 : 1;
      return 0;
    });
    return list;
  };

  const buildSizePairs = (lines: Array<{ color: string; size: string; quantity: number }>) => {
    const bySize = new Map<string, number>();
    for (const l of lines) {
      const s = String(l?.size || '').trim();
      const q = Number(l?.quantity || 0) || 0;
      if (!s) continue;
      bySize.set(s, (bySize.get(s) || 0) + q);
    }
    const sizes = sortSizes(Array.from(bySize.keys()));
    return sizes.map((s) => ({ size: s, quantity: bySize.get(s) || 0 }));
  };

  const isSupervisorOrAbove = (role: any) => {
    const r = String(role ?? '').trim();
    if (!r) return false;
    if (r === '1') return true;
    const lower = r.toLowerCase();
    return lower.includes('admin') || lower.includes('manager') || lower.includes('supervisor') || r.includes('主管') || r.includes('管理员');
  };

  const detailSizePairs = useMemo(() => buildSizePairs(detailOrderLines), [detailOrderLines]);

  const postReturnConfirmWithFallback = async (payload: { purchaseId: string; confirmerId?: string; confirmerName: string; returnQuantity: number }) => {
    const paths = [
      '/production/purchase/return-confirm',
      '/production/material/return-confirm',
      '/production/purchase/returnConfirm',
      '/production/material/returnConfirm',
    ];
    let lastErr: any = null;
    for (const p of paths) {
      try {
        return await api.post<any>(p, payload);
      } catch (e: any) {
        lastErr = e;
        const status = Number(e?.status);
        if (status && status !== 404 && status !== 405) throw e;
      }
    }
    throw lastErr || new Error('回料确认失败');
  };

  const postReturnConfirmResetWithFallback = async (payload: { purchaseId: string; reason?: string }) => {
    const paths = [
      '/production/purchase/return-confirm/reset',
      '/production/material/return-confirm/reset',
      '/production/purchase/returnConfirm/reset',
      '/production/material/returnConfirm/reset',
    ];
    let lastErr: any = null;
    for (const p of paths) {
      try {
        return await api.post<any>(p, payload);
      } catch (e: any) {
        lastErr = e;
        const status = Number(e?.status);
        if (status && status !== 404 && status !== 405) throw e;
      }
    }
    throw lastErr || new Error('退回处理失败');
  };

  const openReturnConfirm = (targets: MaterialPurchaseType[]) => {
    const list = targets.filter((t) => String(t?.id || '').trim());
    if (!list.length) {
      message.info('没有可回料确认的采购任务');
      return;
    }
    setReturnConfirmTargets(list);
    setReturnConfirmOpen(true);
  };

  const openReturnReset = (target: MaterialPurchaseType) => {
    setReturnResetTarget(target);
    setReturnResetOpen(true);
  };

  useEffect(() => {
    if (!returnConfirmOpen) {
      return;
    }
    const list = (returnConfirmTargets || []).filter((t) => String(t?.id || '').trim());
    returnConfirmForm.setFieldsValue({
      items: list.map((t) => ({
        purchaseId: String(t.id),
        materialName: t.materialName,
        purchaseQuantity: Number((t as any).purchaseQuantity || 0) || 0,
        arrivedQuantity: Number((t as any).arrivedQuantity || 0) || 0,
        returnQuantity:
          Number((t as any).returnQuantity || 0)
          || (Number((t as any).arrivedQuantity || 0) || Number((t as any).purchaseQuantity || 0) || 0),
      })),
    });
  }, [returnConfirmForm, returnConfirmOpen, returnConfirmTargets]);

  useEffect(() => {
    if (!returnResetOpen) {
      return;
    }
    returnResetForm.setFieldsValue({ reason: '' });
  }, [returnResetForm, returnResetOpen]);

  const buildColorSummary = (lines: Array<{ color: string; size: string; quantity: number }>) => {
    const set = new Set<string>();
    for (const l of lines) {
      const c = String(l?.color || '').trim();
      if (c) set.add(c);
    }
    return Array.from(set.values()).join(' / ');
  };

  const loadDetailByOrderNo = async (orderNo: string) => {
    const no = String(orderNo || '').trim();
    if (!no) return;
    setDetailLoading(true);
    try {
      const [orderRes, purchaseRes] = await Promise.all([
        api.get<any>('/production/order/list', { params: { page: 1, pageSize: 1, orderNo: no } }),
        api.get<any>('/production/purchase/list', { params: { page: 1, pageSize: 200, orderNo: no, materialType: '', status: '' } }),
      ]);

      const orderResult = orderRes as any;
      const orderRecord = orderResult?.code === 200 ? (orderResult?.data?.records?.[0] || null) : null;
      setDetailOrder(orderRecord);
      setDetailOrderLines(parseOrderLines(orderRecord));

      const purchaseResult = purchaseRes as any;
      const records = purchaseResult?.code === 200 ? (purchaseResult?.data?.records || []) : [];
      const sorted = [...records].sort((a: any, b: any) => {
        const ka = getMaterialTypeSortKey(a?.materialType);
        const kb = getMaterialTypeSortKey(b?.materialType);
        if (ka !== kb) return ka.localeCompare(kb);
        return String(a?.materialName || '').localeCompare(String(b?.materialName || ''), 'zh');
      });
      setDetailPurchases(sorted as any);
    } catch {
      setDetailOrder(null);
      setDetailOrderLines([]);
      setDetailPurchases([]);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    if (!visible) return;
    if (dialogMode !== 'view') return;
    const no = String(currentPurchase?.orderNo || '').trim();
    if (!no) return;
    loadDetailByOrderNo(no);
  }, [currentPurchase?.orderNo, dialogMode, visible]);

  // 获取物料采购列表
  const fetchMaterialPurchaseList = async () => {
    setLoading(true);
    try {
      const response = await api.get<any>('/production/purchase/list', { params: queryParams });
      const result = response as any;
      if (result.code === 200) {
        setPurchaseList(result.data.records || []);
        setTotal(result.data.total || 0);
      } else {
        message.error(result.message || '获取物料采购列表失败');
      }
    } catch (error) {
      message.error('获取物料采购列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 页面加载时获取物料采购列表
  useEffect(() => {
    fetchMaterialPurchaseList();
  }, [queryParams]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const orderNo = (params.get('orderNo') || '').trim();
    if (orderNo) {
      setQueryParams(prev => ({ ...prev, page: 1, orderNo }));
    }
  }, [location.search]);

  const openDialog = (mode: 'view' | 'edit' | 'create' | 'preview', purchase?: MaterialPurchaseType) => {
    if (mode === 'edit' && purchase && Number((purchase as any)?.returnConfirmed || 0) === 1) {
      message.info('该采购任务已回料确认，如需调整请主管退回处理');
      return;
    }
    setDialogMode(mode);
    setCurrentPurchase(purchase || null);
    if (mode !== 'preview') {
      setPreviewList([]);
      setPreviewOrderId('');
    }
    if (mode === 'create') {
      form.setFieldsValue({
        materialType: normalizeMaterialType(queryParams.materialType || 'fabric'),
        arrivedQuantity: 0,
        status: 'pending'
      });
    } else if (purchase) {
      form.setFieldsValue(purchase);
    } else {
      form.resetFields();
    }
    setVisible(true);
  };

  const ensureOrderUnlocked = async (orderId: any) => {
    return await ensureProductionOrderUnlocked(orderId, orderFrozenCacheRef.current, {
      rule: 'status',
      acceptAnyData: true,
      onCacheUpdated: () => setOrderFrozenVersion((v) => v + 1),
      onFrozen: () => message.error('订单已完成，无法操作'),
    });
  };

  const isOrderFrozenById = (orderId: any) => {
    void orderFrozenVersion;
    const oid = String(orderId || '').trim();
    if (!oid) return false;
    return orderFrozenCacheRef.current.get(oid) === true;
  };

  useEffect(() => {
    const ids = Array.from(
      new Set(
        purchaseList
          .map((r: any) => String(r?.orderId || '').trim())
          .filter(Boolean)
      )
    );
    const missing = ids.filter((id) => !orderFrozenCacheRef.current.has(id));
    if (!missing.length) return;

    let cancelled = false;
    void (async () => {
      await Promise.allSettled(
        missing
          .slice(0, 50)
          .map((id) =>
            primeProductionOrderFrozenCache(id, orderFrozenCacheRef.current, {
              rule: 'status',
              acceptAnyData: true,
            })
          )
      );
      if (!cancelled) setOrderFrozenVersion((v) => v + 1);
    })();

    return () => {
      cancelled = true;
    };
  }, [purchaseList]);

  const openDialogSafe = async (mode: 'view' | 'edit' | 'create' | 'preview', purchase?: MaterialPurchaseType) => {
    if (mode !== 'view' && purchase?.orderId) {
      const ok = await ensureOrderUnlocked(purchase.orderId);
      if (!ok) return;
    }
    openDialog(mode, purchase);
  };

  const formatDateTime = (v: any) => {
    const s = String(v || '').trim();
    if (!s) return '';
    if (s.includes('T')) {
      const cleaned = s.replace('T', ' ').replace(/\.\d+Z?$/, '').replace('Z', '');
      return cleaned.length > 16 ? cleaned.slice(0, 16) : cleaned;
    }
    return s.length > 16 ? s.slice(0, 16) : s;
  };

  const escapeHtml = (v: any) => {
    const s = String(v ?? '');
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const buildPurchaseSheetHtml = () => {
    const orderNo = String(currentPurchase?.orderNo || '').trim();
    const purchaseNo = String(currentPurchase?.purchaseNo || '').trim();
    const styleNo = String(currentPurchase?.styleNo || '').trim();
    const styleName = String(currentPurchase?.styleName || '').trim();
    const colorText = String(detailOrder?.color || '').trim() || buildColorSummary(detailOrderLines) || '';
    const totalOrderQty = getOrderQtyTotal(detailOrderLines);

    const group = {
      fabric: detailPurchases.filter((p) => getMaterialTypeCategory(p.materialType) === 'fabric'),
      lining: detailPurchases.filter((p) => getMaterialTypeCategory(p.materialType) === 'lining'),
      accessory: detailPurchases.filter((p) => getMaterialTypeCategory(p.materialType) === 'accessory'),
    } as const;

    const buildSizeTable = () => {
      if (!detailSizePairs.length) {
        return '<div class="size-empty">-</div>';
      }
      const headCells = detailSizePairs.map((x) => `<th>${escapeHtml(x.size)}</th>`).join('');
      const qtyCells = detailSizePairs.map((x) => `<td>${escapeHtml(x.quantity)}</td>`).join('');
      return `
        <table class="size-table">
          <tr>
            <th class="row-head">码数</th>
            ${headCells}
            <th class="total-cell"></th>
          </tr>
          <tr>
            <th class="row-head">数量</th>
            ${qtyCells}
            <th class="total-cell">总下单数：${escapeHtml(totalOrderQty)}</th>
          </tr>
        </table>
      `;
    };

    const buildRows = (list: any[]) => {
      const rows = list.map((r) => {
        const typeLabel = getMaterialTypeLabel(r?.materialType);
        const purchaseQty = Number(r?.purchaseQuantity) || 0;
        const arrivedQty = Number(r?.arrivedQuantity) || 0;
        const unitPrice = Number(r?.unitPrice);
        const amountText = Number.isFinite(unitPrice) ? (arrivedQty * unitPrice).toFixed(2) : '-';
        const unitPriceText = Number.isFinite(unitPrice) ? unitPrice.toFixed(2) : '-';
        const statusText = getStatusConfig(r?.status as any).text;
        const returnTime = Number(r?.returnConfirmed || 0) === 1 ? (formatDateTime(r?.returnConfirmTime) || '-') : '-';
        const returnBy = Number(r?.returnConfirmed || 0) === 1 ? (String(r?.returnConfirmerName || '').trim() || '-') : '-';
        return `
          <tr>
            <td>${escapeHtml(typeLabel)}</td>
            <td>${escapeHtml(r?.materialCode || '')}</td>
            <td>${escapeHtml(r?.materialName || '')}</td>
            <td>${escapeHtml(r?.specifications || '')}</td>
            <td>${escapeHtml(r?.unit || '')}</td>
            <td class="num">${escapeHtml(purchaseQty)}</td>
            <td class="num">${escapeHtml(arrivedQty)}</td>
            <td class="num">${escapeHtml(unitPriceText)}</td>
            <td class="num">${escapeHtml(amountText)}</td>
            <td>${escapeHtml(r?.supplierName || '')}</td>
            <td>${escapeHtml(statusText || '')}</td>
            <td>${escapeHtml(returnTime)}</td>
            <td>${escapeHtml(returnBy)}</td>
          </tr>
        `;
      }).join('');

      return `
        <table class="data-table">
          <thead>
            <tr>
              <th>类型</th>
              <th>物料编码</th>
              <th>物料名称</th>
              <th>规格</th>
              <th>单位</th>
              <th class="num">采购数</th>
              <th class="num">到货数</th>
              <th class="num">单价(元)</th>
              <th class="num">金额(元)</th>
              <th>供应商</th>
              <th>状态</th>
              <th>回料时间</th>
              <th>回料人</th>
            </tr>
          </thead>
          <tbody>
            ${rows || `<tr><td colspan="13" class="empty">-</td></tr>`}
          </tbody>
        </table>
      `;
    };

    const now = new Date();
    const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    return `
      <!doctype html>
      <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(purchaseNo || orderNo || '采购单')}</title>
        <style>
          body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;margin:20px;color:#111}
          .top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
          .title{font-size:18px;font-weight:700}
          .meta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px 16px;margin-top:10px}
          .kv{font-size:12px;color:#555}
          .kv b{display:block;color:#111;margin-top:2px;font-size:13px}
          .block{margin-top:14px}
          .size-table{border-collapse:collapse;font-size:12px}
          .size-table th,.size-table td{border:1px solid #e6e8f0;padding:6px 8px;white-space:nowrap}
          .size-table .row-head{background:#fafafa}
          .size-table .total-cell{min-width:140px;text-align:left;background:#fafafa}
          .section{margin-top:18px}
          .section h3{margin:0 0 8px 0;font-size:14px}
          .data-table{width:100%;border-collapse:collapse;font-size:12px}
          .data-table th,.data-table td{border:1px solid #e6e8f0;padding:6px 8px;vertical-align:top}
          .data-table th{background:#fafafa;text-align:left}
          .data-table .num{text-align:right;white-space:nowrap}
          .empty{text-align:center;color:#999}
          .actions{display:flex;gap:8px;justify-content:flex-end}
          .ant-btn{font-family:inherit}
          @media print{.no-print{display:none} body{margin:0}}
        </style>
      </head>
      <body>
        <div class="top">
          <div>
            <div class="title">采购单</div>
            <div class="meta">
              <div class="kv">订单号<b>${escapeHtml(orderNo || '-')}</b></div>
              <div class="kv">采购单号<b>${escapeHtml(purchaseNo || '-')}</b></div>
              <div class="kv">款号<b>${escapeHtml(styleNo || '-')}</b></div>
              <div class="kv">款名<b>${escapeHtml(styleName || '-')}</b></div>
              <div class="kv">颜色<b>${escapeHtml(colorText || '-')}</b></div>
              <div class="kv">生成时间<b>${escapeHtml(ts)}</b></div>
            </div>
          </div>
          <div class="actions no-print">
            <button class="ant-btn ant-btn-default" onclick="window.print()">打印</button>
            <button class="ant-btn ant-btn-primary" onclick="window.close()">关闭</button>
          </div>
        </div>

        <div class="block">
          ${buildSizeTable()}
        </div>

        <div class="section">
          <h3>面料</h3>
          ${buildRows(group.fabric as any)}
        </div>
        <div class="section">
          <h3>里料</h3>
          ${buildRows(group.lining as any)}
        </div>
        <div class="section">
          <h3>辅料</h3>
          ${buildRows(group.accessory as any)}
        </div>
      </body>
      </html>
    `;
  };

  const openPurchaseSheet = (autoPrint: boolean) => {
    const html = buildPurchaseSheetHtml();
    const w = window.open('', '_blank');
    if (!w) {
      message.error('浏览器拦截了新窗口，请允许弹窗');
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    if (autoPrint) {
      setTimeout(() => {
        try {
          w.focus();
          w.print();
        } catch {
          null;
        }
      }, 250);
    }
  };

  const downloadPurchaseSheet = () => {
    const html = buildPurchaseSheetHtml();
    const orderNo = String(currentPurchase?.orderNo || '').trim();
    const purchaseNo = String(currentPurchase?.purchaseNo || '').trim();
    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    const fileName = `采购单_${purchaseNo || orderNo || 'sheet'}_${ts}.html`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const closeDialog = () => {
    setVisible(false);
    setCurrentPurchase(null);
    setDialogMode('view');
    setPreviewList([]);
    setPreviewOrderId('');
    form.resetFields();
  };

  // 表单提交
  const handleSubmit = async () => {
    try {
      setSubmitLoading(true);
      const values = await form.validateFields();
      const purchaseQuantity = Number(values.purchaseQuantity || 0);
      const unitPrice = Number(values.unitPrice || 0);
      const totalAmount = Number.isFinite(purchaseQuantity) && Number.isFinite(unitPrice)
        ? Number((purchaseQuantity * unitPrice).toFixed(2))
        : undefined;
      const arrivedQuantity = Number(values.arrivedQuantity || 0);
      const computedStatus = values.status === 'cancelled'
        ? 'cancelled'
        : arrivedQuantity <= 0
          ? 'pending'
          : arrivedQuantity < purchaseQuantity
            ? 'partial'
            : 'completed';

      const payload = {
        ...values,
        totalAmount,
        status: values.status || computedStatus,
      };
      let response;
      if (dialogMode === 'edit' && currentPurchase?.id) {
        // 编辑采购单
        response = await api.put('/production/purchase', { ...payload, id: currentPurchase.id });
      } else {
        // 新增采购单
        response = await api.post('/production/purchase', payload);
      }

      const result = response as any;
      if (result.code === 200) {
        message.success(dialogMode === 'edit' ? '保存成功' : '新增采购单成功');
        // 关闭弹窗
        closeDialog();
        // 刷新采购单列表
        fetchMaterialPurchaseList();
      } else {
        message.error(result.message || '保存失败');
      }
    } catch (error) {
      // 处理表单验证错误
      if ((error as any).errorFields) {
        const firstError = (error as any).errorFields[0];
        message.error(firstError.errors[0] || '表单验证失败');
      } else {
        message.error((error as Error).message || '保存失败');
      }
    } finally {
      setSubmitLoading(false);
    }
  };

  const getStatusConfig = (status: MaterialPurchaseType['status']) => {
    const statusMap = {
      pending: { text: '待采购', color: 'blue' },
      received: { text: '已领取', color: 'gold' },
      partial: { text: '部分到货', color: 'orange' },
      completed: { text: '全部到货', color: 'success' },
      cancelled: { text: '已取消', color: 'error' }
    };
    return (statusMap as any)[status] || { text: '未知', color: 'default' };
  };

  const receivePurchaseTask = async (record: MaterialPurchaseType) => {
    const id = String((record as any)?.id || '').trim();
    if (!id) {
      message.error('采购任务缺少ID');
      return;
    }

    const receiverName = String(user?.name || user?.username || '').trim() || window.prompt('请输入领取人姓名') || '';
    if (!String(receiverName).trim()) {
      message.error('未填写领取人');
      return;
    }

    try {
      const res = await api.post<any>('/production/purchase/receive', {
        purchaseId: id,
        receiverId: String(user?.id || '').trim(),
        receiverName: String(receiverName).trim(),
      });
      const result = res as any;
      if (result.code === 200) {
        message.success('已领取采购任务');
        fetchMaterialPurchaseList();
        const no = String(currentPurchase?.orderNo || record?.orderNo || '').trim();
        if (no) loadDetailByOrderNo(no);
        return;
      }
      message.error(result.message || '领取失败');
    } catch (e: any) {
      message.error(e?.message || '领取失败');
    }
  };

  const submitReturnConfirm = async () => {
    try {
      setReturnConfirmSubmitting(true);
      const values = await returnConfirmForm.validateFields();
      const confirmerName = String(user?.name || user?.username || '未命名').trim() || '未命名';
      const items = Array.isArray(values?.items) ? values.items : [];
      const confirmerId = String(user?.id || '').trim() || undefined;

      if (!items.length) {
        message.error('没有可回料确认的采购任务');
        return;
      }

      for (const it of items) {
        const purchaseId = String(it?.purchaseId || '').trim();
        const returnQuantity = Number(it?.returnQuantity);
        if (!purchaseId) continue;
        const res = await postReturnConfirmWithFallback({ purchaseId, confirmerId, confirmerName, returnQuantity });
        const result = res as any;
        if (result?.code !== 200) {
          throw new Error(result?.message || '回料确认失败');
        }
      }

      message.success('回料确认成功');
      setReturnConfirmOpen(false);
      setReturnConfirmTargets([]);
      returnConfirmForm.resetFields();
      fetchMaterialPurchaseList();
      const no = String(currentPurchase?.orderNo || '').trim();
      if (visible && dialogMode === 'view' && no) loadDetailByOrderNo(no);
    } catch (e: any) {
      if (e?.errorFields?.length) return;
      message.error(e?.message || '回料确认失败');
    } finally {
      setReturnConfirmSubmitting(false);
    }
  };

  const submitReturnReset = async () => {
    if (!returnResetTarget) return;
    if (!isSupervisorOrAbove((user as any)?.role || (user as any)?.roleName)) {
      message.error('仅主管级别及以上可执行退回');
      return;
    }
    try {
      setReturnResetSubmitting(true);
      const values = await returnResetForm.validateFields();
      const purchaseId = String((returnResetTarget as any)?.id || '').trim();
      if (!purchaseId) {
        message.error('采购任务缺少ID');
        return;
      }
      const res = await postReturnConfirmResetWithFallback({ purchaseId, reason: String(values?.reason || '').trim() });
      const result = res as any;
      if (result?.code !== 200) {
        throw new Error(result?.message || '退回失败');
      }
      message.success('退回成功');
      setReturnResetOpen(false);
      setReturnResetTarget(null);
      returnResetForm.resetFields();
      fetchMaterialPurchaseList();
      const no = String(currentPurchase?.orderNo || '').trim();
      if (visible && dialogMode === 'view' && no) loadDetailByOrderNo(no);
    } catch (e: any) {
      if (e?.errorFields?.length) return;
      message.error(e?.message || '退回失败');
    } finally {
      setReturnResetSubmitting(false);
    }
  };

  const confirmReturnPurchaseTask = async (record: MaterialPurchaseType) => {
    const id = String((record as any)?.id || '').trim();
    if (!id) {
      message.error('采购任务缺少ID');
      return;
    }

    if (Number((record as any)?.returnConfirmed || 0) === 1) {
      message.info('该采购任务已回料确认，如需调整请主管退回处理');
      return;
    }

    openReturnConfirm([record]);
  };

  // 表格列定义
  const columns = [
    {
      title: '图片',
      dataIndex: 'styleCover',
      key: 'styleCover',
      width: 72,
      render: (_: any, record: any) => (
        <StyleCoverThumb styleId={record.styleId} styleNo={record.styleNo} src={record.styleCover || null} size={48} borderRadius={6} />
      )
    },
    {
      title: '订单号',
      dataIndex: 'orderNo',
      key: 'orderNo',
      width: 120,
      ellipsis: true,
    },
    {
      title: '款号',
      dataIndex: 'styleNo',
      key: 'styleNo',
      width: 100,
      ellipsis: true,
    },
    {
      title: '款名',
      dataIndex: 'styleName',
      key: 'styleName',
      width: 140,
      ellipsis: true,
    },
    {
      title: '附件',
      key: 'attachments',
      width: 100,
      render: (_: any, record: any) => (
        <StyleAttachmentsButton styleId={record.styleId} styleNo={record.styleNo} modalTitle={record.styleNo ? `附件（${record.styleNo}）` : '附件'} />
      )
    },
    {
      title: '采购单号',
      dataIndex: 'purchaseNo',
      key: 'purchaseNo',
      width: 120,
    },
    {
      title: '面料辅料类型',
      dataIndex: 'materialType',
      key: 'materialType',
      width: 120,
      render: (v: any) => {
        const type = String(v || '').trim();
        const category = getMaterialTypeCategory(type);
        const text = getMaterialTypeLabel(type);
        const color = category === 'accessory' ? 'purple' : category === 'lining' ? 'cyan' : 'geekblue';
        return <Tag color={color}>{text}</Tag>;
      },
    },
    {
      title: '物料编码',
      dataIndex: 'materialCode',
      key: 'materialCode',
      width: 100,
    },
    {
      title: '物料名称',
      dataIndex: 'materialName',
      key: 'materialName',
      ellipsis: true,
    },
    {
      title: '规格',
      dataIndex: 'specifications',
      key: 'specifications',
      width: 100,
    },
    {
      title: '单位',
      dataIndex: 'unit',
      key: 'unit',
      width: 80,
    },
    {
      title: '采购数量',
      dataIndex: 'purchaseQuantity',
      key: 'purchaseQuantity',
      width: 100,
      align: 'right' as const,
    },
    {
      title: '到货数量',
      dataIndex: 'arrivedQuantity',
      key: 'arrivedQuantity',
      width: 100,
      align: 'right' as const,
    },
    {
      title: '供应商',
      dataIndex: 'supplierName',
      key: 'supplierName',
      width: 120,
    },
    {
      title: '单价(元)',
      dataIndex: 'unitPrice',
      key: 'unitPrice',
      width: 100,
      align: 'right' as const,
      render: (value: any) => {
        const n = Number(value);
        return Number.isFinite(n) ? n.toFixed(2) : '-';
      },
    },
    {
      title: '金额(元)',
      dataIndex: 'totalAmount',
      key: 'totalAmount',
      width: 120,
      align: 'right' as const,
      render: (value: any, record: MaterialPurchaseType) => {
        const qty = Number((record as any)?.arrivedQuantity ?? 0);
        const price = Number((record as any)?.unitPrice);
        if (Number.isFinite(qty) && Number.isFinite(price)) return (qty * price).toFixed(2);
        const v = Number(value);
        return Number.isFinite(v) ? v.toFixed(2) : '-';
      },
    },
    {
      title: '领取人',
      dataIndex: 'receiverName',
      key: 'receiverName',
      width: 100,
      render: (v: any) => {
        const t = String(v || '').trim();
        return t || '-';
      },
    },
    {
      title: '领取时间',
      dataIndex: 'receivedTime',
      key: 'receivedTime',
      width: 160,
      render: (v: any) => {
        const raw = String(v ?? '').trim();
        if (!raw) return '-';
        return formatDateTime(v) || '-';
      },
    },
    {
      title: '回料时间',
      key: 'returnTime',
      width: 160,
      render: (_: any, record: MaterialPurchaseType) => {
        if (Number((record as any)?.returnConfirmed || 0) !== 1) return '-';
        return formatDateTime((record as any)?.returnConfirmTime) || '-';
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: MaterialPurchaseType['status']) => {
        const { text, color } = getStatusConfig(status);
        return <Tag color={color}>{text}</Tag>;
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 110,
      render: (_: any, record: MaterialPurchaseType) => {
        const orderId = String((record as any)?.orderId || '').trim();
        const frozen = isOrderFrozenById(orderId);

        const editLabel =
          Number((record as any)?.returnConfirmed || 0) === 1
            ? '编辑(已回料确认锁定)'
            : record.status === 'pending' || record.status === 'received' || record.status === 'partial'
              ? '采购'
              : '编辑';
        const editDisabled = frozen || Number((record as any)?.returnConfirmed || 0) === 1;

        const moreItems = (() => {
          const items: any[] = [];
          if (record.status === 'pending') {
            items.push({
              key: 'receive',
              label: '领取任务',
              disabled: frozen,
              onClick: () => void (async () => {
                if (!(await ensureOrderUnlocked((record as any)?.orderId))) return;
                receivePurchaseTask(record);
              })(),
            });
          }
          if (record.status === 'received' || record.status === 'partial' || record.status === 'completed') {
            items.push({
              key: 'returnConfirm',
              label: Number((record as any)?.returnConfirmed || 0) === 1 ? '回料确认(已确认)' : '回料确认',
              disabled: frozen || Number((record as any)?.returnConfirmed || 0) === 1,
              onClick: () => void (async () => {
                if (!(await ensureOrderUnlocked((record as any)?.orderId))) return;
                confirmReturnPurchaseTask(record);
              })(),
            });
          }

          if (Number((record as any)?.returnConfirmed || 0) === 1) {
            items.push({
              key: 'returnReset',
              label: '退回回料确认',
              disabled: frozen || !isSupervisorOrAbove((user as any)?.role || (user as any)?.roleName),
              onClick: () => void (async () => {
                if (!(await ensureOrderUnlocked((record as any)?.orderId))) return;
                openReturnReset(record);
              })(),
            });
          }
          return items;
        })();

        return (
          <RowActions
            actions={[
              {
                key: 'view',
                label: '查看',
                title: '查看',
                icon: <EyeOutlined />,
                onClick: () => void openDialogSafe('view', record),
                primary: true,
              },
              {
                key: 'edit',
                label: editLabel,
                title: editLabel,
                icon: <EditOutlined />,
                disabled: editDisabled,
                onClick: () => void openDialogSafe('edit', record),
                primary: true,
              },
              ...(moreItems.length
                ? [
                  {
                    key: 'more',
                    label: '更多',
                    children: moreItems as any,
                  },
                ]
                : []),
            ]}
          />
        );
      },
    },
  ];

  return (
    <Layout>
      <div className="material-purchase-page">
        <Card className="page-card">
          {/* 页面标题和操作区 */}
          <div className="page-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <h2 className="page-title">
                {queryParams.materialType
                  ? `${getMaterialTypeLabel(queryParams.materialType)}采购`
                  : '物料采购'}
              </h2>
              <Segmented
                value={queryParams.materialType || ''}
                options={[
                  { label: '面料', value: 'fabric' },
                  { label: '里料', value: 'lining' },
                  { label: '辅料', value: 'accessory' },
                  { label: '全部', value: '' },
                ]}
                onChange={(value) => setQueryParams(prev => ({ ...prev, materialType: String(value), page: 1 }))}
              />
            </div>
            <Space wrap>
              <Button type="default" onClick={async () => {
                const targetOrderNo = (queryParams.orderNo || '').trim() || window.prompt('请输入订单号以生成采购单');
                if (!targetOrderNo) return;

                try {
                  const orderRes = await api.get<any>('/production/order/list', {
                    params: {
                      page: 1,
                      pageSize: 1,
                      orderNo: targetOrderNo,
                    }
                  });
                  const orderResult = orderRes as any;
                  const records = orderResult?.data?.records || [];
                  if (orderResult.code !== 200 || !records.length) {
                    message.error(orderResult?.message || '未找到该订单');
                    return;
                  }

                  const order = records[0];
                  if (!order?.id) {
                    message.error('订单数据缺少ID');
                    return;
                  }
                  if (String(order?.status || '').trim().toLowerCase() === 'completed') {
                    message.error('订单已完成，无法生成采购单');
                    return;
                  }

                  setPreviewOrderId(String(order.id));
                  setQueryParams(prev => ({ ...prev, orderNo: String(order.orderNo || targetOrderNo), page: 1 }));

                  const previewRes = await api.get<any>('/production/purchase/demand/preview', {
                    params: { orderId: order.id }
                  });
                  const previewResult = previewRes as any;
                  if (previewResult.code === 200) {
                    const preview = previewResult.data || [];
                    setPreviewList(preview as MaterialPurchaseType[]);
                    openDialog('preview');
                    message.success(`已生成 ${preview.length} 条采购单预览，确认后保存生成`);
                  } else {
                    message.error(previewResult.message || '生成采购单预览失败');
                  }
                } catch (e: any) {
                  message.error(e?.message || '生成采购单失败');
                }
              }}>
                从订单生成采购单
              </Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => openDialog('create')}>
                新增采购单
              </Button>
            </Space>
          </div>

          {/* 筛选区 */}
          <Card size="small" className="filter-card mb-sm">
            <Form layout="inline" size="small">
              <Form.Item label="面料辅料类型">
                <Select
                  placeholder="请选择面料辅料类型"
                  value={queryParams.materialType || ''}
                  onChange={(value) => setQueryParams({ ...queryParams, materialType: value, page: 1 })}
                  style={{ width: 160 }}
                >
                  <Option value="">全部</Option>
                  <Option value="fabric">面料</Option>
                  <Option value="fabricA">面料A</Option>
                  <Option value="fabricB">面料B</Option>
                  <Option value="fabricC">面料C</Option>
                  <Option value="fabricD">面料D</Option>
                  <Option value="fabricE">面料E</Option>
                  <Option value="lining">里料</Option>
                  <Option value="liningA">里料A</Option>
                  <Option value="liningB">里料B</Option>
                  <Option value="liningC">里料C</Option>
                  <Option value="liningD">里料D</Option>
                  <Option value="liningE">里料E</Option>
                  <Option value="accessory">辅料</Option>
                  <Option value="accessoryA">辅料A</Option>
                  <Option value="accessoryB">辅料B</Option>
                  <Option value="accessoryC">辅料C</Option>
                  <Option value="accessoryD">辅料D</Option>
                  <Option value="accessoryE">辅料E</Option>
                </Select>
              </Form.Item>
              <Form.Item label="订单号">
                <Input
                  placeholder="请输入订单号"
                  value={queryParams.orderNo}
                  onChange={(e) => setQueryParams({ ...queryParams, orderNo: e.target.value })}
                  style={{ width: 150 }}
                />
              </Form.Item>
              <Form.Item label="采购单号">
                <Input
                  placeholder="请输入采购单号"
                  onChange={(e) => setQueryParams({ ...queryParams, purchaseNo: e.target.value })}
                  style={{ width: 150 }}
                />
              </Form.Item>
              <Form.Item label="物料编码">
                <Input
                  placeholder="请输入物料编码"
                  onChange={(e) => setQueryParams({ ...queryParams, materialCode: e.target.value })}
                  style={{ width: 120 }}
                />
              </Form.Item>
              <Form.Item label="物料名称">
                <Input
                  placeholder="请输入物料名称"
                  onChange={(e) => setQueryParams({ ...queryParams, materialName: e.target.value })}
                  style={{ width: 120 }}
                />
              </Form.Item>
              <Form.Item label="供应商">
                <Input
                  placeholder="请输入供应商"
                  onChange={(e) => setQueryParams({ ...queryParams, supplier: e.target.value })}
                  style={{ width: 120 }}
                />
              </Form.Item>
              <Form.Item label="状态">
                <Select
                  placeholder="请选择状态"
                  onChange={(value) => setQueryParams({ ...queryParams, status: value })}
                  style={{ width: 100 }}
                >
                  <Option value="">全部</Option>
                  <Option value="pending">待采购</Option>
                  <Option value="received">已领取</Option>
                  <Option value="partial">部分到货</Option>
                  <Option value="completed">全部到货</Option>
                  <Option value="cancelled">已取消</Option>
                </Select>
              </Form.Item>
              <Form.Item className="filter-actions">
                <Space>
                  <Button type="primary" icon={<SearchOutlined />} onClick={() => fetchMaterialPurchaseList()}>
                    查询
                  </Button>
                  <Button onClick={() => {
                    const params = new URLSearchParams(location.search);
                    const orderNo = (params.get('orderNo') || '').trim();
                    setQueryParams({ page: 1, pageSize: 10, orderNo, materialType: '' });
                  }}>
                    重置
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </Card>

          {/* 表格区 */}
          <ResizableTable
            columns={columns}
            dataSource={purchaseList}
            rowKey="id"
            loading={loading}
            scroll={{ x: 'max-content' }}
            size={isMobile ? 'small' : 'middle'}
            pagination={{
              current: queryParams.page,
              pageSize: queryParams.pageSize,
              total: total,
              onChange: (page, pageSize) => setQueryParams({ ...queryParams, page, pageSize }),
              size: isMobile ? 'small' : 'default',
            }}
          />
        </Card>

        {/* 采购单详情弹窗 */}
        <ResizableModal
          title={dialogMode === 'preview' ? '采购清单预览' : dialogMode === 'create' ? '新增采购单' : dialogMode === 'edit' ? '采购单编辑' : '采购单详情'}
          open={visible}
          onCancel={closeDialog}
          width={modalWidth}
          initialHeight={modalInitialHeight}
          minWidth={isMobile ? 320 : 520}
          scaleWithViewport
          tableDensity={isMobile ? 'dense' : 'auto'}
          footer={
            dialogMode === 'view'
              ? [
                <Button
                  key="receiveAll"
                  disabled={!detailPurchases.some((p) => p.status === 'pending')}
                  loading={submitLoading}
                  onClick={async () => {
                    const receiverName = String(user?.name || user?.username || '').trim() || window.prompt('请输入领取人姓名') || '';
                    if (!String(receiverName).trim()) {
                      message.error('未填写领取人');
                      return;
                    }

                    const targets = detailPurchases.filter((p) => p.status === 'pending' && String(p.id || '').trim());
                    if (!targets.length) {
                      message.info('没有可领取的采购任务');
                      return;
                    }

                    try {
                      setSubmitLoading(true);
                      for (const t of targets) {
                        await api.post<any>('/production/purchase/receive', {
                          purchaseId: String(t.id),
                          receiverId: String(user?.id || '').trim(),
                          receiverName: String(receiverName).trim(),
                        });
                      }
                      message.success('已领取该订单待采购任务');
                      fetchMaterialPurchaseList();
                      const no = String(currentPurchase?.orderNo || '').trim();
                      if (no) loadDetailByOrderNo(no);
                    } catch {
                      message.error('领取失败');
                    } finally {
                      setSubmitLoading(false);
                    }
                  }}
                >
                  采购领取
                </Button>,
                <Button
                  key="returnAll"
                  disabled={!detailPurchases.some((p) => p.status === 'received' || p.status === 'partial' || p.status === 'completed')}
                  loading={submitLoading}
                  onClick={async () => {
                    const targets = detailPurchases.filter((p) =>
                      (p.status === 'received' || p.status === 'partial' || p.status === 'completed')
                      && String(p.id || '').trim()
                      && Number((p as any)?.returnConfirmed || 0) !== 1
                    );
                    if (!targets.length) {
                      message.info('没有可回料确认的采购任务');
                      return;
                    }

                    openReturnConfirm(targets);
                  }}
                >
                  回料确认
                </Button>,
                <Dropdown
                  key="sheet"
                  trigger={['click']}
                  menu={{
                    items: [
                      {
                        key: 'print',
                        label: '打印采购单',
                        onClick: () => openPurchaseSheet(true),
                      },
                      {
                        key: 'download',
                        label: '下载采购单',
                        onClick: () => downloadPurchaseSheet(),
                      },
                    ],
                  }}
                >
                  <Button disabled={detailLoading || !detailPurchases.length}>
                    采购单生成
                  </Button>
                </Dropdown>,
                <Button key="close" type="primary" onClick={closeDialog}>
                  关闭
                </Button>
              ]
              : dialogMode === 'preview'
                ? [
                  <Button key="cancel" onClick={closeDialog}>
                    取消
                  </Button>,
                  <Button
                    key="submit"
                    type="primary"
                    loading={submitLoading}
                    onClick={async () => {
                      try {
                        setSubmitLoading(true);
                        if (!previewOrderId) {
                          message.error('缺少订单ID，无法生成采购单');
                          return;
                        }
                        const res = await api.post('/production/purchase/demand/generate', {
                          orderId: previewOrderId,
                          overwrite: false,
                        });
                        const result = res as any;
                        if (result.code === 200) {
                          message.success('生成采购单成功');
                          closeDialog();
                          fetchMaterialPurchaseList();
                        } else {
                          message.error(result.message || '生成失败');
                        }
                      } catch (e) {
                        message.error('生成失败');
                      } finally {
                        setSubmitLoading(false);
                      }
                    }}
                  >
                    保存生成
                  </Button>
                ]
                : [
                  <Button key="cancel" onClick={closeDialog}>
                    取消
                  </Button>,
                  <Button key="submit" type="primary" onClick={() => handleSubmit()} loading={submitLoading}>
                    保存
                  </Button>
                ]
          }
        >
          {dialogMode === 'preview' ? (
            <div className="purchase-preview">
              <ResizableTable
                columns={[
                  {
                    title: '图片',
                    dataIndex: 'styleCover',
                    key: 'styleCover',
                    width: 72,
                    render: (_: any, record: any) => (
                      <StyleCoverThumb styleId={record.styleId} styleNo={record.styleNo} src={record.styleCover || null} size={48} borderRadius={6} />
                    )
                  },
                  {
                    title: '订单号',
                    dataIndex: 'orderNo',
                    key: 'orderNo',
                    width: 120,
                    ellipsis: true,
                  },
                  {
                    title: '款号',
                    dataIndex: 'styleNo',
                    key: 'styleNo',
                    width: 100,
                    ellipsis: true,
                  },
                  {
                    title: '款名',
                    dataIndex: 'styleName',
                    key: 'styleName',
                    width: 140,
                    ellipsis: true,
                  },
                  {
                    title: '附件',
                    key: 'attachments',
                    width: 100,
                    render: (_: any, record: any) => (
                      <StyleAttachmentsButton styleId={record.styleId} styleNo={record.styleNo} modalTitle={record.styleNo ? `附件（${record.styleNo}）` : '附件'} />
                    )
                  },
                  {
                    title: '面料辅料类型',
                    dataIndex: 'materialType',
                    key: 'materialType',
                    width: 120,
                    render: (v: any) => {
                      const type = String(v || '').trim();
                      const category = getMaterialTypeCategory(type);
                      const text = getMaterialTypeLabel(type);
                      const color = category === 'accessory' ? 'purple' : category === 'lining' ? 'cyan' : 'geekblue';
                      return <Tag color={color}>{text}</Tag>;
                    },
                  },
                  {
                    title: '物料编码',
                    dataIndex: 'materialCode',
                    key: 'materialCode',
                  },
                  {
                    title: '物料名称',
                    dataIndex: 'materialName',
                    key: 'materialName',
                  },
                  {
                    title: '规格',
                    dataIndex: 'specifications',
                    key: 'specifications',
                  },
                  {
                    title: '单位',
                    dataIndex: 'unit',
                    key: 'unit',
                  },
                  {
                    title: '采购数量',
                    dataIndex: 'purchaseQuantity',
                    key: 'purchaseQuantity',
                    align: 'right' as const,
                  },
                  {
                    title: '供应商',
                    dataIndex: 'supplierName',
                    key: 'supplierName',
                  },
                ]}
                dataSource={previewList}
                rowKey={(_, index) => index || 0}
                pagination={false}
                scroll={{ x: 'max-content' }}
                size={isMobile ? 'small' : 'middle'}
              />
              <div className="mt-sm" style={{ color: '#999' }}>
                小提示：保存生成后可在列表中查看并补充单价等信息
              </div>
            </div>
          ) : (
            dialogMode === 'view' ? (
              <div className="purchase-detail-view">
                <Row gutter={16} className="purchase-detail-top">
                  <Col xs={24} md={8} lg={6}>
                    <div className="purchase-detail-right">
                      {String(currentPurchase?.styleCover || '').trim() ? (
                        <img src={String(currentPurchase?.styleCover || '').trim()} alt="" className="purchase-detail-cover" />
                      ) : (
                        <div className="purchase-detail-cover purchase-detail-cover-empty" />
                      )}
                    </div>
                  </Col>
                  <Col xs={24} md={16} lg={18}>
                    <div className="purchase-detail-left">
                      <Row gutter={16}>
                        <Col xs={24} sm={12} lg={8}>
                          <div className="purchase-detail-field">
                            <div className="purchase-detail-label">订单号</div>
                            <div className="purchase-detail-value">{currentPurchase?.orderNo || '-'}</div>
                          </div>
                        </Col>
                        <Col xs={24} sm={12} lg={8}>
                          <div className="purchase-detail-field">
                            <div className="purchase-detail-label">采购单号</div>
                            <div className="purchase-detail-value">{currentPurchase?.purchaseNo || '-'}</div>
                          </div>
                        </Col>
                        <Col xs={24} sm={12} lg={8}>
                          <div className="purchase-detail-field">
                            <div className="purchase-detail-label">款号</div>
                            <div className="purchase-detail-value">{currentPurchase?.styleNo || '-'}</div>
                          </div>
                        </Col>
                        <Col xs={24} sm={12} lg={8}>
                          <div className="purchase-detail-field">
                            <div className="purchase-detail-label">款名</div>
                            <div className="purchase-detail-value">{currentPurchase?.styleName || '-'}</div>
                          </div>
                        </Col>
                        <Col xs={24} sm={12} lg={8}>
                          <div className="purchase-detail-field">
                            <div className="purchase-detail-label">颜色</div>
                            <div className="purchase-detail-value">{String(detailOrder?.color || '').trim() || buildColorSummary(detailOrderLines) || '-'}</div>
                          </div>
                        </Col>
                      </Row>

                      <div className="purchase-detail-size-block">
                        <div className="purchase-detail-size-table-wrap">
                          <table className="purchase-detail-size-table">
                            <tbody>
                              <tr>
                                <th className="purchase-detail-size-th">码数</th>
                                {detailSizePairs.length
                                  ? detailSizePairs.map((x) => (
                                    <td key={x.size} className="purchase-detail-size-td">{x.size}</td>
                                  ))
                                  : <td className="purchase-detail-size-td">-</td>
                                }
                                <td className="purchase-detail-size-total-cell" />
                              </tr>
                              <tr>
                                <th className="purchase-detail-size-th">数量</th>
                                {detailSizePairs.length
                                  ? detailSizePairs.map((x) => (
                                    <td key={x.size} className="purchase-detail-size-td">{x.quantity}</td>
                                  ))
                                  : <td className="purchase-detail-size-td">-</td>
                                }
                                <td className="purchase-detail-size-total-cell">总下单数：{getOrderQtyTotal(detailOrderLines)}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </Col>
                </Row>

                <Card size="small" title="需要采购的面辅料（只读）" loading={detailLoading}>
                  {([
                    { key: 'fabric', title: '面料' },
                    { key: 'lining', title: '里料' },
                    { key: 'accessory', title: '辅料' },
                  ] as const).map((sec) => {
                    const data = detailPurchases.filter((p) => getMaterialTypeCategory(p.materialType) === sec.key);
                    if (!data.length) return null;
                    return (
                      <div key={sec.key} className="purchase-detail-section">
                        <div className="purchase-detail-section-title">{sec.title}</div>
                        <ResizableTable
                          rowKey={(r) => String((r as any).id || `${(r as any).purchaseNo}-${(r as any).materialType}-${(r as any).materialCode}`)}
                          dataSource={data}
                          pagination={false}
                          size={isMobile ? 'small' : 'middle'}
                          scroll={{ x: 'max-content' }}
                          columns={[
                            {
                              title: '类型',
                              dataIndex: 'materialType',
                              key: 'materialType',
                              width: 110,
                              render: (v: any) => {
                                const type = String(v || '').trim();
                                const category = getMaterialTypeCategory(type);
                                const text = getMaterialTypeLabel(type);
                                const color = category === 'accessory' ? 'purple' : category === 'lining' ? 'cyan' : 'geekblue';
                                return <Tag color={color}>{text}</Tag>;
                              },
                            },
                            { title: '物料编码', dataIndex: 'materialCode', key: 'materialCode', width: 120, render: (v: any) => v || '-' },
                            { title: '物料名称', dataIndex: 'materialName', key: 'materialName', width: 180, ellipsis: true, render: (v: any) => v || '-' },
                            { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 140, ellipsis: true, render: (v: any) => v || '-' },
                            { title: '单位', dataIndex: 'unit', key: 'unit', width: 80, render: (v: any) => v || '-' },
                            { title: '采购数量', dataIndex: 'purchaseQuantity', key: 'purchaseQuantity', width: 110, align: 'right' as const, render: (v: any) => Number(v) || 0 },
                            { title: '到货数量', dataIndex: 'arrivedQuantity', key: 'arrivedQuantity', width: 110, align: 'right' as const, render: (v: any) => Number(v) || 0 },
                            {
                              title: '单价(元)',
                              dataIndex: 'unitPrice',
                              key: 'unitPrice',
                              width: 110,
                              align: 'right' as const,
                              render: (v: any) => {
                                const n = Number(v);
                                return Number.isFinite(n) ? n.toFixed(2) : '-';
                              },
                            },
                            {
                              title: '金额(元)',
                              dataIndex: 'totalAmount',
                              key: 'totalAmount',
                              width: 120,
                              align: 'right' as const,
                              render: (v: any, r: any) => {
                                const qty = Number(r?.arrivedQuantity ?? 0);
                                const price = Number(r?.unitPrice);
                                if (Number.isFinite(qty) && Number.isFinite(price)) return (qty * price).toFixed(2);
                                const n = Number(v);
                                return Number.isFinite(n) ? n.toFixed(2) : '-';
                              },
                            },
                            { title: '供应商', dataIndex: 'supplierName', key: 'supplierName', width: 140, ellipsis: true, render: (v: any) => v || '-' },
                            {
                              title: '状态',
                              dataIndex: 'status',
                              key: 'status',
                              width: 100,
                              render: (status: MaterialPurchaseType['status']) => {
                                const { text, color } = getStatusConfig(status);
                                return <Tag color={color}>{text}</Tag>;
                              },
                            },
                            {
                              title: '回料时间',
                              dataIndex: 'returnConfirmTime',
                              key: 'returnConfirmTime',
                              width: 160,
                              render: (v: any, r: any) => (Number(r?.returnConfirmed || 0) === 1 ? (formatDateTime(v) || '-') : '-'),
                            },
                            { title: '备注', dataIndex: 'remark', key: 'remark', width: 220, ellipsis: true, render: (v: any) => v || '-' },
                            {
                              title: '确认',
                              key: 'confirm',
                              width: 140,
                              render: (_: any, record: MaterialPurchaseType) => (
                                <Space size={4}>
                                  <Button
                                    type="link"
                                    size="small"
                                    disabled={record.status !== 'pending'}
                                    onClick={() => receivePurchaseTask(record)}
                                  >
                                    领取
                                  </Button>
                                  <Button
                                    type="link"
                                    size="small"
                                    disabled={!(record.status === 'received' || record.status === 'partial' || record.status === 'completed') || Number((record as any)?.returnConfirmed || 0) === 1}
                                    onClick={() => confirmReturnPurchaseTask(record)}
                                  >
                                    {Number((record as any)?.returnConfirmed || 0) === 1 ? '已回料' : '回料确认'}
                                  </Button>
                                  {Number((record as any)?.returnConfirmed || 0) === 1 && (
                                    <Button
                                      type="link"
                                      size="small"
                                      disabled={!isSupervisorOrAbove((user as any)?.role || (user as any)?.roleName)}
                                      onClick={() => openReturnReset(record)}
                                    >
                                      退回
                                    </Button>
                                  )}
                                </Space>
                              ),
                            },
                          ]}
                        />
                      </div>
                    );
                  })}
                </Card>
              </div>
            ) : (
              <Form
                form={form}
                layout="horizontal"
                labelCol={{ span: 8 }}
                wrapperCol={{ span: 16 }}
              >
                <Row gutter={[16, 0]}>
                  <Col xs={24} lg={12}>
                    <Form.Item label="图片">
                      {watchedStyleCover ? (
                        <img
                          src={watchedStyleCover}
                          alt=""
                          style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 6, display: 'block' }}
                        />
                      ) : (
                        <div style={{ width: 96, height: 96, background: '#f5f5f5', borderRadius: 6 }} />
                      )}
                    </Form.Item>
                    <Form.Item name="purchaseNo" label="采购单号">
                      <Input disabled placeholder="自动生成" />
                    </Form.Item>
                    <Form.Item name="styleNo" label="款号">
                      <Input disabled />
                    </Form.Item>
                    <Form.Item name="styleName" label="款名">
                      <Input disabled />
                    </Form.Item>
                    <Form.Item name="materialType" label="面料辅料类型" rules={[{ required: true, message: '请选择面料辅料类型' }]}>
                      <Select>
                        <Option value="fabricA">面料A</Option>
                        <Option value="fabricB">面料B</Option>
                        <Option value="fabricC">面料C</Option>
                        <Option value="fabricD">面料D</Option>
                        <Option value="fabricE">面料E</Option>
                        <Option value="liningA">里料A</Option>
                        <Option value="liningB">里料B</Option>
                        <Option value="liningC">里料C</Option>
                        <Option value="liningD">里料D</Option>
                        <Option value="liningE">里料E</Option>
                        <Option value="accessoryA">辅料A</Option>
                        <Option value="accessoryB">辅料B</Option>
                        <Option value="accessoryC">辅料C</Option>
                        <Option value="accessoryD">辅料D</Option>
                        <Option value="accessoryE">辅料E</Option>
                      </Select>
                    </Form.Item>
                    <Form.Item name="materialCode" label="物料编码" rules={[{ required: true, message: '请输入物料编码' }]}>
                      <Input />
                    </Form.Item>
                    <Form.Item name="materialName" label="物料名称" rules={[{ required: true, message: '请输入物料名称' }]}>
                      <Input />
                    </Form.Item>
                    <Form.Item name="specifications" label="规格">
                      <Input />
                    </Form.Item>
                    <Form.Item name="unit" label="单位" rules={[{ required: true, message: '请输入单位' }]}>
                      <Input />
                    </Form.Item>
                  </Col>
                  <Col xs={24} lg={12}>
                    <Form.Item name="orderNo" label="订单号">
                      <Input disabled />
                    </Form.Item>
                    <Form.Item name="purchaseQuantity" label="采购数量" rules={[{ required: true, message: '请输入采购数量' }]}>
                      <InputNumber style={{ width: '100%' }} min={0} />
                    </Form.Item>
                    <Form.Item name="arrivedQuantity" label="到货数量">
                      <InputNumber style={{ width: '100%' }} min={0} />
                    </Form.Item>
                    <Form.Item name="supplierName" label="供应商" rules={[{ required: true, message: '请输入供应商' }]}>
                      <Input />
                    </Form.Item>
                    <Form.Item name="unitPrice" label="单价(元)" rules={[{ required: true, message: '请输入单价' }]}>
                      <InputNumber style={{ width: '100%' }} min={0} step={0.01} />
                    </Form.Item>
                    <Form.Item name="totalAmount" label="金额(元)">
                      <InputNumber disabled style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="status" label="状态" rules={[{ required: true, message: '请选择状态' }]}>
                      <Select>
                        <Option value="pending">待采购</Option>
                        <Option value="partial">部分到货</Option>
                        <Option value="completed">全部到货</Option>
                        <Option value="cancelled">已取消</Option>
                      </Select>
                    </Form.Item>
                  </Col>
                </Row>
                <Form.Item name="remark" label="备注">
                  <Input.TextArea autoSize={{ minRows: 4, maxRows: 8 }} />
                </Form.Item>
              </Form>
            )
          )}
        </ResizableModal>

        <Modal
          open={returnConfirmOpen}
          title="回料确认"
          okText="确认回料"
          cancelText="取消"
          width={isMobile ? '96vw' : 570}
          centered
          onCancel={() => {
            setReturnConfirmOpen(false);
            setReturnConfirmTargets([]);
            returnConfirmForm.resetFields();
          }}
          okButtonProps={{ loading: returnConfirmSubmitting }}
          onOk={submitReturnConfirm}
          destroyOnHidden
        >
          <Form form={returnConfirmForm} layout="vertical" preserve={false}>
            <div style={{ marginBottom: 12, color: '#1f1f1f' }}>
              确认人：{String(user?.name || user?.username || '未命名').trim() || '未命名'}
            </div>
            <div style={{ overflow: 'auto', border: '1px solid #f0f0f0', borderRadius: 6 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #f0f0f0' }}>物料</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid #f0f0f0', width: 100 }}>采购数</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid #f0f0f0', width: 100 }}>到货数</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid #f0f0f0', width: 180 }}>实际回料数</th>
                  </tr>
                </thead>
                <tbody>
                  {returnConfirmTargets.map((t, idx) => {
                    const purchaseQty = Number((t as any)?.purchaseQuantity || 0) || 0;
                    const arrivedQty = Number((t as any)?.arrivedQuantity || 0) || 0;
                    const max = arrivedQty > 0 ? arrivedQty : purchaseQty;
                    return (
                      <tr key={String((t as any)?.id || idx)}>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid #f5f5f5' }}>
                          <div style={{ fontWeight: 600, color: '#1f1f1f' }}>{String((t as any)?.materialName || '-')}</div>
                          <div style={{ fontSize: 12, color: '#8c8c8c' }}>{String((t as any)?.materialCode || '')}</div>
                          <Form.Item name={['items', idx, 'purchaseId']} initialValue={String((t as any)?.id || '')} hidden>
                            <Input />
                          </Form.Item>
                          <Form.Item name={['items', idx, 'purchaseQuantity']} initialValue={purchaseQty} hidden>
                            <Input />
                          </Form.Item>
                          <Form.Item name={['items', idx, 'arrivedQuantity']} initialValue={arrivedQty} hidden>
                            <Input />
                          </Form.Item>
                        </td>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid #f5f5f5', textAlign: 'right' }}>{purchaseQty}</td>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid #f5f5f5', textAlign: 'right' }}>{arrivedQty}</td>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid #f5f5f5', textAlign: 'right' }}>
                          <Form.Item
                            name={['items', idx, 'returnQuantity']}
                            initialValue={Number((t as any)?.returnQuantity || 0) || (max || 0)}
                            style={{ margin: 0, display: 'inline-block' }}
                            rules={[
                              { required: true, message: '请输入实际回料数量' },
                              {
                                validator: async (_, v) => {
                                  const n = Number(v);
                                  if (!Number.isFinite(n)) throw new Error('请输入数字');
                                  if (n < 0) throw new Error('不能小于0');
                                  if (!Number.isInteger(n)) throw new Error('请输入整数');
                                  if (n > max) throw new Error(`不能大于${max}`);
                                },
                              },
                            ]}
                          >
                            <InputNumber min={0} precision={0} step={1} style={{ width: 140 }} />
                          </Form.Item>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Form>
        </Modal>

        <Modal
          open={returnResetOpen}
          title="退回回料确认"
          okText="确认退回"
          cancelText="取消"
          okButtonProps={{ danger: true, loading: returnResetSubmitting }}
          onCancel={() => {
            setReturnResetOpen(false);
            setReturnResetTarget(null);
            returnResetForm.resetFields();
          }}
          onOk={submitReturnReset}
          destroyOnHidden
        >
          <Form form={returnResetForm} layout="vertical" preserve={false}>
            <Form.Item
              name="reason"
              label="退回原因"
              rules={[{ required: true, message: '请输入退回原因' }]}
            >
              <Input.TextArea rows={3} maxLength={200} showCount />
            </Form.Item>
          </Form>
        </Modal>
      </div>
    </Layout>
  );
};

export default MaterialPurchase;
