import { useState, useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { UploadFile, RcFile } from 'antd/es/upload/interface';
import { dataImportService } from '@/services/system/dataImport';
import type { ImportResult } from '@/services/system/dataImport';
import { message } from '@/utils/antdStatic';

export interface UseZipImportReturn {
  fileList: UploadFile[];
  uploading: boolean;
  progress: number;
  result: ImportResult | null;
  setFileList: Dispatch<SetStateAction<UploadFile[]>>;
  setUploading: Dispatch<SetStateAction<boolean>>;
  setProgress: Dispatch<SetStateAction<number>>;
  setResult: Dispatch<SetStateAction<ImportResult | null>>;
  handleUpload: () => Promise<void>;
}

export const useZipImport = (): UseZipImportReturn => {
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleUpload = useCallback(async () => {
    if (fileList.length === 0) {
      message.warning('请先选择 ZIP 文件');
      return;
    }
    const file = fileList[0].originFileObj as RcFile;
    if (!file) {
      message.error('文件读取失败，请重新选择');
      return;
    }

    setUploading(true);
    setProgress(0);
    setResult(null);
    try {
      const res = await dataImportService.uploadZip(file, setProgress);
      setResult(res);
      setProgress(100);
      if (res.failedCount === 0) message.success(res.message);
      else message.warning(res.message);
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '导入失败，请检查 ZIP 文件内容');
    } finally {
      setUploading(false);
    }
  }, [fileList]);

  return {
    fileList,
    uploading,
    progress,
    result,
    setFileList,
    setUploading,
    setProgress,
    setResult,
    handleUpload,
  };
};
