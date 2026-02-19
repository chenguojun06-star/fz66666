/**
 * 工资结算 API 服务
 * 覆盖工资审批、付款等功能
 */

import api from '@/utils/api';

/**
 * 工资审批请求接口
 */
export interface PayrollApprovalRequest {
  operatorNames: string[];  // 操作人员名称列表
  approvalTime?: string;    // 审批时间
  approver?: string;        // 审批人
  remark?: string;          // 备注
}

/**
 * 工资退回请求接口
 */
export interface PayrollRejectRequest {
  operatorName: string;     // 操作人员名称
  rejectReason: string;     // 退回原因
  rejector?: string;        // 退回人
}

/**
 * 工资付款请求接口
 */
export interface PayrollPaymentRequest {
  operatorNames: string[];  // 操作人员名称列表
  paymentTime?: string;     // 付款时间
  paymentMethod?: string;   // 付款方式
  payer?: string;           // 付款人
  remark?: string;          // 备注
}

/**
 * 工资结算 API
 */
export const payrollApi = {
  /**
   * 审批工资（单个或批量）
   */
  approve: async (request: PayrollApprovalRequest) => {
    return api.post<{ success: boolean; message: string; data?: any }>('/payroll/approve', request);
  },

  /**
   * 退回工资审核
   */
  reject: async (request: PayrollRejectRequest) => {
    return api.post<{ success: boolean; message: string }>('/payroll/reject', request);
  },

  /**
   * 工资付款（单个或批量）
   */
  payment: async (request: PayrollPaymentRequest) => {
    return api.post<{ success: boolean; message: string; data?: any }>('/payroll/payment', request);
  },

  /**
   * 获取工资统计信息
   */
  getStats: async (params?: {
    startDate?: string;
    endDate?: string;
    operatorName?: string;
  }) => {
    return api.post('/payroll/stats', params || {});
  },
};
