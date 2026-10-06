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

export interface SmartMapResult {
  /** 源表头（按列序） */
  headers: string[];
  /** 目标类型的标准列（含 * 的为必填） */
  canonicalFields: string[];
  /** 源表头 → 建议目标列（null = 未识别） */
  mapping: Record<string, string | null>;
  /** 源表头 → 识别依据（rule / ai） */
  matchedBy: Record<string, string>;
  /** 前 3 行样例（与 headers 同序） */
  samples: string[][];
  totalRows: number;
}

/**
 * 数据导入服务
 * 支持 8 种类型: style(款式) / factory(供应商) / employee(员工) / process(工序)
 * / customer(客户) / material(物料主档) / material-stock(物料期初库存) / product-stock(成品期初库存)
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
      customer: '客户导入模板.xlsx',
      material: '物料主档导入模板.xlsx',
      'material-stock': '物料期初库存导入模板.xlsx',
      'product-stock': '成品期初库存导入模板.xlsx',
    };    const blob: Blob = await (request as unknown as { get: (url: string, cfg: object) => Promise<Blob> })
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
   * 智能识别表头（D-751 二期）：任意格式 Excel → 规则+AI 列映射建议
   */
  smartMap: (type: string, file: File): Promise<SmartMapResult> => {
    const formData = new FormData();
    formData.append('file', file);
    return request.post(`${BASE}/smart-map/${type}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  /**
   * 按用户确认的映射导入（归一化后走既有导入器，结果结构与 upload 一致）
   */
  uploadMapped: (type: string, file: File, mapping: Record<string, string>): Promise<ImportResult> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('mapping', JSON.stringify(mapping));
    return request.post(`${BASE}/upload-mapped/${type}`, formData, {
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
