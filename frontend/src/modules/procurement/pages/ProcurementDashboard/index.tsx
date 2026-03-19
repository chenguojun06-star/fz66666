import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card, Col, DatePicker, Form, Input, InputNumber, Row, Segmented, Select, Space, Tabs, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import ResizableTable from '@/components/common/ResizableTable';
import {
  CheckCircleOutlined, DownloadOutlined, PlusOutlined, SearchOutlined,
  ShoppingCartOutlined, ShopOutlined, WalletOutlined,
} from '@ant-design/icons';
import SortableColumnTitle from '@/components/common/SortableColumnTitle';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import Layout from '@/components/Layout';
import ResizableModal from '@/components/common/ResizableModal';
import RowActions, { type RowAction } from '@/components/common/RowActions';
import RejectReasonModal from '@/components/common/RejectReasonModal';
import { StyleCoverThumb } from '@/components/StyleAssets';
import { getMaterialTypeCategory, getMaterialTypeLabel } from '@/utils/materialType';
import { formatDateTime } from '@/utils/datetime';
import { procurementApi, type Supplier, type PurchaseOrder } from '@/services/procurement/procurementApi';
import api from '@/utils/api';
import PurchaseOrderDetailModal from './components/PurchaseOrderDetailModal';
import SupplierPurchaseHistoryModal from './components/SupplierPurchaseHistoryModal';
import { message } from '@/utils/antdStatic';

const { Title, Text } = Typography;

const normalizePurchaseStatus = (value?: string) => String(value || '').trim().toLowerCase();

// ─── 供应商列表 Tab ────────────────────────────────────────────────
const SupplierTab: React.FC = () => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [historyRefreshSeed, setHistoryRefreshSeed] = useState(0);

  const fetchList = useCallback(async (page = pagination.current, kw = keyword) => {
    setLoading(true);
    try {
      const res = await procurementApi.listSuppliers({ page, pageSize: pagination.pageSize, keyword: kw });
      const data = (res as any)?.data ?? res;
      setSuppliers(data?.records ?? []);
      setTotal(data?.total ?? 0);
    } catch {
      /* 静默失败 */
    } finally {
      setLoading(false);
    }
  }, [pagination.pageSize, keyword]);

  useEffect(() => { fetchList(1); }, []);

  const columns: ColumnsType<Supplier> = [
    { title: '供应商编码', dataIndex: 'factoryCode', width: 130, render: v => <Text code style={{ fontSize: 12 }}>{v}</Text> },
    { title: '供应商名称', dataIndex: 'factoryName', width: 200 },
    { title: '联系人', dataIndex: 'contactPerson', width: 100 },
    { title: '联系电话', dataIndex: 'contactPhone', width: 130 },
    { title: '地区', dataIndex: 'region', width: 100 },
    { title: '状态', dataIndex: 'status', width: 90, render: v =>
      v === 'ACTIVE' || !v ? <Tag color="green">合作中</Tag> : <Tag color="default">停合作</Tag>
    },
    { title: '创建时间', dataIndex: 'createTime', render: v => v?.substring(0, 10) ?? '-' },
    {
      title: '操作', width: 100, fixed: 'right' as const,
      render: (_: unknown, record: Supplier) => {
        const actions: RowAction[] = [
          { key: 'orders', label: '采购历史', primary: true, onClick: () => setSelectedSupplier(record) },
        ];
        return <RowActions actions={actions} />;
      },
    },
  ];

  return (
    <>
      <Card size="small" style={{ marginBottom: 12 }} styles={{ body: { padding: '12px 16px' } }}>
        <Space>
          <Input
            placeholder="搜索供应商名称或编码"
            prefix={<SearchOutlined />}
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            onPressEnter={() => { setPagination(p => ({ ...p, current: 1 })); fetchList(1, keyword); }}
            style={{ width: 260 }}
            allowClear
          />
          <Button icon={<SearchOutlined />} onClick={() => { setPagination(p => ({ ...p, current: 1 })); fetchList(1, keyword); }}>搜索</Button>
        </Space>
      </Card>
      <Card styles={{ body: { padding: 0 } }}>
        <ResizableTable
          rowKey="id"
          columns={columns}
          dataSource={suppliers}
          loading={loading}
          size="small"
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total,
            showSizeChanger: true,
            showTotal: t => `共 ${t} 条`,
          }}
          onChange={(p: TablePaginationConfig) => {
            const page = p.current ?? 1;
            setPagination({ current: page, pageSize: p.pageSize ?? 20 });
            fetchList(page);
          }}
          scroll={{ x: 900 }}
        />
      </Card>
      <SupplierPurchaseHistoryModal
        open={Boolean(selectedSupplier)}
        supplier={selectedSupplier}
        onClose={() => setSelectedSupplier(null)}
        onViewOrder={(order) => setSelectedOrder(order)}
        key={`${selectedSupplier?.id || 'empty'}-${historyRefreshSeed}`}
      />
      <PurchaseOrderDetailModal
        open={Boolean(selectedOrder)}
        orderId={selectedOrder?.id}
        initialOrder={selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onUpdated={() => setHistoryRefreshSeed(seed => seed + 1)}
      />
    </>
  );
};

