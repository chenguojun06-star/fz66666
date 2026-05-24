import dayjs from 'dayjs';

const STAGE_BUDGET_RATIOS: { match: RegExp; ratio: number; label: string }[] = [
  { match: /采购|物料|备料|辅料|面料|procurement/i, ratio: 0.30, label: '采购' },
  { match: /裁剪|剪裁|cutting/i, ratio: 0.15, label: '裁剪' },
  { match: /车缝|缝纫|平车|sewing/i, ratio: 0.25, label: '车缝' },
  { match: /大烫|整烫|熨烫|ironing|pressing/i, ratio: 0.10, label: '大烫' },
  { match: /二次工艺|绣花|印花|特殊工艺|secondary/i, ratio: 0.08, label: '二次工艺' },
  { match: /包装|打包|packaging/i, ratio: 0.07, label: '包装' },
  { match: /质检|检验|quality/i, ratio: 0.05, label: '质检' },
];

const DEFAULT_RATIO = 0.10;

function getStageConfig(nodeName: string) {
  for (const s of STAGE_BUDGET_RATIOS) {
    if (s.match.test(nodeName)) return s;
  }
  return { match: /./, ratio: DEFAULT_RATIO, label: nodeName.slice(0, 4) };
}

export interface StageBudgetHint {
  text: string;
  color: string;
  budgetDays: number;
}

export function computeStageBudgetHint(params: {
  nodeName: string;
  orderCreateTime: string | null | undefined;
  expectedShipDate: string | null | undefined;
  stageStartTime: string | null | undefined;
  stageEndTime: string | null | undefined;
  isCompletedOrClosed: boolean;
  isProcureNode: boolean;
}): StageBudgetHint | null {
  const {
    nodeName, orderCreateTime, expectedShipDate,
    stageStartTime, stageEndTime,
    isCompletedOrClosed, isProcureNode,
  } = params;

  if (!orderCreateTime || !expectedShipDate) return null;
  if (isCompletedOrClosed) return null;

  const config = getStageConfig(nodeName);
  const create = dayjs(orderCreateTime);
  const shipDate = dayjs(expectedShipDate);
  const totalDays = shipDate.diff(create, 'day');
  if (totalDays <= 0) return null;

  const budgetDays = Math.max(1, Math.round(totalDays * config.ratio));
  const now = dayjs();

  if (stageEndTime) {
    const actualDays = dayjs(stageEndTime).diff(
      stageStartTime ? dayjs(stageStartTime) : create, 'day'
    );
    if (actualDays <= budgetDays) {
      return { text: `预算${budgetDays}天 · 准时`, color: 'var(--color-text-quaternary, #bfbfbf)', budgetDays };
    }
    return { text: `预算${budgetDays}天 · 超${actualDays - budgetDays}天`, color: '#ff7875', budgetDays };
  }

  if (stageStartTime) {
    const elapsed = now.diff(dayjs(stageStartTime), 'day');
    const remaining = budgetDays - elapsed;
    if (remaining > 0) {
      return { text: `预算${budgetDays}天 · 剩${remaining}天`, color: 'var(--color-text-quaternary, #bfbfbf)', budgetDays };
    }
    if (remaining === 0) {
      return { text: `预算${budgetDays}天 · 今天到期`, color: '#faad14', budgetDays };
    }
    return { text: `预算${budgetDays}天 · 超${Math.abs(remaining)}天`, color: '#ff7875', budgetDays };
  }

  if (isProcureNode) {
    const waitDays = now.diff(create, 'day');
    if (waitDays > budgetDays) {
      return { text: `预算${budgetDays}天 · 待开始超${waitDays - budgetDays}天`, color: '#ff7875', budgetDays };
    }
  }

  return { text: `预算${budgetDays}天`, color: 'var(--color-text-quaternary, #bfbfbf)', budgetDays };
}
