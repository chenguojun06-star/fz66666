import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, Space, Select, App, Popover, Dropdown, Tag, Tooltip } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import TabToolbar from '@/components/common/TabToolbar';
import AttributeGroupLibraryModal from '@/components/common/AttributeGroupLibraryModal';
import { LoadingOutlined, DownOutlined, PlusOutlined } from '@ant-design/icons';
import { toNumberSafe, sortSizeNames } from '@/utils/api';
import ResizableTable from '@/components/common/ResizableTable';
import StyleStageControlBar from './StyleStageControlBar';
import ProcessCostSummary from './ProcessCostSummary';
import { StyleProcessTabProps, StyleProcessWithSizePrice, STAGE_ORDER, computeSortedDataAndStageSpan, buildProcessColumns } from './styleProcessTabUtils';
import { useStyleProcessData } from './hooks/useStyleProcessData';
import { useStyleProcessActions } from './hooks/useStyleProcessActions';
import { useStyleProcessAi } from './hooks/useStyleProcessAi';

const StyleProcessTab: React.FC<StyleProcessTabProps> = ({
  styleId, readOnly, hidePrice = false,
  progressNode: _progressNode, processAssignee, processStartTime, processCompletedTime,
  onRefresh, onDataLoaded, sizeColorConfig,
}) => {
  const { message, modal } = App.useApp();
  const [editMode, setEditMode] = useState(false);
  const [deletedIds, setDeletedIds] = useState<Array<string | number>>([]);
  const snapshotRef = useRef<StyleProcessWithSizePrice[] | null>(null);
  const [processTemplateKey, setProcessTemplateKey] = useState<string | undefined>(undefined);
  // D-252：工序模板导入方式 —— 覆盖现有 / 追加新增（此前恒为覆盖，用户无法追加）
  const [processImportMode, setProcessImportMode] = useState<'overwrite' | 'append'>('overwrite');
  // D-210：基础属性库——码数成组选择（与样衣开发/价格模板同组件）
  const [attrLibOpen, setAttrLibOpen] = useState(false);
  const handleApplyAttrSizes = (values: string[], mode: 'replace' | 'append') => {
    const incoming = values.map((v) => String(v || '').trim().toUpperCase()).filter(Boolean);
    if (!incoming.length) return;
    const base = mode === 'replace' ? [] : sizes;
    const next = sortSizeNames(Array.from(new Set([...base, ...incoming])));
    setSizes(next);
    setData((prev) => prev.map((row) => {
      const nextPrices: Record<string, number> = {};
      const nextTouched: Record<string, boolean> = {};
      next.forEach((sz) => {
        nextPrices[sz] = row.sizePrices?.[sz] ?? toNumberSafe(row.price);
        nextTouched[sz] = row.sizePriceTouched?.[sz] ?? false;
      });
      return { ...row, sizePrices: nextPrices, sizePriceTouched: nextTouched };
    }));
  };
  const editHintTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    return () => { editHintTimersRef.current.forEach(t => clearTimeout(t)); };
  }, []);

  const { data, setData, loading, sizes, setSizes, sizeOptions: _sizeOptions, setSizeOptions: _setSizeOptions, fetchSizeDictOptions: _fetchSizeDictOptions, fetchProcess, processTemplates, templateLoading } = useStyleProcessData({ styleId, onDataLoaded, sizeColorConfig });

  const fetchPriceHintRef = useRef<(id: string | number, processName: string, standardTime?: number) => void>(() => {});

  const enterEdit = useCallback(async () => {
    if (readOnly) return;
    if (editMode) return;
    if (!processStartTime) { message.warning('请先点击上方「开始工序单价」按钮再进行编辑'); return; }
    snapshotRef.current = JSON.parse(JSON.stringify(data)) as StyleProcessWithSizePrice[];
    setEditMode(true);
    editHintTimersRef.current.forEach(t => clearTimeout(t));
    editHintTimersRef.current = [];
    const rows = data.filter(row => row.processName && row.id);
    const BATCH = 5;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const t = setTimeout(() => batch.forEach(row => fetchPriceHintRef.current(row.id!, row.processName, row.standardTime ?? undefined)), (i / BATCH) * 200);
      editHintTimersRef.current.push(t);
    }
  }, [readOnly, editMode, processStartTime, data, message]);

  const { saving, exitEdit, handleAdd, handleRemoveSize, updateSizePrice, applyProcessTemplate, handleDelete, updateField, saveAll } = useStyleProcessActions({ styleId, readOnly: readOnly ?? false, processStartTime, data, setData, sizes, setSizes, fetchProcess, editMode, setEditMode, deletedIds, setDeletedIds, snapshotRef, onRefresh: onRefresh ?? (() => {}), enterEdit });

  const { aiOpen, setAiOpen, aiCategory, setAiCategory, aiLoading, priceHints, priceHintLoading, categoryOptions, fetchPriceHint, handleAiTemplate } = useStyleProcessAi({ styleId, data, editMode, enterEdit });

  fetchPriceHintRef.current = fetchPriceHint;

  const { sortedData, stageSpanMap } = useMemo(() => computeSortedDataAndStageSpan(data), [data]);
  const columns = useMemo(() => buildProcessColumns({
    editableMode: editMode && !readOnly, hidePrice, showSizePrices: true, sizes, stageSpanMap, priceHints, priceHintLoading,
    updateField: (id: string | number, field: any, value: any) => updateField(id, field, value, fetchPriceHint),
    updateSizePrice, handleAdd, handleDelete, handleRemoveSize,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [data, editMode, readOnly, sizes, stageSpanMap]);

  return (
    <div>
      <StyleStageControlBar
        stageName="工序单价" styleId={styleId} apiPath="process"
        status={processCompletedTime ? 'COMPLETED' : processStartTime ? 'IN_PROGRESS' : 'NOT_STARTED'}
        assignee={processAssignee} startTime={processStartTime} completedTime={processCompletedTime}
        readOnly={readOnly} onRefresh={onRefresh ?? (() => {})}
        onBeforeComplete={async () => { if (!data || data.length === 0) { message.error('请先配置工序单价'); return false; } return true; }}
      />
      <TabToolbar
        left={
          <>
            <Dropdown disabled={Boolean(readOnly) || !processStartTime || loading || saving}
              menu={{ items: STAGE_ORDER.map(s => ({ key: s, label: s, icon: <PlusOutlined /> })), onClick: ({ key }) => handleAdd(key) }}>
              <Button type="primary" disabled={Boolean(readOnly) || !processStartTime || loading || saving}>添加工序 <DownOutlined /></Button>
            </Dropdown>
          </>
        }
        center={
          <>
          <Select allowClear style={{ width: 180 }} placeholder="导入工艺模板" value={processTemplateKey} onChange={(v) => setProcessTemplateKey(v)}
            options={processTemplates.map((t) => ({ value: String(t.id || ''), label: t.sourceStyleNo ? `${t.templateName}（${t.sourceStyleNo}）` : t.templateName }))}
            disabled={Boolean(readOnly) || loading || saving || templateLoading}
          />
          <Tooltip title="覆盖现有=先清空本款工序再导入；追加新增=保留现有工序，只补进模板里没有的工序（自动跳过重复）">
            <Select style={{ width: 110 }} value={processImportMode} onChange={(v) => setProcessImportMode(v)}
              options={[{ value: 'overwrite', label: '覆盖现有' }, { value: 'append', label: '追加新增' }]}
              disabled={Boolean(readOnly) || loading || saving || templateLoading}
            />
          </Tooltip>
          <Button onClick={() => { if (!processTemplateKey) { message.error('请选择模板'); return; } applyProcessTemplate(processTemplateKey, processImportMode); }}
            disabled={Boolean(readOnly) || loading || saving || templateLoading || !processStartTime}>导入模板</Button>
          <Popover trigger="click" placement="bottomRight" open={aiOpen} onOpenChange={(v) => { if (!aiLoading) setAiOpen(v); }}
            content={
              <div style={{ width: 260 }}>
                <div style={{ marginBottom: 8, fontWeight: 600, color: 'var(--color-accent-purple)' }}> AI 智能 IE 指导价 & 全套工序生成</div>
                <div style={{ marginBottom: 8, fontSize: 14, color: 'var(--color-text-muted)' }}>选择品类，系统将基于 IE 数据库为您直接生成全套标准工序与智能指导单价。</div>
                <Select style={{ width: '100%', marginBottom: 8 }} placeholder="选择衣服品类（必选）" allowClear showSearch optionFilterProp="label" value={aiCategory} onChange={setAiCategory} options={categoryOptions} />
                <Button type="primary" block loading={aiLoading} disabled={aiLoading || !aiCategory} style={{ borderColor: 'var(--color-accent-purple)', color: 'var(--color-accent-purple)' }} onClick={() => handleAiTemplate(setData)}>{aiLoading ? '生成中…' : ' 一键生成全套工序与指导价'}</Button>
              </div>
            }>
            <Button type="primary" disabled={Boolean(readOnly) || !editMode || loading || saving}
              icon={aiLoading ? <LoadingOutlined /> : <span style={{ marginRight: 4 }}></span>}
              style={{ background: 'transparent', borderColor: 'var(--color-primary)', color: 'var(--color-primary)', fontWeight: 500 }}>AI建议单价</Button>
          </Popover>
          </>
        }
        right={
          <>
          {editMode && !readOnly && sizes.length > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
              {sizes.map((size) => (
                <Tag key={size} closable onClose={() => handleRemoveSize(size)} style={{ margin: 0 }}>{size}</Tag>
              ))}
            </span>
          )}
          {editMode && !readOnly && (
            <Popover
              trigger="click"
              placement="bottomRight"
              content={
                <div style={{ width: 220 }}>
                  <Input
                    placeholder="输入码数名，如 XL(175/96A)"
                    style={{ width: '100%', marginBottom: 8 }}
                    onPressEnter={(e) => {
                      const input = e.target as HTMLInputElement;
                      const val = input.value.trim().toUpperCase();
                      if (!val) return;
                      if (sizes.includes(val)) { message.warning(`码数 ${val} 已存在`); return; }
                      const sortedSizes = sortSizeNames([...sizes, val]);
                      setSizes(sortedSizes);
                      setData((prev) => prev.map((row) => ({
                        ...row,
                        sizePrices: { ...(row.sizePrices || {}), [val]: toNumberSafe(row.price) },
                        sizePriceTouched: { ...(row.sizePriceTouched || {}), [val]: false },
                      })));
                      input.value = '';
                    }}
                  />
                  <Button block type="text" icon={<SettingOutlined />} onClick={() => setAttrLibOpen(true)}>从基础属性库选择</Button>
                </div>
              }
            >
              <Button>添加码数 <DownOutlined /></Button>
            </Popover>
          )}
          {!editMode || readOnly ? (
            <Button type="primary" onClick={enterEdit} disabled={loading || saving || Boolean(readOnly) || !processStartTime}>编辑</Button>
          ) : (
            <><Button type="primary" onClick={saveAll} loading={saving}>保存</Button><Button disabled={saving} onClick={() => { modal.confirm({ width: '30vw', title: '放弃未保存的修改？', onOk: exitEdit }); }}>取消</Button></>
          )}
          </>
        }
      >
      </TabToolbar>
      <AttributeGroupLibraryModal
        open={attrLibOpen}
        onClose={() => setAttrLibOpen(false)}
        onApply={(_k, values, mode) => handleApplyAttrSizes(values, mode)}
      />
      <ProcessCostSummary data={data} />
      <ResizableTable bordered dataSource={sortedData as unknown as any[]} columns={columns as unknown as any[]} pagination={false} loading={loading} rowKey="id" scroll={{ x: 'max-content' }} storageKey={`style-process-${String(styleId)}`} emptyDescription="暂无工序数据" showExport={true} exportFilename="款式工序.xlsx" />
    </div>
  );
};

export default StyleProcessTab;