// ─── 采购单 Tab ────────────────────────────────────────────────────
const PurchaseOrderTab: React.FC = () => {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [orderNoFilter, setOrderNoFilter] = useState('');
  const [styleNoFilter, setStyleNoFilter] = useState('');
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [sortField, setSortField] = useState('createTime');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [exportLoading, setExportLoading] = useState(false);
  const [sourceTypeFilter, setSourceTypeFilter] = useState('');
  const [materialTypeFilter, setMaterialTypeFilter] = useState('');
  const [quickEditTarget, setQuickEditTarget] = useState<PurchaseOrder | null>(null);
  const [quickEditVisible, setQuickEditVisible] = useState(false);
  const [quickEditSaving, setQuickEditSaving] = useState(false);
  const [quickEditForm] = Form.useForm();
  const [cancelTarget, setCancelTarget] = useState<PurchaseOrder | null>(null);
  const [cancelSaving, setCancelSaving] = useState(false);

  const getProcStatusConfig = (status: string) => {
    const map: Record<string, { color: string; text: string }> = {
      pending: { color: 'default', text: '待处理' },
      approved: { color: 'blue', text: '已审批' },
      in_transit: { color: 'processing', text: '运输中' },
      received: { color: 'green', text: '已收货' },
      settled: { color: 'success', text: '已结算' },
      cancelled: { color: 'red', text: '已取消' },
      completed: { color: 'success', text: '已完成' },
      partial: { color: 'orange', text: '部分到货' },
      partial_arrival: { color: 'orange', text: '部分到货' },
    };
    return map[status] ?? { color: 'default', text: status || '-' };
  };

  const cleanRemark = (value: unknown) =>
    String(value ?? '').trim()
      .replace(/(^|[；;]\s*)回料确认:[^；;]*/g, '')
      .replace(/^[；;\s]+|[；;\s]+$/g, '')
      .trim();

  const resolveCompletedTime = (record: PurchaseOrder) =>
    record.returnConfirmTime || record.actualArrivalDate || '';

  const resolveOperatorName = (record: PurchaseOrder) =>
    String(record.returnConfirmerName || '').trim() || String(record.receiverName || '').trim();

  const fetchList = useCallback(async (
    page = pagination.current,
    st = statusFilter,
    orderNo = orderNoFilter,
    styleNo = styleNoFilter,
    sf = sortField,
    so: 'asc' | 'desc' = sortOrder,
    srcType = sourceTypeFilter,
    matType = materialTypeFilter,
  ) => {
    setLoading(true);
    try {
      const res = await procurementApi.listPurchaseOrders({
        page, pageSize: pagination.pageSize, status: st || undefined,
        orderNo: orderNo || undefined, styleNo: styleNo || undefined,
        sortField: sf || undefined, sortOrder: so || undefined,
        sourceType: srcType || undefined, materialType: matType || undefined,
      });
      const data = (res as any)?.data ?? res;
      setOrders(data?.records ?? []);
      setTotal(data?.total ?? 0);
    } catch {
      /* 静默失败 */
    } finally {
      setLoading(false);
    }
  }, [pagination.pageSize, statusFilter, orderNoFilter, styleNoFilter, sortField, sortOrder, sourceTypeFilter, materialTypeFilter]);

  useEffect(() => { fetchList(1); }, []);

  const handleSort = (field: string, order: 'asc' | 'desc') => {
    setSortField(field);
    setSortOrder(order);
    setPagination(p => ({ ...p, current: 1 }));
    fetchList(1, statusFilter, orderNoFilter, styleNoFilter, field, order, sourceTypeFilter, materialTypeFilter);
  };

  const handleExport = async () => {
    if (!orders.length) { message.warning('当前没有数据可导出'); return; }
    setExportLoading(true);
    try {
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.default.Workbook();
      const worksheet = workbook.addWorksheet('供应商采购');
      worksheet.columns = [
        { header: '序号', key: 'idx', width: 6 },
        { header: '采购单号', key: 'purchaseNo', width: 20 },
        { header: '订单号', key: 'orderNo', width: 18 },
        { header: '款号', key: 'styleNo', width: 14 },
        { header: '供应商', key: 'supplierName', width: 18 },
        { header: '物料名称', key: 'materialName', width: 18 },
        { header: '物料类别', key: 'materialType', width: 12 },
        { header: '规格', key: 'specifications', width: 16 },
        { header: '采购数量', key: 'purchaseQuantity', width: 10 },
        { header: '到货数量', key: 'arrivedQuantity', width: 10 },
        { header: '待到数量', key: 'pendingQuantity', width: 10 },
        { header: '单价', key: 'unitPrice', width: 10 },
        { header: '总金额', key: 'totalAmount', width: 12 },
        { header: '状态', key: 'status', width: 10 },
        { header: '预计到货', key: 'expectedDate', width: 14 },
        { header: '创建时间', key: 'createTime', width: 14 },
      ];
      const exportData = orders.map((item, index) => {
        const purchaseQty = Number(item.purchaseQuantity ?? item.quantity ?? 0);
        const arrivedQty = Number(item.arrivedQuantity ?? 0);
        return {
          idx: index + 1,
          purchaseNo: item.purchaseNo,
          orderNo: item.orderNo || '-',
          styleNo: item.styleNo || '-',
          supplierName: item.supplierName || '-',
          materialName: item.materialName || '-',
          materialType: item.materialType || '-',
          specifications: item.specifications || '-',
          purchaseQuantity: purchaseQty,
          arrivedQuantity: arrivedQty,
          pendingQuantity: purchaseQty - arrivedQty,
          unitPrice: item.unitPrice != null ? Number(item.unitPrice) : '-',
          totalAmount: item.totalAmount != null ? Number(item.totalAmount) : '-',
          status: statusLabel[normalizePurchaseStatus(item.status)] ?? item.status ?? '-',
          expectedDate: item.expectedDate?.substring(0, 10) ?? '-',
          createTime: item.createTime?.substring(0, 10) ?? '-',
        };
      });
      worksheet.addRows(exportData);
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0FE' } };
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const date = new Date();
      const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
      const timeStr = `${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`;
      const a = document.createElement('a');
      a.href = url;
      a.download = `供应商采购_${dateStr}_${timeStr}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      message.success('导出成功');
    } catch {
      message.error('导出失败，请重试');
    } finally {
      setExportLoading(false);
    }
  };

  const handleQuickEdit = async () => {
    if (!quickEditTarget?.id) return;
    try {
      const values = await quickEditForm.validateFields();
      setQuickEditSaving(true);
      await procurementApi.quickEditPurchaseOrder({
        id: quickEditTarget.id,
        remark: values.remark ?? '',
        expectedShipDate: values.expectedShipDate ? values.expectedShipDate.format('YYYY-MM-DD') : null,
      });
      message.success('采购单信息已更新');
      setQuickEditVisible(false);
      quickEditForm.resetFields();
      fetchList();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.response?.data?.message || '保存失败');
    } finally {
      setQuickEditSaving(false);
    }
  };

  const handleCancelReceive = async (reason: string) => {
    if (!cancelTarget?.id) return;
    setCancelSaving(true);
    try {
      await procurementApi.cancelReceive({ purchaseId: cancelTarget.id, reason: reason.trim() });
      message.success('采购单已恢复为待处理');
      setCancelTarget(null);
      fetchList();
    } catch (e: any) {
      message.error(e?.response?.data?.message || '撤回失败');
    } finally {
      setCancelSaving(false);
    }
  };

  const statusTagColor: Record<string, string> = {
    pending: 'default',
    approved: 'blue',
    in_transit: 'processing',
    received: 'green',
    settled: 'success',
    cancelled: 'red',
    completed: 'success',
    partial: 'orange',
    partial_arrival: 'orange',
  };
  const statusLabel: Record<string, string> = {
    pending: '待处理', approved: '已审批', in_transit: '运输中', received: '已收货',
    settled: '已结算', cancelled: '已取消', completed: '已完成', partial: '部分到货', partial_arrival: '部分到货',
  };

  const columns: ColumnsType<PurchaseOrder> = [
    {
      title: '图片', key: 'thumb', width: 72, align: 'center' as const,
      render: (_: any, record: PurchaseOrder) => (
        <StyleCoverThumb
          styleNo={record.styleNo}
          src={record.styleImageUrl}
          styleId={record.styleImageId}
          size={44}
          borderRadius={4}
        />
      ),
    },
    {
      title: '款号', dataIndex: 'styleNo', width: 120,
      render: (v: string, record: PurchaseOrder) => v
        ? <a style={{ color: '#1677ff', cursor: 'pointer', fontWeight: 500 }} onClick={() => setSelectedOrder(record)}>{v}</a>
        : <Text type="secondary">-</Text>,
    },
    {
      title: '订单号', dataIndex: 'orderNo', width: 140,
      render: (v: string) => v ? <Text code style={{ fontSize: 12, color: '#1677ff' }}>{v}</Text> : <Text type="secondary">-</Text>,
    },
    {
      title: '生产方', dataIndex: 'factoryName', width: 120,
      render: (v: string, record: PurchaseOrder) => {
        if (!v && !record.factoryType) return <Text type="secondary">-</Text>;
        const isInternal = String(record.factoryType || '').toUpperCase() === 'INTERNAL';
        const isSample = String(record.orderBizType || '').toLowerCase().includes('sample');
        return (
          <Space direction="vertical" size={2}>
            <span style={{ fontSize: 12 }}>{v || '-'}</span>
            <Space size={2}>
              {record.factoryType && <Tag color={isInternal ? 'cyan' : 'default'} style={{ fontSize: 10, padding: '0 4px', margin: 0, lineHeight: '18px' }}>{isInternal ? '内部' : '外部'}</Tag>}
              {record.orderBizType && <Tag color={isSample ? 'purple' : 'geekblue'} style={{ fontSize: 10, padding: '0 4px', margin: 0, lineHeight: '18px' }}>{isSample ? '样衣' : '批量'}</Tag>}
            </Space>
          </Space>
        );
      },
    },
    {
      title: '下单数量', dataIndex: 'orderQuantity', width: 100,
      render: (v: any, record: PurchaseOrder) => {
        const no = String(record.purchaseNo || '');
        const qty = no.startsWith('MP-') ? (record.purchaseQuantity ?? record.quantity) : (v ?? record.orderQuantity);
        return qty != null ? `${qty} 件` : '-';
      },
    },
    {
      title: '采购单号', dataIndex: 'purchaseNo', width: 140,
      render: (v: string) => v ? <Text code style={{ fontSize: 12 }}>{v}</Text> : <Text type="secondary">-</Text>,
    },
    {
      title: '物料类型', dataIndex: 'materialType', width: 100,
      render: (v: any) => {
        const cat = getMaterialTypeCategory(v);
        const label = getMaterialTypeLabel(v);
        const catColor: Record<string, string> = { FABRIC: 'blue', LINING: 'cyan', ACCESSORY: 'orange', OTHER: 'default' };
        return v ? <Tag color={catColor[cat] ?? 'default'}>{label}</Tag> : <Text type="secondary">-</Text>;
      },
    },
    { title: '物料名称', dataIndex: 'materialName', width: 140 },
    { title: '物料编码', dataIndex: 'materialCode', width: 120 },
    { title: '颜色', dataIndex: 'color', width: 90, render: (v: string) => v || <Text type="secondary">-</Text> },
    { title: '规格', dataIndex: 'specifications', width: 120, render: (v: string) => v || <Text type="secondary">-</Text> },
    {
      title: '幅宽', dataIndex: 'fabricWidth', width: 90,
      render: (v: any) => v ? `${v}cm` : <Text type="secondary">-</Text>,
    },
    {
      title: '克重', dataIndex: 'fabricWeight', width: 90,
      render: (v: any) => v ? `${v}g/m²` : <Text type="secondary">-</Text>,
    },
    {
      title: '成分', dataIndex: 'fabricComposition', width: 140,
      render: (v: string) => v || <Text type="secondary">-</Text>,
    },
    { title: '供应商', dataIndex: 'supplierName', width: 140 },
    {
      title: '采购数量', dataIndex: 'purchaseQuantity', width: 100,
      render: (v: any, r: PurchaseOrder) => v != null ? `${v} ${r.unit ?? ''}` : <Text type="secondary">-</Text>,
    },
    {
      title: '到货数量', dataIndex: 'arrivedQuantity', width: 100,
      render: (v: any, r: PurchaseOrder) => v != null ? `${v} ${r.unit ?? ''}` : <Text type="secondary">-</Text>,
    },
    {
      title: '待到数量', key: 'pending', width: 100,
      render: (_: any, r: PurchaseOrder) => {
        const p = Math.max(0, Number(r.purchaseQuantity ?? r.quantity ?? 0) - Number(r.arrivedQuantity ?? 0));
        return `${p} ${r.unit ?? ''}`;
      },
    },
    {
      title: '单价', dataIndex: 'unitPrice', width: 100,
      render: (v: any) => v != null ? `¥${Number(v).toFixed(2)}` : <Text type="secondary">-</Text>,
    },
    {
      title: '状态', dataIndex: 'status', width: 110,
      render: (v: string) => {
        const cfg = getProcStatusConfig(normalizePurchaseStatus(v));
        return <Tag color={cfg.color}>{cfg.text}</Tag>;
      },
    },
    {
      title: '来源', dataIndex: 'sourceType', width: 80,
      render: (v: string) => {
        const map: Record<string, { color: string; text: string }> = {
          sample: { color: 'orange', text: '样衣' },
          order: { color: 'green', text: '订单' },
          bulk: { color: 'blue', text: '批量' },
          batch: { color: 'blue', text: '批量' },
          stock: { color: 'green', text: '库存' },
          manual: { color: 'blue', text: '手动' },
        };
        const cfg = map[String(v || '').toLowerCase()];
        return cfg ? <Tag color={cfg.color}>{cfg.text}</Tag> : (v ? <Tag>{v}</Tag> : <Text type="secondary">-</Text>);
      },
    },
    {
      title: <SortableColumnTitle title="下单时间" fieldName="createTime" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} align="left" />,
      dataIndex: 'createTime', width: 160,
      render: (v: string) => formatDateTime(v) || <Text type="secondary">-</Text>,
    },
    {
      title: <SortableColumnTitle title="预计出货" fieldName="expectedShipDate" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} align="left" />,
      dataIndex: 'expectedShipDate', width: 140,
      render: (v: string) => {
        if (!v) return <Text type="secondary">-</Text>;
        const days = dayjs(v).diff(dayjs(), 'day');
        const dateStr = v.substring(0, 10);
        if (days < 0) return <><span>{dateStr}</span><Tag color="red" style={{ marginLeft: 4 }}>已延误</Tag></>;
        if (days <= 3) return <><span>{dateStr}</span><Tag color="orange" style={{ marginLeft: 4 }}>仅剩{days}天</Tag></>;
        if (days <= 7) return <><span>{dateStr}</span><Tag color="gold" style={{ marginLeft: 4 }}>需关注</Tag></>;
        return <span>{dateStr}</span>;
      },
    },
    {
      title: '采购时间', dataIndex: 'receivedTime', width: 160,
      render: (v: string) => formatDateTime(v) || <Text type="secondary">-</Text>,
    },
    {
      title: '采购完成', key: 'completedTime', width: 160,
      render: (_: any, record: PurchaseOrder) => {
        const t = resolveCompletedTime(record);
        return formatDateTime(t) || <Text type="secondary">-</Text>;
      },
    },
    {
      title: '采购员', key: 'operator', width: 100,
      render: (_: any, record: PurchaseOrder) => resolveOperatorName(record) || <Text type="secondary">-</Text>,
    },
    {
      title: '备注', dataIndex: 'remark', width: 150,
      render: (v: unknown) => {
        const clean = cleanRemark(v);
        return clean || <Text type="secondary">-</Text>;
      },
    },
    {
      title: '操作', width: 120, fixed: 'right' as const,
      render: (_: any, record: PurchaseOrder) => {
        const ns = normalizePurchaseStatus(record.status);
        const canCancel = ns !== 'pending' && ns !== 'cancelled';
        const actions: RowAction[] = [
          { key: 'view', label: '查看', primary: true, onClick: () => setSelectedOrder(record) },
          {
            key: 'edit', label: '编辑', onClick: () => {
              setQuickEditTarget(record);
              quickEditForm.setFieldsValue({
                remark: record.remark ?? '',
                expectedShipDate: record.expectedShipDate ? dayjs(record.expectedShipDate) : undefined,
              });
              setQuickEditVisible(true);
            },
          },
          { key: 'cancel', label: '撤回领取', danger: true, disabled: !canCancel, onClick: () => setCancelTarget(record) },
        ];
        return <RowActions actions={actions} />;
      },
    },
  ];

  return (
    <>
      <Card size="small" style={{ marginBottom: 12 }} styles={{ body: { padding: '12px 16px' } }}>
        <Space wrap>
          <Select
            value={statusFilter}
            onChange={v => { setStatusFilter(v); setPagination(p => ({ ...p, current: 1 })); fetchList(1, v, orderNoFilter, styleNoFilter, sortField, sortOrder, sourceTypeFilter, materialTypeFilter); }}
            style={{ width: 140 }}
            options={[
              { value: '', label: '全部状态' },
              { value: 'pending', label: '待处理' },
              { value: 'partial_arrival', label: '部分到货' },
              { value: 'received', label: '已收货' },
              { value: 'completed', label: '已完成' },
              { value: 'cancelled', label: '已取消' },
            ]}
          />
          <Input
            placeholder="订单号筛选"
            value={orderNoFilter}
            onChange={e => setOrderNoFilter(e.target.value)}
            onPressEnter={() => { setPagination(p => ({ ...p, current: 1 })); fetchList(1, statusFilter, orderNoFilter, styleNoFilter, sortField, sortOrder, sourceTypeFilter, materialTypeFilter); }}
            style={{ width: 180 }}
            allowClear
            onClear={() => { setOrderNoFilter(''); fetchList(1, statusFilter, '', styleNoFilter, sortField, sortOrder, sourceTypeFilter, materialTypeFilter); }}
          />
          <Input
            placeholder="款号筛选"
            value={styleNoFilter}
            onChange={e => setStyleNoFilter(e.target.value)}
            onPressEnter={() => { setPagination(p => ({ ...p, current: 1 })); fetchList(1, statusFilter, orderNoFilter, styleNoFilter, sortField, sortOrder, sourceTypeFilter, materialTypeFilter); }}
            style={{ width: 160 }}
            allowClear
            onClear={() => { setStyleNoFilter(''); fetchList(1, statusFilter, orderNoFilter, '', sortField, sortOrder, sourceTypeFilter, materialTypeFilter); }}
          />
          <Select
            value={sourceTypeFilter}
            onChange={v => { setSourceTypeFilter(v); setPagination(p => ({ ...p, current: 1 })); fetchList(1, statusFilter, orderNoFilter, styleNoFilter, sortField, sortOrder, v, materialTypeFilter); }}
            style={{ width: 130 }}
            options={[
              { value: '', label: '全部来源' },
              { value: 'order', label: '订单采购' },
              { value: 'sample', label: '样衣采购' },
              { value: 'bulk', label: '批量采购' },
            ]}
          />
          <Segmented
            value={materialTypeFilter}
            onChange={v => { setMaterialTypeFilter(String(v)); setPagination(p => ({ ...p, current: 1 })); fetchList(1, statusFilter, orderNoFilter, styleNoFilter, sortField, sortOrder, sourceTypeFilter, String(v)); }}
            options={[
              { label: '全部', value: '' },
              { label: '面料', value: 'FABRIC' },
              { label: '里料', value: 'LINING' },
              { label: '辅料', value: 'ACCESSORY' },
            ]}
          />
          <Button icon={<SearchOutlined />} onClick={() => { setPagination(p => ({ ...p, current: 1 })); fetchList(1, statusFilter, orderNoFilter, styleNoFilter, sortField, sortOrder, sourceTypeFilter, materialTypeFilter); }}>搜索</Button>
          <Button
            icon={<DownloadOutlined />}
            loading={exportLoading}
            disabled={!orders.length || loading}
            onClick={handleExport}
          >
            导出
          </Button>
        </Space>
      </Card>
      <Card styles={{ body: { padding: 0 } }}>
        <ResizableTable
          rowKey="id"
          columns={columns}
          dataSource={orders}
          loading={loading}
          size="small"
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total,
            showSizeChanger: true,
            showTotal: t => `共 ${t} 条`,
          }}
          onChange={(p: TablePaginationConfig) => {
            const page = p.current ?? 1;
            setPagination({ current: page, pageSize: p.pageSize ?? 20 });
            fetchList(page);
          }}
          scroll={{ x: 'max-content' }}
        />
      </Card>
      <PurchaseOrderDetailModal
        open={Boolean(selectedOrder)}
        orderId={selectedOrder?.id}
        initialOrder={selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onUpdated={() => fetchList()}
      />

      {/* 快速编辑弹窗 */}
      <ResizableModal
        title={`编辑采购单：${quickEditTarget?.purchaseNo ?? ''}`}
        open={quickEditVisible}
        onCancel={() => { setQuickEditVisible(false); quickEditForm.resetFields(); }}
        onOk={handleQuickEdit}
        confirmLoading={quickEditSaving}
        width="30vw"
        destroyOnHidden
      >
        <Form form={quickEditForm} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item name="expectedShipDate" label="预计到货日期">
            <DatePicker placeholder="请选择预计到货日期" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="remark" label="采购备注">
            <Input.TextArea placeholder="采购备注（可不填）" rows={3} />
          </Form.Item>
        </Form>
      </ResizableModal>

      <RejectReasonModal
        open={Boolean(cancelTarget)}
        title={`撤回领取 · ${cancelTarget?.purchaseNo ?? ''}`}
        okText="确认撤回"
        fieldLabel="撤回原因"
        placeholder="请输入撤回原因（必填）"
        onOk={handleCancelReceive}
        onCancel={() => setCancelTarget(null)}
        loading={cancelSaving}
      />
    </>
  );
};

// ─── 新建采购单弹窗 ────────────────────────────────────────────────
interface CreatePurchaseOrderModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const CreatePurchaseOrderModal: React.FC<CreatePurchaseOrderModalProps> = ({ open, onClose, onSuccess }) => {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [materialDbOptions, setMaterialDbOptions] = useState<Array<{ label: string; value: string; record?: Record<string, unknown> }>>([]);
  const [materialDbLoading, setMaterialDbLoading] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchMaterialDb = useCallback((keyword: string) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!keyword?.trim()) { setMaterialDbOptions([]); return; }
    searchTimerRef.current = setTimeout(async () => {
      setMaterialDbLoading(true);
      try {
        const res = await api.get('/material/database/list', {
          params: { keyword: keyword, pageSize: 30 },
        });
        const records: Record<string, unknown>[] = (res as any)?.data?.records ?? [];
        setMaterialDbOptions(records.map(m => ({
          label: `${m.materialCode ?? ''} - ${m.materialName ?? ''}`,
          value: String(m.materialName ?? ''),
          record: m,
        })));
      } catch {
        setMaterialDbOptions([]);
      } finally {
        setMaterialDbLoading(false);
      }
    }, 300);
  }, []);

  const handleMaterialDbSelect = (_value: string, option: { record?: Record<string, unknown> }) => {
    const m = option?.record;
    if (!m) return;
    // 物料类型映射：DB 可能存 fabric/fabricA/FABRIC 等，统一归到 FABRIC/LINING/ACCESSORY/OTHER
    const mapMaterialType = (mt: unknown): string | undefined => {
      const t = String(mt || '').trim().toLowerCase();
      if (!t) return undefined;
      if (t.startsWith('fabric')) return 'FABRIC';
      if (t.startsWith('lining')) return 'LINING';
      if (t.startsWith('accessory')) return 'ACCESSORY';
      return 'OTHER';
    };
    form.setFieldsValue({
      materialName: m.materialName ?? '',
      materialType: mapMaterialType(m.materialType),
      specifications: m.specifications ?? '',
      unit: m.unit ?? '',
      unitPrice: m.unitPrice ?? undefined,
      color: m.color ?? undefined,
      fabricComposition: m.fabricComposition ?? undefined,
    });
  };

  useEffect(() => {
    if (open) {
      form.resetFields();
      procurementApi.listSuppliers({ page: 1, pageSize: 100 }).then(res => {
        const data = (res as any)?.data ?? res;
        setSuppliers(data?.records ?? []);
      }).catch(() => setSuppliers([]));
    }
  }, [open, form]);

  const handleOk = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const selectedSupplier = suppliers.find(s => s.id === values.supplierId);
      const payload: PurchaseOrder = {
        ...values,
        supplierName: selectedSupplier?.factoryName,
        expectedDate: values.expectedDate ? values.expectedDate.format('YYYY-MM-DD') : undefined,
        totalAmount: values.purchaseQuantity && values.unitPrice
          ? Number(values.purchaseQuantity) * Number(values.unitPrice) : undefined,
      };
      await procurementApi.createPurchaseOrder(payload);
      message.success('采购单已创建');
      onSuccess();
    } catch {
      message.error('创建失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResizableModal
      title="新建采购单"
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      confirmLoading={saving}
      width="40vw"
      destroyOnHidden
    >
      <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="orderNo" label="关联订单号">
              <Input placeholder="关联大货订单号（选填）" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="styleNo" label="款号">
              <Input placeholder="款号（选填）" />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="supplierId" label="供应商" rules={[{ required: true, message: '请选择供应商' }]}>
              <Select
                placeholder="请选择供应商"
                showSearch
                filterOption={(input, option) =>
                  String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                options={suppliers.map(s => ({ value: s.id, label: s.factoryName }))}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="materialName" label="物料名称" rules={[{ required: true, message: '请选择物料名称' }]}>
              <Select
                showSearch
                filterOption={false}
                placeholder="输入物料名称/编码搜索数据库"
                loading={materialDbLoading}
                options={materialDbOptions}
                onSearch={searchMaterialDb}
                onSelect={handleMaterialDbSelect}
                allowClear
                notFoundContent={materialDbLoading ? '搜索中…' : '输入关键词搜索物料资料库'}
              />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="materialType" label="物料类别">
              <Select placeholder="请选择" allowClear options={[
                { value: 'FABRIC', label: '面料' },
                { value: 'LINING', label: '里料' },
                { value: 'ACCESSORY', label: '辅料' },
                { value: 'OTHER', label: '其他' },
              ]} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="specifications" label="规格">
              <Input placeholder="如：宽148cm，克重280g" />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="color" label="颜色">
              <Input placeholder="如：蓝色" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="fabricComposition" label="成分">
              <Input placeholder="如：棉100%" />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="purchaseQuantity" label="采购数量" rules={[{ required: true, message: '请输入数量' }]}>
              <InputNumber placeholder="数量" style={{ width: '100%' }} min={1} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="unit" label="单位">
              <Select placeholder="单位" options={[
                { value: '米', label: '米' }, { value: '码', label: '码' },
                { value: '千克', label: '千克' }, { value: '件', label: '件' },
                { value: '条', label: '条' }, { value: '个', label: '个' },
              ]} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="unitPrice" label="单价（元）">
              <InputNumber placeholder="单价" style={{ width: '100%' }} min={0} precision={2} />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="expectedDate" label="预计到货日期">
              <DatePicker style={{ width: '100%' }} placeholder="选择预计到货日期" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="remark" label="备注">
              <Input.TextArea rows={1} placeholder="备注信息" />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </ResizableModal>
  );
};

// ─── 主功能页（已订阅时展示）─────────────────────────────────────
const ProcurementManagement: React.FC = () => {
  const [stats, setStats] = useState({ supplierCount: 0, totalPurchaseOrders: 0, pendingOrders: 0, receivedOrders: 0 });
  const [statsLoading, setStatsLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [poRefresh, setPoRefresh] = useState(0);

  const loadStats = useCallback(() => {
    setStatsLoading(true);
    procurementApi.getStats({}).then(res => {
      const data = (res as any)?.data ?? res;
      setStats({
        supplierCount: data?.supplierCount ?? 0,
        totalPurchaseOrders: data?.totalPurchaseOrders ?? 0,
        pendingOrders: data?.pendingOrders ?? 0,
        receivedOrders: data?.receivedOrders ?? 0,
      });
    }).catch(() => {/* 统计失败不影响主流程 */})
      .finally(() => setStatsLoading(false));
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Typography.Title level={5} style={{ margin: 0 }}>供应商采购管理</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          新建采购单
        </Button>
      </div>

      <Row gutter={16} style={{ marginBottom: 20 }}>
        {[
          { icon: <ShopOutlined />, label: '供应商数量', value: stats.supplierCount, color: '#1677ff', warn: false },
          { icon: <ShoppingCartOutlined />, label: '采购单总数', value: stats.totalPurchaseOrders, color: '#52c41a', warn: false },
          { icon: <WalletOutlined />, label: '待处理', value: stats.pendingOrders, color: '#fa8c16', warn: Number(stats.pendingOrders) > 0 },
          { icon: <CheckCircleOutlined />, label: '已收货', value: stats.receivedOrders, color: '#13c2c2', warn: false },
        ].map(s => (
          <Col span={6} key={s.label}>
            <Card
              size="small"
              loading={statsLoading}
              styles={{ body: { display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px' } }}
              style={{ borderColor: s.warn ? '#fa8c16' : undefined }}
            >
              <div style={{ fontSize: 28, color: s.color }}>{s.icon}</div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2, color: s.warn ? '#fa8c16' : undefined }}>
                  {s.value}
                </div>
                <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 2 }}>{s.label}</div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Tabs
        items={[
          { key: 'suppliers', label: '供应商管理', children: <SupplierTab /> },
          { key: 'orders', label: '采购单', children: <PurchaseOrderTab key={poRefresh} /> },
        ]}
      />
      <CreatePurchaseOrderModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={() => { setCreateOpen(false); setPoRefresh(c => c + 1); loadStats(); }}
      />
    </>
  );
};

// ─── 页面主入口（直接展示功能，无需订阅）───────────────────────────
const ProcurementDashboard: React.FC = () => {
  return (
    <Layout>
      <div style={{ padding: '24px' }}>
        <ProcurementManagement />
      </div>
    </Layout>
  );
};

export default ProcurementDashboard;
