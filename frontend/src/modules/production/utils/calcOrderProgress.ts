/**
 * calcOrderProgress — 统一的订单整体进度计算函数
 *
 * 解决问题：项目中曾在 7+ 处用不同公式计算订单进度百分比，导致同一订单
 * 在不同页面/组件中显示不一致的进度。本函数是唯一权威实现。
 *
 * 策略：取 boardStats（实时扫码统计）最远下游节点加权百分比 与
 *       productionProgress（DB 字段）的较大值。
 *
 * 当 boardStatsByOrder 不可用时（如外发厂视图、分享页），退化为 clampProgress(dbValue)。
 */
import type { ProductionOrder } from '@/types/production';
import { hasProcurementStage, isOrderFrozenByStatus } from '@/utils/api';

/** 将 0-100 范围的数值钳位为整数 */
export const clampProgress = (v: number): number =>
  Math.max(0, Math.min(100, Math.round(v)));

/**
 * 计算订单整体进度百分比。
 *
 * @param record          订单记录
 * @param boardStatsMap   可选。boardStatsByOrder[orderId] 映射（key=节点名, value=已完成件数）。
 *                        不传或为空时退化为纯 DB 字段。
 * @returns 0-100 的整数百分比
 */
export function calcOrderProgress(
  record: ProductionOrder,
  boardStatsMap?: Record<string, number> | null,
): number {
  const dbProgress = clampProgress(Number(record.productionProgress) || 0);

  // 终态判断
  if (record.status === 'completed') return 100;
  if (isOrderFrozenByStatus(record)) return dbProgress;

  // 是否有真实业务动作
  const hasProcurementAction =
    Boolean(record.procurementManuallyCompleted) ||
    Boolean(record.procurementConfirmedAt) ||
    (Number(record.materialArrivalRate) || 0) > 0;
  const hasCuttingAction =
    (Number(record.cuttingCompletionRate) || 0) > 0 ||
    (Number(record.cuttingQuantity) || 0) > 0;
  const hasBoardAction =
    !!boardStatsMap &&
    Object.values(boardStatsMap).some((v) => (Number(v) || 0) > 0);
  const hasRealAction = hasProcurementAction || hasCuttingAction || hasBoardAction;

  if (!hasRealAction) return 0;
  if (!boardStatsMap) return dbProgress;

  const total = Math.max(
    1,
    Number(record.cuttingQuantity || record.orderQuantity) || 1,
  );

  // 工序流水线顺序（从前到后）
  const PIPELINE = hasProcurementStage(record as any)
    ? ['采购', '裁剪', '二次工艺', '绣花', '车缝', '尾部', '剪线', '整烫', '后整', '质检', '包装', '入库']
    : ['裁剪', '二次工艺', '绣花', '车缝', '尾部', '剪线', '整烫', '后整', '质检', '包装', '入库'];

  // 规范化节点名
  const normalizeKey = (k: string) => {
    if (k.includes('入库') || k.includes('入仓')) return '入库';
    if (k.includes('质检') || k.includes('品检') || k.includes('验货')) return '质检';
    if (k.includes('包装') || k.includes('后整') || k.includes('打包')) return '包装';
    if (k.includes('裁剪') || k.includes('裁床')) return '裁剪';
    if (k.includes('车缝') || k.includes('车间')) return '车缝';
    return k;
  };

  // 汇总 boardStats → 规范化后取最大百分比
  const normMap = new Map<string, number>();
  for (const [rawKey, rawQty] of Object.entries(boardStatsMap)) {
    const nk = normalizeKey(rawKey);
    const pct = Math.min(100, Math.round(Number(rawQty) / total * 100));
    if (pct > 0) normMap.set(nk, Math.max(normMap.get(nk) ?? 0, pct));
  }
  if (normMap.size === 0) return dbProgress;

  // 找到最远下游节点
  let lastIdx = -1;
  let lastPct = 0;
  for (const [nk, pct] of normMap.entries()) {
    const idx = PIPELINE.indexOf(nk);
    if (idx > lastIdx || (idx === lastIdx && pct > lastPct)) {
      lastIdx = idx;
      lastPct = pct;
    }
  }
  if (lastIdx < 0) return dbProgress;

  // 节点位置加权：之前的节点 + 当前节点按完成百分比折算
  const perStage = 100 / PIPELINE.length;
  const boardProgress = Math.round(lastIdx * perStage + (lastPct * perStage) / 100);
  return Math.min(100, Math.max(dbProgress, boardProgress));
}
