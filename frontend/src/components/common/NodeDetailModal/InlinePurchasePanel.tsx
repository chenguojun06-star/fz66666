import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Alert, App, Button, Card, Collapse, Form, Space, Spin, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import ResizableTable from '@/components/common/ResizableTable';
import ResizableModal from '@/components/common/ResizableModal';
import MaterialTypeTag from '@/components/common/MaterialTypeTag';
import SupplierNameTooltip from '@/components/common/SupplierNameTooltip';
import { ProductionOrderHeader } from '@/components/StyleAssets';
import api, { parseProductionOrderLines } from '@/utils/api';
import { useUser } from '@/utils/AuthContext';
import type { MaterialPurchase, ProductionOrder } from '@/types/production';
import { MATERIAL_PURCHASE_STATUS, MATERIAL_TYPES } from '@/constants/business';
import { getMaterialTypeCategory, getMaterialTypeSortKey, normalizeMaterialType } from '@/utils/materialType';
import PurchaseCreateForm from '@/modules/production/pages/Production/MaterialPurchase/components/PurchaseModal/PurchaseCreateForm';
import {
  formatMaterialQuantity,
  formatReferenceKilograms,
  getStatusConfig,
  buildColorSummary,
  getOrderQtyTotal,
  buildSizePairs,
} from '@/modules/production/pages/Production/MaterialPurchase/utils';

interface InlinePurchasePanelProps {
  orderId?: string;
  orderNo?: string;
}

const unwrapRecords = (res: any): MaterialPurchase[] => {
  if (res?.code !== 200) return [];
  return (
    (Array.isArray(res?.data?.records) && res.data.records) ||
    (Array.isArray(res?.data) && res.data) ||
    []
  );
};

const sortPurchases = (arr: MaterialPurchase[]) =>
  [...arr].sort((a, b) => {
    const ka = getMaterialTypeSortKey(a?.materialType);
    const kb = getMaterialTypeSortKey(b?.materialType);
    return ka !== kb ? ka.localeCompare(kb) : String(a?.materialName || '').localeCompare(String(b?.materialName || ''), 'zh');
  });

const normalizeStatus = (status?: MaterialPurchase['status'] | string) =>
  String(status || '').trim().toLowerCase();

