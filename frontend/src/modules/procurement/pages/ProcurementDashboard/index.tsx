import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card, Col, DatePicker, Form, Input, InputNumber, Row, Select, Space, Tabs, Tag, Typography } from 'antd';
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

  const fetchList = useCallback(async (
    page = pagination.current,
    st = statusFilter,
    orderNo = orderNoFilter,
    styleNo = styleNoFilter,
    sf = sortField,
    so: 'asc' | 'desc' = sortOrder,
  ) => {
    setLoading(true);
    try {
      const res = await procurementApi.listPurchaseOrders({
        page, pageSize: pagination.pageSize, status: st || undefined,
        orderNo: orderNo || undefined, styleNo: styleNo || undefined,
        sortField: sf || undefined, sortOrder: so || undefined,
      });
      const data = (res as any)?.data ?? res;
      setOrders(data?.records ?? []);
      setTotal(data?.total ?? 0);
    } catch {
      /* 静默失败 */
    } finally {
      setLoading(false);
    }
  }, [pagination.pageSize, statusFilter, orderNoFilter, styleNoFilter, sortField, sortOrder]);

  useEffect(() => { fetchList(1); }, []);

  const handleSort = (field: string, order: 'asc' | 'desc') => {
    setSortField(field);
    setSortOrder(order);
    setPagination(p => ({ ...p, current: 1 }));
    fetchList(1, statusFilter, orderNoFilter, styleNoFilter, field, order);
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
    { title: '采购单号', dataIndex: 'purchaseNo', width: 160, render: v => <Text code style={{ fontSize: 12 }}>{v}</Text> },
    {
      title: '订单号', dataIndex: 'orderNo', width: 150,
      render: (v: string) => v ? <Text code style={{ fontSize: 12, color: '#1677ff' }}>{v}</Text> : <Text type="secondary">-</Text>,
    },
    {
      title: '款号', dataIndex: 'styleNo', width: 120,
      render: (v: string, record: PurchaseOrder) => v
        ? <a style={{ color: '#1677ff', cursor: 'pointer' }} onClick={() => setSelectedOrder(record)}>{v}</a>
        : <Text type="secondary">-</Text>,
    },
    { title: '供应商', dataIndex: 'supplierName', width: 160 },
    { title: '物料名称', dataIndex: 'materialName', width: 160 },
    { title: '规格', dataIndex: 'specifications', width: 120 },
    { title: '数量', dataIndex: 'purchaseQuantity', width: 80, render: (v: unknown, r: PurchaseOrder) => `${v ?? r.quantity ?? '-'} ${r.unit ?? ''}` },
    {
      title: <SortableColumnTitle title="总金额" fieldName="totalAmount" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} />,
      dataIndex: 'totalAmount', width: 110, render: (v: unknown) => v != null ? `･${Number(v).toLocaleString()}` : '-',
    },
    { title: '状态', dataIndex: 'status', width: 100, render: (v: string) =>
      <Tag color={statusTagColor[normalizePurchaseStatus(v)] ?? 'default'}>{statusLabel[normalizePurchaseStatus(v)] ?? v}</Tag>
    },
    {
      title: <SortableColumnTitle title="预计到货" fieldName="expectedDate" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} align="left" />,
      dataIndex: 'expectedDate', width: 120, render: (v: string) => v?.substring(0, 10) ?? '-',
    },
    {
      title: <SortableColumnTitle title="创建时间" fieldName="createTime" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} align="left" />,
      dataIndex: 'createTime', render: (v: string) => v?.substring(0, 10) ?? '-',
    },
    {
      title: '操作', width: 80, fixed: 'right' as const,
      render: (_: unknown, record: PurchaseOrder) => {
        const actions: RowAction[] = [
          { key: 'view', label: '详情', primary: true, onClick: () => setSelectedOrder(record) },
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
            onChange={v => { setStatusFilter(v); setPagination(p => ({ ...p, current: 1 })); fetchList(1, v, orderNoFilter, styleNoFilter); }}
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
            onPressEnter={() => { setPagination(p => ({ ...p, current: 1 })); fetchList(1, statusFilter, orderNoFilter, styleNoFilter); }}
            style={{ width: 180 }}
            allowClear
            onClear={() => { setOrderNoFilter(''); fetchList(1, statusFilter, '', styleNoFilter); }}
          />
          <Input
            placeholder="款号筛选"
            value={styleNoFilter}
            onChange={e => setStyleNoFilter(e.target.value)}
            onPressEnter={() => { setPagination(p => ({ ...p, current: 1 })); fetchList(1, statusFilter, orderNoFilter, styleNoFilter); }}
            style={{ width: 160 }}
            allowClear
            onClear={() => { setStyleNoFilter(''); fetchList(1, statusFilter, orderNoFilter, ''); }}
          />
          <Button icon={<SearchOutlined />} onClick={() => { setPagination(p => ({ ...p, current: 1 })); fetchList(1, statusFilter, orderNoFilter, styleNoFilter); }}>搜索</Button>
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
          scroll={{ x: 1220 }}
        />
      </Card>
      <PurchaseOrderDetailModal
        open={Boolean(selectedOrder)}
        orderId={selectedOrder?.id}
        initialOrder={selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onUpdated={() => fetchList()}
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
