import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Card, Form, Image, Input, Select, Space, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';
import RejectReasonModal from '@/components/common/RejectReasonModal';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';
import api from '@/utils/api';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { isAdminUser as isAdminUserFn, useAuth } from '@/utils/AuthContext';
import { useViewport } from '@/utils/useViewport';
import { readPageSize } from '@/utils/pageSizeStore';
import type { TemplateLibrary } from '@/types/style';
import EditTemplateModal from '../../TemplateCenter/components/EditTemplateModal';
import type { EditTemplateModalRef } from '../../TemplateCenter/components/EditTemplateModal';
import TemplateInlineEditor from '../../TemplateCenter/components/inlineEditor/TemplateInlineEditor';
import CreateFromStyleModal from '../../TemplateCenter/components/CreateFromStyleModal';
import ApplyToStyleModal from '../../TemplateCenter/components/ApplyToStyleModal';
import SyncProcessPriceModal from '../../TemplateCenter/components/SyncProcessPriceModal';
import {
  typeLabel, typeColor, formatTemplateKey, getErrorMessage, hasErrorFields,
} from '../../TemplateCenter/utils/templateUtils';
import type { TemplateLibraryRecord } from '../../TemplateCenter/utils/templateUtils';

const { Text } = Typography;
const { TextArea } = Input;

const directCardStyle = {
  border: '1px solid #ececec',
  borderRadius: 10,
  padding: 12,
  background: '#fff',
} as const;

const directStackStyle = { display: 'grid', gap: 10 } as const;

const directTitleStyle = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--color-text-primary)',
  lineHeight: 1.2,
} as const;

const directMetaStyle = {
  fontSize: 12,
  color: 'var(--neutral-text-secondary)',
  lineHeight: 1.4,
} as const;

const directFieldLabelStyle = {
  marginBottom: 4,
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--neutral-text-secondary)',
} as const;

const processingBannerStyle = {
  marginBottom: 10,
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid #ffd591',
  background: '#fff7e6',
  display: 'grid',
  gap: 4,
} as const;

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

const templateTypeOptions = [
  { label: '全部类型', value: '' },
  { label: '工序进度单价', value: 'process' },
  { label: '多码工序进度单价', value: 'process_size' },
];

interface UnitPricePanelProps { styleNo?: string; }

