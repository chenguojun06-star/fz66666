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
};
