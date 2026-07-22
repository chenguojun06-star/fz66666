import React from 'react';
import { Button } from 'antd';
import { ShareAltOutlined, SendOutlined, AppstoreOutlined } from '@ant-design/icons';
import { ProductionOrder } from '@/types/production';

interface ProgressActionsProps {
  record: ProductionOrder;
  frozen: boolean;
  openKanban: (order: ProductionOrder) => void;
  setQuickEditRecord: (record: ProductionOrder | null) => void;
  setQuickEditVisible: (v: boolean) => void;
  setPrintingRecord: (record: ProductionOrder) => void;
  handlePrintLabel: (record: ProductionOrder) => void | Promise<void>;
  labelPrintLoading?: boolean;
  isFactoryAccount?: boolean;
  onFactoryShip?: (order: ProductionOrder) => void;
  canManageOrderLifecycle?: boolean;
  handleCloseOrder: (order: ProductionOrder) => void;
  onShareOrder?: (order: ProductionOrder) => void;
}

export function ProgressActions({
  record,
  frozen,
  openKanban,
  setQuickEditRecord,
  setQuickEditVisible,
  setPrintingRecord,
  handlePrintLabel,
  labelPrintLoading,
  isFactoryAccount,
  onFactoryShip,
  canManageOrderLifecycle,
  handleCloseOrder,
  onShareOrder,
}: ProgressActionsProps) {
  return (
    <div className="progress-row-actions">
      <Button icon={<AppstoreOutlined />} onClick={() => openKanban(record)}>看板</Button>
      <Button onClick={() => { setQuickEditRecord(record); setQuickEditVisible(true); }}>编辑</Button>
      <Button disabled={frozen} onClick={() => setPrintingRecord(record)}>打印</Button>
      <Button disabled={frozen} loading={labelPrintLoading} onClick={() => { void handlePrintLabel(record); }}>标签</Button>
      {isFactoryAccount ? <Button type="primary" disabled={frozen} icon={<SendOutlined />} onClick={() => onFactoryShip?.(record)}>发货</Button> : null}
      {canManageOrderLifecycle ? <Button danger disabled={frozen} onClick={() => handleCloseOrder(record)}>关单</Button> : null}
      <Button icon={<ShareAltOutlined />} onClick={() => onShareOrder?.(record)}>分享</Button>
    </div>
  );
}
