/**
 * 统一的订单进度颜色计算逻辑
 * 根据订单交期距离当前日期的天数判断颜色
 */

export type ProgressStatus = 'normal' | 'warning' | 'danger';

/**
 * 计算订单进度条颜色状态
 * @param plannedEndDate 订单交期
 * @returns 颜色状态: normal(绿色) | warning(黄色/微红) | danger(红色/深红)
 */
export const getProgressColorStatus = (plannedEndDate?: string | null): ProgressStatus => {
  if (!plannedEndDate) {
    return 'normal'; // 没有交期时默认绿色
  }

  const now = new Date();
  const deadline = new Date(plannedEndDate);
  const diffDays = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  // 延期超过3天 - 深红色
  if (diffDays <= -4) return 'danger';

  // 延期1-3天 - 大红色
  if (diffDays >= -3 && diffDays < 0) return 'danger';

  // 当天或距离1天内 - 微红色
  if (diffDays >= 0 && diffDays <= 1) return 'warning';

  // 距离交期3天内 - 黄色
  if (diffDays >= 2 && diffDays <= 3) return 'warning';

  // 正常生产中（距离交期3天以上） - 绿色
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
  actualEndDate?: string | null
): { text: string; color: string } => {
  if (!endDate) return { text: '-', color: '#999' };
  // 已关单：停止倒计时，固定显示"已关单"
  if (actualEndDate) return { text: '已关单', color: '#52c41a' };

  const now = new Date();
  const deadline = new Date(endDate);
  const diff = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  // 逾期
  if (diff < 0) return { text: `逾${Math.abs(diff)}天`, color: '#ff4d4f' };
  if (diff === 0) return { text: '今天', color: '#ff4d4f' };

  // 基于比例的颜色计算
  if (createTime) {
    const start = new Date(createTime);
    const totalDays = Math.ceil((deadline.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) || 1;
    const ratio = diff / totalDays;
    if (ratio <= 0.2) return { text: `${diff}天`, color: '#ff4d4f' };
    if (ratio <= 0.5) return { text: `${diff}天`, color: '#faad14' };
    return { text: `${diff}天`, color: '#52c41a' };
  }

  // 退化：固定阈值
  if (diff <= 3) return { text: `${diff}天`, color: '#ff4d4f' };
  if (diff <= 7) return { text: `${diff}天`, color: '#faad14' };
  return { text: `${diff}天`, color: '#52c41a' };
};
