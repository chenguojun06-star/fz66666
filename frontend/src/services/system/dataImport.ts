import request from '@/utils/api';

const BASE = '/data-import';

export interface ImportResult {
  total: number;
  successCount: number;
  failedCount: number;
  message: string;
  successRecords: Array<Record<string, unknown>>;
  failedRecords: Array<{ row: number; error: string; [key: string]: unknown }>;
}

/**
 * 数据导入服务
 * 支持 4 种类型: style(款式) / factory(供应商) / employee(员工) / process(工序)
 */
export const dataImportService = {
  /**
   * 获取 Excel 模板下载 URL
   */
  getTemplateUrl: (type: string) => `/api${BASE}/template/${type}`,

  /**
   * 上传 Excel 导入数据
   */
  upload: (type: string, file: File): Promise<ImportResult> => {
    const formData = new FormData();
    formData.append('file', file);
    return request.post(`${BASE}/upload/${type}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

export default dataImportService;
