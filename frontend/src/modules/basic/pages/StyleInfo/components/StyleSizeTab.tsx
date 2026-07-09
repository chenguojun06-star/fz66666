import React, { useCallback, useEffect, useRef, useState } from 'react';
import { App, Input, Table, message as antMessage } from 'antd';
import { toNumberSafe, sortSizeNames } from '@/utils/api';

import ResizableTable from '@/components/common/ResizableTable';
import ResizableModal from '@/components/common/ResizableModal';

import StyleStageControlBar from './StyleStageControlBar';
import StyleSizeGradingConfigModal from './styleSize/StyleSizeGradingConfigModal';
import StyleSizeToolbar from './styleSize/StyleSizeToolbar';
import { useStyleSizeColumns } from './useStyleSizeColumns';
import { useStyleSizeData } from './useStyleSizeData';
import { useStyleSizeDerived } from './styleSize/useStyleSizeDerived';
import { useStyleSizeGrading } from './styleSize/useStyleSizeGrading';
import { useStyleSizeStructure } from './styleSize/useStyleSizeStructure';
import { useStyleSizeSave } from './styleSize/useStyleSizeSave';
import {
  MatrixRow,
  resolveGroupName,
  normalizeRowSorts,
  buildEmptySizeCells,
} from './styleSize/shared';

interface Props {
  styleId: string | number;
  readOnly?: boolean;
  sizeAssignee?: string;
  sizeStartTime?: string;
  sizeCompletedTime?: string;
  linkedSizes?: string[];
  simpleView?: boolean;
  hideStageControl?: boolean;
  onRefresh?: () => void;
}

const DEFAULT_LINKED_SIZES: string[] = [];

