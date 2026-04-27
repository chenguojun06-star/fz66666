import React, { useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Card, Form, Image, Input, Select, Space, Tabs, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import PageLayout from '@/components/common/PageLayout';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import api from '@/utils/api';
import { isAdminUser as isAdminUserFn, useAuth } from '@/utils/AuthContext';
import { useViewport } from '@/utils/useViewport';
import type { TemplateLibrary } from '@/types/style';
import SyncProcessPriceModal from './components/SyncProcessPriceModal';
import CreateFromStyleModal from './components/CreateFromStyleModal';
import ApplyToStyleModal from './components/ApplyToStyleModal';
import EditTemplateModal from './components/EditTemplateModal';
import StyleProcessKnowledgeTab from './components/StyleProcessKnowledgeTab';
import type { EditTemplateModalRef } from './components/EditTemplateModal';
import TemplateViewContent from './components/TemplateViewContent';
import RejectReasonModal from '@/components/common/RejectReasonModal';
import { typeLabel, typeColor, formatTemplateKey, getErrorMessage } from './utils/templateUtils';
import type { TemplateLibraryRecord } from './utils/templateUtils';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { usePersistentState } from '@/hooks/usePersistentState';
import { useTemplateListData, TEMPLATE_TYPE_OPTIONS } from './hooks/useTemplateListData';
import { useStyleNoSearch } from './hooks/useStyleNoSearch';
import { useTemplateActions } from './hooks/useTemplateActions';

const { Text } = Typography;

const TemplateCenter: React.FC = () => {
  const { message } = App.useApp();
  const { user } = useAuth();
  const { modalWidth } = useViewport();
  const editModalRef = useRef<EditTemplateModalRef>(null);

  const [templateType, setTemplateType] = useState('');
  const [keyword, setKeyword] = useState('');
  const [sourceStyleNo, setSourceStyleNo] = useState('');
  const [createForm] = Form.useForm();
  const [applyForm] = Form.useForm();

  const {
    queryForm, loading, data, smartError, showSmartErrorNotice,
    page, pageSize, total, fetchList,
  } = useTemplateListData();

  const {
    styleNoOptions, styleNoLoading, fetchStyleNoOptions, scheduleFetchStyleNos,
  } = useStyleNoSearch();

  const {
    rollbackTarget, rollbackLoading, pendingDeleteTemplate, deleteTemplateLoading,
    handleRollback, handleRollbackConfirm, handleDelete, handleDeleteConfirm,
    setRollbackTarget, setPendingDeleteTemplate,
  } = useTemplateActions(fetchList);

  const [createOpen, setCreateOpen] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [syncPriceOpen, setSyncPriceOpen] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [activeRow, setActiveRow] = useState<TemplateLibrary | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [viewContent, setViewContent] = useState<string>('');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [viewObj, setViewObj] = useState<unknown>(null);
  const [cardTab, setCardTab] = usePersistentState<'list' | 'knowledge'>('template-center-card-tab', 'list');

  const [knowledgeKeyword, setKnowledgeKeyword] = useState('');
  const [knowledgePage, setKnowledgePage] = useState(1);
  const [knowledgePageSize, setKnowledgePageSize] = useState(20);
  const [knowledgeSelectedKeys, setKnowledgeSelectedKeys] = useState<React.Key[]>([]);

  const isAdminUser = useMemo(() => isAdminUserFn(user), [user]);
  const isFactoryUser = useMemo(() => !!user?.factoryId, [user]);

  const isLocked = (row?: TemplateLibrary | null) => {
    const v = Number(row?.locked);
    return Number.isFinite(v) && v === 1;
  };

  useEffect(() => {
    fetchList({ page: 1 });
    fetchStyleNoOptions('');
  }, [fetchList, fetchStyleNoOptions]);

  const submitCreate = async () => {
    try {
      const v = await createForm.validateFields();
      const sourceStyleNoVal = String(v.sourceStyleNo || '').trim();
      if (!sourceStyleNoVal) { message.error('请输入来源款号'); return; }
      const templateTypes = Array.isArray(v.templateTypes) ? v.templateTypes : [];
      const res = await api.post<{ code: number; message: string }>('/template-library/create-from-style', { sourceStyleNo: sourceStyleNoVal, templateTypes });
      if (res.code !== 200) { message.error(res.message || '生成模板失败'); return; }
      message.success('模板已生成/更新');
      setCreateOpen(false);
      fetchList({ page: 1 });
    } catch (e: unknown) {
      if (typeof e === 'object' && e !== null && 'errorFields' in e) return;
      message.error(getErrorMessage(e, '生成模板失败'));
    }
  };

  const submitApply = async () => {
    if (!activeRow?.id) { message.error('模板不完整'); return; }
    const t = String(activeRow?.templateType || '').trim().toLowerCase();
    if (t === 'progress') { message.info('进度模板请在"工序跟进"页面导入'); return; }
    try {
      const v = await applyForm.validateFields();
      const targetStyleNo = String(v.targetStyleNo || '').trim();
      if (!targetStyleNo) { message.error('请输入目标款号'); return; }
      const res = await api.post<{ code: number; message: string }>('/template-library/apply-to-style', {
        templateId: activeRow.id, targetStyleNo, mode: v.mode,
      });
      if (res.code !== 200) { message.error(res.message || '导入失败'); return; }
      message.success('已套用到目标款号');
      setApplyOpen(false);
    } catch (e: unknown) {
      if (typeof e === 'object' && e !== null && 'errorFields' in e) return;
      message.error(getErrorMessage(e, '套用失败'));
    }
  };

  const columns: ColumnsType<TemplateLibraryRecord> = [
    {
      title: '图片', dataIndex: 'styleCoverUrl', key: 'styleCoverUrl', width: 72, align: 'center' as const,
      render: (url: string) =>
        url ? (<Image src={getFullAuthedFileUrl(url)} width={48} style={{ height: 'auto', display: 'block', borderRadius: 4 }} preview={false} />)
          : (<div style={{ width: 48, height: 48, margin: '0 auto', background: 'var(--color-bg-subtle)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc', fontSize: 11 }}>无图</div>),
    },
    { title: '名称', dataIndex: 'templateName', key: 'templateName', width: 220, render: (v) => String(v || '-') },
    { title: '类型', dataIndex: 'templateType', key: 'templateType', width: 90, render: (v) => <Tag color={typeColor(String(v || ''))}>{typeLabel(String(v || ''))}</Tag> },
    {
      title: (<Space size={6}><span>标识</span><Tooltip title="系统内部用来识别模板来源/用途，部分场景用于自动套用"><span style={{ cursor: 'help', color: 'rgba(0,0,0,0.45)' }}>?</span></Tooltip></Space>),
      dataIndex: 'templateKey', key: 'templateKey', width: 180,
      render: (v) => { const formatted = formatTemplateKey(v); if (!formatted.full) return '-'; return <Text ellipsis={{ tooltip: formatted.full }} style={{ maxWidth: 160, display: 'inline-block' }}>{formatted.text}</Text>; },
    },
    { title: '来源款号', dataIndex: 'sourceStyleNo', key: 'sourceStyleNo', width: 140, render: (v) => String(v || '-') },
    { title: '更新时间', dataIndex: 'updateTime', key: 'updateTime', width: 170, render: (v) => String(v || '-') },
    { title: '操作人', dataIndex: 'operatorName', key: 'operatorName', width: 120, render: (v) => String(v || '-') },
    { title: '状态', dataIndex: 'locked', key: 'locked', width: 110, render: (_: unknown, row) => (isLocked(row) ? <Tag color="default">已锁定</Tag> : <Tag color="success">可编辑</Tag>) },
    {
      title: '操作', key: 'action', width: isFactoryUser ? 100 : 170,
      render: (_, row) => {
        const locked = isLocked(row);
        if (isFactoryUser) {
          const factoryAction: RowAction = locked
            ? { key: 'unlock', label: '解锁', onClick: () => setRollbackTarget(row) }
            : { key: 'edit', label: '编辑', onClick: () => editModalRef.current?.openEdit(row) };
          return <RowActions actions={[{ ...factoryAction, primary: true }]} />;
        }
        const primaryAction: RowAction = locked
          ? { key: 'rollback', label: '退回', title: '退回', onClick: () => handleRollback(row, isAdminUser, isFactoryUser) }
          : { key: 'edit', label: '编辑', title: '编辑', onClick: () => editModalRef.current?.openEdit(row) };
        return <RowActions actions={[{ ...primaryAction, primary: true }, { key: 'delete', label: '删除', title: '删除', danger: true, onClick: () => handleDelete(row) }]} />;
      },
    },
  ];

  return (
    <>
      <PageLayout
        title="单价维护"
        headerContent={
          <Tabs activeKey={cardTab} onChange={(key) => setCardTab(key as 'list' | 'knowledge')}
            items={[{ key: 'list', label: '模板列表' }, ...(!isFactoryUser ? [{ key: 'knowledge', label: '工序库' }] : [])]}
            style={{ marginBottom: 0 }}
          />
        }
      >
        {showSmartErrorNotice && smartError ? (<Card size="small" style={{ marginBottom: 12 }}><SmartErrorNotice error={smartError} onFix={() => { void fetchList({ page: 1 }); }} /></Card>) : null}
        {cardTab === 'knowledge' ? (
          <StyleProcessKnowledgeTab keyword={knowledgeKeyword} onKeywordChange={setKnowledgeKeyword} currentPage={knowledgePage} pageSize={knowledgePageSize} onPageChange={(page, size) => { setKnowledgePage(page); setKnowledgePageSize(size); }} selectedKeys={knowledgeSelectedKeys} onSelectionChange={setKnowledgeSelectedKeys} />
        ) : (
          <>
            <Card size="small" className="filter-card mb-sm">
              <Form form={queryForm}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: 16 }}>
                  <Space wrap size={12}>
                    <Form.Item name="keyword" noStyle><Input value={keyword} onChange={(e) => { setKeyword(e.target.value); queryForm.setFieldsValue({ keyword: e.target.value }); }} placeholder="名称/关键字" allowClear style={{ width: 200 }} /></Form.Item>
                    <Form.Item name="templateType" noStyle><Select value={templateType || undefined} onChange={(value) => { setTemplateType(value || ''); queryForm.setFieldsValue({ templateType: value }); }} options={TEMPLATE_TYPE_OPTIONS.map((opt) => ({ label: opt.label, value: opt.value }))} placeholder="全部类型" allowClear style={{ width: 140 }} /></Form.Item>
                    <Form.Item name="sourceStyleNo" noStyle><Select allowClear showSearch={{ filterOption: false, onSearch: scheduleFetchStyleNos }} loading={styleNoLoading} style={{ width: 200 }} placeholder="搜索/选择款号" options={styleNoOptions} value={sourceStyleNo || undefined} onChange={(value) => { const v = String(value || '').trim(); setSourceStyleNo(v); queryForm.setFieldsValue({ sourceStyleNo: v || undefined }); }} onOpenChange={(open) => { if (open && !styleNoOptions.length) fetchStyleNoOptions(''); }} /></Form.Item>
                  </Space>
                  <Space>
                    {!isFactoryUser && <Button onClick={() => setCreateOpen(true)}>从款号生成模板</Button>}
                    <Button type="primary" onClick={() => fetchList({ page: 1 })} loading={loading}>刷新</Button>
                    {!isFactoryUser && <Button onClick={() => setSyncPriceOpen(true)}>独立维护工序单价</Button>}
                  </Space>
                </div>
              </Form>
            </Card>
            <div style={{ height: 12 }} />
            <ResizableTable<TemplateLibraryRecord>
              rowKey={(r) => String(r.id || r.templateKey)} columns={columns} dataSource={data as TemplateLibraryRecord[]}
              loading={loading} stickyHeader scroll={{ x: 'max-content' }}
              pagination={{ current: page, pageSize, total, showTotal: (total) => `共 ${total} 条`, showSizeChanger: true, pageSizeOptions: ['10', '20', '50', '100'], onChange: (p, ps) => fetchList({ page: p, pageSize: ps }) }}
            />
          </>
        )}
      </PageLayout>

      <CreateFromStyleModal open={createOpen} form={createForm} styleNoOptions={styleNoOptions} styleNoLoading={styleNoLoading} modalWidth={modalWidth} onCancel={() => setCreateOpen(false)} onOk={submitCreate} onStyleNoSearch={scheduleFetchStyleNos} onStyleNoDropdownOpen={(open) => { if (open && !styleNoOptions.length) fetchStyleNoOptions(''); }} />
      <ApplyToStyleModal open={applyOpen} form={applyForm} activeRow={activeRow} styleNoOptions={styleNoOptions} styleNoLoading={styleNoLoading} modalWidth={modalWidth} typeLabel={typeLabel} onCancel={() => setApplyOpen(false)} onOk={submitApply} onStyleNoSearch={scheduleFetchStyleNos} onStyleNoDropdownOpen={(open) => { if (open && !styleNoOptions.length) fetchStyleNoOptions(''); }} />
      <EditTemplateModal ref={editModalRef} styleNoOptions={styleNoOptions} styleNoLoading={styleNoLoading} modalWidth={modalWidth} onFetchList={fetchList} onStyleNoSearch={scheduleFetchStyleNos} onStyleNoDropdownOpen={(open) => { if (open && !styleNoOptions.length) fetchStyleNoOptions(''); }} />

      <ResizableModal
        title={activeRow ? `模板内容 - ${String(activeRow.templateName || '')}（${typeLabel(String(activeRow.templateType || ''))}）` : '模板内容'}
        open={viewOpen} centered onCancel={() => setViewOpen(false)}
        footer={<div className="modal-footer-actions"><Button onClick={() => setViewOpen(false)}>关闭</Button></div>}
        width={modalWidth} initialHeight={typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800}
      >
        <TemplateViewContent activeRow={activeRow as unknown as Record<string, unknown>} viewObj={viewObj} viewContent={viewContent} />
      </ResizableModal>

      <RejectReasonModal open={rollbackTarget !== null} title="退回该模板为可编辑？" description={String(rollbackTarget?.templateName || '')} loading={rollbackLoading} onOk={handleRollbackConfirm} onCancel={() => setRollbackTarget(null)} />
      <RejectReasonModal open={pendingDeleteTemplate !== null} title="确认删除该模板？" description={String(pendingDeleteTemplate?.templateName || '')} fieldLabel="删除原因" okText="删除" loading={deleteTemplateLoading} onOk={handleDeleteConfirm} onCancel={() => setPendingDeleteTemplate(null)} />
      <SyncProcessPriceModal open={syncPriceOpen} onCancel={() => setSyncPriceOpen(false)} />
    </>
  );
};

export default TemplateCenter;
