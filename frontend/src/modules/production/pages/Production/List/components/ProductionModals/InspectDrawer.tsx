import React from 'react';
import { Drawer } from 'antd';
import { InspectionDetail } from '@/modules/production';

interface InspectDrawerProps {
  visible: boolean;
  orderId: string;
  onClose: () => void;
}

const InspectDrawer: React.FC<InspectDrawerProps> = ({ visible, orderId, onClose }) => {
  return (
    <Drawer
      title="入库进度 / 质检记录（只读）"
      open={visible}
      onClose={onClose}
      size="large"
      styles={{ wrapper: { width: '90%' }, body: { padding: 16 } }}
    >
      {visible && (
        <InspectionDetail
          orderId={orderId}
          embedded
          readOnly
          onClose={onClose}
        />
      )}
    </Drawer>
  );
};

export default InspectDrawer;
