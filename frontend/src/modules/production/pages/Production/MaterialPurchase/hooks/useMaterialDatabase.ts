/**
 * useMaterialDatabase — 物料资料库 tab：查询/分页/CRUD 弹窗
 * ~120 lines
 */
import { useCallback, useEffect, useState } from 'react';
import { Form } from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import { useModal } from '@/hooks';
import api, { unwrapApiData } from '@/utils/api';
import type { MaterialDatabase, MaterialDatabaseQueryParams } from '@/types/production';
import type { SmartErrorInfo } from '@/smart/core/types';
import {
  MATERIAL_DB_QUERY_STORAGE_KEY,
  type MaterialDatabaseModalData,
} from '../types';
import { toLocalDateTimeInputValue, toDateTimeLocalValue, buildImageFileList } from '../utils';

interface UseMaterialDatabaseOptions {
  message: any;
  activeTabKey: string;
  setSmartError: (e: SmartErrorInfo | null) => void;
  showSmartErrorNotice: boolean;
}

const DEFAULT_DB_PAGE_SIZE = 20;

export function useMaterialDatabase({
  message,
  activeTabKey,
  setSmartError,
  showSmartErrorNotice,
}: UseMaterialDatabaseOptions) {
  const [materialDatabaseList, setMaterialDatabaseList] = useState<MaterialDatabase[]>([]);
  const [materialDatabaseLoading, setMaterialDatabaseLoading] = useState(false);
  const [materialDatabaseTotal, setMaterialDatabaseTotal] = useState(0);
  const [materialDatabaseQueryParams, setMaterialDatabaseQueryParams] =
    useState<MaterialDatabaseQueryParams>(() => {
      const base: MaterialDatabaseQueryParams = { page: 1, pageSize: DEFAULT_DB_PAGE_SIZE };
      if (typeof window === 'undefined') return base;
      try {
        const raw = sessionStorage.getItem(MATERIAL_DB_QUERY_STORAGE_KEY);
        if (raw) return { ...base, ...JSON.parse(raw) };
      } catch { /**/ }
      return base;
    });
  const [materialDatabaseImageFiles, setMaterialDatabaseImageFiles] = useState<UploadFile[]>([]);

  const materialDatabaseModal = useModal<MaterialDatabaseModalData>();
  const [materialDatabaseForm] = Form.useForm();

  const fetchMaterialDatabaseList = useCallback(async () => {
    setMaterialDatabaseLoading(true);
    try {
      const res = await api.get<{ code: number; data: { records: MaterialDatabase[]; total: number } }>(
        '/material/database/list',
        { params: materialDatabaseQueryParams },
      );
      const data = unwrapApiData<{ records?: MaterialDatabase[]; total?: number }>(
        res as any,
        '获取物料资料库列表失败',
      );
      const records = Array.isArray(data?.records) ? data.records : [];
      setMaterialDatabaseList(records as MaterialDatabase[]);
      setMaterialDatabaseTotal(Number(data?.total || 0) || 0);
      if (showSmartErrorNotice) setSmartError(null);
    } catch (error) {
      const errMessage = (error as Error)?.message;
      if (showSmartErrorNotice) {
        setSmartError({
          title: '物料资料库加载失败',
          reason: errMessage || '网络异常或服务不可用，请稍后重试',
          code: 'MATERIAL_DATABASE_LIST_FAILED',
        });
      }
      message.error(errMessage || '获取物料资料库列表失败');
    } finally {
      setMaterialDatabaseLoading(false);
    }
  }, [materialDatabaseQueryParams, showSmartErrorNotice, setSmartError, message]);

  const openMaterialDatabaseDialog = (mode: 'create' | 'edit', material?: MaterialDatabase) => {
    if (mode === 'create') {
      const formattedNow = toLocalDateTimeInputValue();
      materialDatabaseForm.setFieldsValue({
        materialType: 'accessory',
        status: 'pending',
        createTime: formattedNow,
        completedTime: undefined,
        image: undefined,
      });
      setMaterialDatabaseImageFiles([]);
      materialDatabaseModal.open({ mode } as MaterialDatabaseModalData);
    } else if (material) {
      const formattedMaterial = {
        ...material,
        createTime: toDateTimeLocalValue(material?.createTime),
        completedTime: toDateTimeLocalValue(material?.completedTime),
      };
      materialDatabaseForm.setFieldsValue(formattedMaterial);
      setMaterialDatabaseImageFiles(buildImageFileList(material?.image));
      materialDatabaseModal.open({ ...material, mode } as MaterialDatabaseModalData);
    } else {
      materialDatabaseForm.resetFields();
      setMaterialDatabaseImageFiles([]);
      materialDatabaseModal.open({ mode } as MaterialDatabaseModalData);
    }
  };

  // Persist query params to sessionStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      sessionStorage.setItem(MATERIAL_DB_QUERY_STORAGE_KEY, JSON.stringify(materialDatabaseQueryParams));
    } catch { /**/ }
  }, [materialDatabaseQueryParams]);

  // Reload when tab switches to materialDatabase
  useEffect(() => {
    if (activeTabKey === 'materialDatabase') fetchMaterialDatabaseList();
  }, [activeTabKey, fetchMaterialDatabaseList, materialDatabaseQueryParams]);

  return {
    materialDatabaseList,
    materialDatabaseLoading,
    materialDatabaseTotal,
    materialDatabaseQueryParams,
    setMaterialDatabaseQueryParams,
    materialDatabaseImageFiles,
    setMaterialDatabaseImageFiles,
    materialDatabaseForm,
    materialDatabaseModal,
    fetchMaterialDatabaseList,
    openMaterialDatabaseDialog,
  };
}
