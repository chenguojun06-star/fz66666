import React, { useState, useCallback, useEffect } from 'react';
import { Button, Tag, Space, message, Input, Descriptions, Select, Typography, Alert, Tooltip } from 'antd';import { CheckCircleOutlined, ReloadOutlined, BellOutlined, BellFilled } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import ResizableModal from '@/components/common/ResizableModal';
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';
import { useModal } from '@/hooks';
import { appStoreService } from '@/services/system/appStore';
import type { AppOrder } from '@/services/system/appStore';
import type { ColumnsType } from 'antd/es/table';
import request from '@/utils/api';

const { Text } = Typography;

const ORDER_STATUS: Record<string, { label: string; color: string }> = {
  PENDING: { label: '待处理', color: 'orange' },
  PAID: { label: '已激活', color: 'green' },
  ACTIVATED: { label: '已激活', color: 'green' },
  CANCELED: { label: '已取消', color: 'default' },
  REFUNDED: { label: '已退款', color: 'red' },
};

const SUB_TYPE: Record<string, { label: string; color: string }> = {
  TRIAL: { label: '免费试用', color: 'default' },
  MONTHLY: { label: '月付', color: 'blue' },
  YEARLY: { label: '年付', color: 'gold' },
  PERPETUAL: { label: '永久', color: 'purple' },
};

/**
 * 应用订单管理 Tab（超级管理员）
 * - 查看所有客户提交的应用购买订单
 * - 手动激活待处理订单（创建订阅 + API凭证）
 * - 配置 Server酱微信通知（客户下单后推送到管理员微信）
 */
