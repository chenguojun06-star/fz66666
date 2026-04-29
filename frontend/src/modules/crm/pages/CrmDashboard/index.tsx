import React, { useCallback, useEffect, useState } from 'react';
import { Button, Card, Col, Descriptions, Form, Input, Modal, Progress, Row, Select, Space, Spin, Tabs, Tag, Typography } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import { useDebouncedValue } from '@/hooks/usePerformance';
import {
  ArrowRightOutlined, CheckCircleOutlined, DollarOutlined,
  LinkOutlined, LockOutlined, PlusOutlined,
  RocketOutlined, SearchOutlined, TeamOutlined, TrophyOutlined, UserOutlined,
} from '@ant-design/icons';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';
import { paths } from '@/routeConfig';
import { appStoreService } from '@/services/system/appStore';
import { useAuth } from '@/utils/AuthContext';
import ResizableModal from '@/components/common/ResizableModal';
import RowActions, { type RowAction } from '@/components/common/RowActions';
import { customerApi, receivableApi, type Customer, type Receivable } from '@/services/crm/customerApi';
import type { ApiResult } from '@/utils/api';
import { message } from '@/utils/antdStatic';
import { readPageSize } from '@/utils/pageSizeStore';
import type { ProductionOrder } from '@/types/production';
import { ORDER_STATUS_LABEL, ORDER_STATUS_COLOR } from '@/constants/orderStatus';
import { useShareOrderDialog } from '@/modules/production/pages/Production/ProgressDetail/hooks/useShareOrderDialog';

const { Title, Text, Paragraph } = Typography;

// ─── 订阅检测（保持原有逻辑）───────────────────────────────────────
const CRM_APP_CODE_ALIASES = ['CRM_MODULE', 'CRM'];

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

// ─── 锁定页（未订阅时展示）─────────────────────────────────────────
const FEATURES = [
  { icon: '', title: '客户档案管理', desc: '统一管理B端客户信息、联系人、合作历史' },
  { icon: '', title: '应收账款追踪', desc: '发货即自动生成应收单，逾期自动提醒催款' },
  { icon: '', title: '客户查询门户', desc: '生成专属二维码，客户扫码即可查看订单进度' },
  { icon: '', title: '历史订单汇总', desc: '按客户维度查看所有合作款式、金额、周期' },
  { icon: '', title: '出货提醒', desc: '出货前3天自动微信提醒对接人，降低漏货风险' },
  { icon: '', title: '报价单生成', desc: '一键生成带款式图、价格、工艺描述的PDF报价单' },
];

