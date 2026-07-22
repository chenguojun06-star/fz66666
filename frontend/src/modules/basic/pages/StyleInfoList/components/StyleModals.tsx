import React from 'react';
import RejectReasonModal from '@/components/common/RejectReasonModal';
import { StatsRangeType, DateRange } from '../../StyleInfo/hooks/useStyleStats';
import { StyleInfo } from '@/types/style';
import type { PatternDevelopmentStats } from '@/types/production';
import StylePrintPreviewModal from './StylePrintPreviewModal';
import StyleMaintenanceModal from './StyleMaintenanceModal';
import StyleCostDetailDrawer from './StyleCostDetailDrawer';

interface StyleModalsProps {
  printModalVisible: boolean;
  printingRecord: StyleInfo | null;
  closePrintModal: () => void;
  maintenanceOpen: boolean;
  maintenanceSaving: boolean;
  maintenanceRecord: StyleInfo | null;
  maintenanceReason: string;
  setMaintenanceReason: (value: string) => void;
  submitMaintenance: () => void;
  closeMaintenance: () => void;
  pendingScrapId: string | null;
  scrapLoading: boolean;
  confirmScrap: (reason: string) => void;
  cancelScrap: () => void;
  costDetailVisible: boolean;
  setCostDetailVisible: (visible: boolean) => void;
  developmentStats: PatternDevelopmentStats | null;
  statsLoading: boolean;
  statsRangeType: StatsRangeType;
  dateRange: DateRange;
  setStatsRangeType: React.Dispatch<React.SetStateAction<StatsRangeType>>;
  setDateRange: React.Dispatch<React.SetStateAction<DateRange>>;
  loadDevelopmentStats: (rangeType: StatsRangeType, dateRange?: DateRange) => Promise<void>;
}

const StyleModals: React.FC<StyleModalsProps> = ({
  printModalVisible,
  printingRecord,
  closePrintModal,
  maintenanceOpen,
  maintenanceSaving,
  maintenanceRecord,
  maintenanceReason,
  setMaintenanceReason,
  submitMaintenance,
  closeMaintenance,
  pendingScrapId,
  scrapLoading,
  confirmScrap,
  cancelScrap,
  costDetailVisible,
  setCostDetailVisible,
  developmentStats,
  statsLoading,
  statsRangeType,
  dateRange,
  setStatsRangeType,
  setDateRange,
  loadDevelopmentStats,
}) => {
  return (
    <>
      <StylePrintPreviewModal
        visible={printModalVisible}
        record={printingRecord}
        onClose={closePrintModal}
      />
      <StyleMaintenanceModal
        open={maintenanceOpen}
        saving={maintenanceSaving}
        record={maintenanceRecord}
        reason={maintenanceReason}
        onReasonChange={setMaintenanceReason}
        onOk={submitMaintenance}
        onCancel={closeMaintenance}
      />
      <RejectReasonModal
        open={pendingScrapId !== null}
        title="确认报废"
        description="报废后记录会保留在当前页面，进度停止，并显示为开发样报废。"
        fieldLabel="报废原因"
        okText="确认报废"
        placeholder="请输入报废原因"
        required
        okDanger
        loading={scrapLoading}
        onOk={confirmScrap}
        onCancel={cancelScrap}
      />
      <StyleCostDetailDrawer
        visible={costDetailVisible}
        onClose={() => setCostDetailVisible(false)}
        stats={developmentStats}
        loading={statsLoading}
        rangeType={statsRangeType}
        dateRange={dateRange}
        onRangeChange={(type) => {
          setStatsRangeType(type);
          loadDevelopmentStats(type);
        }}
        onDateRangeChange={(range) => {
          setStatsRangeType('custom');
          setDateRange(range);
          loadDevelopmentStats('custom', range);
        }}
      />
    </>
  );
};

export default StyleModals;
