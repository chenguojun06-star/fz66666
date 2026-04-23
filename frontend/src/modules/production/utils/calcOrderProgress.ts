/**
 * calcOrderProgress — 统一的订单整体进度计算函数
 *
 * 解决问题：项目中曾在 7+ 处用不同公式计算订单进度百分比，导致同一订单
 * 在不同页面/组件中显示不一致的进度。本函数是唯一权威实现。
 *
 * 策略（v2，2026-07 修复）：
 * 1. 有 boardStats：将扫码节点折叠到 6 个核心阶段，加权平均
 * 2. 无 boardStats：使用订单上的 DB 工序完成率字段（如 cuttingCompletionRate）加权平均
 * 3. 取以上两者与 productionProgress（DB 字段，仅入库时更新）的最大值
 *
 * v1 问题（已修复）：
 * - 原 12 段精细 PIPELINE 导致每个阶段仅占 ~8%，进度值偏低
 * - 原"仅看最远下游节点"逻辑假设前序节点 100%，导致进度虚高
 * - 无 boardStats 时退化为 productionProgress（仅入库才更新，平时为 0）
 */
import type { ProductionOrder } from '@/types/production';
import { hasProcurementStage, isOrderFrozenByStatus } from '@/utils/api';

/** 将 0-100 范围的数值钳位为整数 */
export const clampProgress = (v: number): number =>
  Math.max(0, Math.min(100, Math.round(v)));

/** 6 个核心工序阶段 — 与 ExternalFactorySmartView#PRODUCTION_STAGES 对齐 */
const CORE_STAGES = ['采购', '裁剪', '二次工艺', '车缝', '尾部', '入库'];

/** 子工序 / 别名 → 核心阶段名映射 */
const toCoreStage = (k: string): string => {
  // 子工序精确映射
  if (k === '绣花') return '二次工艺';
  if (k === '剪线' || k === '整烫' || k === '后整' || k === '大烫' || k === '蒸烫') return '尾部';
  if (k === '质检' || k === '包装') return '入库';
  // 别名模糊映射
  if (k.includes('入库') || k.includes('入仓')) return '入库';
  if (k.includes('质检') || k.includes('品检') || k.includes('验货')) return '入库';
  if (k.includes('包装') || k.includes('打包') || k.includes('后整')) return '尾部';
  if (k.includes('裁剪') || k.includes('裁床')) return '裁剪';
  if (k.includes('车缝') || k.includes('车间')) return '车缝';
  if (k.includes('整烫') || k.includes('大烫') || k.includes('蒸烫')) return '尾部';
  if (k === '__procurement__') return '采购';
  return k;
};

/** DB 上的工序完成率字段 — 与 PRODUCTION_STAGES / 后端 OrderFlowStageFillHelper 对齐 */
const RATE_FIELD_MAP: { label: string; field: string }[] = [
  { label: '采购', field: 'procurementCompletionRate' },
  { label: '裁剪', field: 'cuttingCompletionRate' },
  { label: '二次工艺', field: 'secondaryProcessCompletionRate' },
  { label: '车缝', field: 'carSewingCompletionRate' },
  { label: '尾部', field: 'tailProcessRate' },
  { label: '入库', field: 'warehousingCompletionRate' },
];

/**
 * 计算订单整体进度百分比。
 *
 * @param record          订单记录
 * @param boardStatsMap   可选。boardStatsByOrder[orderId] 映射（key=节点名, value=已完成件数）。
 *                        不传或为空时退化为 DB 工序完成率字段。
 * @returns 0-100 的整数百分比
 */
export function calcOrderProgress(
  record: ProductionOrder | null | undefined,
  boardStatsMap?: Record<string, number> | null,
): number {
  if (!record) return 0;
  const dbProgress = clampProgress(Number(record.productionProgress) || 0);

  // 终态判断
  if (record.status === 'completed') return 100;
  if (isOrderFrozenByStatus(record)) return dbProgress;

  const hasProcurement = Boolean(hasProcurementStage(record as any));
  const pipeline = hasProcurement
    ? CORE_STAGES
    : CORE_STAGES.filter((s) => s !== '采购');

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
  const hasRateFieldAction = RATE_FIELD_MAP.some(({ label, field }) => {
    if (label === '采购' && !hasProcurement) return false;
    return (Number((record as any)[field]) || 0) > 0;
  });
  const hasRealAction =
    hasProcurementAction || hasCuttingAction || hasBoardAction || hasRateFieldAction;

  if (!hasRealAction) return 0;

  const total = Math.max(
    1,
    Number(record.cuttingQuantity || record.orderQuantity) || 1,
  );

  // ── 数据源 1：boardStats 扫码统计（折叠到 6 核心阶段，加权平均） ──
  let boardProgress = 0;
  if (boardStatsMap) {
    const corePcts = new Map<string, number>();
    for (const [rawKey, rawQty] of Object.entries(boardStatsMap)) {
      const core = toCoreStage(rawKey);
      if (!pipeline.includes(core)) continue;
      const pct = Math.min(100, Math.round(Number(rawQty) / total * 100));
      if (pct > 0) corePcts.set(core, Math.max(corePcts.get(core) ?? 0, pct));
    }
    if (corePcts.size > 0) {
      let sum = 0;
      for (const stage of pipeline) sum += corePcts.get(stage) ?? 0;
      boardProgress = Math.round(sum / pipeline.length);
    }
  }

  // ── 数据源 2：DB 工序完成率字段加权平均 ──
  let rateProgress = 0;
  {
    let sum = 0;
    for (const { label, field } of RATE_FIELD_MAP) {
      if (!pipeline.includes(label)) continue;
      sum += clampProgress(Number((record as any)[field]) || 0);
    }
    rateProgress = Math.round(sum / pipeline.length);
  }

  // 三者取最大值
  return clampProgress(Math.max(dbProgress, boardProgress, rateProgress));
}
