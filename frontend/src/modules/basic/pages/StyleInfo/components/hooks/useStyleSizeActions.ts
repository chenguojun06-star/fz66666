import React from 'react';
import { useState, useCallback } from 'react';
import { App } from 'antd';
import { StyleSize } from '@/types/style';
import api, { sortSizeNames, toNumberSafe } from '@/utils/api';
import {
  MatrixRow,
  normalizeRowSorts,
} from '../styleSize/shared';
import {
  applyGradingToRow,
  buildGradingDraftZones,
  buildBatchGradingDraftZones,
  createNewPartRow,
  insertPartInGroup,
  createNewGroupRow,
  parseAndValidateSizeNames,
  addSizeColumnsToRows,
  deleteSizeColumnFromRows,
  collectIdsFromDeletedRow,
  collectIdsFromDeletedSize,
  applyGradingDraftToRows,
  setChunkImageUrlsForRows,
  updateChunkGroupNameForRows,
  buildSaveTasks,
} from './utils';

export interface StyleSizeActionsDeps {
  styleId: string | number;
  readOnly?: boolean;
  sizeColumns: string[];
  setSizeColumns: React.Dispatch<React.SetStateAction<string[]>>;
  rows: MatrixRow[];
  setRows: React.Dispatch<React.SetStateAction<MatrixRow[]>>;
  deletedIds: Array<string | number>;
  setDeletedIds: React.Dispatch<React.SetStateAction<Array<string | number>>>;
  originalRef: React.MutableRefObject<StyleSize[]>;
  combinedSizeIdsRef: React.MutableRefObject<Array<string | number>>;
  editMode: boolean;
  setEditMode: React.Dispatch<React.SetStateAction<boolean>>;
  snapshotRef: React.MutableRefObject<{ sizeColumns: string[]; rows: MatrixRow[] } | null>;
  selectedRowKeys: React.Key[];
  setSelectedRowKeys: React.Dispatch<React.SetStateAction<React.Key[]>>;
  gradingTargetRowKey: string;
  setGradingTargetRowKey: React.Dispatch<React.SetStateAction<string>>;
  gradingDraftBaseSize: string;
  setGradingDraftBaseSize: React.Dispatch<React.SetStateAction<string>>;
  gradingDraftZones: any[];
  setGradingDraftZones: React.Dispatch<React.SetStateAction<any[]>>;
  setGradingConfigOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setAddSizeOpen: React.Dispatch<React.SetStateAction<boolean>>;
  newSizeName: string;
  setNewSizeName: React.Dispatch<React.SetStateAction<string>>;
  newGroupName: string;
  setNewGroupName: React.Dispatch<React.SetStateAction<string>>;
  sizeTemplateKey: string | undefined;
  setSizeTemplateKey: React.Dispatch<React.SetStateAction<string | undefined>>;
  fetchSize: () => Promise<void>;
  fetchSizeDictOptions: () => Promise<void>;
}