const parseTemplateContent = (content: unknown) => {
  if (typeof content === 'object' && content !== null) return content;
  const text = String(content ?? '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const isProcessSizeTemplate = (row: TemplateLibrary) => {
  const parsed = parseTemplateContent(row?.templateContent);
  return !!parsed && typeof parsed === 'object' && Array.isArray((parsed as { sizes?: unknown[] }).sizes);
};

const isUnitPriceTemplate = (row: TemplateLibrary, selectedType?: string) => {
  const normalizedSelectedType = String(selectedType || '').trim().toLowerCase();
  const normalizedRowType = String(row?.templateType || '').trim().toLowerCase();
  if (normalizedRowType === 'size' || normalizedRowType === 'bom') return false;
  if (!normalizedSelectedType) {
    return normalizedRowType === 'process' || normalizedRowType === 'process_price';
  }
  if (normalizedSelectedType === 'process_size') {
    return (normalizedRowType === 'process' || normalizedRowType === 'process_price') && isProcessSizeTemplate(row);
  }
  return normalizedRowType === normalizedSelectedType;
};

const getDirectTemplatePriority = (row: TemplateLibrary) => {
  const normalizedRowType = String(row?.templateType || '').trim().toLowerCase();
  if (normalizedRowType === 'process_price') return 0;
  if (normalizedRowType === 'process' && !isProcessSizeTemplate(row)) return 1;
  if (normalizedRowType === 'process') return 2;
  return 99;
};

const UnitPricePanel: React.FC<UnitPricePanelProps> = ({ styleNo }) => {
  const { message } = App.useApp();
  const { user } = useAuth();
  const { width: vpWidth } = useViewport();
  const modalWidth = vpWidth > 1600 ? '60vw' : '60vw';

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

  const isLocked = (row?: TemplateLibrary | null) => {
    const v = Number(row?.locked);
    return Number.isFinite(v) && v === 1;
  };

  const isProcessing = (row?: TemplateLibrary | null) => !!row && !isLocked(row);

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
    } catch (e: any) {
      const msg = e instanceof Error ? e.message : (typeof e === 'object' && e && 'message' in e ? String((e as { message?: unknown }).message || '') : '');
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
    } catch (e: any) {
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
    } catch (e: any) {
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
    } catch (e: any) {
      message.error(getErrorMessage(e, '应用失败'));
    }
  }, [message, applyForm, activeRow, fetchList]);

  /* ─── columns ─── */
  const columns: ColumnsType<TemplateLibraryRecord> = [
    {
      title: '图片', dataIndex: 'styleCoverUrl', key: 'styleCoverUrl', width: 72, align: 'center' as const,
      render: (url: string) => url
        ? <Image src={getFullAuthedFileUrl(url)} width={48} style={{ height: 'auto', display: 'block', borderRadius: 4 }} preview={false} />
        : <div style={{ width: 48, height: 48, margin: '0 auto', background: 'var(--color-bg-subtle)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc', fontSize: 11 }}>无图</div>,
    },
    { title: '名称', dataIndex: 'templateName', key: 'templateName', width: 220, render: (v) => String(v || '-') },
    { title: '类型', dataIndex: 'templateType', key: 'templateType', width: 90,
      render: (v) => <Tag color={typeColor(String(v || ''))}>{typeLabel(String(v || ''))}</Tag> },
    {
      title: (<Space size={6}><span>标识</span><Tooltip title="系统内部用来识别模板来源/用途"><span style={{ cursor: 'help', color: 'rgba(0,0,0,0.45)' }}>?</span></Tooltip></Space>),
      dataIndex: 'templateKey', key: 'templateKey', width: 180,
      render: (v) => { const f = formatTemplateKey(v); return f.full ? <Text ellipsis={{ tooltip: f.full }} style={{ maxWidth: 160, display: 'inline-block' }}>{f.text}</Text> : '-'; },
    },
    { title: '来源款号', dataIndex: 'sourceStyleNo', key: 'sourceStyleNo', width: 140, render: (v) => String(v || '-') },
    { title: '更新时间', dataIndex: 'updateTime', key: 'updateTime', width: 170, render: (v) => String(v || '-') },
    { title: '操作人', dataIndex: 'operatorName', key: 'operatorName', width: 120, render: (v) => String(v || '-') },
    { title: '状态', dataIndex: 'locked', key: 'locked', width: 110,
      render: (_: unknown, row) => isLocked(row) ? <Tag color="default">已锁定</Tag> : <Tag color="warning">处理中</Tag> },
    {
      title: '操作', key: 'action', width: isFactoryUser ? 100 : 170,
      render: (_, row) => {
        const locked = isLocked(row);
        if (isFactoryUser) {
          const fa: RowAction = locked
            ? { key: 'unlock', label: '解锁', onClick: () => setRollbackTarget(row) }
            : { key: 'edit', label: '继续处理', onClick: () => editModalRef.current?.openEdit(row) };
          return <RowActions actions={[{ ...fa, primary: true }]} />;
        }
        const primary: RowAction = locked
          ? { key: 'rollback', label: '退回', title: '退回', onClick: () => handleRollback(row) }
          : { key: 'edit', label: '继续处理', title: '继续处理', onClick: () => editModalRef.current?.openEdit(row) };
        const actions: RowAction[] = [{ ...primary, primary: true }];
        actions.push({ key: 'delete', label: '删除', title: '删除', danger: true, onClick: () => handleDelete(row) });
        if (!locked) {
          actions.push({ key: 'apply', label: '应用到款号', title: '应用到款号', onClick: () => { setActiveRow(row); setApplyOpen(true); } });
        }
        return <RowActions actions={actions} />;
      },
    },
  ];

  const renderDirectEditor = () => {
    if (loading) {
      return <div style={{ textAlign: 'center', padding: 16, color: 'rgba(0,0,0,0.45)' }}>加载中...</div>;
    }
    if (hydratingTemplate) {
      return <div style={{ textAlign: 'center', padding: 16, color: 'rgba(0,0,0,0.45)' }}>正在根据当前款号生成工序单价模板...</div>;
    }
    if (!directRow) {
      return <div style={{ textAlign: 'center', padding: 16, color: 'rgba(0,0,0,0.45)' }}>未找到该款号的数据</div>;
    }
    if (isLocked(directRow)) {
      return (
        <div style={directStackStyle}>
          <div style={directCardStyle}>
            <div style={{ marginBottom: 8 }}>
              <span style={directTitleStyle}>退回后再维护</span>
            </div>
            <Form form={directRollbackForm} layout="vertical">
              <div style={directFieldLabelStyle}>退回原因</div>
              <Form.Item name="reason" rules={[{ required: true, message: '请填写退回原因' }]} style={{ marginBottom: 8 }}>
                <TextArea autoSize={{ minRows: 2, maxRows: 4 }} placeholder="请说明本次退回原因" />
              </Form.Item>
            </Form>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                type="default"
                danger
                size="small"
                loading={rollbackLoading}
                onClick={handleDirectRollback}
                style={{ background: '#fff', color: '#ff4d4f', borderColor: '#ff4d4f' }}
              >
                确认退回
              </Button>
            </div>
          </div>
          <div style={directCardStyle}>
            <TemplateInlineEditor row={directRow} readOnly compact maintenanceMode onSaved={() => fetchList({ page: 1 })} />
          </div>
        </div>
      );
    }
    return (
      <div style={directCardStyle}>
        {isProcessing(directRow) ? (
          <div style={processingBannerStyle}>
            <div style={{ ...directTitleStyle, color: '#d46b08' }}>处理中</div>
            <div style={{ ...directMetaStyle, color: '#ad6800' }}>这份工序单价模板已退回，保存后会自动重新锁定。</div>
          </div>
        ) : null}
        <TemplateInlineEditor
          row={directRow}
          compact
          maintenanceMode
          onCancel={async () => {
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
          }}
          onSaved={async () => {
            await fetchList({ page: 1 });
          }}
        />
      </div>
    );
  };

  /* ─── render ─── */
  return (
    <Card
      size="small"
      styles={{ body: { padding: '8px 12px' } }}
    >
      <Form form={queryForm} component={false} />
      {styleNo ? renderDirectEditor() : (
        <>
          {/* smart error notice */}
          {showSmartErrorNotice && smartError && (
            <SmartErrorNotice error={smartError} onFix={() => setSmartError(null)} />
          )}

          {/* toolbar */}
          <Form form={queryForm} layout="inline" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <Space wrap>
              <Form.Item name="keyword" noStyle>
                <Input placeholder="搜索名称/标识" allowClear style={{ width: 200 }} onPressEnter={() => fetchList({ page: 1 })} />
              </Form.Item>
              <Form.Item name="templateType" noStyle>
                <Select options={templateTypeOptions} defaultValue="" style={{ width: 140 }} onChange={() => fetchList({ page: 1 })} />
              </Form.Item>
              <Form.Item name="sourceStyleNo" noStyle>
                <Select
                  showSearch allowClear placeholder="按来源款号筛选" style={{ width: 200 }}
                  options={styleNoOptions} loading={styleNoLoading} filterOption={false}
                  onSearch={scheduleFetchStyleNos}
                  onOpenChange={(open) => { if (open) fetchStyleNoOptions(''); }}
                />
              </Form.Item>
            </Space>
            <Space>
              {!isFactoryUser && (
                <Button onClick={() => setCreateOpen(true)}>从款号生成模板</Button>
              )}
              <Button type="primary" onClick={() => fetchList({ page: 1 })}>刷新</Button>
              {!isFactoryUser && (
                <Button onClick={() => setSyncPriceOpen(true)}>独立维护工序单价</Button>
              )}
            </Space>
          </Form>

          {/* table */}
          <ResizableTable
            storageKey="unit-price-panel-list"
            rowKey={(r) => String((r as TemplateLibraryRecord).id || (r as TemplateLibraryRecord).templateKey)}
            loading={loading}
            columns={columns}
            dataSource={data as TemplateLibraryRecord[]}
            pagination={{
              current: page, pageSize, total, showSizeChanger: true, showTotal: (t) => `共 ${t} 条`,
              onChange: (p, ps) => fetchList({ page: p, pageSize: ps }),
            }}
            scroll={{ x: 'max-content' }}
            size="small"
          />
        </>
      )}

      {/* create from style modal */}
      <CreateFromStyleModal
        open={createOpen}
        form={createForm}
        styleNoOptions={styleNoOptions}
        styleNoLoading={styleNoLoading}
        modalWidth={modalWidth}
        onCancel={() => { setCreateOpen(false); createForm.resetFields(); }}
        onOk={() => submitCreate({})}
        onStyleNoSearch={scheduleFetchStyleNos}
        onStyleNoDropdownOpen={(o) => { if (o) fetchStyleNoOptions(''); }}
      />

      {/* apply to style modal */}
      <ApplyToStyleModal
        open={applyOpen}
        form={applyForm}
        activeRow={activeRow}
        styleNoOptions={styleNoOptions}
        styleNoLoading={styleNoLoading}
        modalWidth={modalWidth}
        typeLabel={typeLabel}
        onCancel={() => { setApplyOpen(false); applyForm.resetFields(); }}
        onOk={() => submitApply({})}
        onStyleNoSearch={scheduleFetchStyleNos}
        onStyleNoDropdownOpen={(o) => { if (o) fetchStyleNoOptions(''); }}
      />

      {/* edit modal */}
      <EditTemplateModal
        ref={editModalRef}
        styleNoOptions={styleNoOptions}
        styleNoLoading={styleNoLoading}
        modalWidth={modalWidth}
        onFetchList={() => fetchList({})}
        onStyleNoSearch={scheduleFetchStyleNos}
        onStyleNoDropdownOpen={() => fetchStyleNoOptions('')}
      />

      {/* sync process price modal */}
      <SyncProcessPriceModal
        open={syncPriceOpen}
        onCancel={() => { setSyncPriceOpen(false); fetchList({}); }}
      />
      {/* rollback modal */}
      <RejectReasonModal
        open={rollbackTarget !== null}
        title="退回该模板为可编辑？"
        description={rollbackTarget?.templateName}
        loading={rollbackLoading}
        onOk={handleRollbackConfirm}
        onCancel={() => setRollbackTarget(null)}
      />

      {/* delete modal */}
      <RejectReasonModal
        open={pendingDeleteTemplate !== null}
        title="确认删除该模板？"
        description={pendingDeleteTemplate?.templateName}
        fieldLabel="删除原因"
        okText="删除"
        loading={deleteTemplateLoading}
        onOk={handleDeleteConfirm}
        onCancel={() => setPendingDeleteTemplate(null)}
      />
    </Card>
  );
};

export default UnitPricePanel;
