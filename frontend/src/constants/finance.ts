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
    pending: { text: '待核实', color: 'default' },
    verified: { text: '已核实', color: 'processing' },
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
  pending: ['verified', 'approved', 'rejected'],
  verified: ['approved', 'rejected'],
  approved: ['paid', 'rejected'],
  rejected: ['pending'],
  paid: []
};
