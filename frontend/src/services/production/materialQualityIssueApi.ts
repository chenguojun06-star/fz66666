import api, { unwrapApiData } from '@/utils/api';

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
  listByPurchaseId: async (purchaseId: string): Promise<MaterialQualityIssue[]> =>
    unwrapApiData<MaterialQualityIssue[]>(
      await api.get('/production/material-quality-issues', { params: { purchaseId } }),
      '加载质量问题失败',
    ),

  create: async (data: {
    purchaseId: string;
    issueQuantity: number;
    issueType: string;
    severity: string;
    disposition: string;
    remark: string;
    evidenceImageUrls?: string;
  }): Promise<MaterialQualityIssue> =>
    unwrapApiData<MaterialQualityIssue>(
      await api.post('/production/material-quality-issues', data),
      '登记质量问题失败',
    ),

  resolve: async (id: string, data: { resolutionRemark: string; disposition?: string }): Promise<MaterialQualityIssue> =>
    unwrapApiData<MaterialQualityIssue>(
      await api.post(`/production/material-quality-issues/${id}/resolve`, data),
      '处理质量问题失败',
    ),
};
