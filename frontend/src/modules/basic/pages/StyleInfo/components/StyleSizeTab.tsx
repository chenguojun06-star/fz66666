import React, { useCallback, useEffect, useRef, useState } from 'react';
import { App, Input, Table } from 'antd';
import { toNumberSafe } from '@/utils/api';

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

const StyleSizeTab: React.FC<Props> = ({
  styleId,
  readOnly,
  sizeAssignee,
  sizeStartTime,
  sizeCompletedTime,
  linkedSizes = [],
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
          onRefresh={onRefresh}
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
        resizableColumns={false}
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
