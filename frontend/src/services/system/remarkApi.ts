import api from '../../utils/api';

export interface OrderRemark {
  id: number;
  targetType: string;
  targetNo: string;
  authorId: string;
  authorName: string;
  authorRole: string;
  content: string;
  imageUrls?: string;
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
  imageUrls?: string;
}

export const remarkApi = {
  list(params: RemarkListParams) {
    return api.post<OrderRemark[]>('/system/order-remark/list', params);
  },
  add(params: RemarkAddParams) {
    return api.post<OrderRemark>('/system/order-remark/add', params);
  },
  batchLatest(targetType: string, targetNos: string[]) {
    return api.post<Record<string, string>>('/system/order-remark/batch-latest', { targetType, targetNos });
  },
};

export interface OrderImage {
  id: number;
  orderId: string;
  orderNo: string;
  imageUrl: string;
  thumbnailUrl?: string;
  sortOrder: number;
  version: number;
  operatorId?: string;
  operatorName?: string;
  tenantId: number;
  createTime: string;
  updateTime: string;
  deleteFlag: number;
}

export interface OrderImageSnapshot {
  id: number;
  orderNo: string;
  snapshotType: string;
  beforeUrls?: string;
  afterUrls?: string;
  operatorId?: string;
  operatorName?: string;
  tenantId: number;
  createTime: string;
}

export const orderImageApi = {
  list(orderNo: string) {
    return api.post<OrderImage[]>('/production/order-image/list', { orderNo });
  },
  add(orderNo: string, imageUrl: string, thumbnailUrl?: string) {
    return api.post<OrderImage>('/production/order-image', { orderNo, imageUrl, thumbnailUrl });
  },
  delete(id: number) {
    return api.delete(`/production/order-image/${id}`);
  },
  reorder(orderNo: string, imageIds: number[]) {
    return api.post('/production/order-image/reorder', { orderNo, imageIds });
  },
  snapshots(orderNo: string) {
    return api.post<OrderImageSnapshot[]>('/production/order-image/snapshots', { orderNo });
  },
};
