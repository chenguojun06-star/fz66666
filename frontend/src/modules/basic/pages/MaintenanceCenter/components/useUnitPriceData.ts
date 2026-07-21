import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Form } from 'antd';
import api from '@/utils/api';
import { isAdminUser as isAdminUserFn, useUser } from '@/utils/AuthContext';
import { useViewport } from '@/utils/useViewport';
import { readPageSize } from '@/utils/pageSizeStore';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';
import type { TemplateLibrary } from '@/types/style';
import type { EditTemplateModalRef } from '../../TemplateCenter/components/EditTemplateModal';
import { getErrorMessage, hasErrorFields } from '../../TemplateCenter/utils/templateUtils';
import {
  type PageResp,
  normalizeTemplateRecords, isProcessSizeTemplate, isUnitPriceTemplate,
  getDirectTemplatePriority,
} from './helpers';

interface UseUnitPriceDataParams {
  styleNo?: string;
}

export const useUnitPriceData = ({ styleNo }: UseUnitPriceDataParams) => {
  const { message } = App.useApp();
  const { user } = useUser();
  const { width: vpWidth } = useViewport();
  const modalWidth = vpWidth > 1600 ? '85vw' : '85vw';

  const [queryForm] = Form.useForm();
  const [createForm] = Form.useForm();
  const [applyForm] = Form.useForm();
  const [directRollbackForm] = Form.useForm();
  const editModalRef = useRef<EditTemplateModalRef>(null);

  const styleNoReqSeq = useRef(0);
  const styleNoTimerRef = useRef<number | undefined>(undefined);
  const [styleNoOptions, setStyleNoOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [styleNoLoading, setStyleNoLoading] = useState(false);
  const directTemplateHydratedRef = useRef(false);
  const [hydratingTemplate, setHydratingTemplate] = useState(false);

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TemplateLibrary[]>([]);
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(readPageSize(10));
  const [total, setTotal] = useState(0);
  const pageRef = useRef(1);
  const pageSizeRef = useRef(readPageSize(10));

  const [createOpen, setCreateOpen] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [syncPriceOpen, setSyncPriceOpen] = useState(false);
  const [activeRow, setActiveRow] = useState<TemplateLibrary | null>(null);

  const [rollbackTarget, setRollbackTarget] = useState<TemplateLibrary | null>(null);
  const [rollbackLoading, setRollbackLoading] = useState(false);
  const [, setCancelLocking] = useState(false);

  const [pendingDeleteTemplate, setPendingDeleteTemplate] = useState<TemplateLibrary | null>(null);
  const [deleteTemplateLoading, setDeleteTemplateLoading] = useState(false);

  const isAdminUser = useMemo(() => isAdminUserFn(user), [user]);
  const isFactoryUser = useMemo(() => !!user?.factoryId, [user]);

  const showSmartErrorNotice = useMemo(() => isSmartFeatureEnabled('smartErrorNotice' as any), []);

  /* ─── rollback ─── */
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

  /* ─── delete ─── */
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

  /* ─── style-no autocomplete ─── */
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

  /* ─── fetch list (process/process_size/process_price) ─── */
  const fetchList = useCallback(async (next?: { page?: number; pageSize?: number }) => {
    const p = next?.page ?? pageRef.current;
    const ps = next?.pageSize ?? pageSizeRef.current;
    setLoading(true);
    setSmartError(null);
    try {
      const v = styleNo ? {} : queryForm.getFieldsValue();
      const sourceStyleNo = String(styleNo || v.sourceStyleNo || '').trim();
      let templateType = styleNo ? '' : (v.templateType || '');
      /* process_size → process mapping + client-side filter */
      const wantSizes = templateType === 'process_size';
      const apiType = wantSizes ? 'process' : templateType;

      const res = await api.get<{ code: number; message: string; data: PageResp<TemplateLibrary> }>('/template-library/list', {
        params: { page: p, pageSize: ps, templateType: apiType, keyword: styleNo ? '' : (v.keyword || ''), sourceStyleNo },
      });
      if (res.code !== 200) { message.error(res.message || '获取模板列表失败'); return; }
      const keyword = String(v.keyword || '').trim().toLowerCase();
      let records = normalizeTemplateRecords(res.data, sourceStyleNo);
      records = records.filter((row) => {
        if (!keyword) return true;
        const haystack = [row.templateName, row.templateKey, row.sourceStyleNo]
          .map((value) => String(value || '').toLowerCase())
          .join(' ');
        return haystack.includes(keyword);
      });
      records = records.filter((row) => isUnitPriceTemplate(row, templateType));
      /* client-side sizes filter */
      if (wantSizes) {
        records = records.filter((r) => isProcessSizeTemplate(r));
      }
      const start = (p - 1) * ps;
      const pageRecords = styleNo ? records : records.slice(start, start + ps);
      setData(pageRecords);
      setTotal(records.length);
      pageRef.current = p;
      pageSizeRef.current = ps;
      setPage(p);
      setPageSize(ps);
    } catch (e: unknown) {
      const errMsg = getErrorMessage(e, '获取模板列表失败');
      message.error(errMsg);
      if (showSmartErrorNotice && hasErrorFields(e)) {
        setSmartError({ title: errMsg, reason: errMsg } as SmartErrorInfo);
      }
    } finally {
      setLoading(false);
    }
  }, [message, queryForm, showSmartErrorNotice, styleNo]);

  useEffect(() => {
    if (!styleNo) queryForm.setFieldsValue({ sourceStyleNo: undefined });
    fetchList({ page: 1, pageSize: pageSizeRef.current });
    fetchStyleNoOptions('');
  }, [fetchList, fetchStyleNoOptions, queryForm, styleNo]);

  const directRow = useMemo(() => {
    if (!styleNo || data.length === 0) return null;
    const candidates = [...data].sort((a, b) => getDirectTemplatePriority(a) - getDirectTemplatePriority(b));
    return candidates[0] ?? null;
  }, [data, styleNo]);

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
          templateTypes: ['process', 'process_price'],
        });
        if (res.code !== 200) {
          message.error(res.message || '自动生成工序单价模板失败');
          return;
        }
        await fetchList({ page: 1 });
      } catch (error: unknown) {
        message.error(getErrorMessage(error, '自动生成工序单价模板失败'));
      } finally {
        setHydratingTemplate(false);
      }
    })();
  }, [data.length, fetchList, hydratingTemplate, loading, message, styleNo]);

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

  /* ─── submitCreate ─── */
  const submitCreate = useCallback(async (values: Record<string, unknown>) => {
    try {
      const res = await api.post<{ code: number; message: string }>('/template-library/create-from-style', values);
      if (res.code !== 200) { message.error(res.message || '创建失败'); return; }
      message.success('模板已创建');
      setCreateOpen(false);
      createForm.resetFields();
      fetchList({ page: 1 });
    } catch (e: unknown) {
      message.error(getErrorMessage(e, '创建失败'));
    }
  }, [message, createForm, fetchList]);

  /* ─── submitApply ─── */
  const submitApply = useCallback(async (values: Record<string, unknown>) => {
    try {
      const body: Record<string, unknown> = { templateId: activeRow?.id, ...(values || {}) };
      const res = await api.post<{ code: number; message: string }>('/template-library/apply-to-style', body);
      if (res.code !== 200) { message.error(res.message || '应用失败'); return; }
      message.success('已应用到款号');
      setApplyOpen(false);
      applyForm.resetFields();
      fetchList({});
    } catch (e: unknown) {
      message.error(getErrorMessage(e, '应用失败'));
    }
  }, [message, applyForm, activeRow, fetchList]);

  return {
    // forms & refs
    queryForm, createForm, applyForm, directRollbackForm, editModalRef,
    // style-no autocomplete
    styleNoOptions, styleNoLoading, fetchStyleNoOptions, scheduleFetchStyleNos,
    // list data
    loading, data, smartError, setSmartError, page, pageSize, total, fetchList,
    // modals
    createOpen, setCreateOpen, applyOpen, setApplyOpen, syncPriceOpen, setSyncPriceOpen,
    activeRow, setActiveRow,
    // rollback
    rollbackTarget, setRollbackTarget, rollbackLoading, handleRollback, handleRollbackConfirm,
    // delete
    pendingDeleteTemplate, setPendingDeleteTemplate, deleteTemplateLoading, handleDelete, handleDeleteConfirm,
    // direct
    directRow, hydratingTemplate, handleDirectRollback,
    // user
    isFactoryUser,
    // smart
    showSmartErrorNotice,
    // submit
    submitCreate, submitApply,
    // misc
    modalWidth, message, setCancelLocking,
  };
};
