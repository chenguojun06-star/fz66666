import dayjs from 'dayjs';

const STAGE_BUDGET_RATIOS: { match: RegExp; ratio: number; label: string }[] = [
  { match: /整体|overall|全部/i, ratio: 1.00, label: '整体' },
  { match: /采购|物料|备料|辅料|面料|procurement/i, ratio: 0.30, label: '采购' },
  { match: /裁剪|剪裁|cutting/i, ratio: 0.15, label: '裁剪' },
  { match: /车缝|缝纫|平车|sewing/i, ratio: 0.25, label: '车缝' },
  { match: /大烫|整烫|熨烫|ironing|pressing/i, ratio: 0.10, label: '大烫' },
  { match: /二次工艺|绣花|印花|特殊工艺|secondary/i, ratio: 0.08, label: '二次工艺' },
  { match: /包装|打包|packaging/i, ratio: 0.07, label: '包装' },
  { match: /质检|检验|quality/i, ratio: 0.05, label: '质检' },
];

const DEFAULT_RATIO = 0.10;

export function getStageConfig(nodeName: string) {
  for (const s of STAGE_BUDGET_RATIOS) {
    if (s.match.test(nodeName)) return s;
  }
  return { match: /./, ratio: DEFAULT_RATIO, label: nodeName.slice(0, 4) };
}

/** D-219：工序 → 订单表上的预算工时字段（quick-edit 落库用）。尾部列复用整烫/ironing 字段。 */
const STAGE_BUDGET_HOUR_FIELDS: { match: RegExp; field: string }[] = [
  { match: /采购|物料|备料|辅料|面料|procurement/i, field: 'procurementBudgetHours' },
  { match: /裁剪|剪裁|cutting/i, field: 'cuttingBudgetHours' },
  { match: /车缝|缝纫|平车|sewing/i, field: 'carSewingBudgetHours' },
  { match: /大烫|整烫|熨烫|尾部|ironing|pressing/i, field: 'ironingBudgetHours' },
  { match: /二次工艺|绣花|印花|特殊工艺|secondary/i, field: 'secondaryProcessBudgetHours' },
  { match: /包装|打包|packaging/i, field: 'packagingBudgetHours' },
  { match: /质检|检验|quality/i, field: 'qualityBudgetHours' },
  { match: /入库|warehousing/i, field: 'warehousingBudgetHours' },
];

export function getStageBudgetHoursField(nodeName: string): string | null {
  for (const s of STAGE_BUDGET_HOUR_FIELDS) {
    if (s.match.test(nodeName)) return s.field;
  }
  return null;
}

/** 读取订单上该工序已设定的预算工时（小时），未设定返回 null */
export function getStageBudgetHoursValue(record: unknown, nodeName: string): number | null {
  const field = getStageBudgetHoursField(nodeName);
  if (!field) return null;
  const v = (record as Record<string, unknown> | null)?.[field];
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export interface StageBudgetHint {
  text: string;
  color: string;
  budgetDays: number;
}

// D-387：环节配置（t_stage_config.expectedDays）作为超期预警预算天数的首选来源。
// 用户口径：预算天数按「环节配置」给，单环节独立判定，只展示不参与交期计算。
const STAGE_CONFIG_BUDGET_RULES: { match: RegExp; key: string }[] = [
  { match: /采购|物料|备料|辅料|面料|procurement/i, key: '采购' },
  { match: /裁剪|剪裁|cutting/i, key: '裁剪' },
  { match: /二次工艺|特殊工艺|绣花|印花|secondary/i, key: '二次工艺' },
  { match: /车缝|缝纫|平车|sewing/i, key: '车缝' },
  { match: /尾部|尾工|包装|打包|大烫|整烫|熨烫|pressing|packaging|ironing/i, key: '尾部' },
  { match: /入库|仓库|成品|warehousing/i, key: '入库' },
];

// 环节配置预算天数：按 (款式) 分层缓存。key = styleId（空串=全厂基线）；
// 后端 getStageConfig(styleId) 返回「基线+款式覆盖」合并后的该款生效配置，故每款直接存一份生效 map。
const stageConfigBudgetCache: Map<string, Record<string, number>> = new Map();
// 基线首次加载成功后才触发一次全局刷新（style-level 加载不重复触发，避免看板循环重渲染）
let stageBudgetRefreshFired = false;

/** 取某环节在该款式生效配置(t_stage_config.expectedDays)中设定的预算天数；未配置返回 null */
export function getConfigBudgetDays(nodeName: string, styleId?: string | null): number | null {
  const style = styleId == null ? '' : String(styleId);
  const map = stageConfigBudgetCache.get(style);
  if (!map) return null;
  for (const rule of STAGE_CONFIG_BUDGET_RULES) {
    if (rule.match.test(nodeName)) {
      const v = map[rule.key];
      return Number.isFinite(v) && v > 0 ? v : null;
    }
  }
  return null;
}

/** 惰性加载某款生效环节配置预算天数（styleId 空 → 全厂基线；非空 → 该款，未配回退基线）。加载完成返回是否成功。 */
export async function loadStageConfigBudget(styleId?: string | null): Promise<boolean> {
  const style = styleId == null ? '' : String(styleId);
  if (stageConfigBudgetCache.has(style)) return true;
  try {
    const { getStageConfig } = await import('@/utils/api/production.scan');
    const res = await getStageConfig(style || undefined);
    const list = res?.data ?? [];
    const map: Record<string, number> = {};
    (Array.isArray(list) ? list : []).forEach((c: any) => {
      if (c && c.stageName) {
        const n = Number(c.expectedDays);
        if (Number.isFinite(n) && n > 0) map[c.stageName] = n;
      }
    });
    stageConfigBudgetCache.set(style, map);
    // 仅基线首次加载成功时触发一次全局刷新，让进度看板立即用环节配置天数重渲染（guard 避免循环）
    if (!stageBudgetRefreshFired) {
      stageBudgetRefreshFired = true;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('data:changed'));
      }
    }
    return true;
  } catch (e) {
    return false;
  }
}

