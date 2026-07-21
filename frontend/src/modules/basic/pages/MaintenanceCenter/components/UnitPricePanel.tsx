import React from 'react';
import { App, Button, Card, Form, Image, Input, Select, Space, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';
import RejectReasonModal from '@/components/common/RejectReasonModal';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import api from '@/utils/api';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import EditTemplateModal from '../../TemplateCenter/components/EditTemplateModal';
import TemplateInlineEditor from '../../TemplateCenter/components/inlineEditor/TemplateInlineEditor';
import CreateFromStyleModal from '../../TemplateCenter/components/CreateFromStyleModal';
import ApplyToStyleModal from '../../TemplateCenter/components/ApplyToStyleModal';
import SyncProcessPriceModal from '../../TemplateCenter/components/SyncProcessPriceModal';
import {
  typeLabel, typeColor, formatTemplateKey, getErrorMessage,
} from '../../TemplateCenter/utils/templateUtils';
import type { TemplateLibraryRecord } from '../../TemplateCenter/utils/templateUtils';
import {
  type UnitPricePanelProps,
  directCardStyle, directStackStyle, directTitleStyle, directMetaStyle,
  directFieldLabelStyle, processingBannerStyle, templateTypeOptions,
  isLockedRow as isLocked, isProcessingRow as isProcessing,
} from './helpers';
import { useUnitPriceData } from './useUnitPriceData';

const { Text } = Typography;
const { TextArea } = Input;

const UnitPricePanel: React.FC<UnitPricePanelProps> = ({ styleNo, onSaved }) => {
  const {
    queryForm, createForm, applyForm, directRollbackForm, editModalRef,
    styleNoOptions, styleNoLoading, fetchStyleNoOptions, scheduleFetchStyleNos,
    loading, data, smartError, setSmartError, page, pageSize, total, fetchList,
    createOpen, setCreateOpen, applyOpen, setApplyOpen, syncPriceOpen, setSyncPriceOpen,
    activeRow, setActiveRow,
    rollbackTarget, setRollbackTarget, rollbackLoading, handleRollback, handleRollbackConfirm,
    pendingDeleteTemplate, setPendingDeleteTemplate, deleteTemplateLoading, handleDelete, handleDeleteConfirm,
    directRow, hydratingTemplate, handleDirectRollback,
    isFactoryUser,
    showSmartErrorNotice,
    submitCreate, submitApply,
    modalWidth, message, setCancelLocking,
  } = useUnitPriceData({ styleNo });

  /* ─── columns ─── */
  const columns: ColumnsType<TemplateLibraryRecord> = [
    {
      title: '图片', dataIndex: 'styleCoverUrl', key: 'styleCoverUrl', width: 72, align: 'center' as const,
      render: (url: string) => url
        ? <Image src={getFullAuthedFileUrl(url)} width={48} style={{ height: 'auto', display: 'block', borderRadius: 4 }} preview={false} />
        : <div style={{ width: 48, height: 48, margin: '0 auto', background: 'var(--color-bg-subtle)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc', fontSize: 14 }}>无图</div>,
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
                <TextArea autoSize={{ minRows: 2 }} placeholder="请说明本次退回原因" />
              </Form.Item>
            </Form>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                type="default"
                danger
                loading={rollbackLoading}
                onClick={handleDirectRollback}
                style={{ background: 'var(--color-bg-base)', color: 'var(--color-danger)', borderColor: 'var(--color-danger)' }}
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
            emptyDescription="暂无模板数据"
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
