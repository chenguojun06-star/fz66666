import { App } from 'antd';
import type { FormInstance } from 'antd/es/form';
import { useCallback, useState } from 'react';
import { StyleBom, TemplateLibrary } from '@/types/style';
import api from '@/utils/api';
import { normalizeMaterialType } from '@/utils/materialType';
import type { MaterialType } from './useBomColumns';

interface UseStyleBomDataOptions {
  styleId: string | number;
  form: FormInstance;
  sortBomRows: (rows: StyleBom[]) => StyleBom[];
  onAfterFetchBom?: () => void;
}

const useStyleBomData = ({
  styleId,
  form,
  sortBomRows,
  onAfterFetchBom,
}: UseStyleBomDataOptions) => {
  const { message } = App.useApp();
  const [data, setData] = useState<StyleBom[]>([]);
  const [loading, setLoading] = useState(false);
  const [bomTemplates, setBomTemplates] = useState<TemplateLibrary[]>([]);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [currentStyleNo, setCurrentStyleNo] = useState('');

  const fetchBom = useCallback(async (): Promise<StyleBom[]> => {
    let nextData: StyleBom[] = [];
    setLoading(true);
    try {
      const result = await api.get<{ code: number; data: StyleBom[] }>(`/style/bom/list?styleId=${styleId}`);
      if (result.code === 200) {
        const list = (result.data || []) as StyleBom[];
        const normalized = list.map((row) => ({
          ...row,
          groupName: '',
          materialType: normalizeMaterialType<MaterialType>((row as Record<string, unknown>).materialType),
        }));
        nextData = sortBomRows(normalized);
        setData(nextData);
        onAfterFetchBom?.();
        form.resetFields();
      }
    } catch {
      message.error('获取BOM失败');
    } finally {
      setLoading(false);
    }

    return nextData;
  }, [form, message, onAfterFetchBom, sortBomRows, styleId]);

  const fetchBomTemplates = useCallback(async (sourceStyleNo?: string) => {
    const sn = String(sourceStyleNo ?? '').trim();
    setTemplateLoading(true);
    try {
      const res = await api.get<{ code: number; data: unknown }>('/template-library/list', {
        params: {
          page: 1,
          pageSize: 200,
          templateType: 'bom',
          keyword: '',
          sourceStyleNo: sn,
        },
      });
      const result = res as Record<string, unknown>;
      if (result.code === 200) {
        const remoteData = result.data as any;
        let records: TemplateLibrary[] = [];
        if (Array.isArray(remoteData)) {
          records = remoteData as TemplateLibrary[];
        } else if (remoteData && typeof remoteData === 'object' && 'records' in remoteData) {
          records = ((remoteData as Record<string, unknown>).records || []) as TemplateLibrary[];
        }
        setBomTemplates(records);
        return;
      }
    } catch {
      // 忽略错误
    } finally {
      setTemplateLoading(false);
    }

    try {
      const res = await api.get<{ code: number; data: unknown[] }>('/template-library/type/bom');
      const result = res as Record<string, unknown>;
      if (result.code === 200) {
        setBomTemplates(Array.isArray(result.data) ? (result.data as TemplateLibrary[]) : []);
      }
    } catch {
      // 忽略错误
    }
  }, []);

  const fetchCurrentStyleNo = useCallback(async () => {
    const sid = Number(styleId);
    if (!Number.isFinite(sid) || sid <= 0) {
      setCurrentStyleNo('');
      return;
    }
    try {
      const res = await api.get<{ code: number; data: Record<string, unknown> }>(`/style/info/${sid}`);
      const result = res as Record<string, unknown>;
      if (result.code === 200) {
        setCurrentStyleNo(String((result.data as Record<string, unknown>)?.styleNo || '').trim());
      }
    } catch {
      setCurrentStyleNo('');
    }
  }, [styleId]);

  return {
    data,
    setData,
    loading,
    setLoading,
    bomTemplates,
    setBomTemplates,
    templateLoading,
    currentStyleNo,
    fetchBom,
    fetchBomTemplates,
    fetchCurrentStyleNo,
  };
};

export default useStyleBomData;
