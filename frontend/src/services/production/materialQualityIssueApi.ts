import api from '@/utils/api';

export interface MaterialQualityIssue {
  id: string;
  issueNo: string;
  purchaseId: string;
  purchaseNo?: string;
  orderNo?: string;
  styleNo?: string;
  supplierName?: string;
  materialCode?: string;
  materialName?: string;
  issueQuantity?: number;
  issueType?: string;
  severity?: string;
  disposition?: string;
  status?: string;
  evidenceImageUrls?: string;
  remark?: string;
  resolutionRemark?: string;
  relatedPurchaseId?: string;
  relatedPurchaseNo?: string;
  deductionAmount?: number;
  reporterName?: string;
  resolverName?: string;
  resolvedTime?: string;
  createTime?: string;
}

export const materialQualityIssueApi = {
  listByPurchaseId: (purchaseId: string) =>
    api.get<{ code: number; data: MaterialQualityIssue[] }>('/production/material-quality-issues', {
      params: { purchaseId },
    }),

  create: (data: {
    purchaseId: string;
    issueQuantity: number;
    issueType: string;
    severity: string;
    disposition: string;
    remark: string;
    evidenceImageUrls?: string;
  }) =>
    api.post<{ code: number; data: MaterialQualityIssue }>('/production/material-quality-issues', data),

  resolve: (id: string, data: { resolutionRemark: string; disposition?: string }) =>
    api.post<{ code: number; data: MaterialQualityIssue }>(`/production/material-quality-issues/${id}/resolve`, data),
};
