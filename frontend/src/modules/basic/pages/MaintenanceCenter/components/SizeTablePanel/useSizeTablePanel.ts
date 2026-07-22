import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Form } from 'antd';
import api from '@/utils/api';
import { isAdminUser as isAdminUserFn, useUser } from '@/utils/AuthContext';
import { useViewport } from '@/utils/useViewport';
import { readPageSize } from '@/utils/pageSizeStore';
import type { TemplateLibrary } from '@/types/style';
import type { EditTemplateModalRef } from '../../../TemplateCenter/components/EditTemplateModal';
import { getErrorMessage } from '../../../TemplateCenter/utils/templateUtils';

interface PageResp<T> { records: T[]; total: number }

const normalizeTemplateRecords = (payload: unknown, sourceStyleNo?: string) => {
  const records = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as PageResp<TemplateLibrary> | undefined)?.records)
      ? (payload as PageResp<TemplateLibrary>).records
      : [];
  const normalizedStyleNo = String(sourceStyleNo || '').trim();
  return records
    .filter((item): item is TemplateLibrary => !!item)
    .filter((item) => !normalizedStyleNo || String(item.sourceStyleNo || '').trim() === normalizedStyleNo);
};

export interface UseSizeTablePanelOptions {
  styleNo?: string;
  onSaved?: () => void;
}

