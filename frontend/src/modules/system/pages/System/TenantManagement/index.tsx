import React, { useState, useEffect, useCallback } from 'react';
import { Tabs, Button, Tag, Space, message, Input, Modal, Select, Card, Statistic, Row, Col, Typography, Descriptions, Badge, Tooltip, Timeline, Empty } from 'antd';
import { SafetyCertificateOutlined, ApiOutlined, CopyOutlined, StopOutlined, PlayCircleOutlined, CodeOutlined, DashboardOutlined, LinkOutlined, CheckCircleOutlined, SwapOutlined, EyeOutlined, BookOutlined, ShopOutlined, EditOutlined, SaveOutlined, CloseOutlined } from '@ant-design/icons';
import { useAuth } from '@/utils/AuthContext';
import ResizableTable from '@/components/common/ResizableTable';
import IntegrationGuideTab from './IntegrationGuideTab';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '@/components/Layout';
import ResizableModal from '@/components/common/ResizableModal';
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';
import { useModal } from '@/hooks';

import tenantService from '@/services/tenantService';
import tenantAppService from '@/services/tenantAppService';
import type { TenantAppInfo, TenantAppLogInfo, IntegrationOverview, IntegrationModuleInfo } from '@/services/tenantAppService';
import type { RoleTemplate } from '@/services/tenantService';
import type { ColumnsType } from 'antd/es/table';

const { Text } = Typography;

// ========== 应用类型配置 ==========
const APP_TYPE_CONFIG: Record<string, { label: string; color: string; icon: string; description: string }> = {
  ORDER_SYNC:       { label: '下单对接',       color: 'var(--color-primary)', icon: '📦', description: '客户ERP系统直接下达生产订单，实时查询订单进度' },
  QUALITY_FEEDBACK: { label: '质检反馈',       color: 'var(--color-success)', icon: '✅', description: '质检完成后自动推送结果到客户系统，支持Webhook回调' },
  LOGISTICS_SYNC:   { label: '物流对接',       color: 'var(--color-info)',    icon: '🚚', description: '出库发货时自动同步物流信息到客户系统' },
  PAYMENT_SYNC:     { label: '付款对接',       color: 'var(--color-warning)', icon: '💰', description: '对账单推送、付款确认，与客户支付系统双向对接' },
  MATERIAL_SUPPLY:  { label: '面辅料供应对接', color: '#13c2c2',              icon: '🧵', description: '面辅料供应商系统直接同步采购、入库数据' },
  DATA_IMPORT:      { label: '数据导入',       color: '#722ed1',              icon: '📊', description: '批量导入生产订单、工序、库存等数据，开通即用' },
  EC_TAOBAO:        { label: '淘宝对接',       color: '#ff4500',              icon: '🛒', description: '淘宝平台订单自动同步到生产系统' },
  EC_TMALL:         { label: '天猫对接',       color: '#ff2d2d',              icon: '🏪', description: '天猫旗舰店订单实时同步，支持SKU映射' },
  EC_JD:            { label: '京东对接',       color: '#e1251b',              icon: '🏬', description: '京东平台订单自动同步，支持物流回传' },
  EC_DOUYIN:        { label: '抖音对接',       color: '#000000',              icon: '🎵', description: '抖音小店订单实时接入，直播售卖自动下单' },
  EC_PINDUODUO:     { label: '拼多多对接',     color: '#e02e24',              icon: '🛍️', description: '拼多多平台订单同步，支持多规格SKU' },
  EC_XIAOHONGSHU:   { label: '小红书对接',     color: '#fe2c55',              icon: '📕', description: '小红书商城订单同步，种草转化直连生产' },
  EC_WECHAT_SHOP:   { label: '微信小店对接',   color: '#07c160',              icon: '💬', description: '微信小店/视频号订单直接推送生产系统' },
  EC_SHOPIFY:       { label: 'Shopify对接',    color: '#96bf48',              icon: '🌐', description: '跨境Shopify店铺订单自动同步，支持多货币' },
};

