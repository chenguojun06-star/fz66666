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
  // D-242：分批收货——已收数量、剩余待收数量一并展示，输入上限改为剩余待收
  const alreadyReceived = record?.receivedQuantity ?? 0;
  const shipQty = record?.shipQuantity ?? 0;
  const remaining = Math.max(0, shipQty - alreadyReceived);

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
            <Descriptions.Item label="发货数量">{shipQty} 件</Descriptions.Item>
            {alreadyReceived > 0 && (
              <Descriptions.Item label="已收数量">{alreadyReceived} 件</Descriptions.Item>
            )}
            <Descriptions.Item label="本次待收">
              <span style={{ color: 'var(--color-warning-deep)', fontWeight: 600 }}>
                {remaining} 件
              </span>
            </Descriptions.Item>
          </Descriptions>
          <div style={{ marginTop: 16 }}>
            <div style={{ marginBottom: 8, fontWeight: 500 }}>本次到货数量（点货数量）</div>
            <InputNumber
              value={receiveQty}
              min={1}
              max={remaining}
              onChange={val => onReceiveQtyChange(Number(val) || 0)}
              style={{ width: '100%' }}
              suffix="件"
            />
            <div style={{ marginTop: 4, fontSize: 14, color: 'var(--color-text-tertiary)' }}>
              {alreadyReceived > 0
                ? `该发货单共发 ${shipQty} 件，已收 ${alreadyReceived} 件，本次最多可收 ${remaining} 件`
                : '默认等于发货数量，如实际到货数量不同请修改'}
            </div>
          </div>
        </div>
      )}
    </ResizableModal>
  );
};

export default ReceiveModal;
