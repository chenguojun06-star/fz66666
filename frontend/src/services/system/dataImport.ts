import request from '@/utils/api';

const BASE = '/data-import';

export interface ImportResult {
  total: number;
  successCount: number;
  failedCount: number;
  message: string;
  imageCount?: number;
  withCoverCount?: number;
  successRecords: Array<Record<string, unknown>>;
  failedRecords: Array<{ row: number; error: string; [key: string]: unknown }>;
}

/**
 * 数据导入服务
 * 支持 4 种类型: style(款式) / factory(供应商) / employee(员工) / process(工序)
 * 以及 ZIP 打包导入款式+图片
 */
export const dataImportService = {
  /**
   * 下载 Excel 导入模板（通过 axios 携带 JWT，避免浏览器直接跳转 401）
   * 修复：原 getTemplateUrl 返回裸 URL，<a>.click() 不携带 Authorization header → 401
   */
  downloadTemplate: async (type: string): Promise<void> => {
    const fileNameMap: Record<string, string> = {
      style:    '款式资料导入模板.xlsx',
      factory:  '供应商导入模板.xlsx',
      employee: '员工导入模板.xlsx',
      process:  '工序导入模板.xlsx',
    };
    const blob: Blob = await (request as unknown as { get: (url: string, cfg: object) => Promise<Blob> })
      .get(`${BASE}/template/${type}`, { responseType: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileNameMap[type] ?? `${type}导入模板.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

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

  /**
   * ZIP 打包导入款式 + 封面图片
   * ZIP 内放 Excel 文件 + 图片（图片文件名 = 款号，如 FZ2024001.jpg）
   */
  uploadZip: (file: File, onProgress?: (percent: number) => void): Promise<ImportResult> => {
    const formData = new FormData();
    formData.append('file', file);
    return request.post(`${BASE}/upload-zip/style`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e: { loaded: number; total?: number }) => {
        if (onProgress && e.total) {
          onProgress(Math.round((e.loaded * 100) / e.total));
        }
      },
    });
  },
};

export default dataImportService;