export const useSizeTablePanel = ({ styleNo }: UseSizeTablePanelOptions) => {
  const { message } = App.useApp();
  const { user } = useUser();
  const { width: vpWidth } = useViewport();
  const modalWidth = vpWidth > 1600 ? '85vw' : '85vw';

  const [queryForm] = Form.useForm();
  const [directRollbackForm] = Form.useForm();
  const editModalRef = useRef<EditTemplateModalRef>(null);

  const styleNoReqSeq = useRef(0);
  const styleNoTimerRef = useRef<number | undefined>(undefined);
  const directTemplateHydratedRef = useRef(false);
  const [styleNoOptions, setStyleNoOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [styleNoLoading, setStyleNoLoading] = useState(false);
  const [hydratingTemplate, setHydratingTemplate] = useState(false);

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TemplateLibrary[]>([]);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(readPageSize(10));
  const [total, setTotal] = useState(0);
  const pageRef = useRef(1);
  const pageSizeRef = useRef(readPageSize(10));

  const [rollbackTarget, setRollbackTarget] = useState<TemplateLibrary | null>(null);
  const [rollbackLoading, setRollbackLoading] = useState(false);
  const [, setCancelLocking] = useState(false);

  const [pendingDeleteTemplate, setPendingDeleteTemplate] = useState<TemplateLibrary | null>(null);
  const [deleteTemplateLoading, setDeleteTemplateLoading] = useState(false);

  const isAdminUser = useMemo(() => isAdminUserFn(user), [user]);
  const isFactoryUser = useMemo(() => !!user?.factoryId, [user]);

  const isLocked = (row?: TemplateLibrary | null) => {
    const v = Number(row?.locked);
    return Number.isFinite(v) && v === 1;
  };

  const isProcessing = (row?: TemplateLibrary | null) => !!row && !isLocked(row);

  const handleRollback = (row: TemplateLibrary) => {
    if (!row?.id) return;
    if (!isAdminUser && !isFactoryUser) { message.error('仅管理员可退回修改'); return; }
    setRollbackTarget(row);
  };

  const handleRollbackConfirm = async (reason: string) => {
    if (!rollbackTarget?.id) return;
    const target = rollbackTarget;
    setRollbackLoading(true);
    try {
      const res = await api.post<{ code: number; message: string }>(`/template-library/${rollbackTarget.id}/rollback`, { reason });
      if (res.code !== 200) { message.error(res.message || '退回失败'); return; }
      message.success('已退回，可修改');
      setRollbackTarget(null);
      await fetchList({ page: 1 });
      if (styleNo && target) {
        editModalRef.current?.openEdit({ ...target, locked: 0 });
      }
    } finally {
      setRollbackLoading(false);
    }
  };

  const handleDelete = (row: TemplateLibrary) => {
    if (!row?.id) return;
    setPendingDeleteTemplate(row);
  };

  const handleDeleteConfirm = async (reason: string) => {
    if (!pendingDeleteTemplate?.id) return;
    setDeleteTemplateLoading(true);
    try {
      const res = await api.delete<{ code: number; message: string }>(`/template-library/${pendingDeleteTemplate.id}`, { params: { reason } });
      if (res.code !== 200) { message.error(res.message || '删除失败'); return; }
      message.success('已删除');
      setPendingDeleteTemplate(null);
      fetchList({ page: 1 });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : (typeof e === 'object' && e !== null && 'message' in e ? String((e as { message?: unknown }).message || '') : '');
      message.error(msg || '删除失败');
    } finally {
      setDeleteTemplateLoading(false);
    }
  };

  const fetchStyleNoOptions = useCallback(async (keyword?: string) => {
    const seq = (styleNoReqSeq.current += 1);
    setStyleNoLoading(true);
    try {
      const res = await api.get<{ code: number; data: Array<{ styleNo: string; styleName?: string }> }>('/template-library/process-price-style-options', {
        params: { keyword: String(keyword ?? '').trim() },
      });
      if (seq !== styleNoReqSeq.current) return;
      if (res.code !== 200) return;
      const records = Array.isArray(res.data) ? res.data : [];
      const next = records
        .map((r) => {
          const sn = String(r?.styleNo || '').trim();
          const nm = String(r?.styleName || '').trim();
          return sn ? { value: sn, label: nm ? `${sn}（${nm}）` : sn } : null;
        })
        .filter(Boolean) as Array<{ value: string; label: string }>;
      setStyleNoOptions(next);
    } catch { /* ignore */ } finally {
      if (seq === styleNoReqSeq.current) setStyleNoLoading(false);
    }
  }, []);

  const scheduleFetchStyleNos = (keyword: string) => {
    if (styleNoTimerRef.current != null) window.clearTimeout(styleNoTimerRef.current);
    styleNoTimerRef.current = window.setTimeout(() => fetchStyleNoOptions(keyword), 250);
  };

  const fetchList = useCallback(async (next?: { page?: number; pageSize?: number }) => {
    const p = next?.page ?? pageRef.current;
    const ps = next?.pageSize ?? pageSizeRef.current;
    setLoading(true);
    try {
      const v = styleNo ? {} : queryForm.getFieldsValue();
      const sourceStyleNo = String(styleNo || v.sourceStyleNo || '').trim();
      const res = await api.get<{ code: number; message: string; data: PageResp<TemplateLibrary> }>('/template-library/list', {
        params: { page: p, pageSize: ps, templateType: 'size', keyword: styleNo ? '' : (v.keyword || ''), sourceStyleNo },
      });
      if (res.code !== 200) { message.error(res.message || '获取模板列表失败'); return; }
      const keyword = String(v.keyword || '').trim().toLowerCase();
      const allRecords = normalizeTemplateRecords(res.data, sourceStyleNo);
      const filteredRecords = allRecords.filter((item) => {
        if (!keyword) return true;
        const haystack = [item.templateName, item.templateKey, item.sourceStyleNo]
          .map((value) => String(value || '').toLowerCase())
          .join(' ');
        return haystack.includes(keyword);
      });
      const start = (p - 1) * ps;
      const pageRecords = styleNo ? filteredRecords : filteredRecords.slice(start, start + ps);
      setData(pageRecords);
      setTotal(filteredRecords.length);
      pageRef.current = p;
      pageSizeRef.current = ps;
      setPage(p);
      setPageSize(ps);
    } catch (e: unknown) {
      message.error(getErrorMessage(e, '获取尺寸表列表失败'));
    } finally {
      setLoading(false);
    }
  }, [message, queryForm, styleNo]);

  useEffect(() => {
    if (!styleNo) queryForm.setFieldsValue({ sourceStyleNo: undefined });
    fetchList({ page: 1, pageSize: pageSizeRef.current });
    fetchStyleNoOptions('');
  }, [fetchList, fetchStyleNoOptions, queryForm, styleNo]);

  useEffect(() => {
    if (!styleNo) {
      directTemplateHydratedRef.current = false;
      return;
    }
    if (loading || hydratingTemplate || data.length > 0 || directTemplateHydratedRef.current) return;

    directTemplateHydratedRef.current = true;
    setHydratingTemplate(true);

    void (async () => {
      try {
        const res = await api.post<{ code: number; message?: string }>('/template-library/create-from-style', {
          sourceStyleNo: styleNo,
          templateTypes: ['size'],
        });
        if (res.code !== 200) {
          message.error(res.message || '自动生成尺寸模板失败');
          return;
        }
        await fetchList({ page: 1 });
      } catch (error: unknown) {
        message.error(getErrorMessage(error, '自动生成尺寸模板失败'));
      } finally {
        setHydratingTemplate(false);
      }
    })();
  }, [data.length, fetchList, hydratingTemplate, loading, message, styleNo]);

  const directRow = styleNo ? (data[0] ?? null) : null;

  const handleDirectRollback = async () => {
    if (!directRow?.id) return;
    try {
      const values = await directRollbackForm.validateFields();
      setRollbackLoading(true);
      const res = await api.post<{ code: number; message: string }>(`/template-library/${directRow.id}/rollback`, { reason: values.reason });
      if (res.code !== 200) {
        message.error(res.message || '退回失败');
        return;
      }
      message.success('已退回，可直接在当前页面继续编辑');
      directRollbackForm.resetFields();
      await fetchList({ page: 1 });
    } catch (error: unknown) {
      message.error(getErrorMessage(error, '退回失败'));
    } finally {
      setRollbackLoading(false);
    }
  };

  const handleCancelEdit = async () => {
    if (!directRow?.id) return;
    setCancelLocking(true);
    try {
      await api.post(`/template-library/${directRow.id}/lock`);
      await fetchList({ page: 1 });
    } catch (error: unknown) {
      message.error(getErrorMessage(error, '取消修改失败'));
    } finally {
      setCancelLocking(false);
    }
  };

  const handleRollbackCancel = () => setRollbackTarget(null);
  const handleDeleteCancel = () => setPendingDeleteTemplate(null);

  return {
    queryForm,
    directRollbackForm,
    editModalRef,
    styleNoOptions,
    styleNoLoading,
    hydratingTemplate,
    loading,
    data,
    page,
    pageSize,
    total,
    rollbackTarget,
    rollbackLoading,
    pendingDeleteTemplate,
    deleteTemplateLoading,
    isAdminUser,
    isFactoryUser,
    modalWidth,
    directRow,
    isLocked,
    isProcessing,
    handleRollback,
    handleRollbackConfirm,
    handleRollbackCancel,
    handleDelete,
    handleDeleteConfirm,
    handleDeleteCancel,
    fetchList,
    fetchStyleNoOptions,
    scheduleFetchStyleNos,
    handleDirectRollback,
    handleCancelEdit,
  };
};
