export type ProgressNode = {
  id: string;
  name: string;
  unitPrice?: number;
  progressStage?: string;
  /** D-684：看板统计用（节点级进度状态） */
  progressStatus?: string;
};