export function computeStageBudgetHint(params: {
  nodeName: string;
  styleId?: string | null;
  orderCreateTime: string | null | undefined;
  expectedShipDate: string | null | undefined;
  stageStartTime: string | null | undefined;
  stageEndTime: string | null | undefined;
  isCompletedOrClosed: boolean;
  isProcureNode: boolean;
  /** 独立设定的预算工时（小时），优先于按比例计算 */
  budgetHours?: number | null;
}): StageBudgetHint | null {
  const {
    nodeName, styleId, orderCreateTime, expectedShipDate,
    stageStartTime, stageEndTime,
    isCompletedOrClosed, isProcureNode,
    budgetHours,
  } = params;

  if (!orderCreateTime || !expectedShipDate) return null;
  if (isCompletedOrClosed && !stageEndTime) return null;

  const config = getStageConfig(nodeName);
  const create = dayjs(orderCreateTime);
  const shipDate = dayjs(expectedShipDate);
  const totalDays = shipDate.diff(create, 'day');
  if (totalDays <= 0) return null;

  const now = dayjs();

  // D-387：优先使用环节配置表设定的预算天数（用户口径：按环节给，单环节独立判定；按款生效，未配回退基线）
  const configBudgetDays = getConfigBudgetDays(nodeName, styleId);
  const budgetDays = configBudgetDays != null
    ? Math.max(1, Math.round(configBudgetDays))
    : (budgetHours != null && budgetHours > 0
        ? Math.max(1, Math.ceil(budgetHours / 14))
        : Math.max(1, Math.round(totalDays * config.ratio)));

  if (stageEndTime) {
    const actualDays = dayjs(stageEndTime).diff(
      stageStartTime ? dayjs(stageStartTime) : create, 'day'
    );
    if (actualDays <= budgetDays) {
      return { text: `预算${budgetDays}天 · 准时`, color: 'var(--color-text-quaternary, var(--color-text-quaternary))', budgetDays };
    }
    return { text: `预算${budgetDays}天 · 超${actualDays - budgetDays}天`, color: 'var(--color-text-quaternary, var(--color-text-quaternary))', budgetDays };
  }

  if (stageStartTime) {
    const elapsed = now.diff(dayjs(stageStartTime), 'day');
    const remaining = budgetDays - elapsed;
    if (remaining > 0) {
      return { text: `预算${budgetDays}天 · 剩${remaining}天`, color: 'var(--color-text-quaternary, var(--color-text-quaternary))', budgetDays };
    }
    if (remaining === 0) {
      return { text: `预算${budgetDays}天 · 今天到期`, color: 'var(--color-warning)', budgetDays };
    }
    return { text: `预算${budgetDays}天 · 超${Math.abs(remaining)}天`, color: 'var(--color-danger)', budgetDays };
  }

  if (isProcureNode) {
    const waitDays = now.diff(create, 'day');
    if (waitDays > budgetDays) {
      return { text: `预算${budgetDays}天 · 待开始超${waitDays - budgetDays}天`, color: 'var(--color-danger)', budgetDays };
    }
  }

  return { text: `预算${budgetDays}天`, color: 'var(--color-text-quaternary, var(--color-text-quaternary))', budgetDays };
}