const AppOrderTab: React.FC<{ onOrderActivated?: () => void }> = ({ onOrderActivated }) => {
  const [data, setData] = useState<AppOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [activating, setActivating] = useState(false);
  const [remark, setRemark] = useState('');

  // 通知配置状态
  const [notifyConfigured, setNotifyConfigured] = useState(false);
  const [notifyMaskedKey, setNotifyMaskedKey] = useState('');
  const notifyModal = useModal<null>();
  const [serverChanKey, setServerChanKey] = useState('');
  const [savingNotify, setSavingNotify] = useState(false);

  const activateModal = useModal<AppOrder>();
  const resultModal = useModal<any>();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = statusFilter ? { status: statusFilter } : undefined;
      const res: any = await appStoreService.adminOrderList(params);
      setData(res?.data || res || []);
    } catch {
      message.error('加载订单列表失败');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  const fetchNotifyConfig = useCallback(async () => {
    try {
      const res: any = await request.get('/system/app-store/admin/notify-config');
      const d = res?.data || res;
      setNotifyConfigured(d?.configured || false);
      setNotifyMaskedKey(d?.maskedKey || '');
    } catch { /* 忽略 */ }
  }, []);

  useEffect(() => { fetchData(); fetchNotifyConfig(); }, [fetchData, fetchNotifyConfig]);

  const handleSaveNotify = async () => {
    setSavingNotify(true);
    try {
      await request.post('/system/app-store/admin/notify-config', { serverChanKey });
      message.success(serverChanKey ? '通知配置已保存，客户下单后将推送到您的微信' : '已清除通知配置');
      notifyModal.close();
      setServerChanKey('');
      fetchNotifyConfig();
    } catch (e: any) {
      message.error(e?.message || '保存失败');
    } finally {
      setSavingNotify(false);
    }
  };

  const handleActivate = async () => {
    const order = activateModal.data;
    if (!order) return;
    setActivating(true);
    try {
      const res: any = await appStoreService.adminActivateOrder({
        orderId: order.id,
        remark: remark || undefined,
      });
      const result = res?.data || res;
      message.success(`订单 ${order.orderNo} 激活成功`);
      activateModal.close();
      setRemark('');
      resultModal.open(result);
      fetchData();
      // 通知父组件刷新待处理数量（清除红点）
      onOrderActivated?.();
    } catch (e: any) {
      message.error(e?.message || '激活失败');
    } finally {
      setActivating(false);
    }
  };

  const columns: ColumnsType<AppOrder> = [
    {
      title: '订单号',
      dataIndex: 'orderNo',
      width: 160,
      render: (v: string) => <Text copyable={{ text: v }}>{v}</Text>,
    },
    {
      title: '客户名称',
      dataIndex: 'tenantName',
      width: 140,
      ellipsis: true,
    },
    {
      title: '应用名称',
      dataIndex: 'appName',
      width: 140,
      ellipsis: true,
    },
    {
      title: '订阅类型',
      dataIndex: 'subscriptionType',
      width: 100,
      render: (v: string) => {
        const s = SUB_TYPE[v] || { label: v, color: 'default' };
        return <Tag color={s.color}>{s.label}</Tag>;
      },
    },
    {
      title: '金额',
      dataIndex: 'actualAmount',
      width: 100,
      render: (v: number) => v != null ? <Text strong>¥{Number(v).toFixed(2)}</Text> : '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (v: string) => {
        const s = ORDER_STATUS[v] || { label: v, color: 'default' };
        return <Tag color={s.color}>{s.label}</Tag>;
      },
    },
    {
      title: '联系人',
      dataIndex: 'contactName',
      width: 100,
      ellipsis: true,
      render: (name: string, record: AppOrder) =>
        name ? <span>{name}{record.contactPhone ? ` / ${record.contactPhone}` : ''}</span> : '-',
    },
    {
      title: '下单时间',
      dataIndex: 'createTime',
      width: 160,
    },
    {
      title: '支付时间',
      dataIndex: 'paymentTime',
      width: 160,
      render: (v: string) => v || '-',
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      fixed: 'right',
      render: (_: any, record: AppOrder) => {
        const actions: RowAction[] = [];
        if (record.status === 'PENDING') {
          actions.push({
            key: 'activate',
            label: '激活开通',
            primary: true,
            onClick: () => {
              setRemark('');
              activateModal.open(record);
            },
          });
        }
        if (actions.length === 0) {
          return <Text type="secondary">已处理</Text>;
        }
        return <RowActions actions={actions} />;
      },
    },
  ];

  const pendingCount = data.filter(d => d.status === 'PENDING').length;

  return (
    <div>
      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          value={statusFilter}
          onChange={setStatusFilter}
          style={{ width: 140 }}
          options={[
            { value: '', label: '全部状态' },
            { value: 'PENDING', label: `待处理${pendingCount > 0 ? ` (${pendingCount})` : ''}` },
            { value: 'PAID', label: '已激活' },
            { value: 'CANCELED', label: '已取消' },
          ]}
        />
        <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>刷新</Button>
        <Tooltip title={notifyConfigured ? `微信通知已开启 (${notifyMaskedKey})` : '未配置微信通知，客户下单后您不会收到提醒'}>
          <Button
            icon={notifyConfigured ? <BellFilled style={{ color: '#52c41a' }} /> : <BellOutlined />}
            onClick={() => { setServerChanKey(''); notifyModal.open(null); }}
          >
            {notifyConfigured ? '通知已开启' : '设置通知'}
          </Button>
        </Tooltip>
        {pendingCount > 0 && (
          <Alert
            message={`有 ${pendingCount} 个待处理订单`}
            type="warning"
            showIcon
            banner
            style={{ padding: '4px 12px' }}
          />
        )}
      </Space>

      <ResizableTable
        dataSource={data}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="small"
        pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 条` }}
        scroll={{ x: 1200 }}
      />

      {/* 激活确认弹窗 */}
      <ResizableModal
        title="激活订单"
        open={activateModal.visible}
        onCancel={() => { activateModal.close(); setRemark(''); }}
        defaultWidth="40vw"
        defaultHeight="50vh"
        footer={
          <Space>
            <Button onClick={() => { activateModal.close(); setRemark(''); }}>取消</Button>
            <Button type="primary" icon={<CheckCircleOutlined />} loading={activating} onClick={handleActivate}>
              确认激活
            </Button>
          </Space>
        }
      >
        {activateModal.data && (
          <>
            <Alert
              message="激活后将自动为客户创建订阅和API凭证，请确认已收到付款。"
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
            />
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="订单号">{activateModal.data.orderNo}</Descriptions.Item>
              <Descriptions.Item label="客户">{activateModal.data.tenantName}</Descriptions.Item>
              <Descriptions.Item label="应用">{activateModal.data.appName}</Descriptions.Item>
              <Descriptions.Item label="订阅类型">
                <Tag color={SUB_TYPE[activateModal.data.subscriptionType]?.color}>
                  {SUB_TYPE[activateModal.data.subscriptionType]?.label || activateModal.data.subscriptionType}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="实付金额">
                <Text strong style={{ color: 'var(--primary-color)' }}>
                  ¥{Number(activateModal.data.actualAmount).toFixed(2)}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="联系人">
                {activateModal.data.contactName || '-'} / {activateModal.data.contactPhone || '-'}
              </Descriptions.Item>
              {activateModal.data.companyName && (
                <Descriptions.Item label="公司名称">{activateModal.data.companyName}</Descriptions.Item>
              )}
            </Descriptions>
            <div style={{ marginTop: 16 }}>
              <Text>备注（可选）：</Text>
              <Input.TextArea
                rows={2}
                placeholder="如：已收到转账 / 线下签约确认"
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                style={{ marginTop: 8 }}
              />
            </div>
          </>
        )}
      </ResizableModal>

      {/* 激活成功结果弹窗 */}
      <ResizableModal
        title="激活成功"
        open={resultModal.visible}
        onCancel={() => resultModal.close()}
        defaultWidth="40vw"
        defaultHeight="50vh"
        footer={<Button type="primary" onClick={() => resultModal.close()}>知道了</Button>}
      >
        {resultModal.data && (
          <>
            <Alert message="订单已激活成功，客户可以开始使用应用了。" type="success" showIcon style={{ marginBottom: 16 }} />
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="订单号">{resultModal.data.orderNo}</Descriptions.Item>
              <Descriptions.Item label="激活时间">{resultModal.data.activatedAt}</Descriptions.Item>
              <Descriptions.Item label="到期时间">{resultModal.data.expireAt}</Descriptions.Item>
            </Descriptions>
            {resultModal.data.apiCredentials && (
              <div style={{ marginTop: 16 }}>
                <Text strong>API 凭证（请妥善保管）：</Text>
                <Descriptions column={1} bordered size="small" style={{ marginTop: 8 }}>
                  <Descriptions.Item label="App Key">
                    <Typography.Paragraph copyable style={{ marginBottom: 0 }}>{resultModal.data.apiCredentials.appKey}</Typography.Paragraph>
                  </Descriptions.Item>
                  <Descriptions.Item label="App Secret">
                    <Typography.Paragraph copyable style={{ marginBottom: 0 }}>{resultModal.data.apiCredentials.appSecret}</Typography.Paragraph>
                  </Descriptions.Item>
                </Descriptions>
              </div>
            )}
          </>
        )}
      </ResizableModal>

      {/* Server酱微信通知配置弹窗 */}
      <ResizableModal
        title="配置微信通知"
        open={notifyModal.visible}
        onCancel={() => notifyModal.close()}
        defaultWidth="40vw"
        defaultHeight="50vh"
        footer={
          <Space>
            <Button onClick={() => notifyModal.close()}>取消</Button>
            <Button
              onClick={() => { setServerChanKey(''); handleSaveNotify(); }}
              danger
              disabled={!notifyConfigured}
            >
              清除通知
            </Button>
            <Button type="primary" loading={savingNotify} onClick={handleSaveNotify} disabled={!serverChanKey}>
              保存
            </Button>
          </Space>
        }
      >
        <Alert
          message="配置后，每当客户在应用商店提交购买订单，系统自动推送微信通知到您的手机。"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <div style={{ marginBottom: 12 }}>
          <Text strong>获取 Server酱 SendKey：</Text>
          <ol style={{ marginTop: 8, paddingLeft: 20, fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 2 }}>
            <li>用微信扫码登录 <a href="https://sct.ftqq.com/" target="_blank" rel="noreferrer">sct.ftqq.com</a></li>{/* cspell:disable-line */}
            <li>点击「SendKey」复制您的专属Key</li>
            <li>粘贴到下方输入框保存</li>
          </ol>
        </div>
        {notifyConfigured && (
          <Alert
            message={`当前已配置：${notifyMaskedKey}`}
            type="success"
            showIcon
            style={{ marginBottom: 12 }}
          />
        )}
        <Input
          placeholder="粘贴您的 Server酱 SendKey（如：SCT123456789...）"
          value={serverChanKey}
          onChange={e => setServerChanKey(e.target.value)}
          allowClear
        />
      </ResizableModal>
    </div>
  );
};

export default AppOrderTab;
