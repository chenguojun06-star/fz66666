import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card, Col, DatePicker, Form, Input, InputNumber, Row, Select, Space, Spin, Tabs, Tag, Typography } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import {
  ArrowRightOutlined, CheckCircleOutlined, LockOutlined, PlusOutlined, RocketOutlined, SearchOutlined,
  ShoppingCartOutlined, ShopOutlined, WalletOutlined,
} from '@ant-design/icons';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import { paths } from '@/routeConfig';
import { appStoreService } from '@/services/system/appStore';
import { useAuth } from '@/utils/AuthContext';
import ResizableModal from '@/components/common/ResizableModal';
import RowActions, { type RowAction } from '@/components/common/RowActions';
import { procurementApi, type Supplier, type PurchaseOrder } from '@/services/procurement/procurementApi';
import api from '@/utils/api';
import PurchaseOrderDetailModal from './components/PurchaseOrderDetailModal';
import SupplierPurchaseHistoryModal from './components/SupplierPurchaseHistoryModal';
import { message } from '@/utils/antdStatic';

const { Title, Text, Paragraph } = Typography;

// ─── 订阅检测 ─────────────────────────────────────────────────────
const PROCUREMENT_APP_CODE_ALIASES = ['PROCUREMENT', 'SUPPLIER_PROCUREMENT'];

const hasActiveSubscription = (item: any, appCodeAliases: string[]) => {
  const code = String(item?.appCode || '').trim().toUpperCase();
  if (!appCodeAliases.includes(code)) return false;
  const status = String(item?.status || '').trim().toUpperCase();
  const isStatusActive = status === '' || status === 'ACTIVE' || status === 'TRIAL';
  if (item?.isExpired === true) return false;
  const endTime = item?.endTime ? new Date(item.endTime).getTime() : null;
  const notExpired = endTime == null || Number.isNaN(endTime) || endTime > Date.now();
  return isStatusActive && notExpired;
};

const normalizePurchaseStatus = (value?: string) => String(value || '').trim().toLowerCase();

// ─── 锁定页（未订阅时展示）─────────────────────────────────────────
const FEATURES = [
  { icon: '📦', title: '采购订单管理', desc: '对面辅料供应商下单，支持多家比价与历史报价' },
  { icon: '✅', title: '收货确认', desc: '供应商发货后小程序扫码收货，自动入库并更新应付' },
  { icon: '💰', title: '应付账款', desc: '按供应商汇总欠款，到期自动提醒，一键付款确认' },
  { icon: '⚠️', title: '缺料预警', desc: '生产订单用料计划与库存对比，提前7天发出缺料警报' },
  { icon: '🏭', title: '供应商评级', desc: '按交期准时率、质量合格率自动生成黑黄绿供应商评级' },
  { icon: '🔗', title: '仓库联动', desc: '收货入库、退货出库全程自动联动仓库模块，消除手写台账' },
];

