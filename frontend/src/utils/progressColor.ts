/**
 * 统一的订单进度颜色计算逻辑
 * 根据订单交期距离当前日期的天数判断颜色
 */

export type ProgressStatus = 'normal' | 'warning' | 'danger';

/**
 * iOS 安全日期解析：将不带时区信息的日期字符串按本地时间解析
 * 解决 iOS 上 new Date('2024-05-01T08:00:00') 被当作 UTC 解析导致差8小时的问题
 * @param dateStr 可能的格式：YYYY-MM-DD / YYYY-MM-DD HH:mm:ss / YYYY-MM-DDTHH:mm:ss[.sss]
 * @returns Date（本地时间），解析失败返回 Invalid Date
 */
const parseSafeLocalDate = (dateStr: string | null | undefined): Date => {
  if (!dateStr) return new Date(NaN);
  const s = String(dateStr).trim();
  if (!s) return new Date(NaN);

  // 含显式时区信息（Z 或 +08:00 / -05:30）→ 交给原生解析
  if (/Z|[+-]\d{2}:?\d{2}$/.test(s)) {
    return new Date(s);
  }

  // 手动拆分：YYYY-MM-DD[ T]HH:mm:ss[.sss] → 按本地时间构造
  // 匹配日期部分和可选的时间部分
  const match = s.match(
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[\sT]+(\d{1,2}):(\d{1,2})(?::(\d{1,2})(?:\.(\d+))?)?)?$/
  );
  if (match) {
    const [, y, mo, d, h = '0', mi = '0', se = '0', ms = '0'] = match;
    return new Date(
      Number(y),
      Number(mo) - 1,
      Number(d),
      Number(h),
      Number(mi),
      Number(se),
      Math.round(Number('0.' + ms) * 1000)
    );
  }

  // 退化为原生解析
  return new Date(s);
};

/** 本地时间的 00:00（今天零点） */
const getLocalToday = (): Date => {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
};

/**
 * 判断订单是否已处于"完成/终止"状态（不应再显示"延期"倒计时）
 */
const isOrderFinished = (
  status?: string | null,
  actualEndDate?: unknown,
  progress?: unknown
): boolean => {
  const s = String(status || '').trim().toLowerCase();
  if (s === 'completed' || s === 'closed' || s === 'cancelled' || s === 'canceled'
    || s === 'scrapped' || s === 'archived') return true;
  if (actualEndDate && String(actualEndDate).trim()) return true;
  const p = Number(progress);
  if (!isNaN(p) && p >= 100) return true;
  return false;
};

/**
 * 计算订单进度条颜色状态
 * @param plannedEndDate 订单交期
 * @returns 颜色状态: normal(绿色) | warning(黄色/微红) | danger(红色/深红)
 */
export const getProgressColorStatus = (
  plannedEndDate?: string | null,
  status?: string | null,
  actualEndDate?: string | null,
  productionProgress?: unknown
): ProgressStatus => {
  if (!plannedEndDate) return 'normal';
  if (isOrderFinished(status, actualEndDate, productionProgress)) return 'normal';

  const now = new Date();
  const deadline = parseSafeLocalDate(plannedEndDate);
  if (isNaN(deadline.getTime())) return 'normal';
  const diffDays = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays <= -4) return 'danger';
  if (diffDays >= -3 && diffDays < 0) return 'danger';
  if (diffDays >= 0 && diffDays <= 1) return 'warning';
  if (diffDays >= 2 && diffDays <= 3) return 'warning';
  return 'normal';
};

/**
 * 获取剩余天数显示信息（文本 + 颜色）
 * 颜色逻辑：基于剩余时间占总订单工期的比例
 *   - 绿色：剩余 > 50% 总工期
 *   - 黄色：剩余 20%-50% 总工期
 *   - 红色：剩余 < 20% 或已逾期
 *   - 无 createTime 时退化为固定阈值：>7天绿, 3-7天黄, ≤3天红
 */
export const getRemainingDaysDisplay = (
  endDate?: string | null,
  createTime?: string | null,
  actualEndDate?: string | null,
  status?: string | null,
  productionProgress?: unknown
): { text: string; color: string } => {
  if (!endDate) return { text: '-', color: 'var(--color-text-tertiary)' };

  // 完成/终止态：不再显示延期倒计时
  const s = String(status || '').trim().toLowerCase();
  if (s === 'scrapped') return { text: '已报废', color: 'var(--color-text-tertiary)' };
  if (s === 'closed' || s === 'archived') return { text: '已关单', color: 'var(--color-text-tertiary)' };
  if (s === 'completed') return { text: '已完成', color: 'var(--color-success)' };
  if (s === 'cancelled' || s === 'canceled') return { text: '已取消', color: 'var(--color-text-tertiary)' };
  if (actualEndDate) return { text: '已关单', color: 'var(--color-text-tertiary)' };
  const p = Number(productionProgress);
  if (!isNaN(p) && p >= 100) return { text: '已完成', color: 'var(--color-success)' };

  const now = new Date();
  const deadline = parseSafeLocalDate(endDate);
  if (isNaN(deadline.getTime())) return { text: '-', color: 'var(--color-text-tertiary)' };
  const diff = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diff < 0) return { text: `逾${Math.abs(diff)}天`, color: 'var(--color-danger)' };
  if (diff === 0) return { text: '今天', color: 'var(--color-danger)' };

  if (createTime) {
    const start = parseSafeLocalDate(createTime);
    if (!isNaN(start.getTime())) {
      const totalDays = Math.ceil((deadline.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) || 1;
      const ratio = diff / totalDays;
      if (ratio <= 0.2) return { text: `${diff}天`, color: 'var(--color-danger)' };
      if (ratio <= 0.5) return { text: `${diff}天`, color: 'var(--color-warning)' };
      return { text: `${diff}天`, color: 'var(--color-success)' };
    }
  }

  if (diff <= 3) return { text: `${diff}天`, color: 'var(--color-danger)' };
  if (diff <= 7) return { text: `${diff}天`, color: 'var(--color-warning)' };
  return { text: `${diff}天`, color: 'var(--color-success)' };
};
