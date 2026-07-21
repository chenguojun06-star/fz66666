// 主文件：统一导出入口
// 业务实现拆分至同目录下的子文件，按职责分组：
// - cellRendererHelpers.ts: 纯函数/常量（calcHealthScore / NODE_TYPE_MAP / formatCompletionTime / getNodeColor / colorWithAlpha）
// - ShipmentSumCell.tsx: 发货汇总单元格组件
// - orderSummaryRenderer.tsx: 订单摘要列渲染（OrderSummaryContext + createOrderSummaryRender）
// - progressNodesRenderer.tsx: 工序进度列渲染（ProgressNodesContext + createProgressNodesRender）

export {
  calcHealthScore,
  NODE_TYPE_MAP,
  formatCompletionTime,
  getNodeColor,
  colorWithAlpha,
} from './cellRendererHelpers';

export { ShipmentSumCell } from './ShipmentSumCell';

export {
  createOrderSummaryRender,
} from './orderSummaryRenderer';
export type { OrderSummaryContext } from './orderSummaryRenderer';

export {
  createProgressNodesRender,
} from './progressNodesRenderer';
export type { ProgressNodesContext } from './progressNodesRenderer';
