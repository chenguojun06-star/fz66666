import React from 'react';
import { Button, Tag, Space, Input, Card, Statistic, Row, Col, Typography, Descriptions, Badge, Tooltip, Select } from 'antd';
import { ApiOutlined, CopyOutlined, StopOutlined, PlayCircleOutlined, CodeOutlined, ShopOutlined, EditOutlined, SaveOutlined, CloseOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import ResizableTable from '@/components/common/ResizableTable';
import ResizableModal from '@/components/common/ResizableModal';
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';
import type { TenantAppInfo, TenantAppLogInfo } from '@/services/tenantAppService';
import type { ColumnsType } from 'antd/es/table';
import { useAppManagement } from '../hooks/useAppManagement';
import { APP_TYPE_CONFIG } from '../constants';

const { Text } = Typography;

const AppManagementTab: React.FC = () => {
  const navigate = useNavigate();
  const {
    apps, total, loading, stats, queryParams, setQueryParams,
    detailModal, logModal, selectedApp, logs, logsTotal, logsLoading, newSecret, setNewSecret,
    editingUrlId, editingUrlField, editingUrlValue, setEditingUrlValue,
    detailEditCallbackUrl, setDetailEditCallbackUrl,
    detailEditExternalApiUrl, setDetailEditExternalApiUrl, savingDetailUrl,
    handleSaveUrl, startEditUrl, cancelEditUrl,
    handleToggleStatus, handleResetSecret, handleDelete, handleViewLogs,
    handleViewDetail, handleSaveDetailUrls, copyToClipboard,
  } = useAppManagement();

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
              {hasUrl ? ' 已配置' : ' 待配置'}
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
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Card size="small"><Statistic title="应用总数" value={stats.total} prefix={<ApiOutlined />} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="运行中" value={stats.active} styles={{ content: { color: 'var(--color-success)' } }} prefix={<PlayCircleOutlined />} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="已停用" value={stats.disabled} styles={{ content: { color: 'var(--color-danger)' } }} prefix={<StopOutlined />} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="总调用次数" value={stats.totalCalls} prefix={<CodeOutlined />} /></Card></Col>
      </Row>

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
      <ResizableModal
        open={detailModal.visible}
        title={`应用详情 - ${selectedApp?.appName || ''}`}
        onCancel={() => { detailModal.close(); setNewSecret(null); }}
        width="60vw"
        initialHeight={Math.round(window.innerHeight * 0.82)}
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
                <div style={{ fontWeight: 700, color: 'var(--color-warning)', marginBottom: 8 }}> 请妥善保管以下密钥（仅显示一次）</div>
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
            {selectedApp.exampleSnippet && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}> 接入示例</div>
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

      <ResizableModal
        open={logModal.visible}
        title={`调用日志 - ${selectedApp?.appName || ''}`}
        onCancel={logModal.close}
        width="60vw"
        initialHeight={Math.round(window.innerHeight * 0.82)}
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
        />
      </ResizableModal>
    </div>
  );
};

export default AppManagementTab;
