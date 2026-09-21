import React from 'react';
import RemarkTimelineModal from '@/components/common/RemarkTimelineModal';
import { CuttingCreateTaskModal } from '@/modules/production/pages/Production/Cutting/components';
import type { CuttingCreateTaskState } from '@/modules/production/pages/Production/Cutting/hooks';
import OrderCreateModal from './OrderCreateModal';
import type { OrderCreateModalProps } from './OrderCreateModal';

interface OrderManagementModalsProps extends OrderCreateModalProps {
  remarkModalOpen: boolean;
  setRemarkModalOpen: (v: boolean) => void;
  remarkStyleNo: string;
  cuttingCreateTask: CuttingCreateTaskState;
}

const OrderManagementModals: React.FC<OrderManagementModalsProps> = ({
  remarkModalOpen,
  setRemarkModalOpen,
  remarkStyleNo,
  cuttingCreateTask,
  ...orderCreateModalProps
}) => {
  return (
    <>
      <OrderCreateModal {...orderCreateModalProps} />

      <RemarkTimelineModal
        open={remarkModalOpen}
        onClose={() => setRemarkModalOpen(false)}
        targetType="style"
        targetNo={remarkStyleNo}
      />

      <CuttingCreateTaskModal createTask={cuttingCreateTask} />
    </>
  );
};

export default OrderManagementModals;
