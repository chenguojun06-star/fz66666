import React from 'react';
import QuickEditModal from '@/components/common/QuickEditModal';
import CuttingSheetPrintModal from '@/components/common/CuttingSheetPrintModal';
import RejectReasonModal from '@/components/common/RejectReasonModal';
import ProcessDetailModal from '@/components/production/ProcessDetailModal';
import RemarkTimelineModal from '@/components/common/RemarkTimelineModal';
import { CuttingCreateTaskModal } from './index';
import type { CuttingTask } from '@/types/production';

interface CuttingModalsProps {
  createTask: any;
  tasks: {
    quickEditVisible: boolean;
    quickEditSaving: boolean;
    quickEditRecord: CuttingTask | null;
    handleQuickEditSave: (values: any) => Promise<void>;
    setQuickEditVisible: (v: boolean) => void;
    setQuickEditRecord: (r: CuttingTask | null) => void;
    pendingRollbackTask: { task: CuttingTask; onRolledBack?: () => void } | null;
    rollbackTaskLoading: boolean;
    confirmRollback: (reason: string) => Promise<void>;
    cancelRollback: () => void;
    fetchTasks: () => void;
  };
  processDetail: {
    processDetailVisible: boolean;
    closeProcessDetail: () => void;
    processDetailRecord: any;
    processDetailType: string;
    procurementStatus: any;
    processStatus: any;
  };
  bundles: {
    selectedBundles: any[];
  };
  activeTask: CuttingTask | null;
  user: any;
  cuttingSheetPrintOpen: boolean;
  setCuttingSheetPrintOpen: (v: boolean) => void;
  remarkOpen: boolean;
  setRemarkOpen: (v: boolean) => void;
  remarkOrderNo: string;
}

const CuttingModals: React.FC<CuttingModalsProps> = ({
  createTask,
  tasks,
  processDetail,
  bundles,
  activeTask,
  user,
  cuttingSheetPrintOpen,
  setCuttingSheetPrintOpen,
  remarkOpen,
  setRemarkOpen,
  remarkOrderNo,
}) => {
  return (
    <>
      <CuttingCreateTaskModal createTask={createTask} />

      <QuickEditModal
        visible={tasks.quickEditVisible}
        loading={tasks.quickEditSaving}
        initialValues={{
          remarks: tasks.quickEditRecord?.remarks,
          expectedShipDate: tasks.quickEditRecord?.expectedShipDate,
        }}
        onSave={tasks.handleQuickEditSave}
        onCancel={() => {
          tasks.setQuickEditVisible(false);
          tasks.setQuickEditRecord(null);
        }}
      />

      <CuttingSheetPrintModal
        open={cuttingSheetPrintOpen}
        onCancel={() => setCuttingSheetPrintOpen(false)}
        bundles={bundles.selectedBundles}
        styleImageUrl={activeTask?.styleCover}
        companyName={user?.tenantName}
        cuttingTask={activeTask ? {
          receiverName: activeTask?.receiverName,
          creatorName: activeTask?.creatorName,
          orderCreatorName: activeTask?.orderCreatorName,
          expectedShipDate: activeTask?.expectedShipDate,
        } : undefined}
      />

      <RejectReasonModal
        open={tasks.pendingRollbackTask !== null}
        title="确认退回该裁剪任务？"
        description="退回后会清空领取信息，并删除已生成的裁剪明细，可重新领取并重新生成。"
        loading={tasks.rollbackTaskLoading}
        onOk={tasks.confirmRollback}
        onCancel={tasks.cancelRollback}
      />

      <ProcessDetailModal
        visible={processDetail.processDetailVisible}
        onClose={processDetail.closeProcessDetail}
        record={processDetail.processDetailRecord}
        processType={processDetail.processDetailType}
        procurementStatus={processDetail.procurementStatus}
        processStatus={processDetail.processStatus}
        onDataChanged={tasks.fetchTasks}
      />

      <RemarkTimelineModal
        open={remarkOpen}
        onClose={() => setRemarkOpen(false)}
        targetType="order"
        targetNo={remarkOrderNo}
        canAddRemark={true}
      />
    </>
  );
};

export default CuttingModals;
