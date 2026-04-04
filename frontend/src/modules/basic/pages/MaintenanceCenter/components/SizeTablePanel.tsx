import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Card, Form, Image, Input, Select, Space, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';
import RejectReasonModal from '@/components/common/RejectReasonModal';
import api from '@/utils/api';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { isAdminUser as isAdminUserFn, useAuth } from '@/utils/AuthContext';
import { useViewport } from '@/utils/useViewport';
import { readPageSize } from '@/utils/pageSizeStore';
import type { TemplateLibrary } from '@/types/style';
import EditTemplateModal from '../../TemplateCenter/components/EditTemplateModal';
import type { EditTemplateModalRef } from '../../TemplateCenter/components/EditTemplateModal';
import TemplateInlineEditor from '../../TemplateCenter/components/inlineEditor/TemplateInlineEditor';
import {
  typeLabel, typeColor, formatTemplateKey, getErrorMessage,
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

interface SizeTablePanelProps { styleNo?: string; }

const SizeTablePanel: React.FC<SizeTablePanelProps> = ({ styleNo }) => {
  const { message } = App.useApp();
  const { user } = useAuth();
  const { width: vpWidth } = useViewport();
  const modalWidth = vpWidth > 1600 ? '60vw' : '60vw';

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

  const [pendingDeleteTemplate, setPendingDeleteTemplate] = useState<TemplateLibrary | null>(null);
  const [deleteTemplateLoading, setDeleteTemplateLoading] = useState(false);

  const isAdminUser = useMemo(() => isAdminUserFn(user), [user]);
  const isFactoryUser = useMemo(() => !!user?.factoryId, [user]);

  const isLocked = (row?: TemplateLibrary | null) => {
    const v = Number(row?.locked);
    return Number.isFinite(v) && v === 1;
  };

  const isProcessing = (row?: TemplateLibrary | null) => !!row && !isLocked(row);

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

  /* ─── fetch list (fixed type=size) ─── */
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
    } catch (e: any) {
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
        return (
          <RowActions actions={[
            { ...primary, primary: true },
            { key: 'delete', label: '删除', title: '删除', danger: true, onClick: () => handleDelete(row) },
          ]} />
        );
      },
    },
  ];
  /* ─── render ─── */
  return (
    <Card size="small" styles={{ body: { padding: '8px 12px' } }}>
      <Form form={queryForm} component={false} />
      {styleNo ? (
        <div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 16, color: 'rgba(0,0,0,0.45)' }}>加载中...</div>
          ) : hydratingTemplate ? (
            <div style={{ textAlign: 'center', padding: 16, color: 'rgba(0,0,0,0.45)' }}>正在根据当前款号生成尺寸模板...</div>
          ) : !directRow ? (
            <div style={{ textAlign: 'center', padding: 16, color: 'rgba(0,0,0,0.45)' }}>未找到该款号的数据</div>
          ) : isLocked(directRow) ? (
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
          ) : (
            <div style={directCardStyle}>
              {isProcessing(directRow) ? (
                <div style={processingBannerStyle}>
                  <div style={{ ...directTitleStyle, color: '#d46b08' }}>处理中</div>
                  <div style={{ ...directMetaStyle, color: '#ad6800' }}>这份尺寸模板已退回，当前还没有重新保存提交，保存后会自动重新锁定。</div>
                </div>
              ) : null}
              <TemplateInlineEditor
                row={directRow}
                compact
                maintenanceMode
                onSaved={async () => {
                  await fetchList({ page: 1 });
                }}
              />
            </div>
          )}
        </div>
      ) : (
        <>
          {/* toolbar */}
          <Form form={queryForm} layout="inline" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <Space wrap>
              <Form.Item name="keyword" noStyle>
                <Input placeholder="搜索名称/标识" allowClear style={{ width: 200 }} onPressEnter={() => fetchList({ page: 1 })} />
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
              <Button type="primary" onClick={() => fetchList({ page: 1 })}>刷新</Button>
            </Space>
          </Form>

          {/* table */}
          <ResizableTable
        storageKey="size-table-panel-list"
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

export default SizeTablePanel;
