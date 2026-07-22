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
      title="质检入库"
      open={visible}
      onClose={onClose}
      size="large"
      styles={{ wrapper: { width: '90%' }, body: { padding: 0 } }}
    >
      {visible && (
        <InspectionDetail
          orderId={orderId}
          embedded
          onClose={onClose}
        />
      )}
    </Drawer>
  );
};

export default InspectDrawer;
