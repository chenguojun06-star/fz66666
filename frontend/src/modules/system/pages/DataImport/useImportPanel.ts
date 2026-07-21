import { useState, useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { UploadFile, RcFile } from 'antd/es/upload/interface';
import { dataImportService } from '@/services/system/dataImport';
import type { ImportResult } from '@/services/system/dataImport';
import { message } from '@/utils/antdStatic';
import type { TabConfig } from './types';

export interface UseImportPanelReturn {
  fileList: UploadFile[];
  uploading: boolean;
  result: ImportResult | null;
  setFileList: Dispatch<SetStateAction<UploadFile[]>>;
  setUploading: Dispatch<SetStateAction<boolean>>;
  setResult: Dispatch<SetStateAction<ImportResult | null>>;
  handleDownloadTemplate: () => void;
  handleUpload: () => Promise<void>;
  handleReset: () => void;
}

export const useImportPanel = (config: TabConfig): UseImportPanelReturn => {
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleDownloadTemplate = useCallback(() => {
    void dataImportService.downloadTemplate(config.key);
  }, [config.key]);

  const handleUpload = useCallback(async () => {
    if (fileList.length === 0) {
      message.warning('请先选择文件');
      return;
    }
    const file = fileList[0].originFileObj as RcFile;
    if (!file) {
      message.error('文件读取失败，请重新选择');
      return;
    }

    setUploading(true);
    setResult(null);

    try {
      const res = await dataImportService.upload(config.key, file);
      setResult(res);
      if (res.failedCount === 0) {
        message.success(res.message);
      } else {
        message.warning(res.message);
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : '导入失败，请检查文件格式';
      message.error(errorMsg);
    } finally {
      setUploading(false);
    }
  }, [fileList, config.key]);

  const handleReset = useCallback(() => {
    setFileList([]);
    setResult(null);
  }, []);

  return {
    fileList,
    uploading,
    result,
    setFileList,
    setUploading,
    setResult,
    handleDownloadTemplate,
    handleUpload,
    handleReset,
  };
};