const LockedView: React.FC<{ onGoStore: () => void }> = ({ onGoStore }) => (
  <>
    <Card
      style={{ background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)', border: 'none', marginBottom: 24 }}
      styles={{ body: { padding: '32px 40px' } }}
    >
      <Row align="middle" gutter={24}>
        <Col flex="auto">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <LockOutlined style={{ fontSize: 22, color: 'rgba(255,255,255,0.85)' }} />
            <Tag color="gold" style={{ fontWeight: 600 }}>付费模块 · ¥599/月</Tag>
          </div>
          <Title level={3} style={{ color: '#fff', margin: '0 0 8px' }}>供应商采购管理</Title>
          <Paragraph style={{ color: 'rgba(255,255,255,0.85)', margin: 0, fontSize: 14 }}>
            将面辅料采购流程完全数字化：下单→收货→入库→付款，打通仓库模块，替代手写台账与微信截图催货。
          </Paragraph>
        </Col>
        <Col>
          <Button type="primary" size="large" icon={<RocketOutlined />}
            style={{ background: '#fff', color: '#11998e', border: 'none', fontWeight: 600, height: 44, padding: '0 28px' }}
            onClick={onGoStore}
          >
            立即开通 <ArrowRightOutlined />
          </Button>
        </Col>
      </Row>
    </Card>
    <Title level={5} style={{ marginBottom: 16 }}>开通后解锁以下功能</Title>
    <Row gutter={[16, 16]}>
      {FEATURES.map(f => (
        <Col span={8} key={f.title}>
          <Card size="small" style={{ height: '100%', opacity: 0.85 }} hoverable={false}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 28, lineHeight: 1 }}>{f.icon}</span>
              <div>
                <Text strong>{f.title}</Text>
                <Paragraph type="secondary" style={{ margin: '4px 0 0', fontSize: 12 }}>{f.desc}</Paragraph>
              </div>
            </div>
          </Card>
        </Col>
      ))}
    </Row>
    <Card style={{ marginTop: 24, background: '#f8f9fa' }} bordered={false}>
      <Row gutter={24} align="middle">
        <Col span={16}>
          <Text strong>采购管理模块与工厂目录有什么区别？</Text>
          <Paragraph type="secondary" style={{ margin: '4px 0 0', fontSize: 13 }}>
            现有"供应商目录"（系统设置 → 工厂列表）仅保存联系方式。本模块在此基础上增加完整采购业务流：
            下采购单 → 跟进供应商发货 → 扫码入库确认 → 应付账款核销，形成完整的采购财务闭环。
          </Paragraph>
        </Col>
        <Col span={8} style={{ textAlign: 'center' }}>
          <Button type="primary" size="large" onClick={onGoStore} style={{ width: '100%' }}>
            前往应用商店开通
          </Button>
        </Col>
      </Row>
    </Card>
  </>
);

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
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);

  const fetchList = useCallback(async (page = pagination.current, st = statusFilter) => {
    setLoading(true);
    try {
      const res = await procurementApi.listPurchaseOrders({ page, pageSize: pagination.pageSize, status: st });
      const data = (res as any)?.data ?? res;
      setOrders(data?.records ?? []);
      setTotal(data?.total ?? 0);
    } catch {
      /* 静默失败 */
    } finally {
      setLoading(false);
    }
  }, [pagination.pageSize, statusFilter]);

  useEffect(() => { fetchList(1); }, []);

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
    { title: '供应商', dataIndex: 'supplierName', width: 160 },
    { title: '物料名称', dataIndex: 'materialName', width: 160 },
    { title: '规格', dataIndex: 'specifications', width: 120 },
    { title: '数量', dataIndex: 'purchaseQuantity', width: 80, render: (v: unknown, r: PurchaseOrder) => `${v ?? r.quantity ?? '-'} ${r.unit ?? ''}` },
    { title: '总金额', dataIndex: 'totalAmount', width: 100, render: (v: unknown) => v != null ? `￥${Number(v).toLocaleString()}` : '-' },
    { title: '状态', dataIndex: 'status', width: 100, render: (v: string) =>
      <Tag color={statusTagColor[normalizePurchaseStatus(v)] ?? 'default'}>{statusLabel[normalizePurchaseStatus(v)] ?? v}</Tag>
    },
    { title: '预计到货', dataIndex: 'expectedDate', width: 110, render: (v: string) => v?.substring(0, 10) ?? '-' },
    { title: '创建时间', dataIndex: 'createTime', render: (v: string) => v?.substring(0, 10) ?? '-' },
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
        <Select
          value={statusFilter}
          onChange={v => { setStatusFilter(v); setPagination(p => ({ ...p, current: 1 })); fetchList(1, v); }}
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
          scroll={{ x: 980 }}
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
          params: { materialCode: keyword, materialName: keyword, pageSize: 30 },
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
    form.setFieldsValue({
      materialName: m.materialName ?? '',
      materialType: m.materialType ? String(m.materialType).toUpperCase() : undefined,
      specifications: m.specifications ?? '',
      unit: m.unit ?? '',
      unitPrice: m.unitPrice ?? undefined,
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
                notFoundContent={materialDbLoading ? '搜索中…' : '输入关键词搜索面辅料资料'}
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

// ─── 页面主入口（订阅检测 + 分支渲染）──────────────────────────────
const ProcurementDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isSuperAdmin = user?.isSuperAdmin === true;
  const [subscribed, setSubscribed] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (isSuperAdmin) { setSubscribed(true); setChecking(false); return; }
    const checkSubscribed = async () => {
      try {
        const apps = await appStoreService.getMyApps();
        const appList = Array.isArray(apps) ? apps : ((apps as any)?.data ?? []);
        const activeFromApps = appList.some((a: any) =>
          hasActiveSubscription(a, PROCUREMENT_APP_CODE_ALIASES)
        );
        if (activeFromApps) { setSubscribed(true); return; }
        const subscriptions = await appStoreService.getMySubscriptions();
        const subList = Array.isArray(subscriptions) ? subscriptions : ((subscriptions as any)?.data ?? []);
        const activeFromSubs = subList.some((s: any) =>
          hasActiveSubscription(s, PROCUREMENT_APP_CODE_ALIASES)
        );
        setSubscribed(activeFromSubs);
      } catch {
        setSubscribed(false);
      } finally {
        setChecking(false);
      }
    };
    checkSubscribed();
  }, [isSuperAdmin]);

  return (
    <Layout>
      <div style={{ padding: '24px' }}>
        {checking ? (
          <div style={{ textAlign: 'center', padding: '80px 0' }}><Spin size="large" /></div>
        ) : subscribed ? (
          <ProcurementManagement />
        ) : (
          <div style={{ maxWidth: 960 }}>
            <LockedView onGoStore={() => navigate(paths.appStore)} />
          </div>
        )}
      </div>
    </Layout>
  );
};

export default ProcurementDashboard;
