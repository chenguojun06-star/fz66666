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

  /** 处理AI识别尺寸表结果 */
  const handleSizeTableRecognized = (result: { sizes: string[]; parts: any[] }) => {
    try {
      // 1. 处理尺码列表
      const recognizedSizes = (result.sizes || [])
        .map((s: string) => String(s || '').trim())
        .filter(Boolean);
      
      if (recognizedSizes.length === 0) {
        message.warning('未识别到尺码信息');
        return;
      }
      
      // 2. 将新尺码添加到列中（保留现有尺码，新增不存在的）
      const existingSizes = new Set(sizeColumns);
      const newSizes = recognizedSizes.filter((s: string) => !existingSizes.has(s));
      
      if (newSizes.length > 0) {
        // 使用 sortSizeNames 排序后合并
        const allSizes = sortSizeNames([...sizeColumns, ...newSizes]);
        setSizeColumns(allSizes);
        message.success(`已添加 ${newSizes.length} 个新尺码：${newSizes.join(', ')}`);
      }
      
      // 3. 处理部位数据
      const parts = result.parts || [];
      
      if (parts.length === 0) {
        if (newSizes.length > 0) {
          // 只有新尺码，没有部位数据
          message.info('尺码已添加，可手动录入部位数据');
        }
        return;
      }
      
      // 4. 构建新行
      const newRows: MatrixRow[] = parts.map((part: any, index: number) => {
        const partName = String(part.name || '').trim();
        const measureMethod = String(part.measureMethod || '').trim();
        const tolerance = String(part.tolerance || '').trim();
        const values = part.values || {};
        
        // 构建单元格
        const cells: Record<string, { value: number }> = {};
        
        // 为所有尺码填充数值（从识别结果中获取）
        const allSizeColumns = sortSizeNames([...sizeColumns, ...newSizes]);
        allSizeColumns.forEach((sizeName: string) => {
          const rawValue = values[sizeName];
          if (rawValue !== null && rawValue !== undefined && rawValue !== '') {
            cells[sizeName] = { value: Number(rawValue) };
          } else {
            cells[sizeName] = { value: 0 };
          }
        });
        
        return {
          key: `ai-row-${Date.now()}-${index}`,
          groupName: '',
          partName,
          measureMethod,
          baseSize: '',
          gradingZones: [],
          tolerance: tolerance || '',
          sort: rows.length + index,
          cells,
        } as MatrixRow;
      });
      
      // 5. 合并到现有行
      if (newRows.length > 0) {
        setRows((prev) => {
          const updatedRows = [...prev];
          newRows.forEach((newRow) => {
            // 检查是否已存在相同部位名的行
            const existingIndex = updatedRows.findIndex(
              (r) => r.partName === newRow.partName
            );
            
            if (existingIndex >= 0) {
              // 合并单元格数值
              const existing = updatedRows[existingIndex];
              const mergedCells = { ...existing.cells };
              Object.keys(newRow.cells).forEach((sizeName) => {
                if (newRow.cells[sizeName]?.value !== 0) {
                  mergedCells[sizeName] = newRow.cells[sizeName];
                }
              });
              updatedRows[existingIndex] = {
                ...existing,
                cells: mergedCells,
                measureMethod: newRow.measureMethod || existing.measureMethod,
                tolerance: newRow.tolerance || existing.tolerance,
              };
            } else {
              // 新增行
              updatedRows.push(newRow);
            }
          });
          
          // 重新排序
          return normalizeRowSorts(updatedRows);
        });
        
        message.success(`已导入 ${parts.length} 个部位数据`);
      }
      
      // 6. 确保进入编辑模式
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
