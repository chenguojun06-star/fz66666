import React from 'react';
import StylePrintModal from '@/components/common/StylePrintModal';
import RemarkTimelineModal from '@/components/common/RemarkTimelineModal';
import { CuttingCreateTaskModal } from '@/modules/production/pages/Production/Cutting/components';
import type { CuttingCreateTaskState } from '@/modules/production/pages/Production/Cutting/hooks';
import { StyleInfo } from '@/types/style';
import OrderCreateModal from './OrderCreateModal';
import type { OrderCreateModalProps } from './OrderCreateModal';

interface OrderManagementModalsProps extends OrderCreateModalProps {
  remarkModalOpen: boolean;
  setRemarkModalOpen: (v: boolean) => void;
  remarkStyleNo: string;
  printModalVisible: boolean;
  setPrintModalVisible: (v: boolean) => void;
  printingRecord: StyleInfo | null;
  setPrintingRecord: (r: StyleInfo | null) => void;
  cuttingCreateTask: CuttingCreateTaskState;
}

const OrderManagementModals: React.FC<OrderManagementModalsProps> = ({
  remarkModalOpen,
  setRemarkModalOpen,
  remarkStyleNo,
  printModalVisible,
  setPrintModalVisible,
  printingRecord,
  setPrintingRecord,
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

      <StylePrintModal
        visible={printModalVisible}
        onClose={() => { setPrintModalVisible(false); setPrintingRecord(null); }}
        styleId={printingRecord?.id}
        styleNo={printingRecord?.styleNo}
        styleName={printingRecord?.styleName}
        cover={printingRecord?.cover}
        color={printingRecord?.color}
        quantity={printingRecord?.sampleQuantity}
        category={printingRecord?.category}
        season={printingRecord?.season}
        mode="order"
        extraInfo={{
          '交板日期': printingRecord?.deliveryDate,
          '设计师': printingRecord?.sampleNo,
        }}
      />

      <CuttingCreateTaskModal createTask={cuttingCreateTask} />
    </>
  );
};

export default OrderManagementModals;
