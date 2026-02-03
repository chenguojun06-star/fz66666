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
