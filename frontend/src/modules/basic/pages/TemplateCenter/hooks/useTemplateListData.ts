import { useCallback, useMemo, useRef, useState } from 'react';
import { App, Form } from 'antd';
import api from '@/utils/api';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';
import { readPageSize } from '@/utils/pageSizeStore';
import type { TemplateLibrary } from '@/types/style';
import { getErrorMessage } from '../utils/templateUtils';

type PageResp<T> = { records: T[]; total: number };

export const TEMPLATE_TYPE_OPTIONS = [
  { value: '', label: '全部类型' },
  { value: 'bom', label: 'BOM' },
  { value: 'size', label: '尺寸' },
  { value: 'process', label: '工序进度单价' },
  { value: 'process_size', label: '多码工序进度单价' },
];

export const useTemplateListData = () => {
  const { message } = App.useApp();
  const [queryForm] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TemplateLibrary[]>([]);
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const showSmartErrorNotice = useMemo(() => isSmartFeatureEnabled('smart.production.precheck.enabled'), []);

  const reportSmartError = (title: string, reason?: string, code?: string) => {
    if (!showSmartErrorNotice) return;
    setSmartError({ title, reason, code });
  };

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(readPageSize(10));
  const [total, setTotal] = useState(0);
  const pageRef = useRef(1);
  const pageSizeRef = useRef(readPageSize(10));

  const fetchList = useCallback(async (next?: { page?: number; pageSize?: number }) => {
    const p = next?.page ?? pageRef.current;
    const ps = next?.pageSize ?? pageSizeRef.current;
    setLoading(true);
    try {
      const v = queryForm.getFieldsValue();
      const selectedType = String(v.templateType || '').trim();
      const requestType = selectedType === 'process_size' ? 'process' : selectedType;
      const res = await api.get<{ code: number; message: string; data: PageResp<TemplateLibrary> }>('/template-library/list', {
        params: {
          page: p,
          pageSize: ps,
          templateType: requestType || '',
          keyword: v.keyword || '',
          sourceStyleNo: v.sourceStyleNo || '',
        },
      });
      if (res.code !== 200) {
        reportSmartError('模板列表加载失败', res.message || '服务返回异常，请稍后重试', 'TEMPLATE_LIST_LOAD_FAILED');
        message.error(res.message || '获取模板列表失败');
        return;
      }
      const pageData: PageResp<TemplateLibrary> = res.data || { records: [], total: 0 };
      const records = Array.isArray(pageData.records) ? pageData.records : [];
      const filtered = records.filter((row) => {
        if (selectedType === 'process_size') {
          try {
            const raw = (row as TemplateLibrary & Record<string, unknown>)?.templateContent;
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            const sizes = parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).sizes)
              ? (parsed as Record<string, unknown>).sizes as unknown[]
              : [];
            return sizes.length > 0;
          } catch {
            return false;
          }
        }
        return true;
      });
      setData(filtered);
      setTotal(Number(pageData.total || 0));
      pageRef.current = p;
      pageSizeRef.current = ps;
      setPage(p);
      setPageSize(ps);
      if (showSmartErrorNotice) setSmartError(null);
    } catch (e: unknown) {
      reportSmartError('模板列表加载失败', getErrorMessage(e, '获取模板列表失败'), 'TEMPLATE_LIST_LOAD_EXCEPTION');
      message.error(getErrorMessage(e, '获取模板列表失败'));
    } finally {
      setLoading(false);
    }
  }, [queryForm, message]);

  return {
    queryForm,
    loading,
    data,
    smartError,
    showSmartErrorNotice,
    page,
    pageSize,
    total,
    fetchList,
    setSmartError,
  };
};
