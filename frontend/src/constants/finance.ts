/**
 * 财务相关常量定义
 */

/**
 * 获取物料对账状态配置
 * @param status 状态值
 * @returns 状态配置对象，包含文本和颜色
 */
export const getMaterialReconStatusConfig = (status: any) => {
  const statusMap: Record<string, { text: string; color: string }> = {
    pending: { text: '待审批', color: 'default' },
    approved: { text: '已审批', color: 'success' },
    paid: { text: '已付款', color: 'success' },
    rejected: { text: '已驳回', color: 'error' },
  };
  const key = String(status || '').trim();
  return statusMap[key] || { text: '未知', color: 'default' };
};

/**
 * 物料对账状态流转规则（简化版）
 * 定义每个状态允许转换的目标状态
 */
export const materialReconStatusTransitions: Record<string, string[]> = {
  pending: ['approved', 'rejected'],      // 待审批 → 已审批/已驳回
  approved: ['paid', 'rejected'],         // 已审批 → 已付款/已驳回
  rejected: ['pending'],                  // 已驳回 → 待审批
  paid: []                                // 已付款 → 无（已完成）
};