const LockedView: React.FC<{ onGoStore: () => void }> = ({ onGoStore }) => (
  <>
    <Card
      style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', border: 'none', marginBottom: 24 }}
      styles={{ body: { padding: '32px 40px' } }}
    >
      <Row align="middle" gutter={24}>
        <Col flex="auto">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <LockOutlined style={{ fontSize: 22, color: 'rgba(255,255,255,0.85)' }} />
            <Tag color="gold" style={{ fontWeight: 600 }}>付费模块 · ¥599/月</Tag>
          </div>
          <Title level={3} style={{ color: '#fff', margin: '0 0 8px' }}>客户管理 CRM</Title>
          <Paragraph style={{ color: 'rgba(255,255,255,0.85)', margin: 0, fontSize: 14 }}>
            深度整合您的生产数据，让每位B端客户都能实时追踪到自己的订单进度。低价对标鼎普 CRM（¥3000+/月），专为中小服装工厂设计。
          </Paragraph>
        </Col>
        <Col>
          <Button type="primary" size="large" icon={<RocketOutlined />}
            style={{ background: '#fff', color: '#764ba2', border: 'none', fontWeight: 600, height: 44, padding: '0 28px' }}
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
    <Card style={{ marginTop: 24, background: '#f8f9fa' }} variant="borderless">
      <Row gutter={24} align="middle">
        <Col span={16}>
          <Text strong>为什么比鼎普便宜5倍？</Text>
          <Paragraph type="secondary" style={{ margin: '4px 0 0', fontSize: 13 }}>
            鼎普 CRM 模块定价 ¥3000+/月，功能复杂适合大企业。本模块专注中小服装工厂核心需求：
            应收款追踪 + 客户门户查单，去掉80%用不上的功能，降到 ¥599/月，90天回本，开通当月即可用起来。
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

// ─── 表单 Modal（新建/编辑客户）────────────────────────────────────
interface CustomerFormModalProps {
  open: boolean;
  editData: Customer | null;
  onClose: () => void;
  onSuccess: () => void;
}

const CustomerFormModal: React.FC<CustomerFormModalProps> = ({ open, editData, onClose, onSuccess }) => {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      form.setFieldsValue(editData ?? { status: 'ACTIVE', customerLevel: 'NORMAL' });
    } else {
      form.resetFields();
    }
  }, [open, editData, form]);

  const handleOk = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (editData?.id) {
        await customerApi.update(editData.id, values);
        message.success('更新成功');
      } else {
        await customerApi.create(values);
        message.success('新建成功');
      }
      onSuccess();
      onClose();
    } catch {
      message.error('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResizableModal
      title={editData?.id ? '编辑客户' : '新建客户'}
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      confirmLoading={saving}
      width="40vw"
      destroyOnHidden
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="companyName" label="公司名称" rules={[{ required: true, message: '请输入公司名称' }]}>
              <Input placeholder="请输入客户公司名称" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="customerLevel" label="客户等级">
              <Select options={[{ value: 'NORMAL', label: '普通客户' }, { value: 'VIP', label: 'VIP客户' }]} />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="contactPerson" label="联系人">
              <Input placeholder="对接人姓名" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="contactPhone" label="联系电话">
              <Input placeholder="手机号或座机" />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="contactEmail" label="邮箱">
              <Input placeholder="电子邮箱" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="industry" label="所属行业">
              <Input placeholder="如：服装、家纺" />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="address" label="地址">
          <Input placeholder="公司地址" />
        </Form.Item>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="source" label="客户来源">
              <Input placeholder="如：转介绍、展会、网络" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="status" label="状态">
              <Select options={[{ value: 'ACTIVE', label: '合作中' }, { value: 'INACTIVE', label: '已停合作' }]} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="remark" label="备注">
          <Input.TextArea rows={2} placeholder="其他备注信息" />
        </Form.Item>
      </Form>
    </ResizableModal>
  );
};

