import React from 'react';
import { App, AutoComplete, Space, Typography } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import api from '@/utils/api';

interface SyncProcessPriceModalProps {
  open: boolean;
  styleNoOptions: Array<{ value: string; label: string }>;
  onCancel: () => void;
  onSearch: (keyword: string) => void;
}

const SyncProcessPriceModal: React.FC<SyncProcessPriceModalProps> = ({
  open,
  styleNoOptions,
  onCancel,
  onSearch,
}) => {
  const { message } = App.useApp();
  const [syncPriceStyleNo, setSyncPriceStyleNo] = React.useState('');
  const [syncPriceLoading, setSyncPriceLoading] = React.useState(false);

  // 关闭时重置状态
  const handleCancel = () => {
    setSyncPriceStyleNo('');
    onCancel();
  };

  const handleOk = async () => {
    const sn = syncPriceStyleNo.trim();
    if (!sn) { message.error('请输入款号'); return; }
    setSyncPriceLoading(true);
    try {
      const res = await api.post<{ code: number; message: string; data?: Record<string, unknown> }>(
        '/template-library/sync-process-prices',
        { styleNo: sn }
      );
      if (res.code === 200) {
        const d = res.data as any;
        message.success(`同步完成：${d?.totalOrders ?? 0}个订单，共更新 ${d?.totalSynced ?? 0} 条工序单价`);
        handleCancel();
      } else {
        message.error(res.message || '同步失败');
      }
    } catch {
      message.error('同步失败');
    } finally {
      setSyncPriceLoading(false);
    }
  };

  return (
    <ResizableModal
      open={open}
      title="按款号更新工序进度单价"
      width={400}
      centered
      onCancel={handleCancel}
      okText="开始同步"
      confirmLoading={syncPriceLoading}
      onOk={handleOk}
      initialHeight={260}
    >
      <Space direction="vertical" style={{ width: '100%', padding: '8px 0' }}>
        <Typography.Text type="secondary">
          输入款号，自动将模板库配置的工序单价同步到该款号下所有大货生产订单。
        </Typography.Text>
        <AutoComplete
          value={syncPriceStyleNo}
          style={{ width: '100%' }}
          placeholder="输入或选择款号"
          options={styleNoOptions}
          onSearch={onSearch}
          onChange={(v) => setSyncPriceStyleNo(String(v || ''))}
          allowClear
        />
      </Space>
    </ResizableModal>
  );
};

export default SyncProcessPriceModal;
