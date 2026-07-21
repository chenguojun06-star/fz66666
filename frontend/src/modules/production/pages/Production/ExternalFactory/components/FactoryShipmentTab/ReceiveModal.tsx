import React from 'react';
import { Descriptions, InputNumber } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import type { ReceiveModalProps } from './types';

/**
 * 收货确认弹窗：展示发货信息 + 输入实际到货数量
 */
const ReceiveModal: React.FC<ReceiveModalProps> = ({
  open,
  loading,
  record,
  receiveQty,
  onCancel,
  onOk,
  onReceiveQtyChange,
}) => {
  return (
    <ResizableModal
      title="确认收货"
      open={open}
      onCancel={onCancel}
      onOk={onOk}
      confirmLoading={loading}
      width="30vw"
    >
      {record && (
        <div style={{ padding: '8px 0' }}>
          <Descriptions column={1} bordered>
            <Descriptions.Item label="发货单号">{record.shipmentNo}</Descriptions.Item>
            <Descriptions.Item label="订单号">{record.orderNo}</Descriptions.Item>
            <Descriptions.Item label="款号">{record.styleNo}</Descriptions.Item>
            <Descriptions.Item label="工厂">{record.factoryName || '-'}</Descriptions.Item>
            <Descriptions.Item label="发货数量">{record.shipQuantity} 件</Descriptions.Item>
          </Descriptions>
          <div style={{ marginTop: 16 }}>
            <div style={{ marginBottom: 8, fontWeight: 500 }}>实际到货数量（点货数量）</div>
            <InputNumber
              value={receiveQty}
              min={1}
              max={record.shipQuantity}
              onChange={val => onReceiveQtyChange(Number(val) || 0)}
              style={{ width: '100%' }}
              suffix="件"
            />
            <div style={{ marginTop: 4, fontSize: 14, color: 'var(--color-text-tertiary)' }}>
              默认等于发货数量，如实际到货数量不同请修改
            </div>
          </div>
        </div>
      )}
    </ResizableModal>
  );
};

export default ReceiveModal;