export function useStyleSizeActions(deps: StyleSizeActionsDeps) {
  const {
    styleId, readOnly,
    sizeColumns, setSizeColumns, rows, setRows,
    deletedIds, setDeletedIds, originalRef, combinedSizeIdsRef,
    editMode, setEditMode, snapshotRef,
    selectedRowKeys, setSelectedRowKeys,
    gradingTargetRowKey, setGradingTargetRowKey,
    gradingDraftBaseSize, setGradingDraftBaseSize,
    gradingDraftZones, setGradingDraftZones,
    setGradingConfigOpen, setAddSizeOpen,
    newSizeName, setNewSizeName, newGroupName, setNewGroupName,
    setSizeTemplateKey,
    fetchSize,
  } = deps;

  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);

  const enterEdit = useCallback(() => {
    if (readOnly) return;
    snapshotRef.current = {
      sizeColumns: [...sizeColumns],
      rows: JSON.parse(JSON.stringify(rows)) as MatrixRow[],
    };
    setEditMode(true);
  }, [readOnly, sizeColumns, rows, snapshotRef, setEditMode]);

  const exitEdit = useCallback(() => {
    const snap = snapshotRef.current;
    if (snap) {
      setSizeColumns(snap.sizeColumns);
      setRows(snap.rows);
      setDeletedIds([]);
    }
    setEditMode(false);
    snapshotRef.current = null;
  }, [snapshotRef, setSizeColumns, setRows, setDeletedIds, setEditMode]);

  const updatePartName = useCallback((rowKey: string, partName: string) => {
    setRows((prev) => prev.map((r) => (r.key === rowKey ? { ...r, partName } : r)));
  }, [setRows]);

  const updateChunkGroupName = useCallback((chunkRowKeys: string[], groupName: string) => {
    setRows((prev) => updateChunkGroupNameForRows(prev, chunkRowKeys, groupName));
  }, [setRows]);

  const updateMeasureMethod = useCallback((rowKey: string, measureMethod: string) => {
    setRows((prev) => prev.map((r) => (r.key === rowKey ? { ...r, measureMethod } : r)));
  }, [setRows]);

  const updateTolerance = useCallback((rowKey: string, tolerance: string) => {
    setRows((prev) => prev.map((r) => (r.key === rowKey ? { ...r, tolerance } : r)));
  }, [setRows]);

  const updateBaseSize = useCallback((rowKey: string, baseSize: string) => {
    setRows((prev) => prev.map((row) => (
      row.key === rowKey ? applyGradingToRow({ ...row, baseSize: String(baseSize || '').trim() }, sizeColumns) : row
    )));
  }, [setRows, sizeColumns]);

  const openGradingConfig = useCallback((row: MatrixRow) => {
    setGradingTargetRowKey(row.key);
    setGradingDraftBaseSize(row.baseSize || '');
    setGradingDraftZones(buildGradingDraftZones(row, sizeColumns));
    setGradingConfigOpen(true);
  }, [sizeColumns, setGradingTargetRowKey, setGradingDraftBaseSize, setGradingDraftZones, setGradingConfigOpen]);

  const openBatchGradingConfig = useCallback(() => {
    if (selectedRowKeys.length === 0) { message.warning('请先选择要配置的部位'); return; }
    setGradingTargetRowKey('batch');
    const firstSelectedRow = rows.find((r) => selectedRowKeys.includes(r.key));
    setGradingDraftBaseSize(firstSelectedRow?.baseSize || '');
    setGradingDraftZones(buildBatchGradingDraftZones(selectedRowKeys, rows, sizeColumns));
    setGradingConfigOpen(true);
  }, [rows, selectedRowKeys, sizeColumns, message, setGradingTargetRowKey, setGradingDraftBaseSize, setGradingDraftZones, setGradingConfigOpen]);

  const applyGradingDraft = useCallback(() => {
    const targetKey = gradingTargetRowKey;
    if (!targetKey) return;
    if (!gradingDraftBaseSize || !sizeColumns.includes(gradingDraftBaseSize)) {
      message.error('请先选择样版码');
      return;
    }
    const result = applyGradingDraftToRows(rows, targetKey, gradingDraftBaseSize, gradingDraftZones, sizeColumns);
    setRows(result.rows);
    if (result.clearSelection) setSelectedRowKeys([]);
    setGradingConfigOpen(false);
    setGradingTargetRowKey('');
  }, [gradingTargetRowKey, gradingDraftBaseSize, gradingDraftZones, sizeColumns, rows, message, setRows, setSelectedRowKeys, setGradingConfigOpen, setGradingTargetRowKey]);

  const updateCellValue = useCallback((rowKey: string, sizeName: string, value: number) => {
    setRows((prev) => prev.map((r) =>
      r.key === rowKey ? { ...r, cells: { ...r.cells, [sizeName]: { ...(r.cells[sizeName] || { value: 0 }), value: toNumberSafe(value) } } } : r
    ));
  }, [setRows]);

  const setChunkImageUrls = useCallback((chunkRowKeys: string[], nextImages: string[]) => {
    setRows((prev) => setChunkImageUrlsForRows(prev, chunkRowKeys, nextImages));
  }, [setRows]);

  const handleAddPartInGroup = useCallback((groupName: string) => {
    if (readOnly) return;
    const key = `tmp-part-${Date.now()}-${Math.random()}`;
    const newRow = createNewPartRow(groupName, sizeColumns, key);
    setRows((prev) => insertPartInGroup(prev, groupName, newRow));
    if (!editMode) enterEdit();
  }, [readOnly, sizeColumns, editMode, enterEdit, setRows]);

  const confirmAddGroup = useCallback(() => {
    if (readOnly) return;
    const groupName = String(newGroupName || '').trim();
    if (!groupName) { message.error('请输入分组名称'); return; }
    const key = `tmp-group-${Date.now()}-${Math.random()}`;
    const maxSort = rows.length ? Math.max(...rows.map((r) => Number(r.sort || 0))) + 1 : 1;
    const newRow = createNewGroupRow(groupName, sizeColumns, key, maxSort);
    setRows((prev) => normalizeRowSorts([...prev, newRow]));
    setNewGroupName('');
    if (!editMode) enterEdit();
  }, [readOnly, newGroupName, sizeColumns, rows, editMode, enterEdit, message, setRows, setNewGroupName]);

  const confirmAddSize = useCallback(() => {
    if (readOnly) return;
    const raw = String(newSizeName || '').trim();
    const result = parseAndValidateSizeNames(raw, sizeColumns);
    if (result.error) { message.error(result.error); return; }
    const merged = sortSizeNames([...sizeColumns, ...result.sizes]);
    setSizeColumns(merged);
    setRows((prev) => addSizeColumnsToRows(prev, result.sizes, merged));
    setAddSizeOpen(false);
    setNewSizeName('');
    if (!editMode) enterEdit();
  }, [readOnly, newSizeName, sizeColumns, editMode, enterEdit, message, setSizeColumns, setRows, setAddSizeOpen, setNewSizeName]);

  const applySizeTemplate = useCallback(async (templateId: string, mode: 'merge' | 'overwrite' = 'overwrite') => {
    if (readOnly) return;
    if (editMode) { message.error('请先保存或退出编辑再导入模板'); return; }
    const sid = Number(styleId);
    if (!Number.isFinite(sid) || sid <= 0) { message.error('styleId不合法'); return; }
    try {
      const res = await api.post<{ code: number; message: string; data: boolean }>('/template-library/apply-to-style', {
        templateId, targetStyleId: sid, mode,
      });
      const result = res as any;
      if (result.code !== 200) { message.error(result.message || '导入失败'); return; }
      message.success(mode === 'merge' ? '已追加导入尺寸模板' : '已覆盖导入尺寸模板');
      setSizeTemplateKey(undefined);
      await fetchSize();
      setEditMode(true);
    } catch (e: unknown) {
      message.error((e as any)?.message || '导入失败');
    }
  }, [readOnly, editMode, styleId, message, setSizeTemplateKey, fetchSize, setEditMode]);

  const handleDeletePart = useCallback((row: MatrixRow) => {
    if (readOnly) return;
    const ids = collectIdsFromDeletedRow(row);
    setDeletedIds((prev) => [...prev, ...ids]);
    setRows((prev) => prev.filter((r) => r.key !== row.key));
  }, [readOnly, setDeletedIds, setRows]);

  const handleDeleteSize = useCallback((sizeName: string) => {
    if (readOnly) return;
    const ids = collectIdsFromDeletedSize(rows, sizeName);
    setDeletedIds((prev) => [...prev, ...ids]);
    const remainingSizes = sizeColumns.filter((s) => s !== sizeName);
    setSizeColumns((prev) => prev.filter((s) => s !== sizeName));
    setRows((prev) => deleteSizeColumnFromRows(prev, sizeName, remainingSizes));
  }, [readOnly, rows, sizeColumns, setDeletedIds, setSizeColumns, setRows]);

  const saveAll = useCallback(async () => {
    if (readOnly) return;
    const taskInput = {
      rows, sizeColumns, deletedIds,
      originals: originalRef.current,
      combinedSizeIds: combinedSizeIdsRef.current || [],
      styleId,
    };
    const { deleteIds, updateTasks, hasInvalid, normalizedRows } = buildSaveTasks(taskInput);
    if (hasInvalid) {
      if (normalizedRows.some((r) => !String(r.partName || '').trim())) {
        message.error('请先填写部位');
      } else {
        message.error('请先添加尺码');
      }
      return;
    }
    setSaving(true);
    try {
      const deleteTasks = deleteIds.map((id) => api.delete(`/style/size/${id}`));
      if (deleteTasks.length) await Promise.all(deleteTasks);
      const tasks = updateTasks.map(({ payload, isNew }) =>
        isNew ? api.post('/style/size', payload) : api.put('/style/size', payload)
      );
      if (tasks.length) {
        const results = await Promise.all(tasks);
        const bad = results.find((r: Record<string, unknown>) => (r as any)?.code !== 200);
        if (bad) { message.error((bad as any)?.message || '保存失败'); return; }
      }
      message.success('保存成功');
      setRows(normalizedRows);
      setEditMode(false);
      snapshotRef.current = null;
      await fetchSize();
    } catch (e: unknown) {
      message.error((e as any)?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  }, [readOnly, rows, sizeColumns, deletedIds, originalRef, combinedSizeIdsRef, styleId, snapshotRef, message, setRows, setEditMode, fetchSize]);

  return {
    saving, enterEdit, exitEdit,
    updatePartName, updateChunkGroupName, updateMeasureMethod, updateTolerance,
    updateBaseSize, updateCellValue, setChunkImageUrls,
    openGradingConfig, openBatchGradingConfig, applyGradingDraft,
    handleAddPartInGroup, confirmAddGroup, confirmAddSize,
    applySizeTemplate, handleDeletePart, handleDeleteSize, saveAll,
  };
}
