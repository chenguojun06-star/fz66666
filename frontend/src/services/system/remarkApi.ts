import api from '../../utils/api';

export interface OrderRemark {
  id: number;
  targetType: string;
  targetNo: string;
  authorId: string;
  authorName: string;
  authorRole: string;
  content: string;
  tenantId: number;
  createTime: string;
}

export interface RemarkListParams {
  targetType: string;
  targetNo: string;
}

export interface RemarkAddParams {
  targetType: string;
  targetNo: string;
  authorRole?: string;
  content: string;
}

export const remarkApi = {
  list(params: RemarkListParams) {
    return api.post<OrderRemark[]>('/system/order-remark/list', params);
  },
  add(params: RemarkAddParams) {
    return api.post<OrderRemark>('/system/order-remark/add', params);
  },
  /** 批量查各记录最新备注，返回 targetNo → content 映射（用于列表导出） */
  batchLatest(targetType: string, targetNos: string[]) {
    return api.post<Record<string, string>>('/system/order-remark/batch-latest', { targetType, targetNos });
  },
};
