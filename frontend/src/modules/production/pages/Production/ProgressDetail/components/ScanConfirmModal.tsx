import React from 'react';
import { Button, Modal } from 'antd';

type ScanConfirmDetail = {
  scanCode?: string;
  quantity?: number | string;
  progressStage?: string;
  processName?: string;
  unitPrice?: number | string;
  orderNo?: string;
  styleNo?: string;
  color?: string;
  size?: string;
};

type ScanConfirmModalProps = {
  open: boolean;
  loading: boolean;
  remain: number;
  detail?: ScanConfirmDetail | null;
  onCancel: () => void;
  onSubmit: () => void;
};

const ScanConfirmModal: React.FC<ScanConfirmModalProps> = ({
  open,
  loading,
  remain,
  detail,
  onCancel,
  onSubmit,
}) => (
  <Modal
    title="扫码确认"
    open={open}
    onCancel={onCancel}
    footer={[
      <Button key="cancel" onClick={onCancel} disabled={loading}>
        取消
      </Button>,
      <Button key="submit" type="primary" onClick={onSubmit} loading={loading}>
        领取
      </Button>,
    ]}
  >
    <div style={{ marginBottom: 8, color: 'var(--neutral-text-secondary)' }}>请在 {remain} 秒内完成操作</div>
    {detail && (
      <div style={{ display: 'grid', gap: 6 }}>
        <div>二维码：{detail.scanCode || '-'}</div>
        <div>数量：{detail.quantity || '-'}</div>
        <div>环节：{detail.progressStage || detail.processName || '-'}</div>
        <div>工序：{detail.processName || '-'}</div>
        <div>单价：{detail.unitPrice ?? '-'}</div>
        <div>订单号：{detail.orderNo || '-'}</div>
        <div>款号：{detail.styleNo || '-'}</div>
        <div>颜色：{detail.color || '-'}</div>
        <div>尺码：{detail.size || '-'}</div>
      </div>
    )}
  </Modal>
);

export default ScanConfirmModal;
