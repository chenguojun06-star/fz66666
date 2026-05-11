import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Button, Input, Space, Select, App, Popover, Dropdown, Tag } from 'antd';
import { modal } from '@/utils/antdStatic';
import { LoadingOutlined, DownOutlined, PlusOutlined } from '@ant-design/icons';
import { toNumberSafe } from '@/utils/api';
import ResizableTable from '@/components/common/ResizableTable';
import StyleStageControlBar from './StyleStageControlBar';
import StyleQuoteSuggestionInlineCard from './StyleQuoteSuggestionInlineCard';
import ProcessCostSummary from './ProcessCostSummary';
import { StyleProcessTabProps, StyleProcessWithSizePrice, STAGE_ORDER, computeSortedDataAndStageSpan, buildProcessColumns } from './styleProcessTabUtils';
import { useStyleProcessData } from './hooks/useStyleProcessData';
import { useStyleProcessActions } from './hooks/useStyleProcessActions';
import { useStyleProcessAi } from './hooks/useStyleProcessAi';

const StyleProcessTab: React.FC<StyleProcessTabProps> = ({
  styleId, styleNo, readOnly, hidePrice = false,
  progressNode: _progressNode, processAssignee, processStartTime, processCompletedTime,
  onRefresh, onDataLoaded,
}) => {
  const { message } = App.useApp();
  const [editMode, setEditMode] = useState(false);
  const [deletedIds, setDeletedIds] = useState<Array<string | number>>([]);
  const snapshotRef = useRef<StyleProcessWithSizePrice[] | null>(null);
  const [processTemplateKey, setProcessTemplateKey] = useState<string | undefined>(undefined);

  const { data, setData, loading, sizes, setSizes, sizeOptions, setSizeOptions, fetchSizeDictOptions, fetchProcess, processTemplates, templateLoading } = useStyleProcessData({ styleId, onDataLoaded });

  const enterEdit = useCallback(async () => {
    if (readOnly) return;
    if (editMode) return;
    if (!processStartTime) { message.warning('请先点击上方「开始工序单价」按钮再进行编辑'); return; }
    snapshotRef.current = JSON.parse(JSON.stringify(data)) as StyleProcessWithSizePrice[];
    setEditMode(true);
    data.forEach((row, idx) => { if (row.processName && row.id) setTimeout(() => fetchPriceHint(row.id!, row.processName, row.standardTime ?? undefined), idx * 150); });
  }, [readOnly, editMode, processStartTime, data, message]);

  const { saving, exitEdit, handleAdd, handleRemoveSize, updateSizePrice, applyProcessTemplate, handleDelete, updateField, saveAll } = useStyleProcessActions({ styleId, readOnly: readOnly ?? false, processStartTime, data, setData, sizes, setSizes, fetchProcess, editMode, setEditMode, deletedIds, setDeletedIds, snapshotRef, onRefresh: onRefresh ?? (() => {}), enterEdit });

  const { aiOpen, setAiOpen, aiCategory, setAiCategory, aiLoading, priceHints, priceHintLoading, categoryOptions, fetchPriceHint, handleAiTemplate } = useStyleProcessAi({ styleId, data, editMode, enterEdit });

  const { sortedData, stageSpanMap } = useMemo(() => computeSortedDataAndStageSpan(data), [data]);
  const columns = useMemo(() => buildProcessColumns({
    editableMode: editMode && !readOnly, hidePrice, showSizePrices: true, sizes, stageSpanMap, priceHints, priceHintLoading,
    updateField: (id: string | number, field: any, value: any) => updateField(id, field, value, fetchPriceHint),
    updateSizePrice, handleAdd, handleDelete, handleRemoveSize,
  }), [data, editMode, readOnly, sizes, stageSpanMap]);

  return (
    <div>
      <StyleQuoteSuggestionInlineCard styleNo={styleNo} sourceStyleNo="" />
      <StyleStageControlBar
        stageName="工序单价" styleId={styleId} apiPath="process"
        status={processCompletedTime ? 'COMPLETED' : processStartTime ? 'IN_PROGRESS' : 'NOT_STARTED'}
        assignee={processAssignee} startTime={processStartTime} completedTime={processCompletedTime}
        readOnly={readOnly} onRefresh={onRefresh ?? (() => {})}
        onBeforeComplete={async () => { if (!data || data.length === 0) { message.error('请先配置工序单价'); return false; } return true; }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div />
        <Space>
          <Select allowClear style={{ width: 220 }} placeholder="导入工艺模板" value={processTemplateKey} onChange={(v) => setProcessTemplateKey(v)}
            options={processTemplates.map((t) => ({ value: String(t.id || ''), label: t.sourceStyleNo ? `${t.templateName}（${t.sourceStyleNo}）` : t.templateName }))}
            disabled={Boolean(readOnly) || loading || saving || templateLoading}
          />
          <Button onClick={() => { if (!processTemplateKey) { message.error('请选择模板'); return; } applyProcessTemplate(processTemplateKey); }}
            disabled={Boolean(readOnly) || loading || saving || templateLoading || !processStartTime}>导入模板</Button>
          <Dropdown disabled={Boolean(readOnly) || !processStartTime || loading || saving}
            menu={{ items: STAGE_ORDER.map(s => ({ key: s, label: s, icon: <PlusOutlined /> })), onClick: ({ key }) => handleAdd(key) }}>
            <Button type="primary" disabled={Boolean(readOnly) || !processStartTime || loading || saving}>添加工序 <DownOutlined /></Button>
          </Dropdown>
          <Popover trigger="click" placement="bottomRight" open={aiOpen} onOpenChange={(v) => { if (!aiLoading) setAiOpen(v); }}
            content={
              <div style={{ width: 260 }}>
                <div style={{ marginBottom: 8, fontWeight: 600, color: '#722ed1' }}> AI 智能 IE 指导价 & 全套工序生成</div>
                <div style={{ marginBottom: 8, fontSize: 12, color: '#888' }}>选择品类，系统将基于 IE 数据库为您直接生成全套标准工序与智能指导单价。</div>
                <Select style={{ width: '100%', marginBottom: 8 }} placeholder="选择衣服品类（必选）" allowClear showSearch optionFilterProp="label" value={aiCategory} onChange={setAiCategory} options={categoryOptions} />
                <Button type="primary" block loading={aiLoading} disabled={aiLoading || !aiCategory} style={{ background: 'linear-gradient(135deg, #722ed1, #1677ff)', border: 'none' }} onClick={() => handleAiTemplate(setData)}>{aiLoading ? '生成中…' : ' 一键生成全套工序与指导价'}</Button>
              </div>
            }>
            <Button type="primary" disabled={Boolean(readOnly) || !editMode || loading || saving}
              icon={aiLoading ? <LoadingOutlined /> : <span style={{ marginRight: 4 }}></span>}
              style={{ background: 'linear-gradient(135deg, #722ed1, #2f54eb)', borderColor: 'transparent', fontWeight: 500, boxShadow: '0 2px 6px rgba(114, 46, 209, 0.3)' }}>AI建议单价</Button>
          </Popover>
          {editMode && !readOnly && sizes.length > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
              {sizes.map((size) => (
                <Tag key={size} closable onClose={() => handleRemoveSize(size)} style={{ margin: 0 }}>{size}</Tag>
              ))}
            </span>
          )}
          {editMode && !readOnly && (
            <Input
              size="small"
              placeholder="输入码数回车添加"
              style={{ width: 130 }}
              onPressEnter={(e) => {
                const input = e.target as HTMLInputElement;
                const val = input.value.trim().toUpperCase();
                if (!val) return;
                if (sizes.includes(val)) { message.warning(`码数 ${val} 已存在`); return; }
                const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL', '4XL', '5XL'];
                const sortedSizes = [...sizes, val].sort((a, b) => {
                  const ia = SIZE_ORDER.indexOf(a.toUpperCase());
                  const ib = SIZE_ORDER.indexOf(b.toUpperCase());
                  if (ia >= 0 && ib >= 0) return ia - ib;
                  if (ia >= 0) return -1;
                  if (ib >= 0) return 1;
                  return a.localeCompare(b);
                });
                setSizes(sortedSizes);
                setData((prev) => prev.map((row) => ({
                  ...row,
                  sizePrices: { ...(row.sizePrices || {}), [val]: toNumberSafe(row.price) },
                  sizePriceTouched: { ...(row.sizePriceTouched || {}), [val]: false },
                })));
                input.value = '';
              }}
            />
          )}
          {!editMode || readOnly ? (
            <Button type="primary" onClick={enterEdit} disabled={loading || saving || Boolean(readOnly) || !processStartTime}>编辑</Button>
          ) : (
            <><Button type="primary" onClick={saveAll} loading={saving}>保存</Button><Button disabled={saving} onClick={() => { modal.confirm({ width: '30vw', title: '放弃未保存的修改？', onOk: exitEdit }); }}>取消</Button></>
          )}
        </Space>
      </div>
      <ProcessCostSummary data={data} />
      <ResizableTable bordered dataSource={sortedData as unknown as any[]} columns={columns as unknown as any[]} pagination={false} loading={loading} rowKey="id" scroll={{ x: 'max-content' }} storageKey={`style-process-${String(styleId)}`} />
    </div>
  );
};

export default StyleProcessTab;
