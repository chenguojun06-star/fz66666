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
    pending: { text: '待审核', color: 'default' },
    verified: { text: '已验证', color: 'success' },
    approved: { text: '已批准', color: 'success' },
    paid: { text: '已付款', color: 'success' },
    rejected: { text: '已拒绝', color: 'error' },
  };
  const key = String(status || '').trim();
  return statusMap[key] || { text: '未知', color: 'default' };
};

/**
 * 物料对账状态流转规则
 * 定义每个状态允许转换的目标状态
 */
export const materialReconStatusTransitions: Record<string, string[]> = {
  pending: ['verified', 'rejected'],      // 待审核 → 已验证/已拒绝
  verified: ['approved', 'rejected'],     // 已验证 → 已批准/已拒绝
  approved: ['paid', 'rejected'],         // 已批准 → 已付款/已拒绝
  rejected: ['pending'],                  // 已拒绝 → 待审核
  paid: []                                // 已付款 → 无（已完成）
};
