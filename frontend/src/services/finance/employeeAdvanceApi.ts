import api from '@/utils/api';

export interface EmployeeAdvance {
  id?: string;
  advanceNo?: string;
  employeeId?: string;
  employeeName?: string;
  factoryId?: string;
  factoryName?: string;
  amount: number;
  reason?: string;
  orderNo?: string;
  status?: 'pending' | 'approved' | 'rejected';
  repaymentStatus?: 'unrepaid' | 'partial' | 'repaid';
  repaidAmount?: number;
  remainingAmount?: number;
  approverId?: string;
  approverName?: string;
  approvalTime?: string;
  approvalRemark?: string;
  createTime?: string;
  updateTime?: string;
}

export const ADVANCE_STATUS = [
  { value: 'pending', label: '待审批', color: 'orange' },
  { value: 'approved', label: '已审批', color: 'green' },
  { value: 'rejected', label: '已驳回', color: 'red' },
];

export const REPAYMENT_STATUS = [
  { value: 'unrepaid', label: '未还', color: 'red' },
  { value: 'partial', label: '部分还款', color: 'orange' },
  { value: 'repaid', label: '已还清', color: 'green' },
];

export const employeeAdvanceApi = {
  list: (params?: Record<string, unknown>) => api.post('/finance/employee-advance/list', params),
  create: (data: Record<string, unknown>) => api.post('/finance/employee-advance', data),
  approve: (id: string, remark?: string) => api.put(`/finance/employee-advance/${id}/approve`, { remark }),
  reject: (id: string, remark?: string) => api.put(`/finance/employee-advance/${id}/reject`, { remark }),
  repay: (id: string, amount: number) => api.put(`/finance/employee-advance/${id}/repay`, { amount }),
};
