import React, { useCallback, useState } from 'react';
import { Button, Input, Space, message } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import api from '@/utils/api';

interface OrderPickerModalProps {
  open: boolean;
  isMobile: boolean;
  onClose: () => void;
  onPickOrder: (order: any) => void;
}

const OrderPickerModal: React.FC<OrderPickerModalProps> = ({ open, isMobile, onClose, onPickOrder }) => {
  const [keyword, setKeyword] = useState('');
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearchOrders = useCallback(async () => {
    if (!keyword.trim()) { message.warning('请输入订单号或款号'); return; }
    setLoading(true);
    try {
      const res = await api.get('/production/order/list', {
        params: { page: 1, pageSize: 20, keyword: keyword.trim() },
      });
      const records = res?.code === 200 ? (res?.data?.records || []) : [];
      setList(records);
    } catch { setList([]); }
    finally { setLoading(false); }
  }, [keyword]);

  const handlePickOrder = useCallback((order: any) => {
    onPickOrder(order);
  }, [onPickOrder]);

  return (
    <ResizableModal
      title="选择订单 — 新增物料采购"
      open={open}
      onCancel={onClose}
      width={isMobile ? '96vw' : 900}
      footer={null}
    >
      <Space orientation="vertical" style={{ width: '100%' }} size={12}>
        <div style={{ color: 'var(--color-text-secondary)', fontSize: 13, lineHeight: 1.6 }}>
          选择一个生产订单，进入该订单的物料采购详情页，可编辑面辅料信息、采购到货、回料确认等操作。
        </div>
        <Space>
          <Input
            placeholder="输入订单号或款号搜索"
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            onPressEnter={handleSearchOrders}
            style={{ width: 320 }}
            allowClear
          />
          <Button type="primary" onClick={handleSearchOrders} loading={loading}>搜索</Button>
        </Space>
        <ResizableTable
          rowKey="id"
          dataSource={list}
          loading={loading}
          pagination={false}
          size="small"
          scroll={{ x: 720, y: 400 }}
          emptyDescription="暂无生产订单"
          columns={[
            { title: '订单号', dataIndex: 'orderNo', width: 180 },
            { title: '款号', dataIndex: 'styleNo', width: 120 },
            { title: '款名', dataIndex: 'styleName', width: 160, ellipsis: true },
            { title: '颜色', dataIndex: 'color', width: 100 },
            { title: '下单数量', dataIndex: 'orderQuantity', width: 100, align: 'right' as const },
            {
              title: '操作', width: 80, fixed: 'right' as const,
              render: (_: any, record: any) => (
                <Button type="link" size="small" onClick={() => handlePickOrder(record)}>选择</Button>
              ),
            },
          ]}
        />
      </Space>
    </ResizableModal>
  );
};

export default OrderPickerModal;
