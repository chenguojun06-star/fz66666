import React from 'react';
import { Drawer } from 'antd';
import InlinePurchasePanel from '@/components/common/NodeDetailModal/InlinePurchasePanel';

// 面辅料采购抽屉（从 SampleProcessList.tsx 拆分而来）

export interface PurchaseDrawerProps {
  open: boolean;
  onClose: () => void;
  sourceType: 'sample' | 'order';
  patternProductionId?: string;
  orderId: string | null;
  orderNo: string | null;
  styleNo: string;
  color: string;
  quantity?: number;
}

const PurchaseDrawer: React.FC<PurchaseDrawerProps> = ({
  open,
  onClose,
  sourceType,
  patternProductionId,
  orderId,
  orderNo,
  styleNo,
  color,
  quantity,
}) => {
  return (
    <Drawer
      title="面辅料采购"
      open={open}
      onClose={onClose}
      size="large"
      styles={{ wrapper: { width: '50vw' }, body: { padding: 0 } }}
    >
      {sourceType === 'sample' && patternProductionId ? (
        <InlinePurchasePanel patternId={patternProductionId} sourceType="sample" styleNo={styleNo} color={color} quantity={quantity} />
      ) : orderId ? (
        <InlinePurchasePanel orderId={orderId} orderNo={orderNo || ''} />
      ) : null}
    </Drawer>
  );
};

export default PurchaseDrawer;
