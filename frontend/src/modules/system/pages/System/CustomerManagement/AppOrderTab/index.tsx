import React, { useState, useCallback, useEffect } from 'react';
import { Button, Select, Space, Alert, Tooltip } from 'antd';
import { ReloadOutlined, BellOutlined, BellFilled } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import { useModal } from '@/hooks';
import { useUser } from '@/utils/AuthContext';
import { appStoreService } from '@/services/system/appStore';
import type { AppOrder } from '@/services/system/appStore';
import request from '@/utils/api';
import { message } from '@/utils/antdStatic';
import { getOrderColumns } from './orderColumns';
import ActivateOrderModal from './ActivateOrderModal';
import ActivateResultModal from './ActivateResultModal';
import NotifyConfigModal from './NotifyConfigModal';

const AppOrderTab: React.FC<{ onOrderActivated?: () => void }> = ({ onOrderActivated }) => {
  const { isSuperAdmin } = useUser();
  const [data, setData] = useState<AppOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [activating, setActivating] = useState(false);
  const [remark, setRemark] = useState('');

  const [notifyConfigured, setNotifyConfigured] = useState(false);
  const [notifyMaskedKey, setNotifyMaskedKey] = useState('');
  const notifyModal = useModal<null>();
  const [serverChanKey, setServerChanKey] = useState('');
  const [savingNotify, setSavingNotify] = useState(false);

  const activateModal = useModal<AppOrder>();
  const resultModal = useModal<any>();

  const fetchData = useCallback(async () => {
    if (!isSuperAdmin) { setData([]); return; }
    setLoading(true);
    try {
      const params = statusFilter ? { status: statusFilter } : undefined;
      const res: any = await appStoreService.adminOrderList(params);
      if (res?.code !== undefined && res.code !== 200) {
        message.error(res.message || '加载订单列表失败');
        setData([]);
        return;
      }
      const list = res?.data ?? res;
      setData(Array.isArray(list) ? list : []);
    } catch {
      message.error('加载订单列表失败');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, isSuperAdmin]);

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
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSavingNotify(false);
    }
  };

  const handleClearNotify = async () => {
    setServerChanKey('');
    await handleSaveNotify();
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
      if (res?.code !== undefined && res.code !== 200) {
        throw new Error(res.message || '激活失败');
      }
      const result = res?.data || res;
      activateModal.close();
      setRemark('');
      await fetchData();
      message.success(`订单 ${order.orderNo} 激活成功`);
      resultModal.open({
        ...result,
        orderNo: result?.orderNo || order?.orderNo || '',
      });
      onOrderActivated?.();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '激活失败');
    } finally {
      setActivating(false);
    }
  };

  const handleOpenActivate = (record: AppOrder) => {
    setRemark('');
    activateModal.open(record);
  };

  const handleCancelActivate = () => {
    activateModal.close();
    setRemark('');
  };

  const columns = getOrderColumns({ onActivate: handleOpenActivate });

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
            { value: 'TRIAL', label: '免费试用（自动激活）' },
            { value: 'PAID', label: '已激活' },
            { value: 'CANCELED', label: '已取消' },
          ]}
        />
        <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>刷新</Button>
        <Tooltip title={notifyConfigured ? `微信通知已开启 (${notifyMaskedKey})` : '未配置微信通知，客户下单后您不会收到提醒'}>
          <Button
            icon={notifyConfigured ? <BellFilled style={{ color: 'var(--color-success)' }} /> : <BellOutlined />}
            onClick={() => { setServerChanKey(''); notifyModal.open(null); }}
          >
            {notifyConfigured ? '通知已开启' : '设置通知'}
          </Button>
        </Tooltip>
        {pendingCount > 0 && (
          <Alert
            title={`有 ${pendingCount} 个待处理订单`}
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
       
        pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 条` }}
        scroll={{ x: 1200 }}
        emptyDescription="暂无数据"
      />

      <ActivateOrderModal
        visible={activateModal.visible}
        order={activateModal.data}
        remark={remark}
        activating={activating}
        onRemarkChange={setRemark}
        onCancel={handleCancelActivate}
        onConfirm={handleActivate}
      />

      <ActivateResultModal
        visible={resultModal.visible}
        data={resultModal.data}
        onClose={() => resultModal.close()}
      />

      <NotifyConfigModal
        visible={notifyModal.visible}
        serverChanKey={serverChanKey}
        notifyConfigured={notifyConfigured}
        notifyMaskedKey={notifyMaskedKey}
        saving={savingNotify}
        onKeyChange={setServerChanKey}
        onCancel={() => notifyModal.close()}
        onSave={handleSaveNotify}
        onClear={handleClearNotify}
      />
    </div>
  );
};

export default AppOrderTab;