// ─── 主功能页（已订阅时展示）────────────────────────────────────────
const CustomerManagement: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const debouncedKeyword = useDebouncedValue(keyword, 300);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [pagination, setPagination] = useState({ current: 1, pageSize: readPageSize(20) });
  const [stats, setStats] = useState({ total: 0, activeCount: 0, newThisMonth: 0, vip: 0 });
  const [modalOpen, setModalOpen] = useState(false);
  const [editData, setEditData] = useState<Customer | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerData, setDrawerData] = useState<Customer | null>(null);
  const [drawerOrders, setDrawerOrders] = useState<any[]>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerReceivables, setDrawerReceivables] = useState<Receivable[]>([]);
  const [drawerReceivableLoading, setDrawerReceivableLoading] = useState(false);
  const { handleShareOrder, shareOrderDialog } = useShareOrderDialog({ message });

  const fetchList = useCallback(async (page = pagination.current, kw = debouncedKeyword, st = statusFilter) => {
    setLoading(true);
    try {
      const res: ApiResult = await customerApi.list({ page, pageSize: pagination.pageSize, keyword: kw, status: st });
      const data = (res?.data ?? res) as Record<string, unknown> | undefined;
      setCustomers((data?.records as Customer[]) ?? []);
      setTotal((data?.total as number) ?? 0);
    } catch {
      message.error('加载客户列表失败');
    } finally {
      setLoading(false);
    }
  }, [pagination.pageSize, debouncedKeyword, statusFilter]);

  const fetchStats = useCallback(async () => {
    try {
      const res: ApiResult = await customerApi.getStats();
      const data = (res?.data ?? res) as Record<string, unknown> | undefined;
      setStats({ total: (data?.total as number) ?? 0, activeCount: (data?.activeCount as number) ?? 0, newThisMonth: (data?.newThisMonth as number) ?? 0, vip: (data?.vip as number) ?? 0 });
    } catch { /* 统计失败不影响主流程 */ }
  }, []);

  useEffect(() => {
    fetchList(1);
    fetchStats();
  }, []);

  const handleSearch = () => {
    setPagination(p => ({ ...p, current: 1 }));
    fetchList(1, keyword, statusFilter);
  };

  const handleTableChange = (p: TablePaginationConfig) => {
    const page = p.current ?? 1;
    setPagination({ current: page, pageSize: p.pageSize ?? 20 });
    fetchList(page);
  };

  const handleDelete = (record: Customer) => {
    Modal.confirm({
      width: '30vw',
      title: `确认删除客户「${record.companyName}」？`,
      content: '删除后不可恢复',
      okButtonProps: { danger: true, type: 'default' },
      onOk: async () => {
        await customerApi.delete(record.id!);
        message.success('已删除');
        fetchList(pagination.current);
        fetchStats();
      },
    });
  };

  const openDrawer = async (record: Customer) => {
    setDrawerData(record);
    setDrawerOpen(true);
    setDrawerLoading(true);
    setDrawerReceivableLoading(true);
    const [ordersRes, receivablesRes] = await Promise.allSettled([
      customerApi.getOrders(record.id!),
      receivableApi.list({ customerId: record.id, pageSize: 50, page: 1 }),
    ]);
    setDrawerOrders(ordersRes.status === 'fulfilled'
      ? (((ordersRes.value as any)?.data ?? ordersRes.value) ?? [])
      : []);
    setDrawerReceivables(receivablesRes.status === 'fulfilled'
      ? ((receivablesRes.value as any)?.data?.records ?? (receivablesRes.value as any)?.records ?? [])
      : []);
    setDrawerLoading(false);
    setDrawerReceivableLoading(false);
  };

  const columns: ColumnsType<Customer> = [
    { title: '客户编号', dataIndex: 'customerNo', width: 130, render: v => <Text code style={{ fontSize: 12 }}>{v}</Text> },
    { title: '公司名称', dataIndex: 'companyName', width: 180, render: (v, r) => (
      <Button type="link" style={{ padding: 0, fontWeight: 600 }} onClick={() => openDrawer(r)}>{v}</Button>
    )},
    { title: '等级', dataIndex: 'customerLevel', width: 90, render: v =>
      v === 'VIP' ? <Tag color="gold">VIP</Tag> : <Tag>普通</Tag>
    },
    { title: '联系人', dataIndex: 'contactPerson', width: 100 },
    { title: '联系电话', dataIndex: 'contactPhone', width: 130 },
    { title: '状态', dataIndex: 'status', width: 90, render: v =>
      v === 'ACTIVE' ? <Tag color="green">合作中</Tag> : <Tag color="default">已停合作</Tag>
    },
    { title: '创建人', dataIndex: 'creatorName', width: 90 },
    { title: '创建时间', dataIndex: 'createTime', width: 160, render: v => v?.substring(0, 16) ?? '-' },
    {
      title: '操作', width: 160, fixed: 'right',
      render: (_, record) => {
        const actions: RowAction[] = [
          { key: 'detail', label: '详情', primary: true, onClick: () => openDrawer(record) },
          { key: 'edit', label: '编辑', onClick: () => { setEditData(record); setModalOpen(true); } },
          { key: 'delete', label: '删除', danger: true, onClick: () => handleDelete(record) },
        ];
        return <RowActions actions={actions} />;
      },
    },
  ];

  return (
    <>
      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 20 }}>
        {[
          { icon: <TeamOutlined />, label: '客户总数', value: stats.total, color: '#1677ff' },
          { icon: <CheckCircleOutlined />, label: '合作中', value: stats.activeCount, color: '#52c41a' },
          { icon: <TrophyOutlined />, label: 'VIP客户', value: stats.vip, color: '#fa8c16' },
          { icon: <UserOutlined />, label: '本月新增', value: stats.newThisMonth, color: '#722ed1' },
        ].map(s => (
          <Col span={6} key={s.label}>
            <Card size="small" styles={{ body: { display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px' } }}>
              <div style={{ fontSize: 28, color: s.color }}>{s.icon}</div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>{s.value}</div>
                <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 2 }}>{s.label}</div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* 搜索栏 */}
      <Card size="small" style={{ marginBottom: 16 }} styles={{ body: { padding: '12px 16px' } }}>
        <Row gutter={12} align="middle">
          <Col flex="auto">
            <Space>
              <Input
                placeholder="搜索公司名称、联系人、电话"
                prefix={<SearchOutlined />}
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                onPressEnter={handleSearch}
                style={{ width: 280 }}
                allowClear
              />
              <Select
                value={statusFilter}
                onChange={v => { setStatusFilter(v); setPagination(p => ({ ...p, current: 1 })); fetchList(1, keyword, v); }}
                style={{ width: 120 }}
                options={[
                  { value: '', label: '全部状态' },
                  { value: 'ACTIVE', label: '合作中' },
                  { value: 'INACTIVE', label: '已停合作' },
                ]}
              />
              <Button icon={<SearchOutlined />} onClick={handleSearch}>搜索</Button>
            </Space>
          </Col>
          <Col>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditData(null); setModalOpen(true); }}>
              新增客户
            </Button>
          </Col>
        </Row>
      </Card>

      {/* 表格 */}
      <Card styles={{ body: { padding: 0 } }}>
        <ResizableTable
          rowKey="id"
          columns={columns}
          dataSource={customers}
          loading={loading}
          stickyHeader
          scroll={{ x: 1200 }}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total,
            showSizeChanger: true,
            showTotal: t => `共 ${t} 条`,
          }}
          onChange={handleTableChange}
          size="small"
        />
      </Card>

      {/* 新建/编辑 Modal */}
      <CustomerFormModal
        open={modalOpen}
        editData={editData}
        onClose={() => setModalOpen(false)}
        onSuccess={() => { fetchList(pagination.current); fetchStats(); }}
      />

      {/* 客户详情弹窗 */}
      <ResizableModal
        title={<Space><UserOutlined />{drawerData?.companyName}</Space>}
        open={drawerOpen}
        onCancel={() => setDrawerOpen(false)}
        footer={null}
        width="60vw"
        initialHeight={Math.round(window.innerHeight * 0.82)}
        destroyOnHidden
      >
        {drawerData && (
          <Tabs
            items={[
              {
                key: 'info',
                label: '基本信息',
                children: (
                  <Descriptions column={2} size="small" bordered>
                    <Descriptions.Item label="客户编号">{drawerData.customerNo}</Descriptions.Item>
                    <Descriptions.Item label="等级">
                      {drawerData.customerLevel === 'VIP' ? <Tag color="gold">VIP</Tag> : <Tag>普通</Tag>}
                    </Descriptions.Item>
                    <Descriptions.Item label="联系人">{drawerData.contactPerson || '-'}</Descriptions.Item>
                    <Descriptions.Item label="联系电话">{drawerData.contactPhone || '-'}</Descriptions.Item>
                    <Descriptions.Item label="邮箱" span={2}>{drawerData.contactEmail || '-'}</Descriptions.Item>
                    <Descriptions.Item label="地址" span={2}>{drawerData.address || '-'}</Descriptions.Item>
                    <Descriptions.Item label="所属行业">{drawerData.industry || '-'}</Descriptions.Item>
                    <Descriptions.Item label="客户来源">{drawerData.source || '-'}</Descriptions.Item>
                    <Descriptions.Item label="状态">
                      {drawerData.status === 'ACTIVE' ? <Tag color="green">合作中</Tag> : <Tag>已停合作</Tag>}
                    </Descriptions.Item>
                    <Descriptions.Item label="创建人">{drawerData.creatorName || '-'}</Descriptions.Item>
                    <Descriptions.Item label="备注" span={2}>{drawerData.remark || '-'}</Descriptions.Item>
                  </Descriptions>
                ),
              },
              {
                key: 'orders',
                label: `生产订单${drawerOrders.length > 0 ? ` (${drawerOrders.length})` : ''}`,
                children: (
                  <ResizableTable
                    rowKey="id"
                    loading={drawerLoading}
                    dataSource={drawerOrders}
                    size="small"
                    pagination={{ pageSize: 8, showTotal: t => `共 ${t} 条` }}
                    columns={[
                      { title: '订单号', dataIndex: 'orderNo', width: 160 },
                      { title: '款式', dataIndex: 'styleName', width: 120 },
                      { title: '数量', dataIndex: 'orderQuantity', width: 80 },
                      {
                        title: '生产进度', dataIndex: 'productionProgress', width: 150,
                        render: v => (
                          <Progress
                            percent={Number(v) || 0}
                            size="small"
                            strokeColor={Number(v) >= 100 ? '#52c41a' : undefined}
                          />
                        ),
                      },
                      {
                        title: '状态', dataIndex: 'status', width: 100,
                        render: (v: string) => {
                          const s = String(v || '').toLowerCase();
                          const label = ORDER_STATUS_LABEL[s];
                          return <Tag color={ORDER_STATUS_COLOR[s] ?? 'default'}>{label ?? v}</Tag>;
                        },
                      },
                      { title: '创建时间', dataIndex: 'createTime', width: 110, render: v => v?.substring(0, 10) ?? '-' },
                      {
                        title: '操作', width: 120,
                        render: (_, order: any) => (
                          <Button
                            size="small"
                            icon={<LinkOutlined />}
                            onClick={() => {
                              void handleShareOrder({
                                id: order.id,
                                orderNo: order.orderNo,
                              } as ProductionOrder);
                            }}
                          >
                            追踪链接
                          </Button>
                        ),
                      },
                    ]}
                    locale={{ emptyText: '暂无关联订单' }}
                  />
                ),
              },
              {
                key: 'receivables',
                label: (
                  <Space size={4}>
                    <DollarOutlined />
                    {`应收账款${drawerReceivables.length > 0 ? ` (${drawerReceivables.length})` : ''}`}
                  </Space>
                ),
                children: (
                  <ResizableTable
                    rowKey="id"
                    loading={drawerReceivableLoading}
                    dataSource={drawerReceivables}
                    size="small"
                    pagination={{ pageSize: 8, showTotal: (t: number) => `共 ${t} 条` }}
                    columns={[
                      { title: '单号', dataIndex: 'receivableNo', width: 150 },
                      { title: '应收金额', dataIndex: 'amount', width: 110, render: (v: number) => `¥${Number(v).toFixed(2)}` },
                      { title: '已收金额', dataIndex: 'receivedAmount', width: 110, render: (v: number) => `¥${Number(v ?? 0).toFixed(2)}` },
                      { title: '到期日', dataIndex: 'dueDate', width: 110, render: (v: string) => v || '-' },
                      {
                        title: '状态', dataIndex: 'status', width: 110,
                        render: (v: string) => {
                          const cfg: Record<string, { label: string; color: string }> = {
                            PENDING:  { label: '待收款', color: 'blue' },
                            PARTIAL:  { label: '部分到账', color: 'orange' },
                            PAID:     { label: '已全额到账', color: 'green' },
                            OVERDUE:  { label: '已逾期', color: 'red' },
                          };
                          const c = cfg[v] ?? { label: v, color: 'default' };
                          return <Tag color={c.color}>{c.label}</Tag>;
                        },
                      },
                    ]}
                    locale={{ emptyText: '暂无应收账款' }}
                  />
                ),
              },
            ]}
          />
        )}
      </ResizableModal>

      {shareOrderDialog}
    </>
  );
};

// ─── 页面主入口（订阅检测 + 分支渲染）──────────────────────────────
const CrmDashboard: React.FC = () => {
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
          hasActiveSubscription(a, CRM_APP_CODE_ALIASES)
        );
        if (activeFromApps) { setSubscribed(true); return; }
        const subscriptions = await appStoreService.getMySubscriptions();
        const subList = Array.isArray(subscriptions) ? subscriptions : ((subscriptions as any)?.data ?? []);
        const activeFromSubs = subList.some((s: any) =>
          hasActiveSubscription(s, CRM_APP_CODE_ALIASES)
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
    <>
      <div style={{ padding: '24px' }}>
        {checking ? (
          <div style={{ textAlign: 'center', padding: '80px 0' }}><Spin size="large" /></div>
        ) : subscribed ? (
          <CustomerManagement />
        ) : (
          <div style={{ maxWidth: 960 }}>
            <LockedView onGoStore={() => navigate(paths.appStore)} />
          </div>
        )}
      </div>
    </>
  );
};

export default CrmDashboard;
