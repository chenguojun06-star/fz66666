import api from '@/utils/api';

/**
 * D-473 录入记录管理 —— 扫码/录入记录的统一查询与修正。
 * 修改/撤回后生产统计（进度/菲号报工/工资聚合）随记录实时推导自动回流。
 */

export interface ScanRecordManageRow {
  id: string;
  orderId: string;
  orderNo: string;
  styleNo: string;
  styleName?: string;
  coverImage?: string;
  color?: string;
  size?: string;
  scanType?: string;
  processName?: string;
  progressStage?: string;
  quantity: number;
  unitPrice?: number;
  totalAmount?: number;
  operatorName?: string;
  remark?: string;
  bundleNo?: number;
  settlementStatus: 'SETTLED' | 'UNSETTLED';
  scanTime?: string;
}

export const SCAN_TYPE_MAP: Record<string, { text: string; color: string }> = {
  production: { text: '车缝生产', color: 'blue' },
  cutting: { text: '裁剪', color: 'purple' },
  quality: { text: '质检', color: 'orange' },
  warehouse: { text: '入库', color: 'green' },
  pattern: { text: '样衣', color: 'cyan' },
  reversal: { text: '退回', color: 'red' },
  orchestration: { text: '系统编排', color: 'default' },
};

export const scanRecordManageApi = {
  list: (params: {
    pageNum?: number;
    pageSize?: number;
    keyword?: string;
    scanType?: string;
    settlementStatus?: string;
    startDate?: string;
    endDate?: string;
  }) => api.post('/production/scan-records/manage/list', params),

  update: (id: string, data: { quantity?: number; remark?: string }) =>
    api.post(`/production/scan-records/manage/${id}/update`, data),

  remove: (id: string, reason?: string) =>
    api.post(`/production/scan-records/manage/${id}/delete`, { reason }),

  logs: (id: string) =>
    api.get(`/production/scan-records/manage/${id}/logs`),
};