// ========== 集成总览 Tab ==========
const MODULE_ICONS: Record<string, { icon: string; color: string; bgColor: string }> = {
  ORDER_SYNC:       { icon: '📦', color: 'var(--color-primary)', bgColor: 'rgba(45, 127, 249, 0.1)' },
  QUALITY_FEEDBACK: { icon: '✅', color: 'var(--color-success)', bgColor: 'rgba(34, 197, 94, 0.15)' },
  LOGISTICS_SYNC:   { icon: '🚚', color: 'var(--color-info)',    bgColor: 'rgba(114, 46, 209, 0.1)' },
  PAYMENT_SYNC:     { icon: '💰', color: 'var(--color-warning)', bgColor: 'rgba(250, 140, 22, 0.1)' },
  MATERIAL_SUPPLY:  { icon: '🧵', color: '#13c2c2',              bgColor: 'rgba(19, 194, 194, 0.1)' },
  DATA_IMPORT:      { icon: '📊', color: '#722ed1',              bgColor: 'rgba(114, 46, 209, 0.1)' },
  EC_TAOBAO:        { icon: '🛒', color: '#ff4500',              bgColor: 'rgba(255, 69, 0, 0.1)' },
  EC_TMALL:         { icon: '🏪', color: '#ff2d2d',              bgColor: 'rgba(255, 45, 45, 0.1)' },
  EC_JD:            { icon: '🏬', color: '#e1251b',              bgColor: 'rgba(225, 37, 27, 0.1)' },
  EC_DOUYIN:        { icon: '🎵', color: '#333333',              bgColor: 'rgba(0,0,0,0.06)' },
  EC_PINDUODUO:     { icon: '🛍️', color: '#e02e24',              bgColor: 'rgba(224, 46, 36, 0.1)' },
  EC_XIAOHONGSHU:   { icon: '📕', color: '#fe2c55',              bgColor: 'rgba(254, 44, 85, 0.1)' },
  EC_WECHAT_SHOP:   { icon: '💬', color: '#07c160',              bgColor: 'rgba(7, 193, 96, 0.1)' },
  EC_SHOPIFY:       { icon: '🌐', color: '#96bf48',              bgColor: 'rgba(150, 191, 72, 0.1)' },
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
  const detailModal = useModal<TenantAppInfo>();
  const logModal = useModal<TenantAppInfo>();
  const [selectedApp, setSelectedApp] = useState<TenantAppInfo | null>(null);
  const [logs, setLogs] = useState<TenantAppLogInfo[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsLoading, setLogsLoading] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const navigate = useNavigate();
  const { user } = useAuth();
  const isSuperAdmin = user?.isSuperAdmin === true;



  // 行内编辑URL状态（列表行）
  const [editingUrlId, setEditingUrlId] = useState<string | null>(null);
  const [editingUrlField, setEditingUrlField] = useState<'callbackUrl' | 'externalApiUrl' | null>(null);
  const [editingUrlValue, setEditingUrlValue] = useState('');
  const [_savingUrl, setSavingUrl] = useState(false);

  // 详情弹窗行内编辑URL状态
  const [detailEditCallbackUrl, setDetailEditCallbackUrl] = useState('');
  const [detailEditExternalApiUrl, setDetailEditExternalApiUrl] = useState('');
  const [savingDetailUrl, setSavingDetailUrl] = useState(false);

  const fetchApps = useCallback(async (autoActivate = false) => {
    setLoading(true);
    try {
      const res: any = await tenantAppService.listApps(queryParams);
      if (res?.code !== undefined && res.code !== 200) {
        message.error(res.message || '加载应用列表失败');
        setApps([]);
        setTotal(0);
        return;
      }
      const d = res?.data ?? res;
      const records: TenantAppInfo[] = d?.records || [];
      setApps(records);
      setTotal(d?.total || 0);

      // 超管：自动开通所有未开通的对接类型
      if (autoActivate && isSuperAdmin) {
        const activated = new Set(records.map((a: TenantAppInfo) => a.appType));
        const missing = Object.entries(APP_TYPE_CONFIG).filter(([k]) => !activated.has(k));
        if (missing.length > 0) {
          await Promise.all(missing.map(([type, cfg]) =>
            tenantAppService.createApp({ appName: `${cfg.label}对接`, appType: type }).catch(() => null)
          ));
          // 重新加载列表（不再触发autoActivate）
          const res2: any = await tenantAppService.listApps(queryParams);
          const d2 = res2?.data ?? res2;
          setApps(d2?.records || []);
          setTotal(d2?.total || 0);
        }
      }
    } catch {
      message.error('加载应用列表失败');
    } finally {
      setLoading(false);
    }
  }, [queryParams, isSuperAdmin]);

  const fetchStats = useCallback(async () => {
    try {
      const res: any = await tenantAppService.getStats();
      setStats(res?.data || res || { total: 0, active: 0, disabled: 0, totalCalls: 0 });
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchApps(true); fetchStats(); }, [fetchApps, fetchStats]);

  // 行内保存URL
  const handleSaveUrl = async () => {
    if (!editingUrlId || !editingUrlField) return;
    setSavingUrl(true);
    try {
      await tenantAppService.updateApp(editingUrlId, { [editingUrlField]: editingUrlValue });
      message.success('地址已保存');
      setEditingUrlId(null);
      setEditingUrlField(null);
      fetchApps();
    } catch {
      message.error('保存失败');
    } finally {
      setSavingUrl(false);
    }
  };

  const startEditUrl = (record: TenantAppInfo, field: 'callbackUrl' | 'externalApiUrl') => {
    setEditingUrlId(record.id);
    setEditingUrlField(field);
    setEditingUrlValue((record as any)[field] || '');
  };

  const cancelEditUrl = () => {
    setEditingUrlId(null);
    setEditingUrlField(null);
    setEditingUrlValue('');
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
      okButtonProps: { danger: true, type: 'default' },
      onOk: async () => {
        try {
          const res: any = await tenantAppService.resetSecret(record.id);
          const data = res?.data || res;
          setNewSecret(data?.appSecret || null);
          setSelectedApp(data);
          setDetailEditCallbackUrl(data?.callbackUrl || '');
          setDetailEditExternalApiUrl(data?.externalApiUrl || '');
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
      okButtonProps: { danger: true, type: 'default' },
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
      setDetailEditCallbackUrl(data?.callbackUrl || '');
      setDetailEditExternalApiUrl(data?.externalApiUrl || '');
      detailModal.open(data);
    } catch {
      message.error('加载详情失败');
    }
  };

  const handleSaveDetailUrls = async () => {
    if (!selectedApp) return;
    setSavingDetailUrl(true);
    try {
      await tenantAppService.updateApp(selectedApp.id, {
        callbackUrl: detailEditCallbackUrl || undefined,
        externalApiUrl: detailEditExternalApiUrl || undefined,
      });
      message.success('配置已保存');
      setSelectedApp(prev => prev ? { ...prev, callbackUrl: detailEditCallbackUrl, externalApiUrl: detailEditExternalApiUrl } : prev);
      fetchApps();
    } catch {
      message.error('保存失败');
    } finally {
      setSavingDetailUrl(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    message.success('已复制到剪贴板');
  };



  const columns: ColumnsType<TenantAppInfo> = [
    {
      title: '应用', dataIndex: 'appName', width: 180,
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
      title: 'AppKey', dataIndex: 'appKey', width: 200,
      render: (key: string) => (
        <Space>
          <Text code style={{ fontSize: 12 }}>{key}</Text>
          <Tooltip title="复制"><CopyOutlined style={{ cursor: 'pointer', color: 'var(--color-primary)' }} onClick={() => copyToClipboard(key)} /></Tooltip>
        </Space>
      ),
    },
    {
      title: '配置状态', key: 'configStatus', width: 90, align: 'center',
      render: (_: unknown, record: TenantAppInfo) => {
        const hasUrl = !!(record.callbackUrl || record.externalApiUrl);
        return (
          <Tooltip title={hasUrl ? '已配置接口地址' : '未配置接口地址，点击操作列编辑'}>
            <Tag color={hasUrl ? 'success' : 'warning'} style={{ fontSize: 11 }}>
              {hasUrl ? '✓ 已配置' : '⚙ 待配置'}
            </Tag>
          </Tooltip>
        );
      },
    },
    {
      title: '回调地址', key: 'callbackUrl', width: 220,
      render: (_: unknown, record: TenantAppInfo) => {
        if (editingUrlId === record.id && editingUrlField === 'callbackUrl') {
          return (
            <Space size={4}>
              <Input size="small" value={editingUrlValue} onChange={e => setEditingUrlValue(e.target.value)}
                placeholder="https://..." style={{ width: 150, fontSize: 11 }} />
              <SaveOutlined style={{ cursor: 'pointer', color: 'var(--color-success)' }} onClick={handleSaveUrl} />
              <CloseOutlined style={{ cursor: 'pointer', color: 'var(--color-danger)' }} onClick={cancelEditUrl} />
            </Space>
          );
        }
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {record.callbackUrl ? (
              <Text style={{ fontSize: 11 }} ellipsis={{ tooltip: record.callbackUrl }}>{record.callbackUrl}</Text>
            ) : (
              <Text type="secondary" style={{ fontSize: 11 }}>未配置</Text>
            )}
            <EditOutlined style={{ cursor: 'pointer', color: 'var(--color-primary)', fontSize: 11, flexShrink: 0 }}
              onClick={() => startEditUrl(record, 'callbackUrl')} />
          </div>
        );
      },
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
        <Button type="primary" icon={<ShopOutlined />} onClick={() => navigate('/system/app-store')}>
            去应用商店开通
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

      {/* 应用详情弹窗 */}
      <ResizableModal
        open={detailModal.visible}
        title={`应用详情 - ${selectedApp?.appName || ''}`}
        onCancel={() => { detailModal.close(); setNewSecret(null); }}
        width="60vw"
        footer={
          <Space>
            <Button onClick={() => { detailModal.close(); setNewSecret(null); }}>关闭</Button>
            <Button type="primary" loading={savingDetailUrl} onClick={handleSaveDetailUrls}>
              保存配置
            </Button>
          </Space>
        }
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
              <Descriptions.Item label="回调地址" span={2}>
                <Space.Compact style={{ width: '100%' }}>
                  <Input
                    value={detailEditCallbackUrl}
                    onChange={e => setDetailEditCallbackUrl(e.target.value)}
                    placeholder="https://your-domain.com/webhook（我们主动推送数据到此地址）"
                    style={{ fontSize: 12 }}
                  />
                </Space.Compact>
              </Descriptions.Item>
              <Descriptions.Item label="客户API" span={2}>
                <Space.Compact style={{ width: '100%' }}>
                  <Input
                    value={detailEditExternalApiUrl}
                    onChange={e => setDetailEditExternalApiUrl(e.target.value)}
                    placeholder="https://your-domain.com/api（系统主动调用客户系统时使用）"
                    style={{ fontSize: 12 }}
                  />
                </Space.Compact>
              </Descriptions.Item>
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


// ========== 角色模板 Tab ==========
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

// ========== 主页面 ==========
const TenantManagement: React.FC = () => {
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
          {
            key: 'templates',
            label: <span><SafetyCertificateOutlined /> 角色模板</span>,
            children: <RoleTemplateTab />,
          },
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
