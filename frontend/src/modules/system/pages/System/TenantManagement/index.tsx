import React, { useState, useEffect, useCallback } from 'react';
import { Tabs, Button, Tag, Space, message, Form, Input, InputNumber, Modal, Select, Card, Statistic, Row, Col, Typography, Descriptions, Badge, Tooltip, Timeline, Empty, QRCode, Alert } from 'antd';
import { PlusOutlined, TeamOutlined, CrownOutlined, SafetyCertificateOutlined, ApiOutlined, CopyOutlined, StopOutlined, PlayCircleOutlined, CodeOutlined, DashboardOutlined, LinkOutlined, CheckCircleOutlined, SwapOutlined, EyeOutlined, BookOutlined, QrcodeOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import IntegrationGuideTab from './IntegrationGuideTab';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '@/components/Layout';
import ResizableModal from '@/components/common/ResizableModal';
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';
import { useModal } from '@/hooks';
import { useAuth } from '@/utils/AuthContext';
import tenantService from '@/services/tenantService';
import tenantAppService from '@/services/tenantAppService';
import type { TenantAppInfo, TenantAppLogInfo, IntegrationOverview, IntegrationModuleInfo } from '@/services/tenantAppService';
import type { RoleTemplate, TenantInfo, TenantUser } from '@/services/tenantService';
import type { ColumnsType } from 'antd/es/table';

const { Text } = Typography;

// ========== 应用类型配置 ==========
const APP_TYPE_CONFIG: Record<string, { label: string; color: string; icon: string; description: string }> = {
  ORDER_SYNC: { label: '下单对接', color: 'var(--color-primary)', icon: '📦', description: '客户ERP系统直接下达生产订单，实时查询订单进度' },
  QUALITY_FEEDBACK: { label: '质检反馈', color: 'var(--color-success)', icon: '✅', description: '质检完成后自动推送结果到客户系统，支持Webhook回调' },
  LOGISTICS_SYNC: { label: '物流对接', color: 'var(--color-info)', icon: '🚚', description: '出库发货时自动同步物流信息到客户系统' },
  PAYMENT_SYNC: { label: '付款对接', color: 'var(--color-warning)', icon: '💰', description: '对账单推送、付款确认，与客户支付系统双向对接' },
};

// ========== 集成总览 Tab ==========
const MODULE_ICONS: Record<string, { icon: string; color: string; bgColor: string }> = {
  ORDER_SYNC: { icon: '📦', color: 'var(--color-primary)', bgColor: 'rgba(45, 127, 249, 0.1)' },
  QUALITY_FEEDBACK: { icon: '✅', color: 'var(--color-success)', bgColor: 'rgba(34, 197, 94, 0.15)' },
  LOGISTICS_SYNC: { icon: '🚚', color: 'var(--color-info)', bgColor: 'rgba(114, 46, 209, 0.1)' },
  PAYMENT_SYNC: { icon: '💰', color: 'var(--color-warning)', bgColor: 'rgba(250, 140, 22, 0.1)' },
};

const IntegrationOverviewTab: React.FC = () => {
  const navigate = useNavigate();
  const [overview, setOverview] = useState<IntegrationOverview | null>(null);
  const [allLogs, setAllLogs] = useState<TenantAppLogInfo[]>([]);
  const [_loading, setLoading] = useState(false);

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await tenantAppService.getIntegrationOverview();
      const data = res?.data || res;
      setOverview(data);
      setAllLogs(data?.recentLogs || []);
    } catch {
      message.error('加载集成总览失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchOverview(); }, [fetchOverview]);

  const getFlowDescription = (appType: string): string => {
    const map: Record<string, string> = {
      ORDER_SYNC: '客户ERP下单 → 自动创建生产订单 → 在「生产管理→我的订单」查看',
      QUALITY_FEEDBACK: '质检完成 → Webhook推送质检结果 → 在「生产管理→质检入库」查看',
      LOGISTICS_SYNC: '出库发货 → Webhook推送物流信息 → 在「仓库管理→成品进销存」查看',
      PAYMENT_SYNC: '对账单生成 → 推送给客户 → 客户确认付款 → 在「财务管理→订单结算」查看',
    };
    return map[appType] || '';
  };

  const getApiEndpoints = (appType: string): { method: string; path: string; desc: string }[] => {
    const map: Record<string, { method: string; path: string; desc: string }[]> = {
      ORDER_SYNC: [
        { method: 'POST', path: '/openapi/order/create', desc: '创建生产订单' },
        { method: 'POST', path: '/openapi/order/status', desc: '查询订单状态' },
        { method: 'POST', path: '/openapi/order/list', desc: '订单列表' },
      ],
      QUALITY_FEEDBACK: [
        { method: 'POST', path: '/openapi/quality/report', desc: '获取质检报告' },
        { method: 'POST', path: '/openapi/quality/list', desc: '质检记录列表' },
        { method: '-', path: 'Webhook 回调', desc: '自动推送质检完成结果' },
      ],
      LOGISTICS_SYNC: [
        { method: 'POST', path: '/openapi/logistics/status', desc: '获取物流状态' },
        { method: 'POST', path: '/openapi/logistics/list', desc: '物流记录列表' },
        { method: '-', path: 'Webhook 回调', desc: '自动推送出库发货信息' },
      ],
      PAYMENT_SYNC: [
        { method: 'POST', path: '/openapi/payment/pending', desc: '待付款清单' },
        { method: 'POST', path: '/openapi/payment/confirm', desc: '确认付款' },
        { method: 'POST', path: '/openapi/payment/list', desc: '付款记录列表' },
      ],
    };
    return map[appType] || [];
  };

  return (
    <div>
      {/* 总体统计 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card size="small" style={{ borderLeft: '3px solid var(--color-primary)' }}>
            <Statistic title="已配置应用" value={overview?.totalApps || 0} suffix="个" prefix={<ApiOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" style={{ borderLeft: '3px solid var(--color-success)' }}>
            <Statistic title="运行中" value={overview?.activeApps || 0} suffix="个" styles={{ content: { color: 'var(--color-success)' } }} prefix={<CheckCircleOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" style={{ borderLeft: '3px solid var(--color-info)' }}>
            <Statistic title="总API调用" value={overview?.totalCalls || 0} suffix="次" prefix={<SwapOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" style={{ borderLeft: '3px solid var(--color-warning)' }}>
            <Statistic
              title="已对接模块"
              value={overview?.modules?.filter(m => m.connected).length || 0}
              suffix={`/ ${overview?.modules?.length || 4}`}
              prefix={<LinkOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* 四大模块卡片 */}
      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 12 }}>🔗 对接模块状态</div>
      <Row gutter={16} style={{ marginBottom: 24 }}>
        {(overview?.modules || []).map((mod: IntegrationModuleInfo) => {
          const cfg = MODULE_ICONS[mod.appType] || { icon: '🔌', color: 'var(--color-text-tertiary)', bgColor: 'var(--color-bg-subtle)' };
          return (
            <Col span={6} key={mod.appType}>
              <Card
                size="small"
                hoverable
                style={{
                  borderTop: `3px solid ${cfg.color}`,
                  background: mod.connected ? '#fff' : '#fafafa',
                  minHeight: 220,
                }}
              >
                <div style={{ textAlign: 'center', marginBottom: 12 }}>
                  <div style={{ fontSize: 32, marginBottom: 4 }}>{cfg.icon}</div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{mod.appTypeName}</div>
                  <Tag
                    color={mod.connected ? 'success' : 'default'}
                    style={{ marginTop: 4 }}
                  >
                    {mod.connected ? '✓ 已对接' : '未对接'}
                  </Tag>
                </div>

                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
                  <div>活跃应用: <strong>{mod.activeApps}</strong> 个</div>
                  <div>累计调用: <strong>{(mod.totalCalls || 0).toLocaleString()}</strong> 次</div>
                  {mod.lastCallTime && <div>最后调用: {mod.lastCallTime}</div>}
                </div>

                <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 12, lineHeight: 1.6 }}>
                  {getFlowDescription(mod.appType)}
                </div>

                <Button
                  type="link"
                  size="small"
                  icon={<EyeOutlined />}
                  onClick={() => navigate(mod.viewPath)}
                  style={{ padding: 0, fontSize: 12 }}
                >
                  查看数据：{mod.viewPage}
                </Button>
              </Card>
            </Col>
          );
        })}
      </Row>

      {/* API端点速查 + 最近调用日志 双栏 */}
      <Row gutter={16}>
        <Col span={12}>
          <Card
            size="small"
            title="📡 API 端点速查"
            style={{ minHeight: 360 }}
          >
            {(overview?.modules || []).map((mod: IntegrationModuleInfo) => {
              const cfg = MODULE_ICONS[mod.appType] || { icon: '🔌', color: 'var(--color-text-tertiary)', bgColor: 'var(--color-bg-subtle)' };
              const endpoints = getApiEndpoints(mod.appType);
              return (
                <div key={mod.appType} style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4, color: cfg.color }}>
                    {cfg.icon} {mod.appTypeName}
                  </div>
                  {endpoints.map((ep, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 8, padding: '2px 0', fontSize: 12 }}>
                      {ep.method !== '-' ? (
                        <Tag color="blue" style={{ fontSize: 11, minWidth: 44, textAlign: 'center' }}>{ep.method}</Tag>
                      ) : (
                        <Tag color="green" style={{ fontSize: 11, minWidth: 44, textAlign: 'center' }}>PUSH</Tag>
                      )}
                      <Text code style={{ fontSize: 11 }}>{ep.path}</Text>
                      <Text type="secondary" style={{ fontSize: 11 }}>{ep.desc}</Text>
                    </div>
                  ))}
                </div>
              );
            })}
          </Card>
        </Col>
        <Col span={12}>
          <Card
            size="small"
            title="📋 最近 API 调用"
            style={{ minHeight: 360 }}
            extra={<Text type="secondary" style={{ fontSize: 12 }}>最新10条</Text>}
          >
            {allLogs.length === 0 ? (
              <Empty description="暂无调用记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <Timeline
                items={allLogs.map((log, idx) => ({
                  key: idx,
                  color: log.result === 'SUCCESS' ? 'green' : 'red',
                  children: (
                    <div style={{ fontSize: 12 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Tag color={log.direction === 'INBOUND' ? 'blue' : 'green'} style={{ fontSize: 10 }}>
                          {log.direction === 'INBOUND' ? '入站' : '出站'}
                        </Tag>
                        <Tag style={{ fontSize: 10 }}>{log.httpMethod}</Tag>
                        <Text code style={{ fontSize: 10 }}>{log.requestPath}</Text>
                        <Tag color={log.result === 'SUCCESS' ? 'green' : 'red'} style={{ fontSize: 10 }}>
                          {log.responseCode} {log.costMs}ms
                        </Tag>
                      </div>
                      <Text type="secondary" style={{ fontSize: 11 }}>{log.createTime}</Text>
                    </div>
                  ),
                }))}
              />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

// ========== 应用管理 Tab ==========
const AppManagementTab: React.FC = () => {
  const [apps, setApps] = useState<TenantAppInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ total: 0, active: 0, disabled: 0, totalCalls: 0 });
  const [queryParams, setQueryParams] = useState({ page: 1, size: 20, appType: '', status: '' });
  const createModal = useModal<TenantAppInfo>();
  const detailModal = useModal<TenantAppInfo>();
  const logModal = useModal<TenantAppInfo>();
  const [form] = Form.useForm();
  const [selectedApp, setSelectedApp] = useState<TenantAppInfo | null>(null);
  const [logs, setLogs] = useState<TenantAppLogInfo[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsLoading, setLogsLoading] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  const fetchApps = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await tenantAppService.listApps(queryParams);
      const d = res?.data || res;
      setApps(d?.records || []);
      setTotal(d?.total || 0);
    } catch {
      message.error('加载应用列表失败');
    } finally {
      setLoading(false);
    }
  }, [queryParams]);

  const fetchStats = useCallback(async () => {
    try {
      const res: any = await tenantAppService.getStats();
      setStats(res?.data || res || { total: 0, active: 0, disabled: 0, totalCalls: 0 });
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchApps(); fetchStats(); }, [fetchApps, fetchStats]);

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      const res: any = await tenantAppService.createApp(values);
      const appData = res?.data || res;
      message.success('应用创建成功');
      setNewSecret(appData?.appSecret || null);
      setSelectedApp(appData);
      createModal.close();
      detailModal.open(appData);
      form.resetFields();
      fetchApps();
      fetchStats();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.message || '创建失败');
    }
  };

  const handleToggleStatus = async (record: TenantAppInfo) => {
    try {
      await tenantAppService.toggleStatus(record.id);
      message.success(record.status === 'active' ? '已停用' : '已启用');
      fetchApps();
      fetchStats();
    } catch {
      message.error('操作失败');
    }
  };

  const handleResetSecret = async (record: TenantAppInfo) => {
    Modal.confirm({
      title: '重置密钥',
      content: '重置后旧密钥立即失效，客户系统需要更新配置。确认重置？',
      okText: '确认重置',
      okType: 'danger',
      onOk: async () => {
        try {
          const res: any = await tenantAppService.resetSecret(record.id);
          const data = res?.data || res;
          setNewSecret(data?.appSecret || null);
          setSelectedApp(data);
          detailModal.open(data);
          message.success('密钥已重置');
          fetchApps();
        } catch {
          message.error('重置失败');
        }
      },
    });
  };

  const handleDelete = async (record: TenantAppInfo) => {
    Modal.confirm({
      title: '删除应用',
      content: `确认删除应用"${record.appName}"？删除后无法恢复。`,
      okText: '确认删除',
      okType: 'danger',
      onOk: async () => {
        try {
          await tenantAppService.deleteApp(record.id);
          message.success('已删除');
          fetchApps();
          fetchStats();
        } catch {
          message.error('删除失败');
        }
      },
    });
  };

  const handleViewLogs = async (record: TenantAppInfo) => {
    setSelectedApp(record);
    logModal.open(record);
    setLogsLoading(true);
    try {
      const res: any = await tenantAppService.listLogs(record.id, { page: 1, size: 50 });
      const d = res?.data || res;
      setLogs(d?.records || []);
      setLogsTotal(d?.total || 0);
    } catch {
      message.error('加载日志失败');
    } finally {
      setLogsLoading(false);
    }
  };

  const handleViewDetail = async (record: TenantAppInfo) => {
    try {
      const res: any = await tenantAppService.getAppDetail(record.id);
      const data = res?.data || res;
      setSelectedApp(data);
      setNewSecret(null);
      detailModal.open(data);
    } catch {
      message.error('加载详情失败');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    message.success('已复制到剪贴板');
  };

  const columns: ColumnsType<TenantAppInfo> = [
    {
      title: '应用', dataIndex: 'appName', width: 200,
      render: (name: string, record: TenantAppInfo) => {
        const cfg = APP_TYPE_CONFIG[record.appType];
        return (
          <div>
            <div style={{ fontWeight: 600 }}>{cfg?.icon} {name}</div>
            <Text type="secondary" style={{ fontSize: 12 }}>{cfg?.label || record.appType}</Text>
          </div>
        );
      },
    },
    {
      title: 'AppKey', dataIndex: 'appKey', width: 220,
      render: (key: string) => (
        <Space>
          <Text code style={{ fontSize: 12 }}>{key}</Text>
          <Tooltip title="复制"><CopyOutlined style={{ cursor: 'pointer', color: 'var(--color-primary)' }} onClick={() => copyToClipboard(key)} /></Tooltip>
        </Space>
      ),
    },
    {
      title: '状态', dataIndex: 'status', width: 80, align: 'center',
      render: (s: string) => {
        const map: Record<string, { status: 'success' | 'error' | 'default'; text: string }> = {
          active: { status: 'success', text: '启用' },
          disabled: { status: 'error', text: '停用' },
          expired: { status: 'default', text: '过期' },
        };
        const item = map[s] || { status: 'default' as const, text: s };
        return <Badge status={item.status} text={item.text} />;
      },
    },
    {
      title: '今日调用', dataIndex: 'dailyUsed', width: 100, align: 'center',
      render: (used: number, record: TenantAppInfo) => (
        <span>{used || 0}{record.dailyQuota ? ` / ${record.dailyQuota}` : ''}</span>
      ),
    },
    { title: '总调用', dataIndex: 'totalCalls', width: 80, align: 'center', render: (v: number) => v?.toLocaleString() || '0' },
    { title: '创建时间', dataIndex: 'createTime', width: 160 },
    {
      title: '操作', key: 'actions', width: 160,
      render: (_: unknown, record: TenantAppInfo) => {
        const actions: RowAction[] = [
          { key: 'detail', label: '详情', primary: true, onClick: () => handleViewDetail(record) },
          {
            key: 'toggle',
            label: record.status === 'active' ? '停用' : '启用',
            danger: record.status === 'active',
            onClick: () => handleToggleStatus(record),
          },
          { key: 'log', label: '调用日志', onClick: () => handleViewLogs(record) },
          { key: 'resetKey', label: '重置密钥', onClick: () => handleResetSecret(record) },
          { key: 'delete', label: '删除', danger: true, onClick: () => handleDelete(record) },
        ];
        return <RowActions actions={actions} />;
      },
    },
  ];

  const logColumns: ColumnsType<TenantAppLogInfo> = [
    { title: '时间', dataIndex: 'createTime', width: 160 },
    { title: '方向', dataIndex: 'direction', width: 80, render: (d: string) => d === 'INBOUND' ? <Tag color="blue">入站</Tag> : <Tag color="green">出站</Tag> },
    { title: '方法', dataIndex: 'httpMethod', width: 70 },
    { title: '路径', dataIndex: 'requestPath', width: 220, ellipsis: true },
    { title: '状态码', dataIndex: 'responseCode', width: 70, align: 'center' },
    {
      title: '结果', dataIndex: 'result', width: 80, align: 'center',
      render: (r: string) => <Tag color={r === 'SUCCESS' ? 'green' : 'red'}>{r}</Tag>,
    },
    { title: '耗时', dataIndex: 'costMs', width: 80, align: 'right', render: (ms: number) => `${ms}ms` },
    { title: 'IP', dataIndex: 'clientIp', width: 120 },
  ];

  return (
    <div>
      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Card size="small"><Statistic title="应用总数" value={stats.total} prefix={<ApiOutlined />} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="运行中" value={stats.active} styles={{ content: { color: 'var(--color-success)' } }} prefix={<PlayCircleOutlined />} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="已停用" value={stats.disabled} styles={{ content: { color: 'var(--color-danger)' } }} prefix={<StopOutlined />} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="总调用次数" value={stats.totalCalls} prefix={<CodeOutlined />} /></Card></Col>
      </Row>

      {/* 工具栏 */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <Space>
          <Select
            placeholder="应用类型"
            allowClear
            style={{ width: 140 }}
            onChange={(v) => setQueryParams(p => ({ ...p, appType: v || '', page: 1 }))}
            options={Object.entries(APP_TYPE_CONFIG).map(([k, v]) => ({ value: k, label: `${v.icon} ${v.label}` }))}
          />
          <Select
            placeholder="状态"
            allowClear
            style={{ width: 100 }}
            onChange={(v) => setQueryParams(p => ({ ...p, status: v || '', page: 1 }))}
            options={[{ value: 'active', label: '启用' }, { value: 'disabled', label: '停用' }]}
          />
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setNewSecret(null); createModal.open(); }}>
          创建应用
        </Button>
      </div>

      {/* 应用列表 */}
      <ResizableTable
        storageKey="tenant-apps"
        rowKey="id"
        columns={columns}
        dataSource={apps}
        loading={loading}
        pagination={{
          current: queryParams.page, pageSize: queryParams.size, total,
          onChange: (p, ps) => setQueryParams(prev => ({ ...prev, page: p, size: ps })),
          showTotal: (t) => `共 ${t} 个应用`,
        }}
        size="small"
      />

      {/* 创建应用弹窗 */}
      <ResizableModal
        open={createModal.visible}
        title="创建对接应用"
        onCancel={createModal.close}
        width="40vw"
        footer={
          <Space>
            <Button onClick={createModal.close}>取消</Button>
            <Button type="primary" onClick={handleCreate}>确认创建</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item label="应用名称" name="appName" rules={[{ required: true, message: '请输入应用名称' }]}>
            <Input placeholder="如: XXX品牌下单通道" />
          </Form.Item>
          <Form.Item label="应用类型" name="appType" rules={[{ required: true, message: '请选择应用类型' }]}>
            <Select placeholder="选择对接模块">
              {Object.entries(APP_TYPE_CONFIG).map(([key, cfg]) => (
                <Select.Option key={key} value={key}>
                  <div>
                    <span>{cfg.icon} {cfg.label}</span>
                    <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{cfg.description}</div>
                  </div>
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="回调地址 (Webhook)" name="callbackUrl" tooltip="我们将向此地址推送数据变更通知">
            <Input placeholder="https://your-system.com/webhook/callback" />
          </Form.Item>
          <Form.Item label="客户API地址" name="externalApiUrl" tooltip="用于主动调用客户系统接口">
            <Input placeholder="https://your-system.com/api" />
          </Form.Item>
          <Form.Item label="每日调用限制" name="dailyQuota" tooltip="0 表示不限制">
            <InputNumber min={0} max={1000000} defaultValue={0} style={{ width: '100%' }} placeholder="0 = 不限制" />
          </Form.Item>
          <Form.Item label="备注" name="remark">
            <Input.TextArea rows={2} placeholder="备注说明" />
          </Form.Item>
        </Form>
      </ResizableModal>

      {/* 应用详情弹窗 */}
      <ResizableModal
        open={detailModal.visible}
        title={`应用详情 - ${selectedApp?.appName || ''}`}
        onCancel={() => { detailModal.close(); setNewSecret(null); }}
        width="60vw"
        footer={<Button onClick={() => { detailModal.close(); setNewSecret(null); }}>关闭</Button>}
      >
        {selectedApp && (
          <div style={{ padding: '0 8px' }}>
            {newSecret && (
              <div style={{ background: 'rgba(250, 140, 22, 0.1)', border: '1px solid rgba(250, 140, 22, 0.5)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                <div style={{ fontWeight: 700, color: 'var(--color-warning)', marginBottom: 8 }}>⚠️ 请妥善保管以下密钥（仅显示一次）</div>
                <div style={{ marginBottom: 8 }}>
                  <Text strong>AppSecret: </Text>
                  <Text code copyable>{newSecret}</Text>
                </div>
                {selectedApp.callbackSecret && (
                  <div>
                    <Text strong>回调签名密钥: </Text>
                    <Text code copyable>{selectedApp.callbackSecret}</Text>
                  </div>
                )}
              </div>
            )}

            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="应用名称">{selectedApp.appName}</Descriptions.Item>
              <Descriptions.Item label="应用类型">
                <Tag color={APP_TYPE_CONFIG[selectedApp.appType]?.color}>
                  {APP_TYPE_CONFIG[selectedApp.appType]?.icon} {selectedApp.appTypeName}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="AppKey">
                <Space>
                  <Text code>{selectedApp.appKey}</Text>
                  <CopyOutlined style={{ cursor: 'pointer', color: 'var(--color-primary)' }} onClick={() => copyToClipboard(selectedApp.appKey)} />
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Badge status={selectedApp.status === 'active' ? 'success' : 'error'} text={selectedApp.statusName} />
              </Descriptions.Item>
              <Descriptions.Item label="回调地址" span={2}>{selectedApp.callbackUrl || '-'}</Descriptions.Item>
              <Descriptions.Item label="客户API">{selectedApp.externalApiUrl || '-'}</Descriptions.Item>
              <Descriptions.Item label="每日配额">{selectedApp.dailyQuota ? `${selectedApp.dailyUsed || 0} / ${selectedApp.dailyQuota}` : '不限制'}</Descriptions.Item>
              <Descriptions.Item label="总调用次数">{selectedApp.totalCalls?.toLocaleString() || '0'}</Descriptions.Item>
              <Descriptions.Item label="创建时间">{selectedApp.createTime}</Descriptions.Item>
            </Descriptions>

            {/* 接入示例 */}
            {selectedApp.exampleSnippet && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>📖 接入示例</div>
                <pre style={{
                  background: 'var(--color-bg-base)', color: 'var(--color-text-secondary)', padding: 16, borderRadius: 8,
                  fontSize: 13, lineHeight: 1.5, overflow: 'auto', maxHeight: 300,
                }}>
                  {selectedApp.exampleSnippet}
                </pre>
              </div>
            )}
          </div>
        )}
      </ResizableModal>

      {/* 调用日志弹窗 */}
      <ResizableModal
        open={logModal.visible}
        title={`调用日志 - ${selectedApp?.appName || ''}`}
        onCancel={logModal.close}
        width="60vw"
        footer={<Button onClick={logModal.close}>关闭</Button>}
      >
        <ResizableTable
          storageKey="tenant-app-logs"
          rowKey="id"
          columns={logColumns}
          dataSource={logs}
          loading={logsLoading}
          pagination={{ total: logsTotal, pageSize: 50, showTotal: (t) => `共 ${t} 条` }}
          size="small"
          scroll={{ y: 400 }}
        />
      </ResizableModal>
    </div>
  );
};

// ========== 租户列表 Tab ==========
const TenantListTab: React.FC = () => {
  const [data, setData] = useState<TenantInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [statusTab, setStatusTab] = useState<string>('');
  const [queryParams, setQueryParams] = useState({ page: 1, pageSize: 20, tenantName: '', status: '' });
  const modal = useModal<TenantInfo>();
  const qrModal = useModal<TenantInfo>();
  const resetPwdModal = useModal<TenantInfo>();
  const rejectModal = useModal<TenantInfo>();
  const [form] = Form.useForm();
  const [resetPwdForm] = Form.useForm();
  const [rejectReasonForm] = Form.useForm();
  const [resettingPwd, setResettingPwd] = useState(false);
  const [processingId, setProcessingId] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await tenantService.listTenants(queryParams);
      const d = res?.data || res;
      setData(d?.records || []);
      setTotal(d?.total || 0);
    } catch {
      message.error('加载租户列表失败');
    } finally {
      setLoading(false);
    }
  }, [queryParams]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      await tenantService.createTenant(values);
      message.success('租户创建成功');
      modal.close();
      form.resetFields();
      fetchData();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.message || '创建失败');
    }
  };

  const handleToggleStatus = async (record: TenantInfo) => {
    const newStatus = record.status === 'active' ? 'inactive' : 'active';
    try {
      await tenantService.toggleTenantStatus(record.id, newStatus);
      message.success(newStatus === 'active' ? '已启用' : '已停用');
      fetchData();
    } catch {
      message.error('操作失败');
    }
  };

  const handleResetOwnerPassword = async () => {
    const record = resetPwdModal.data;
    if (!record) return;
    try {
      const values = await resetPwdForm.validateFields();
      if (values.newPassword !== values.confirmPassword) {
        message.error('两次输入密码不一致');
        return;
      }
      setResettingPwd(true);
      const res: any = await tenantService.resetTenantOwnerPassword(record.id, values.newPassword);
      if (res?.code === 200 || res?.data) {
        message.success('密码重置成功');
        resetPwdModal.close();
        resetPwdForm.resetFields();
      } else {
        message.error(res?.message || '重置失败');
      }
    } catch (e: any) {
      if (e?.errorFields?.length) return;
      message.error(e?.message || '重置失败');
    } finally {
      setResettingPwd(false);
    }
  };

  const handleApproveApplication = async (record: TenantInfo) => {
    Modal.confirm({
      title: `确认审批通过「${record.tenantName}」`,
      content: `将创建主账号「${record.applyUsername || ''}」，并激活该工厂账户。`,
      okText: '确认审批',
      cancelText: '取消',
      onOk: async () => {
        setProcessingId(record.id);
        try {
          await tenantService.approveApplication(record.id);
          message.success('审批通过，工厂账户已激活');
          fetchData();
        } catch (e: any) {
          message.error(e?.message || '审批失败');
        } finally {
          setProcessingId(null);
        }
      },
    });
  };

  const handleRejectApplication = async () => {
    const record = rejectModal.data;
    if (!record) return;
    try {
      const values = await rejectReasonForm.validateFields();
      setProcessingId(record.id);
      await tenantService.rejectApplication(record.id, values.reason);
      message.success('已拒绝申请');
      rejectModal.close();
      rejectReasonForm.resetFields();
      fetchData();
    } catch (e: any) {
      if (e?.errorFields?.length) return;
      message.error(e?.message || '操作失败');
    } finally {
      setProcessingId(null);
    }
  };

  const handleMarkPaid = async (record: TenantInfo) => {
    const isPaid = record.paidStatus === 'PAID';
    Modal.confirm({
      title: isPaid ? `取消「${record.tenantName}」的已付费状态` : `标记「${record.tenantName}」为已付费`,
      okText: isPaid ? '取消付费' : '标记已付费',
      cancelText: '取消',
      onOk: async () => {
        try {
          await tenantService.markTenantPaid(record.id, isPaid ? 'TRIAL' : 'PAID');
          message.success(isPaid ? '已取消付费状态' : '已标记为已付费');
          fetchData();
        } catch (e: any) {
          message.error(e?.message || '操作失败');
        }
      },
    });
  };

  const columns: ColumnsType<TenantInfo> = [
    { title: '工厂名称', dataIndex: 'tenantName', width: 160 },
    { title: '租户编码', dataIndex: 'tenantCode', width: 110, render: (v: string) => v || <span style={{color:'#bbb'}}>待分配</span> },
    { title: '主账号', dataIndex: 'ownerUsername', width: 110, render: (v: string, r: TenantInfo) => v || r.applyUsername || '-' },
    { title: '联系人', dataIndex: 'contactName', width: 90 },
    { title: '联系电话', dataIndex: 'contactPhone', width: 120 },
    {
      title: '账户状态', dataIndex: 'status', width: 90, align: 'center',
      render: (s: string) => {
        const map: Record<string, {color:string, label:string}> = {
          active: {color:'green', label:'正常'},
          disabled: {color:'red', label:'停用'},
          pending_review: {color:'orange', label:'待审核'},
          rejected: {color:'default', label:'已拒绝'},
        };
        const cfg = map[s] || {color:'default', label: s};
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    {
      title: '付费状态', dataIndex: 'paidStatus', width: 90, align: 'center',
      render: (s: string, r: TenantInfo) => r.status === 'active'
        ? <Tag color={s === 'PAID' ? 'gold' : 'default'}>{s === 'PAID' ? '已付费' : '免费试用'}</Tag>
        : '-',
    },
    { title: '最大用户数', dataIndex: 'maxUsers', width: 90, align: 'center', render: (v: number, r: TenantInfo) => r.status === 'active' ? v : '-' },
    { title: '申请时间', dataIndex: 'createTime', width: 150 },
    {
      title: '操作', key: 'actions', width: 200,
      render: (_: unknown, record: TenantInfo) => {
        if (record.status === 'pending_review') {
          const actions: RowAction[] = [
            {
              key: 'approve', label: '审批通过', primary: true,
              disabled: processingId === record.id,
              onClick: () => handleApproveApplication(record),
            },
            {
              key: 'reject', label: '拒绝',
              danger: true,
              onClick: () => { rejectReasonForm.resetFields(); rejectModal.open(record); },
            },
          ];
          return <RowActions actions={actions} />;
        }
        const actions: RowAction[] = [
          {
            key: 'qrcode', label: '注册码',
            primary: true,
            onClick: () => qrModal.open(record),
          },
          {
            key: 'markPaid', label: record.paidStatus === 'PAID' ? '取消付费' : '标记已付费',
            onClick: () => handleMarkPaid(record),
          },
          {
            key: 'resetPwd', label: '重置密码',
            onClick: () => { resetPwdForm.resetFields(); resetPwdModal.open(record); },
          },
          {
            key: 'toggle', label: record.status === 'active' ? '停用' : '启用',
            danger: record.status === 'active',
            onClick: () => handleToggleStatus(record),
          },
        ];
        return <RowActions actions={actions} />;
      },
    },
  ];

  // 生成注册链接
  const getRegisterUrl = (tenant: TenantInfo) => {
    const origin = window.location.origin;
    return `${origin}/register?tenantCode=${encodeURIComponent(tenant.tenantCode)}&tenantName=${encodeURIComponent(tenant.tenantName)}`;
  };

  const handleCopyLink = (tenant: TenantInfo) => {
    const url = getRegisterUrl(tenant);
    navigator.clipboard.writeText(url).then(() => {
      message.success('注册链接已复制');
    }).catch(() => {
      // 降级方案
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      message.success('注册链接已复制');
    });
  };

  const handleCopyCode = (tenantCode: string) => {
    navigator.clipboard.writeText(tenantCode).then(() => {
      message.success('工厂编码已复制');
    }).catch(() => {
      message.success('工厂编码已复制');
    });
  };

  return (
    <div>
      {/* 标签筛选 + 操作栏 */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {[
            { key: '', label: '全部' },
            { key: 'pending_review', label: '待审核', color: 'orange' },
            { key: 'active', label: '正常', color: 'green' },
            { key: 'disabled', label: '停用', color: 'red' },
            { key: 'rejected', label: '已拒绝', color: 'default' },
          ].map(tab => (
            <Tag
              key={tab.key}
              color={statusTab === tab.key ? (tab.color || 'blue') : undefined}
              style={{
                cursor: 'pointer',
                padding: '3px 12px',
                fontSize: 14,
                border: statusTab === tab.key ? undefined : '1px solid #d9d9d9',
              }}
              onClick={() => {
                setStatusTab(tab.key);
                setQueryParams(p => ({ ...p, status: tab.key, page: 1 }));
              }}
            >
              {tab.label}
            </Tag>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Input.Search
            placeholder="搜索工厂名称"
            allowClear
            onSearch={(v) => setQueryParams(p => ({ ...p, tenantName: v, page: 1 }))}
            style={{ width: 200 }}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); modal.open(); }}>
            新建租户
          </Button>
        </div>
      </div>

      <ResizableTable
        storageKey="tenant-list"
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={loading}
        pagination={{
          current: queryParams.page, pageSize: queryParams.pageSize, total,
          onChange: (p, ps) => setQueryParams(prev => ({ ...prev, page: p, pageSize: ps })),
        }}
        size="small"
      />

      {/* 拒绝申请弹窗 */}
      <ResizableModal
        open={rejectModal.visible}
        title={`拒绝入驻申请 - ${rejectModal.data?.tenantName || ''}`}
        onCancel={() => { rejectModal.close(); rejectReasonForm.resetFields(); }}
        width="30vw"
        footer={
          <Space>
            <Button onClick={() => { rejectModal.close(); rejectReasonForm.resetFields(); }}>取消</Button>
            <Button danger type="primary" loading={processingId === rejectModal.data?.id} onClick={handleRejectApplication}>确认拒绝</Button>
          </Space>
        }
      >
        <Form form={rejectReasonForm} layout="vertical">
          <Alert message={`申请账号：${rejectModal.data?.applyUsername || '-'}`} type="warning" showIcon style={{ marginBottom: 16 }} />
          <Form.Item label="拒绝原因" name="reason" rules={[{ required: true, message: '请填写拒绝原因' }]}>
            <Input.TextArea rows={3} placeholder="请填写拒绝原因（将记录在备注中）" />
          </Form.Item>
        </Form>
      </ResizableModal>

      <ResizableModal
        open={modal.visible}
        title="新建租户"
        onCancel={modal.close}
        width="40vw"
        footer={
          <Space>
            <Button onClick={modal.close}>取消</Button>
            <Button type="primary" onClick={handleCreate}>确认创建</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item label="租户名称" name="tenantName" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item label="租户编码" name="tenantCode" rules={[{ required: true }]}><Input placeholder="唯一编码，工人注册用" /></Form.Item>
          <Form.Item label="联系人" name="contactName" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item label="联系电话" name="contactPhone"><Input /></Form.Item>
          <Form.Item label="最大用户数" name="maxUsers"><InputNumber min={1} max={9999} defaultValue={50} style={{ width: '100%' }} /></Form.Item>
          <div style={{ background: 'rgba(45, 127, 249, 0.08)', borderRadius: 8, padding: '12px 16px', marginTop: 8 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>主账号信息</div>
            <Form.Item label="用户名" name="ownerUsername" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item label="密码" name="ownerPassword" rules={[{ required: true, min: 6 }]}><Input.Password /></Form.Item>
            <Form.Item label="姓名" name="ownerName"><Input /></Form.Item>
          </div>
        </Form>
      </ResizableModal>

      {/* 注册二维码弹窗 */}
      <ResizableModal
        open={qrModal.visible}
        title={`注册二维码 - ${qrModal.data?.tenantName || ''}`}
        onCancel={qrModal.close}
        width="40vw"
        footer={<Button onClick={qrModal.close}>关闭</Button>}
      >
        {qrModal.data && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ marginBottom: 20 }}>
              <QRCode
                value={getRegisterUrl(qrModal.data)}
                size={240}
                style={{ margin: '0 auto' }}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <Text type="secondary">员工扫码或打开链接即可注册到该工厂</Text>
            </div>
            <Card size="small" style={{ textAlign: 'left', maxWidth: 400, margin: '0 auto', background: '#f8f9fa', borderRadius: 8 }}>
              <div style={{ marginBottom: 12 }}>
                <Text strong>工厂名称：</Text>
                <Text>{qrModal.data.tenantName}</Text>
              </div>
              <div style={{ marginBottom: 12 }}>
                <Text strong>工厂编码：</Text>
                <Text code copyable={{ text: qrModal.data.tenantCode }}>{qrModal.data.tenantCode}</Text>
              </div>
              <div style={{ marginBottom: 12 }}>
                <Text strong>注册链接：</Text>
                <div style={{ wordBreak: 'break-all', marginTop: 4 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>{getRegisterUrl(qrModal.data)}</Text>
                </div>
              </div>
              <Space>
                <Button size="small" icon={<CopyOutlined />} onClick={() => handleCopyLink(qrModal.data!)}>
                  复制链接
                </Button>
                <Button size="small" icon={<QrcodeOutlined />} onClick={() => handleCopyCode(qrModal.data!.tenantCode)}>
                  复制编码
                </Button>
              </Space>
            </Card>
            <div style={{ marginTop: 16 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                提示：员工注册后需要管理员在「注册审批」中审批通过后才能使用
              </Text>
            </div>
          </div>
        )}
      </ResizableModal>

      {/* 重置主账号密码弹窗 */}
      <ResizableModal
        open={resetPwdModal.visible}
        title={`重置主账号密码 - ${resetPwdModal.data?.tenantName || ''}`}
        onCancel={() => { resetPwdModal.close(); resetPwdForm.resetFields(); }}
        width="30vw"
        footer={
          <Space>
            <Button onClick={() => { resetPwdModal.close(); resetPwdForm.resetFields(); }}>取消</Button>
            <Button type="primary" danger loading={resettingPwd} onClick={handleResetOwnerPassword}>确认重置</Button>
          </Space>
        }
      >
        <div style={{ marginBottom: 12, color: '#666', fontSize: 13 }}>
          主账号：<strong style={{ color: 'var(--primary-color)' }}>{resetPwdModal.data?.ownerUsername || '-'}</strong>
        </div>
        <Form form={resetPwdForm} layout="vertical">
          <Form.Item label="新密码" name="newPassword" rules={[{ required: true, min: 6, message: '密码不能少于6位' }]}>
            <Input.Password placeholder="请输入新密码（至少6位）" autoComplete="new-password" />
          </Form.Item>
          <Form.Item label="确认新密码" name="confirmPassword" rules={[{ required: true, message: '请再次输入新密码' }]}>
            <Input.Password placeholder="请再次输入新密码" autoComplete="new-password" />
          </Form.Item>
        </Form>
      </ResizableModal>
    </div>
  );
};
const RoleTemplateTab: React.FC = () => {
  const [templates, setTemplates] = useState<RoleTemplate[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await tenantService.listRoleTemplates();
      setTemplates(res?.data || res || []);
    } catch {
      message.error('加载模板失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const columns: ColumnsType<RoleTemplate> = [
    { title: '排序', dataIndex: 'sortOrder', width: 60, align: 'center' },
    { title: '角色名称', dataIndex: 'roleName', width: 140 },
    { title: '角色编码', dataIndex: 'roleCode', width: 140 },
    { title: '说明', dataIndex: 'description', width: 200 },
    {
      title: '权限数量', dataIndex: 'permissionCount', width: 100, align: 'center',
      render: (v: number) => <Tag color="blue">{v}项</Tag>,
    },
    {
      title: '状态', dataIndex: 'status', width: 80, align: 'center',
      render: (s: string) => <Tag color={s === 'active' ? 'green' : 'default'}>{s === 'active' ? '启用' : '停用'}</Tag>,
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, color: 'var(--color-text-secondary)', fontSize: 13 }}>
        角色模板是预设的权限方案，为新租户创建员工时从模板中选择角色。共 {templates.length} 个模板。
      </div>
      <ResizableTable
        storageKey="tenant-role-templates"
        rowKey="id"
        columns={columns}
        dataSource={templates}
        loading={loading}
        pagination={false}
        size="small"
      />
    </div>
  );
};

// ========== 注册审批 Tab ==========
// 说明：统一展示工厂入驻申请 + 员工注册申请
const RegistrationTab: React.FC = () => {
  const { isSuperAdmin, isTenantOwner } = useAuth();

  // ---- 工厂入驻申请（Tenant status=pending_review）----
  const [tenantApps, setTenantApps] = useState<TenantInfo[]>([]);
  const [tenantAppsLoading, setTenantAppsLoading] = useState(false);

  const fetchTenantApps = useCallback(async () => {
    if (!isSuperAdmin) { setTenantApps([]); return; }
    setTenantAppsLoading(true);
    try {
      const res: any = await tenantService.listTenants({ page: 1, pageSize: 100, status: 'pending_review' });
      const d = res?.data || res;
      setTenantApps(d?.records || []);
    } catch { /* ignore */ }
    finally { setTenantAppsLoading(false); }
  }, [isSuperAdmin]);

  const handleApproveTenant = async (record: TenantInfo) => {
    Modal.confirm({
      title: `确认审批通过「${record.tenantName}」`,
      content: `将创建主账号「${record.applyUsername || ''}」，并激活该工厂账户。`,
      okText: '确认审批',
      cancelText: '取消',
      onOk: async () => {
        try {
          await tenantService.approveApplication(record.id);
          message.success('审批通过，工厂账户已激活');
          fetchTenantApps();
        } catch (e: any) {
          message.error(e?.message || '审批失败');
        }
      },
    });
  };

  const handleRejectTenant = async (record: TenantInfo) => {
    Modal.confirm({
      title: `拒绝「${record.tenantName}」的入驻申请`,
      content: <Input.TextArea placeholder="请输入拒绝原因" id="reject-tenant-reason" />,
      okText: '确认拒绝',
      cancelText: '取消',
      onOk: async () => {
        const reason = (document.getElementById('reject-tenant-reason') as HTMLTextAreaElement)?.value || '不符合要求';
        try {
          await tenantService.rejectApplication(record.id, reason);
          message.success('已拒绝');
          fetchTenantApps();
        } catch (e: any) {
          message.error(e?.message || '操作失败');
        }
      },
    });
  };

  const tenantAppColumns: ColumnsType<TenantInfo> = [
    { title: '工厂名称', dataIndex: 'tenantName', width: 160 },
    { title: '申请账号', dataIndex: 'applyUsername', width: 120 },
    { title: '联系人', dataIndex: 'contactName', width: 100 },
    { title: '联系电话', dataIndex: 'contactPhone', width: 130 },
    {
      title: '状态', dataIndex: 'status', width: 90, align: 'center',
      render: () => <Tag color="orange">待审核</Tag>,
    },
    { title: '申请时间', dataIndex: 'createTime', width: 160 },
    {
      title: '操作', key: 'actions', width: 160,
      render: (_: unknown, record: TenantInfo) => {
        const actions: RowAction[] = [
          { key: 'approve', label: '通过', primary: true, onClick: () => handleApproveTenant(record) },
          { key: 'reject', label: '拒绝', danger: true, onClick: () => handleRejectTenant(record) },
        ];
        return <RowActions actions={actions} />;
      },
    },
  ];

  // ---- 员工注册申请（User registrationStatus=PENDING）----
  const [data, setData] = useState<TenantUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);

  const fetchData = useCallback(async () => {
    if (!isSuperAdmin && !isTenantOwner) {
      setData([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    try {
      const res: any = await tenantService.listPendingRegistrations({ page, pageSize: 20 });
      const d = res?.data || res;
      setData(d?.records || []);
      setTotal(d?.total || 0);
    } catch {
      message.error('加载注册列表失败');
    } finally {
      setLoading(false);
    }
  }, [page, isSuperAdmin, isTenantOwner]);

  useEffect(() => { fetchTenantApps(); fetchData(); }, [fetchTenantApps, fetchData]);

  const handleApprove = async (userId: number) => {
    try {
      await tenantService.approveRegistration(userId);
      message.success('审批通过');
      fetchData();
    } catch {
      message.error('操作失败');
    }
  };

  const handleReject = async (userId: number) => {
    Modal.confirm({
      title: '拒绝注册',
      content: <Input.TextArea placeholder="请输入拒绝原因" id="reject-reason" />,
      onOk: async () => {
        const reason = (document.getElementById('reject-reason') as HTMLTextAreaElement)?.value || '不符合要求';
        try {
          await tenantService.rejectRegistration(userId, reason);
          message.success('已拒绝');
          fetchData();
        } catch {
          message.error('操作失败');
        }
      },
    });
  };

  const columns: ColumnsType<TenantUser> = [
    { title: '用户名', dataIndex: 'username', width: 120 },
    { title: '角色', dataIndex: 'roleName', width: 100 },
    {
      title: '注册状态', dataIndex: 'registrationStatus', width: 100, align: 'center',
      render: (s: string) => {
        const map: Record<string, { color: string; text: string }> = {
          PENDING: { color: 'orange', text: '待审批' },
          ACTIVE: { color: 'green', text: '已通过' },
          REJECTED: { color: 'red', text: '已拒绝' },
        };
        const item = map[s] || { color: 'default', text: s };
        return <Tag color={item.color}>{item.text}</Tag>;
      },
    },
    { title: '注册时间', dataIndex: 'createTime', width: 160 },
    {
      title: '操作', key: 'actions', width: 160,
      render: (_: unknown, record: TenantUser) => {
        if (record.registrationStatus !== 'PENDING') return null;
        const actions: RowAction[] = [
          { key: 'approve', label: '通过', primary: true, onClick: () => handleApprove(record.id) },
          { key: 'reject', label: '拒绝', danger: true, onClick: () => handleReject(record.id) },
        ];
        return <RowActions actions={actions} />;
      },
    },
  ];

  return (
    <div>
      <Alert
        message="功能说明"
        description="此页面汇总所有待审批的注册信息：① 工厂入驻申请（新工厂注册）② 成员注册申请（员工通过工厂编码注册）。审批通过后方可登录使用。"
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      {/* 工厂入驻申请 */}
      {isSuperAdmin && (
        <div style={{ marginBottom: 24 }}>
          <Typography.Title level={5} style={{ marginBottom: 12 }}>
            🏭 工厂入驻申请 {tenantApps.length > 0 && <Badge count={tenantApps.length} style={{ marginLeft: 8 }} />}
          </Typography.Title>
          {tenantApps.length > 0 ? (
            <ResizableTable
              storageKey="tenant-application-audit"
              rowKey="id"
              columns={tenantAppColumns}
              dataSource={tenantApps}
              loading={tenantAppsLoading}
              pagination={false}
              size="small"
            />
          ) : (
            <Card size="small" style={{ textAlign: 'center', color: '#999' }}>
              {tenantAppsLoading ? '加载中...' : '暂无待审核的工厂入驻申请'}
            </Card>
          )}
        </div>
      )}

      {/* 成员注册申请 */}
      <div>
        <Typography.Title level={5} style={{ marginBottom: 12 }}>
          👤 成员注册申请 {total > 0 && <Badge count={total} style={{ marginLeft: 8 }} />}
        </Typography.Title>
        <ResizableTable
          storageKey="tenant-registration-audit"
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          pagination={{ current: page, pageSize: 20, total, onChange: setPage }}
          size="small"
        />
      </div>
    </div>
  );
};

// ========== 主页面 ==========
const TenantManagement: React.FC = () => {
  const { user } = useAuth();
  const isSuperAdmin = user?.isSuperAdmin === true || !user?.tenantId;
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'overview';

  return (
    <Layout>
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setSearchParams({ tab: key })}
          items={[
            {
              key: 'overview',
              label: <span><DashboardOutlined /> 集成总览</span>,
              children: <IntegrationOverviewTab />,
            },
            {
              key: 'apps',
              label: <span><ApiOutlined /> 应用管理</span>,
              children: <AppManagementTab />,
            },
            ...(isSuperAdmin ? [{
              key: 'tenants',
              label: <span><CrownOutlined /> 客户管理</span>,
              children: <TenantListTab />,
            }] : []),
            {
              key: 'templates',
              label: <span><SafetyCertificateOutlined /> 角色模板</span>,
              children: <RoleTemplateTab />,
            },
            ...(isSuperAdmin ? [{
              key: 'registrations',
              label: <span><TeamOutlined /> 注册审批</span>,
              children: <RegistrationTab />,
            }] : []),
            {
              key: 'guide',
              label: <span><BookOutlined /> 使用教程</span>,
              children: <IntegrationGuideTab />,
            },
          ]}
        />
    </Layout>
  );
};

export default TenantManagement;