const InlinePurchasePanel: React.FC<InlinePurchasePanelProps> = ({ orderId, orderNo }) => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { user } = useUser();

  const [purchases, setPurchases] = useState<MaterialPurchase[]>([]);
  const [order, setOrder] = useState<ProductionOrder | null>(null);
  const [orderLines, setOrderLines] = useState<Array<{ color: string; size: string; quantity: number }>>([]);
  const [sizePairs, setSizePairs] = useState<Array<{ size: string; quantity: number }>>([]);
  const [loading, setLoading] = useState(false);
  const [stockMap, setStockMap] = useState<Record<string, number>>({});
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmCompleteLoading, setConfirmCompleteLoading] = useState(false);

  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [createForm] = Form.useForm();
  const [createLoading, setCreateLoading] = useState(false);

  const orderColors = useMemo(() => {
    const colors = new Set<string>();
    orderLines.forEach(line => {
      const c = String(line?.color || '').trim();
      if (c && c !== '-') colors.add(c);
    });
    return Array.from(colors);
  }, [orderLines]);

  const firstPurchase = purchases[0] || null;

  const loadData = useCallback(async () => {
    const no = String(orderNo || '').trim();
    if (!no) return;
    setLoading(true);
    try {
      const [orderRes, purchaseRes] = await Promise.all([
        api.get<{ code: number; data: { records: ProductionOrder[] } }>('/production/order/list', {
          params: { page: 1, pageSize: 1, orderNo: no },
        }),
        api.get<{ code: number; data: { records: MaterialPurchase[] } }>('/production/purchase/list', {
          params: { page: 1, pageSize: 200, orderNo: no, materialType: '', status: '' },
        }),
      ]);
      const orderRecords = orderRes?.code === 200
        ? (Array.isArray(orderRes?.data?.records) ? orderRes.data.records : [])
        : [];
      const orderRecord = orderRecords[0] || null;
      setOrder(orderRecord);

      let records = sortPurchases(unwrapRecords(purchaseRes));

      if (records.length === 0 && orderRecord?.id) {
        try {
          const previewRes = await api.get<{ code: number; data: MaterialPurchase[] }>(
            '/production/purchase/demand/preview',
            { params: { orderId: orderRecord.id } }
          );
          if (previewRes?.code === 200 && Array.isArray(previewRes?.data)) {
            records = sortPurchases(previewRes.data);
          }
        } catch {
          // 预览失败，保持空列表
        }
      }

      setPurchases(records);

      const parsedLines = parseProductionOrderLines(orderRecord);
      if (parsedLines.length) {
        setOrderLines(parsedLines);
        setSizePairs(buildSizePairs(parsedLines));
      } else if (orderRecord) {
        const fc = String(orderRecord?.color || '').trim();
        const fs = String(orderRecord?.size || '').trim();
        const fq = Number(orderRecord?.orderQuantity || 0);
        const lines = [(fc || fs || fq) ? { color: fc, size: fs, quantity: fq } : { color: '-', size: '-', quantity: 0 }];
        setOrderLines(lines);
        setSizePairs(buildSizePairs(lines));
      } else if (records.length > 0) {
        const colors = new Set<string>(); const sizes = new Set<string>(); let totalQty = 0;
        records.forEach((p: any) => {
          const c = String(p?.color || '').trim(); const s = String(p?.size || '').trim();
          if (c && c !== '-') colors.add(c); if (s && s !== '-') sizes.add(s);
          if (Number(p?.purchaseQuantity || 0) > 0) totalQty += Number(p?.purchaseQuantity || 0);
        });
        const lines = [{ color: Array.from(colors).join(',') || '-', size: Array.from(sizes).join(',') || '-', quantity: totalQty || 0 }];
        setOrderLines(lines);
        setSizePairs(buildSizePairs(lines));
      } else {
        setOrderLines([{ color: '-', size: '-', quantity: 0 }]);
        setSizePairs([]);
      }
    } catch {
      setPurchases([]);
      setOrder(null);
      setOrderLines([{ color: '-', size: '-', quantity: 0 }]);
      setSizePairs([]);
    } finally {
      setLoading(false);
    }
  }, [orderNo]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const no = String(orderNo || '').trim();
    if (!no) return;
    api.get<any>('/production/purchase/smart-receive-preview', { params: { orderNo: no } })
      .then((res: any) => {
        const materials: any[] = res?.data?.materials || res?.materials || [];
        const map: Record<string, number> = {};
        materials.forEach((m: any) => { if (m.purchaseId != null) map[String(m.purchaseId)] = Number(m.availableStock ?? 0); });
        setStockMap(map);
      })
      .catch(() => setStockMap({}));
  }, [orderNo]);

  const getOrderStyleInfo = useCallback(() => {
    return {
      orderId: orderId || order?.id || firstPurchase?.orderId || '',
      orderNo: String(orderNo || firstPurchase?.orderNo || '').trim(),
      styleNo: order?.styleNo || firstPurchase?.styleNo || '',
      styleName: order?.styleName || firstPurchase?.styleName || '',
      styleId: order?.styleId || firstPurchase?.styleId || '',
      styleCover: order?.styleCover || firstPurchase?.styleCover || '',
    };
  }, [orderId, orderNo, order, firstPurchase]);

  const openCreateModal = useCallback(() => {
    const info = getOrderStyleInfo();
    createForm.setFieldsValue({
      orderId: info.orderId,
      orderNo: info.orderNo,
      styleNo: info.styleNo,
      styleName: info.styleName,
      styleId: info.styleId,
      styleCover: info.styleCover,
      materialType: normalizeMaterialType(MATERIAL_TYPES.FABRIC),
      arrivedQuantity: 0,
      status: MATERIAL_PURCHASE_STATUS.PENDING,
      sourceType: 'order',
    });
    setCreateModalVisible(true);
  }, [createForm, getOrderStyleInfo]);

  const handleCreateSave = useCallback(async () => {
    try {
      setCreateLoading(true);
      const values = await createForm.validateFields();
      const purchaseQuantity = Number(values.purchaseQuantity || 0);
      const unitPrice = Number(values.unitPrice || 0);
      const totalAmount = Number.isFinite(purchaseQuantity) && Number.isFinite(unitPrice)
        ? Number((purchaseQuantity * unitPrice).toFixed(2)) : undefined;
      const arrivedQuantity = Number(values.arrivedQuantity || 0);
      const computedStatus = values.status === MATERIAL_PURCHASE_STATUS.CANCELLED
        ? MATERIAL_PURCHASE_STATUS.CANCELLED
        : arrivedQuantity <= 0 ? MATERIAL_PURCHASE_STATUS.PENDING
        : arrivedQuantity < purchaseQuantity ? MATERIAL_PURCHASE_STATUS.PARTIAL
        : MATERIAL_PURCHASE_STATUS.AWAITING_CONFIRM;
      const payload = {
        ...values,
        totalAmount,
        status: values.status || computedStatus,
        sourceType: values.sourceType || 'order',
      };
      const response = await api.post<{ code: number; message?: string }>('/production/purchase', payload);
      if (response.code === 200) {
        message.success('采购物料添加成功');
        setCreateModalVisible(false);
        createForm.resetFields();
        loadData();
      } else {
        message.error(response.message || '保存失败');
      }
    } catch (error) {
      const formError = error as { errorFields?: Array<{ errors?: string[] }> };
      if (formError?.errorFields?.length) {
        message.error(formError.errorFields[0]?.errors?.[0] || '表单验证失败');
      } else {
        message.error((error as Error).message || '保存失败');
      }
    } finally {
      setCreateLoading(false);
    }
  }, [createForm, message, loadData]);

  const handleCloseCreateModal = useCallback(() => {
    setCreateModalVisible(false);
    createForm.resetFields();
  }, [createForm]);

  const handleReceive = useCallback(async (record: MaterialPurchase) => {
    const purchaseId = String(record?.id || '').trim();
    if (!purchaseId) return;
    const receiverId = String(user?.id || '').trim();
    const receiverName = String(user?.name || user?.username || '').trim();
    try {
      const res = await api.post<{ code: number; message?: string }>('/production/purchase/receive', {
        purchaseId,
        receiverId,
        receiverName,
        arrivedQuantity: Number(record.purchaseQuantity || 0),
      });
      if (res?.code === 200) {
        message.success(`${record.materialName || record.materialCode} 采购领取成功`);
        loadData();
      } else {
        message.error(res?.message || '领取失败');
      }
    } catch (e) {
      message.error((e as Error)?.message || '领取失败');
    }
  }, [user, message, loadData]);

  const handleReceiveAll = useCallback(async () => {
    const pendingItems = purchases.filter(p => normalizeStatus(p.status) === MATERIAL_PURCHASE_STATUS.PENDING);
    if (pendingItems.length === 0) {
      message.info('没有待采购的物料');
      return;
    }
    const receiverId = String(user?.id || '').trim();
    const receiverName = String(user?.name || user?.username || '').trim();
    setActionLoading(true);
    try {
      const purchaseIds = pendingItems.map(p => String(p.id || '')).filter(Boolean);
      const res = await api.post<{ code: number; message?: string }>('/production/purchase/batch-receive', {
        purchaseIds,
        receiverId,
        receiverName,
      });
      if (res?.code === 200) {
        message.success(`已批量领取 ${pendingItems.length} 项物料`);
        loadData();
      } else {
        message.error(res?.message || '批量领取失败');
      }
    } catch (e) {
      message.error((e as Error)?.message || '批量领取失败');
    } finally {
      setActionLoading(false);
    }
  }, [purchases, user, message, loadData]);

  const handleConfirmReturn = useCallback(async (record: MaterialPurchase) => {
    const purchaseId = String(record?.id || '').trim();
    if (!purchaseId) return;
    const confirmerId = String(user?.id || '').trim();
    const confirmerName = String(user?.name || user?.username || '').trim();
    try {
      const res = await api.post<{ code: number; message?: string }>('/production/purchase/return-confirm', {
        purchaseId,
        returnQuantity: Number(record.arrivedQuantity || record.purchaseQuantity || 0),
        confirmerId,
        confirmerName,
      });
      if (res?.code === 200) {
        message.success(`${record.materialName || record.materialCode} 回料确认成功`);
        loadData();
      } else {
        message.error(res?.message || '回料确认失败');
      }
    } catch (e) {
      message.error((e as Error)?.message || '回料确认失败');
    }
  }, [user, message, loadData]);

  const handleReturnReset = useCallback(async (record: MaterialPurchase) => {
    const purchaseId = String(record?.id || '').trim();
    if (!purchaseId) return;
    try {
      const res = await api.post<{ code: number; message?: string }>('/production/purchase/return-confirm/reset', {
        purchaseId,
      });
      if (res?.code === 200) {
        message.success(`${record.materialName || record.materialCode} 已退回`);
        loadData();
      } else {
        message.error(res?.message || '退回失败');
      }
    } catch (e) {
      message.error((e as Error)?.message || '退回失败');
    }
  }, [message, loadData]);

  const handleBatchReturn = useCallback(async () => {
    const returnable = purchases.filter(p => {
      const s = normalizeStatus(p.status);
      return (s === MATERIAL_PURCHASE_STATUS.RECEIVED || s === MATERIAL_PURCHASE_STATUS.PARTIAL || s === MATERIAL_PURCHASE_STATUS.COMPLETED)
        && Number(p?.returnConfirmed || 0) !== 1;
    });
    if (returnable.length === 0) {
      message.info('没有可回料确认的物料');
      return;
    }
    setActionLoading(true);
    try {
      const confirmerId = String(user?.id || '').trim();
      const confirmerName = String(user?.name || user?.username || '').trim();
      const purchaseIds = returnable.map(p => String(p.id || '')).filter(Boolean);
      const res = await api.post<{ code: number; message?: string }>('/production/purchase/batch-return-confirm', {
        purchaseIds,
        confirmerId,
        confirmerName,
      });
      if (res?.code === 200) {
        message.success(`已批量回料确认 ${returnable.length} 项`);
        loadData();
      } else {
        message.error(res?.message || '批量回料确认失败');
      }
    } catch (e) {
      message.error((e as Error)?.message || '批量回料确认失败');
    } finally {
      setActionLoading(false);
    }
  }, [purchases, user, message, loadData]);

  const handleConfirmComplete = useCallback(async () => {
    const awaiting = purchases.filter(p => normalizeStatus(p.status) === MATERIAL_PURCHASE_STATUS.AWAITING_CONFIRM);
    if (awaiting.length === 0) {
      message.info('没有待确认完成的物料');
      return;
    }
    setConfirmCompleteLoading(true);
    try {
      for (const record of awaiting) {
        await api.post('/production/purchase/confirm-complete', { purchaseId: record.id });
      }
      message.success(`已确认完成 ${awaiting.length} 项`);
      loadData();
    } catch (e) {
      message.error((e as Error)?.message || '确认完成失败');
    } finally {
      setConfirmCompleteLoading(false);
    }
  }, [purchases, message, loadData]);

  const handleWarehousePick = useCallback(async (record: MaterialPurchase, pickQty: number) => {
    const purchaseId = String(record?.id || '').trim();
    if (!purchaseId) return;
    const receiverId = String(user?.id || '').trim();
    const receiverName = String(user?.name || user?.username || '').trim();
    try {
      const res = await api.post<{ code: number; message?: string }>('/production/purchase/warehouse-pick', {
        purchaseId,
        pickQty,
        receiverId,
        receiverName,
      });
      if (res?.code === 200) {
        message.success(`${record.materialName || record.materialCode} 已提交出库申请`);
        loadData();
      } else {
        message.error(res?.message || '出库领取失败');
      }
    } catch (e) {
      message.error((e as Error)?.message || '出库领取失败');
    }
  }, [user, message, loadData]);

  const handleQualityIssue = useCallback((record: MaterialPurchase) => {
    message.info(`品质异常：${record.materialName || record.materialCode}，请前往物料采购页面处理`);
  }, [message]);

  const orderColorSet = useMemo(() => {
    const colors = new Set<string>();
    orderLines.forEach(line => {
      const c = String(line?.color || '').trim();
      if (c && c !== '-') colors.add(c);
    });
    return colors;
  }, [orderLines]);

  const purchaseColorSet = useMemo(() => {
    const colors = new Set<string>();
    purchases.forEach(p => {
      const c = String(p?.color || '').trim();
      if (c && c !== '-') colors.add(c);
    });
    return colors;
  }, [purchases]);

  const missingColors = useMemo(() => {
    if (orderColorSet.size <= 1) return [];
    const missing: string[] = [];
    orderColorSet.forEach(c => {
      if (!purchaseColorSet.has(c)) missing.push(c);
    });
    return missing;
  }, [orderColorSet, purchaseColorSet]);

  const sections = useMemo(() => {
    return ([
      { key: 'fabric', title: '面料' },
      { key: 'lining', title: '里料' },
      { key: 'accessory', title: '辅料' },
    ] as const).map(sec => {
      const data = purchases.filter(p => getMaterialTypeCategory(p.materialType) === sec.key);
      return { ...sec, data };
    }).filter(x => x.data.length > 0);
  }, [purchases]);

  const columns = useMemo(() => [
    {
      title: '物料类型',
      dataIndex: 'materialType',
      key: 'materialType',
      width: 100,
      render: (v: unknown) => <MaterialTypeTag value={v} />,
    },
    { title: '物料编码', dataIndex: 'materialCode', key: 'materialCode', width: 110, render: (v: unknown) => v || '-' },
    { title: '物料名称', dataIndex: 'materialName', key: 'materialName', width: 160, ellipsis: true, render: (v: unknown) => v || '-' },
    {
      title: '颜色',
      dataIndex: 'color',
      key: 'color',
      width: 80,
      render: (v: unknown) => {
        const c = String(v || '').trim();
        return c || <span style={{ color: 'var(--color-text-quaternary)' }}>-</span>;
      },
    },
    {
      title: '规格/幅宽',
      key: 'specWidth',
      width: 130,
      ellipsis: true,
      render: (_: unknown, r: MaterialPurchase) => {
        const spec = String(r.specifications || '').trim();
        const w = String((r as any).fabricWidth || '').trim();
        if (spec && w) return `${spec} / ${w}`;
        return spec || w || '-';
      },
    },
    { title: '单位', dataIndex: 'unit', key: 'unit', width: 70, render: (v: unknown) => v || '-' },
    {
      title: '采购数量',
      dataIndex: 'purchaseQuantity',
      key: 'purchaseQuantity',
      width: 100,
      align: 'right' as const,
      render: (v: unknown) => formatMaterialQuantity(v),
    },
    {
      title: '参考公斤数',
      key: 'referenceKilograms',
      width: 110,
      align: 'right' as const,
      render: (_: unknown, r: MaterialPurchase) => formatReferenceKilograms(r.purchaseQuantity, (r as any).conversionRate, r.unit),
    },
    {
      title: '到货数量',
      dataIndex: 'arrivedQuantity',
      key: 'arrivedQuantity',
      width: 100,
      align: 'right' as const,
      render: (v: unknown, r: MaterialPurchase) => {
        const qty = Number(v ?? 0);
        const purchased = Number(r.purchaseQuantity ?? 0);
        const canReceive = purchased > qty;
        return (
          <span
            style={{
              color: canReceive ? 'var(--color-primary)' : undefined,
              cursor: canReceive ? 'pointer' : undefined,
              textDecoration: canReceive ? 'underline' : undefined,
            }}
            title={canReceive ? '点击到货入库' : undefined}
            onClick={() => { if (canReceive) handleReceive(r); }}
          >
            {formatMaterialQuantity(v)}
          </span>
        );
      },
    },
    {
      title: '仓库库存',
      key: 'warehouseStock',
      width: 90,
      align: 'right' as const,
      render: (_: unknown, r: MaterialPurchase) => {
        const stock = stockMap[String(r.id)];
        if (stock == null) return <span style={{ color: '#bbb' }}>-</span>;
        const hasStock = stock > 0;
        return (
          <span
            style={{
              color: hasStock ? 'var(--color-primary)' : '#bbb',
              cursor: hasStock ? 'pointer' : undefined,
              textDecoration: hasStock ? 'underline' : undefined,
            }}
            title={hasStock ? '点击出库领取' : undefined}
            onClick={() => {
              if (hasStock) {
                const pickQty = Math.min(stock, Number(r.purchaseQuantity || 0));
                handleWarehousePick(r, pickQty);
              }
            }}
          >
            {stock}{r.unit ? ` ${r.unit}` : ''}
          </span>
        );
      },
    },
    {
      title: '单价(元)',
      dataIndex: 'unitPrice',
      key: 'unitPrice',
      width: 100,
      align: 'right' as const,
      render: (v: unknown) => {
        const n = Number(v);
        return Number.isFinite(n) ? n.toFixed(2) : '-';
      },
    },
    {
      title: '金额(元)',
      dataIndex: 'totalAmount',
      key: 'totalAmount',
      width: 110,
      align: 'right' as const,
      render: (v: any, r: any) => {
        const qty = Number(r?.arrivedQuantity ?? 0);
        const price = Number(r?.unitPrice);
        if (Number.isFinite(qty) && Number.isFinite(price)) return (qty * price).toFixed(2);
        const n = Number(v);
        return Number.isFinite(n) ? n.toFixed(2) : '-';
      },
    },
    {
      title: '供应商',
      dataIndex: 'supplierName',
      key: 'supplierName',
      width: 130,
      ellipsis: true,
      render: (_: unknown, record: MaterialPurchase) => (
        <SupplierNameTooltip
          name={record.supplierName}
          contactPerson={(record as any).supplierContactPerson}
          contactPhone={(record as any).supplierContactPhone}
        />
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: MaterialPurchase['status']) => {
        const { text, color } = getStatusConfig(status);
        return <Tag color={color}>{text}</Tag>;
      },
    },
    {
      title: '回料时间',
      dataIndex: 'returnConfirmTime',
      key: 'returnConfirmTime',
      width: 140,
      render: (v: any, r: any) => (Number(r?.returnConfirmed || 0) === 1 ? (String(v || '').slice(0, 16).replace('T', ' ') || '-') : '-'),
    },
    { title: '备注', dataIndex: 'remark', key: 'remark', width: 180, ellipsis: true, render: (v: unknown) => v || '-' },
    {
      title: '操作',
      key: 'action',
      width: 220,
      render: (_: unknown, record: MaterialPurchase) => {
        const status = normalizeStatus(record.status);
        const stock = stockMap[String(record.id)];
        const hasStock = stock != null && stock > 0;
        const isWarehousePending = status === MATERIAL_PURCHASE_STATUS.WAREHOUSE_PENDING;
        return (
          <Space size={4}>
            {isWarehousePending ? (
              <Tag color="blue">待仓库出库</Tag>
            ) : (
              <Button
                type="link"
                size="small"
                disabled={status !== MATERIAL_PURCHASE_STATUS.PENDING}
                onClick={() => {
                  if (hasStock) {
                    const pickQty = Math.min(stock, Number(record.purchaseQuantity || 0));
                    handleWarehousePick(record, pickQty);
                  } else {
                    handleReceive(record);
                  }
                }}
              >
                {hasStock ? '出库领取' : '采购'}
              </Button>
            )}
            <Button
              type="link"
              size="small"
              disabled={!(status === MATERIAL_PURCHASE_STATUS.RECEIVED || status === MATERIAL_PURCHASE_STATUS.PARTIAL || status === MATERIAL_PURCHASE_STATUS.COMPLETED)}
              onClick={() => handleQualityIssue(record)}
            >
              品质异常
            </Button>
            <Button
              type="link"
              size="small"
              disabled={!(status === MATERIAL_PURCHASE_STATUS.RECEIVED || status === MATERIAL_PURCHASE_STATUS.PARTIAL || status === MATERIAL_PURCHASE_STATUS.COMPLETED)}
              onClick={() => handleConfirmReturn(record)}
            >
              {Number(record?.returnConfirmed || 0) === 1 ? '追加回料' : '回料确认'}
            </Button>
            {(Number(record?.returnConfirmed || 0) === 1 || status === MATERIAL_PURCHASE_STATUS.COMPLETED) && (
              <Button
                type="link"
                size="small"
                onClick={() => handleReturnReset(record)}
              >
                退回
              </Button>
            )}
          </Space>
        );
      },
    },
  ], [handleReceive, handleConfirmReturn, handleReturnReset, handleWarehousePick, handleQualityIssue, stockMap]);

  return (
    <Spin spinning={loading}>
      <ProductionOrderHeader
        order={order}
        orderLines={orderLines}
        orderNo={firstPurchase?.orderNo || orderNo}
        styleNo={firstPurchase?.styleNo || order?.styleNo}
        styleName={firstPurchase?.styleName || order?.styleName}
        styleId={firstPurchase?.styleId || order?.styleId}
        styleCover={firstPurchase?.styleCover || order?.styleCover}
        color={String(order?.color || firstPurchase?.color || '').trim() || buildColorSummary(orderLines) || ''}
        sizeItems={sizePairs.map(x => ({ size: x.size, quantity: x.quantity }))}
        totalQuantity={getOrderQtyTotal(orderLines)}
        showOrderNo
        coverSize={80}
      />

      {missingColors.length > 0 && (
        <Alert
          type="warning"
          showIcon
          message="颜色覆盖不完整"
          description={
            <span>
              订单包含 <strong>{orderColorSet.size}</strong> 种颜色（{Array.from(orderColorSet).join('、')}），
              但以下颜色缺少采购物料记录：<strong style={{ color: 'var(--color-error)' }}>{missingColors.join('、')}</strong>。
              请前往<a href={`/production/material?orderNo=${encodeURIComponent(String(orderNo || ''))}`}>物料采购页面</a>为每个颜色分别添加面料信息。
            </span>
          }
          style={{ marginBottom: 12 }}
        />
      )}

      <Card
        size="small"
        title={`需要采购的面辅料（${purchases.length}项）`}
        loading={loading}
        extra={
          <Space>
            <Button
              type="primary"
              size="small"
              disabled={!purchases.some(p => normalizeStatus(p.status) === MATERIAL_PURCHASE_STATUS.PENDING)}
              loading={actionLoading}
              onClick={handleReceiveAll}
            >
              采购全部
            </Button>
            <Button
              size="small"
              disabled={!purchases.some(p => {
                const s = normalizeStatus(p.status);
                return (s === MATERIAL_PURCHASE_STATUS.RECEIVED || s === MATERIAL_PURCHASE_STATUS.PARTIAL || s === MATERIAL_PURCHASE_STATUS.COMPLETED)
                  && Number(p?.returnConfirmed || 0) !== 1;
              })}
              loading={actionLoading}
              onClick={handleBatchReturn}
            >
              回料确认
            </Button>
            <Button
              size="small"
              disabled={!purchases.some(p => normalizeStatus(p.status) === MATERIAL_PURCHASE_STATUS.AWAITING_CONFIRM)}
              loading={confirmCompleteLoading}
              onClick={handleConfirmComplete}
            >
              确认完成
            </Button>
            <Button
              size="small"
              type="primary"
              icon={<PlusOutlined />}
              onClick={openCreateModal}
            >
              添加采购物料
            </Button>
            <Button
              size="small"
              onClick={() => navigate(`/production/material?orderNo=${encodeURIComponent(String(orderNo || ''))}`)}
            >
              前往物料采购 →
            </Button>
          </Space>
        }
      >
        {purchases.length === 0 && !loading ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-text-tertiary)' }}>
            该订单暂无采购记录，点击上方「添加采购物料」按钮添加
          </div>
        ) : (
          <Collapse
            collapsible="icon"
            defaultActiveKey={sections.map(s => s.key)}
            items={sections.map(sec => ({
              key: sec.key,
              label: `${sec.title}（${sec.data.length}）`,
              children: (
                <ResizableTable<MaterialPurchase>
                  rowKey={(r: MaterialPurchase) => String(r.id || `${r.purchaseNo}-${r.materialType}-${r.materialCode}`)}
                  dataSource={sec.data}
                  pagination={false}
                  size="small"
                  scroll={{ x: 'max-content' }}
                  columns={columns}
                />
              ),
            }))}
          />
        )}
      </Card>

      <ResizableModal
        title="添加采购物料"
        open={createModalVisible}
        onCancel={handleCloseCreateModal}
        width={typeof window !== 'undefined' ? Math.max(600, window.innerWidth * 0.45) : 700}
        footer={[
          <Button key="cancel" onClick={handleCloseCreateModal}>
            取消
          </Button>,
          <Button key="submit" type="primary" loading={createLoading} onClick={handleCreateSave}>
            保存
          </Button>,
        ]}
      >
        <Form form={createForm} component={false} />
        <PurchaseCreateForm form={createForm} orderColors={orderColors} />
      </ResizableModal>
    </Spin>
  );
};

export default InlinePurchasePanel;
