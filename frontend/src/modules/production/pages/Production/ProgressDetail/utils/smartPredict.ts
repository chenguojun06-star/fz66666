/**
 * smartPredict.ts — 生产进度智能预测工具
 * 根据已完成数量、创建时间、计划交期，预测实际完成日期和风险等级
 */

export interface SmartPrediction {
  /** 日均生产速度（件/天），-1 表示无法计算 */
  dailyRate: number;
  /** 剩余件数 */
  remainingQty: number;
  /** 预计还需天数，-1 表示无法计算 */
  daysNeeded: number;
  /** 预计完成日期，null 表示无法计算 */
  estimatedDate: Date | null;
  /** 距计划交期的提前/延迟天数（正=提前，负=延迟），null 表示无交期 */
  bufferDays: number | null;
  /** 风险等级 */
  risk: 'safe' | 'warning' | 'danger' | 'completed' | 'unknown';
  /** 风险说明文字 */
  riskLabel: string;
  /** 进度百分比（冗余，方便使用） */
  progress: number;
  /** 已生产天数 */
  elapsedDays: number;
}

export function calcSmartPrediction(params: {
  orderQuantity: number;
  completedQuantity: number;
  productionProgress: number;
  createTime?: string;
  plannedEndDate?: string;
  status?: string;
}): SmartPrediction {
  const {
    orderQuantity,
    completedQuantity,
    productionProgress,
    createTime,
    plannedEndDate,
    status,
  } = params;

  const now = new Date();

  // 已完成
  if (status === 'completed' || productionProgress >= 100) {
    return {
      dailyRate: 0,
      remainingQty: 0,
      daysNeeded: 0,
      estimatedDate: now,
      bufferDays: null,
      risk: 'completed',
      riskLabel: '已完成',
      progress: 100,
      elapsedDays: 0,
    };
  }

  const total = orderQuantity || 0;
  const done = completedQuantity || 0;
  const remaining = Math.max(0, total - done);

  // 计算已生产天数
  let elapsedDays = 0;
  if (createTime) {
    const created = new Date(createTime);
    elapsedDays = Math.max(1, Math.ceil((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)));
  }

  // 日均速度
  const dailyRate = elapsedDays > 0 && done > 0 ? Math.round((done / elapsedDays) * 10) / 10 : -1;

  // 预计完成日期
  let daysNeeded = -1;
  let estimatedDate: Date | null = null;
  if (dailyRate > 0 && remaining > 0) {
    daysNeeded = Math.ceil(remaining / dailyRate);
    estimatedDate = new Date(now.getTime() + daysNeeded * 24 * 60 * 60 * 1000);
  } else if (remaining === 0) {
    daysNeeded = 0;
    estimatedDate = now;
  }

  // 距计划交期
  let bufferDays: number | null = null;
  if (plannedEndDate && estimatedDate) {
    const planned = new Date(plannedEndDate);
    bufferDays = Math.round((planned.getTime() - estimatedDate.getTime()) / (1000 * 60 * 60 * 24));
  } else if (plannedEndDate && !estimatedDate) {
    // 无法预测时，用交期距今
    const planned = new Date(plannedEndDate);
    bufferDays = Math.round((planned.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }

  // 风险判断
  let risk: SmartPrediction['risk'] = 'unknown';
  let riskLabel = '数据不足，无法预测';

  if (dailyRate <= 0) {
    // 还没有生产速度数据
    if (bufferDays !== null) {
      if (bufferDays < 0) {
        risk = 'danger';
        riskLabel = `已超出交期 ${Math.abs(bufferDays)} 天`;
      } else if (bufferDays <= 3) {
        risk = 'warning';
        riskLabel = `距交期仅剩 ${bufferDays} 天，尚未开始`;
      } else {
        risk = 'unknown';
        riskLabel = '生产尚未开始';
      }
    }
  } else if (bufferDays === null) {
    risk = 'safe';
    riskLabel = `预计 ${daysNeeded} 天完成`;
  } else if (bufferDays >= 5) {
    risk = 'safe';
    riskLabel = `预计提前 ${bufferDays} 天完成 ✓`;
  } else if (bufferDays >= 0) {
    risk = 'warning';
    riskLabel = `仅剩 ${bufferDays} 天余量，注意跟进`;
  } else {
    risk = 'danger';
    riskLabel = `预计延期 ${Math.abs(bufferDays)} 天，需紧急处理`;
  }

  return {
    dailyRate,
    remainingQty: remaining,
    daysNeeded,
    estimatedDate,
    bufferDays,
    risk,
    riskLabel,
    progress: productionProgress || 0,
    elapsedDays,
  };
}

/** 格式化日期为 MM-DD */
export function fmtDate(d: Date | null): string {
  if (!d) return '-';
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${m}-${day}`;
}

/** 格式化剩余/提前天数为文字 */
export function fmtBuffer(bufferDays: number | null): string {
  if (bufferDays === null) return '-';
  if (bufferDays === 0) return '恰好完成';
  if (bufferDays > 0) return `提前 ${bufferDays} 天`;
  return `延期 ${Math.abs(bufferDays)} 天`;
}
