export interface StyleProductionTabProps {
  styleId: string | number;
  styleNo?: string;
  productionReqRows: string[];
  productionReqRowCount: number;
  productionReqLocked: boolean;
  productionReqEditable: boolean;
  productionReqSaving: boolean;
  productionReqRollbackSaving: boolean;
  onProductionReqChange: (index: number, value: string) => void;
  onProductionReqSave: () => void;
  onProductionReqReset: () => void;
  onProductionReqRollback: () => void;
  productionReqCanRollback: boolean;
  productionAssignee?: string;
  productionStartTime?: string;
  productionCompletedTime?: string;
  onRefresh?: () => void;
  // 样衣审核
  sampleCompleted?: boolean;
  sampleReviewStatus?: string | null;
  sampleReviewComment?: string | null;
  sampleReviewer?: string | null;
  sampleReviewTime?: string | null;
  // 样衣入库所需字段
  completedTime?: string | null;
  styleName?: string;
  color?: string;
  size?: string;
  sampleQuantity?: number;
}
