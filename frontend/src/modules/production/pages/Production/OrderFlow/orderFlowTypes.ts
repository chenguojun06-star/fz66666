/**
 * 订单流程（OrderFlow）相关类型定义。
 *
 * 单独成文件的原因：`utils.tsx` 需要引用这些类型，若仍定义在
 * `useOrderFlowData.tsx` 中，会形成 utils ↔ hook 的循环依赖。
 */
import type { CuttingBundle, CuttingTask, ProductionOrder, ProductWarehousing } from '@/types/production';

export type FlowStage = {
  processName: string;
  status: 'not_started' | 'in_progress' | 'completed';
  totalQuantity?: number;
  startTime?: string;
  startOperatorId?: string;
  startOperatorName?: string;
  completeTime?: string;
  completeOperatorId?: string;
  completeOperatorName?: string;
  lastTime?: string;
  lastOperatorId?: string;
  lastOperatorName?: string;
};

export type OrderFlowResponse = {
  order: ProductionOrder;
  stages: FlowStage[];
  warehousings?: ProductWarehousing[];
  cuttingBundles?: CuttingBundle[];
  cuttingTasks?: CuttingTask[];
  materialPurchases?: any[];
};