const StyleSizeTab: React.FC<Props> = ({
  styleId,
  readOnly,
  sizeAssignee,
  sizeStartTime,
  sizeCompletedTime,
  linkedSizes = DEFAULT_LINKED_SIZES,
  simpleView = false,
  hideStageControl = false,
  onRefresh,
}) => {
  const { message } = App.useApp();

  const {
    loading, sizeColumns, rows, sizeTemplates, templateLoading, sizeOptions, setSizeOptions,
    deletedIds, setDeletedIds, originalRef, combinedSizeIdsRef, linkedSizeColumns,
    setSizeColumns, setRows, fetchSize, fetchSizeDictOptions,
  } = useStyleSizeData(styleId, linkedSizes);

  const [editMode, setEditMode] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const snapshotRef = useRef<{ sizeColumns: string[]; rows: MatrixRow[] } | null>(null);

  const enterEdit = useCallback(() => {
    if (readOnly) return;
    snapshotRef.current = {
      sizeColumns: [...sizeColumns],
      rows: JSON.parse(JSON.stringify(rows)) as MatrixRow[],
    };
    setEditMode(true);
  }, [readOnly, sizeColumns, rows]);

  const exitEdit = useCallback(() => {
    const snap = snapshotRef.current;
    if (snap) {
      setSizeColumns(snap.sizeColumns);
      setRows(snap.rows);
      setDeletedIds([]);
    }
    setEditMode(false);
    snapshotRef.current = null;
  }, [setSizeColumns, setRows, setDeletedIds]);

  useEffect(() => {
    if (!readOnly) return;
    setEditMode(false);
    setDeletedIds([]);
    snapshotRef.current = null;
  }, [readOnly, setDeletedIds]);

  const updatePartName = (rowKey: string, partName: string) =>
    setRows((prev) => prev.map((r) => (r.key === rowKey ? { ...r, partName } : r)));

  const updateChunkGroupName = (chunkRowKeys: string[], groupName: string) => {
    const normalized = String(groupName || '').trim() || '其他区';
    if (!chunkRowKeys.length) return;
    const rowKeySet = new Set(chunkRowKeys);
    setRows((prev) => {
      let changed = false;
      const nextRows = prev.map((row) => {
        if (!rowKeySet.has(row.key)) return row;
        const currentGroup = resolveGroupName(row.groupName, row.partName);
        if (currentGroup === normalized && String(row.groupName || '').trim() === normalized) return row;
        changed = true;
        return { ...row, groupName: normalized };
      });
      return changed ? normalizeRowSorts(nextRows) : prev;
    });
  };

  const updateMeasureMethod = (rowKey: string, measureMethod: string) =>
    setRows((prev) => prev.map((r) => (r.key === rowKey ? { ...r, measureMethod } : r)));

  const updateTolerance = (rowKey: string, tolerance: string) =>
    setRows((prev) => prev.map((r) => (r.key === rowKey ? { ...r, tolerance } : r)));

  const updateCellValue = (rowKey: string, sizeName: string, value: number) =>
    setRows((prev) => prev.map((r) => r.key !== rowKey ? r : {
      ...r, cells: { ...r.cells, [sizeName]: { ...(r.cells[sizeName] || { value: 0 }), value: toNumberSafe(value) } },
    }));

  /** 从 Excel 粘贴多值到指定行，从 startSizeIndex 开始填充 */
  const handlePasteToRow = useCallback((rowKey: string, startSizeIndex: number, values: number[]) => {
    setRows((prev) => prev.map((r) => {
      if (r.key !== rowKey) return r;
      const nextCells = { ...r.cells };
      values.forEach((val, i) => {
        const targetIndex = startSizeIndex + i;
        if (targetIndex < sizeColumns.length) {
          const sizeName = sizeColumns[targetIndex];
          nextCells[sizeName] = { ...(nextCells[sizeName] || { value: 0 }), value: toNumberSafe(val) };
        }
      });
      return { ...r, cells: nextCells };
    }));
  }, [sizeColumns]);

  /** 复制一行（插入到当前行下方） */
  const handleDuplicateRow = useCallback((rowKey: string) => {
    setRows((prev) => {
      const index = prev.findIndex((r) => r.key === rowKey);
      if (index < 0) return prev;
      const source = prev[index];
      const newRow: MatrixRow = {
        ...source,
        key: `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        partName: `${source.partName}(副本)`,
        cells: { ...source.cells },
        gradingZones: source.gradingZones.map((z) => ({
          ...z,
          key: `grading-zone-${Date.now()}-${Math.random()}`,
        })),
        imageUrls: undefined,
      };
      const nextRows = [...prev];
      nextRows.splice(index + 1, 0, newRow);
      return normalizeRowSorts(nextRows);
    });
  }, []);

  const setChunkImageUrls = (chunkRowKeys: string[], nextImages: string[]) => {
    const ownerRowKey = String(chunkRowKeys[0] || '');
    const rowKeySet = new Set(chunkRowKeys);
    const sanitized = nextImages.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 2);
    setRows((prev) => prev.map((row) => {
      if (!rowKeySet.has(row.key)) return row;
      return {
        ...row,
        imageUrls: String(row.key) === ownerRowKey && sanitized.length ? sanitized : undefined,
      };
    }));
  };

  const derived = useStyleSizeDerived({ rows, editMode, linkedSizeColumns, setSizeColumns, setRows });

  const grading = useStyleSizeGrading({
    rows, sizeColumns, selectedRowKeys, setRows, setSelectedRowKeys, message,
  });

  const structure = useStyleSizeStructure({
    styleId, readOnly, editMode, enterEdit, setEditMode,
    rows, sizeColumns, setRows, setSizeColumns, setDeletedIds, fetchSize, message,
  });

  const saveOps = useStyleSizeSave({
    styleId, readOnly, rows, sizeColumns, setRows, setEditMode,
    deletedIds, originalRef, combinedSizeIdsRef, snapshotRef, fetchSize, message,
  });

  /** 处理AI识别尺寸表结果：自动加尺码列 + 自动加部位行 + 已有行自动补列 */
  const handleSizeTableRecognized = (result: { sizes: string[]; parts: any[] }) => {
    try {
      // 1. 识别到的尺码列表（统一字符串、去空格）
      const recognizedSizes = (result.sizes || [])
        .map((s: string) => String(s || '').trim())
        .filter(Boolean);

      if (recognizedSizes.length === 0 && (result.parts || []).length === 0) {
        message.warning('未识别到尺码或部位信息');
        return;
      }

      // 2. 计算合并后的尺码列（保留已有顺序，新增追加后统一排序）
      const existingSizeSet = new Set(sizeColumns);
      const newSizes = recognizedSizes.filter((s: string) => !existingSizeSet.has(s));
      const allSizes = sortSizeNames([...sizeColumns, ...newSizes]);

      // 3. 构建尺码 -> 单元格数值 map（统一从 part.values 读，避免 key 不一致）
      //    结构：{ [partName]: { measureMethod, tolerance, sizeValues: { [sizeName]: number } } }
      const partMap = new Map<string, {
        measureMethod: string;
        tolerance: string;
        sizeValues: Record<string, number>;
      }>();
      (result.parts || []).forEach((part: any) => {
        const partName = String(part.name || '').trim();
        if (!partName) return;
        const measureMethod = String(part.measureMethod || '').trim();
        const tolerance = String(part.tolerance || '').trim();
        const values = part.values || {};
        const sizeValues: Record<string, number> = {};
        Object.keys(values).forEach((key) => {
          const v = values[key];
          if (v === null || v === undefined || v === '') return;
          const n = Number(v);
          if (!Number.isNaN(n)) sizeValues[String(key).trim()] = n;
        });
        // 合并相同部位（后面的覆盖前面的）
        const prev = partMap.get(partName);
        if (prev) {
          partMap.set(partName, {
            measureMethod: measureMethod || prev.measureMethod,
            tolerance: tolerance || prev.tolerance,
            sizeValues: { ...prev.sizeValues, ...sizeValues },
          });
        } else {
          partMap.set(partName, { measureMethod, tolerance, sizeValues });
        }
      });

      // 4. 合并行（已有行 + 新部位行），并给所有行在 allSizes 中的尺码补上单元格
      setRows((prevRows) => {
        const updatedRows: MatrixRow[] = prevRows.map((r) => ({ ...r, cells: { ...r.cells } }));

        partMap.forEach((info, partName) => {
          const existingIndex = updatedRows.findIndex(
            (r) => r.partName === partName,
          );
          if (existingIndex >= 0) {
            // 已有部位：合并数值（保留已有非零值，新识别到的非零值覆盖零值）
            const existing = updatedRows[existingIndex];
            const mergedCells: Record<string, { value: number }> = {};
            allSizes.forEach((sn) => {
              const oldVal = existing.cells[sn]?.value ?? 0;
              const newVal = info.sizeValues[sn] ?? 0;
              const finalVal = oldVal !== 0 ? oldVal : newVal;
              mergedCells[sn] = { value: finalVal };
            });
            updatedRows[existingIndex] = {
              ...existing,
              cells: mergedCells,
              measureMethod: info.measureMethod || existing.measureMethod,
              tolerance: info.tolerance || existing.tolerance,
            };
          } else {
            // 新增部位行：按 allSizes 构建完整的 cells（即便识别没这个尺码也是 0）
            const cells: Record<string, { value: number }> = {};
            allSizes.forEach((sn) => {
              cells[sn] = { value: info.sizeValues[sn] ?? 0 };
            });
            updatedRows.push({
              key: `ai-row-${Date.now()}-${updatedRows.length}`,
              groupName: '',
              partName,
              measureMethod: info.measureMethod || '',
              baseSize: '',
              gradingZones: [],
              tolerance: info.tolerance || '',
              sort: updatedRows.length,
              cells,
            } as MatrixRow);
          }
        });

        // 5. 重要：即便没有新部位（partMap 空），也给所有已有行补上新尺码列（填 0）
        if (partMap.size === 0 && newSizes.length > 0) {
          updatedRows.forEach((r, idx, arr) => {
            const mergedCells: Record<string, { value: number }> = {};
            allSizes.forEach((sn) => {
              if (r.cells && r.cells[sn]) {
                mergedCells[sn] = { ...r.cells[sn] };
              } else {
                mergedCells[sn] = { value: 0 };
              }
            });
            arr[idx] = { ...r, cells: mergedCells };
          });
        }

        return normalizeRowSorts(updatedRows);
      });

      // 6. 更新尺码列（要放在 setRows 后，确保 columns rerender 时 sizeColumns 已是最新）
      setSizeColumns(allSizes);

      // 7. 友好提示
      const msg: string[] = [];
      if (newSizes.length > 0) msg.push(`新增 ${newSizes.length} 个尺码（${newSizes.join(', ')}）`);
      if (partMap.size > 0) msg.push(`导入 ${partMap.size} 个部位数据`);
      if (msg.length) message.success(msg.join('，'));

      // 8. 确保进入编辑模式
      if (!editMode && !readOnly) {
        enterEdit();
      }
    } catch (error) {
      console.error('[AI识别尺寸表] 处理失败:', error);
      message.error('处理识别结果失败，请重试');
    }
  };

  const columns = useStyleSizeColumns({
    editMode,
    readOnly,
    sizeColumns,
    displayRows: derived.displayRows,
    groupNameOptions: derived.groupNameOptions,
    rows,
    message,
    updatePartName,
    updateChunkGroupName,
    updateMeasureMethod,
    updateTolerance,
    updateBaseSize: grading.updateBaseSize,
    updateCellValue,
    setChunkImageUrls,
    handleAddPartInGroup: structure.handleAddPartInGroup,
    handleDeletePart: structure.handleDeletePart,
    handleDeleteSize: structure.handleDeleteSize,
    openGradingConfig: grading.openGradingConfig,
    onPasteToRow: handlePasteToRow,
    onDuplicateRow: handleDuplicateRow,
  });

  return (
    <div>
      <style>{`.style-size-table .ant-table-tbody>tr>td{vertical-align:top}.style-size-table .ant-table-tbody>tr.style-size-group-start>td{border-top:12px solid #f5f7fa;box-shadow:inset 0 1px 0 rgba(0,0,0,.03)}.style-size-table .ant-table-tbody>tr.style-size-group-upper>td{background:#f7fbff}.style-size-table .ant-table-tbody>tr.style-size-group-lower>td{background:#fffaf2}`}</style>

      {!simpleView && !hideStageControl && (
        <StyleStageControlBar
          stageName="尺寸表"
          styleId={styleId}
          apiPath="size"
          status={sizeCompletedTime ? 'COMPLETED' : sizeStartTime ? 'IN_PROGRESS' : 'NOT_STARTED'}
          assignee={sizeAssignee}
          startTime={sizeStartTime}
          completedTime={sizeCompletedTime}
          readOnly={readOnly}
          onRefresh={onRefresh ?? (() => {})}
          onBeforeComplete={async () => {
            if (!sizeColumns.length || !rows.length) {
              message.error('请先配置尺寸数据');
              return false;
            }
            return true;
          }}
        />
      )}

      {!simpleView && (
        <StyleSizeToolbar
          editMode={editMode}
          readOnly={readOnly}
          loading={loading}
          saving={saveOps.saving}
          templateLoading={templateLoading}
          selectedRowKeys={selectedRowKeys}
          setSelectedRowKeys={setSelectedRowKeys}
          openBatchGradingConfig={grading.openBatchGradingConfig}
          enterEdit={enterEdit}
          exitEdit={exitEdit}
          saveAll={saveOps.saveAll}
          sizeTemplates={sizeTemplates}
          sizeTemplateKey={structure.sizeTemplateKey}
          setSizeTemplateKey={structure.setSizeTemplateKey}
          applySizeTemplate={structure.applySizeTemplate}
          newGroupName={structure.newGroupName}
          setNewGroupName={structure.setNewGroupName}
          confirmAddGroup={structure.confirmAddGroup}
          sizeOptions={sizeOptions}
          setSizeOptions={setSizeOptions}
          sizeColumns={sizeColumns}
          mergeSizeColumns={structure.mergeSizeColumns}
          fetchSizeDictOptions={fetchSizeDictOptions}
          message={message}
          styleId={styleId}
          onSizeTableRecognized={handleSizeTableRecognized}
        />
      )}

      <ResizableTable
        className="style-size-table"
        bordered
        dataSource={derived.displayRows}
        columns={columns as any}
        pagination={false}
        loading={loading}
        emptyDescription="暂无数据"
        rowKey="key"
        scroll={{ x: 'max-content' }}
        rowClassName={(_record, rowIndex) => {
          const row = derived.displayRows[rowIndex];
          if (!row) return '';
          const classes = [`style-size-group-${row.groupToneMeta.key}`];
          if (row.isGroupStart) classes.push('style-size-group-start');
          return classes.join(' ');
        }}
        rowSelection={
          editMode && !readOnly
            ? {
                selectedRowKeys,
                onChange: (newSelectedRowKeys: React.Key[]) => setSelectedRowKeys(newSelectedRowKeys),
                selections: [Table.SELECTION_ALL, Table.SELECTION_INVERT, Table.SELECTION_NONE],
              }
            : undefined
        }
      />

      <ResizableModal
        open={structure.addSizeOpen}
        title="新增尺码(多码)"
        onCancel={() => {
          structure.setAddSizeOpen(false);
          structure.setNewSizeName('');
        }}
        onOk={structure.confirmAddSize}
        okText="确定"
        cancelText="取消"
        confirmLoading={saveOps.saving}
        width="30vw"
        minWidth={360}
        initialHeight={typeof window !== 'undefined' ? window.innerHeight * 0.4 : 320}
        minHeight={220}
        autoFontSize={false}
        scaleWithViewport
      >
        <Input.TextArea
          id="newSizeName"
          value={structure.newSizeName}
          placeholder={'每行一个，或用逗号分隔：\nS\nM\n3-6M'}
          rows={4}
          onChange={(e) => structure.setNewSizeName(e.target.value)}
        />
      </ResizableModal>

      <StyleSizeGradingConfigModal
        open={grading.gradingConfigOpen}
        gradingTargetRowKey={grading.gradingTargetRowKey}
        selectedRowCount={selectedRowKeys.length}
        sizeColumns={sizeColumns}
        rows={rows}
        gradingDraftBaseSize={grading.gradingDraftBaseSize}
        gradingDraftZones={grading.gradingDraftZones}
        setGradingDraftBaseSize={grading.setGradingDraftBaseSize}
        setGradingDraftZones={grading.setGradingDraftZones}
        onCancel={grading.closeGradingConfig}
        onSubmit={grading.applyGradingDraft}
      />
    </div>
  );
};

export default StyleSizeTab;
