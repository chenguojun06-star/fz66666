import type { UploadFile } from 'antd/es/upload/interface';

export const EXCEL_SIZE_LIMIT = 5 * 1024 * 1024; // 5MB
export const ZIP_SIZE_LIMIT = 500 * 1024 * 1024; // 500MB

/** 校验 Excel 文件，返回错误消息（null 表示通过） */
export const validateExcelFile = (file: File): string | null => {
  const isExcel =
    file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    file.type === 'application/vnd.ms-excel' ||
    file.name.endsWith('.xlsx') ||
    file.name.endsWith('.xls');
  if (!isExcel) return '仅支持 .xlsx 或 .xls 格式的Excel文件';
  if (file.size > EXCEL_SIZE_LIMIT) return '文件大小不能超过5MB';
  return null;
};

/** 校验 ZIP 文件，返回错误消息（null 表示通过） */
export const validateZipFile = (file: File): string | null => {
  const isZip =
    file.name.toLowerCase().endsWith('.zip') ||
    file.type === 'application/zip' ||
    file.type === 'application/x-zip-compressed';
  if (!isZip) return '仅支持 .zip 格式';
  if (file.size > ZIP_SIZE_LIMIT) return 'ZIP 包不能超过 500MB';
  return null;
};

/** 将原生 File 转为 antd UploadFile 形态 */
export const toUploadFile = (file: File): UploadFile =>
  ({
    ...file,
    uid: file.name + '-' + Date.now(),
    name: file.name,
    originFileObj: file,
  }) as unknown as UploadFile;
