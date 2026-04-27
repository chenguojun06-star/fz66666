import { useState, useCallback, useRef } from 'react';
import { App } from 'antd';
import { StyleSize } from '@/types/style';
import api, { sortSizeNames, toNumberSafe } from '@/utils/api';
import {
  MatrixCell, MatrixRow,
  resolveGroupName, normalizeRowSorts,
  normalizeChunkImageAssignments, normalizeGradingZones,
  serializeGradingRule, createGradingZone,
} from '../styleSize/shared';

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
    sizeTemplateKey, setSizeTemplateKey,
    fetchSize, fetchSizeDictOptions,
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
    const normalizedGroupName = String(groupName || '').trim() || '其他区';
    if (!chunkRowKeys.length) return;
    const rowKeySet = new Set(chunkRowKeys);
    setRows((prev) => {
      let changed = false;
      const nextRows = prev.map((row) => {
        if (!rowKeySet.has(row.key)) return row;
        const currentResolvedGroup = resolveGroupName(row.groupName, row.partName);
        if (currentResolvedGroup === normalizedGroupName && String(row.groupName || '').trim() === normalizedGroupName) {
          return row;
        }
        changed = true;
        return { ...row, groupName: normalizedGroupName };
      });
      return changed ? normalizeRowSorts(nextRows) : prev;
    });
  }, [setRows]);

  const updateMeasureMethod = useCallback((rowKey: string, measureMethod: string) => {
    setRows((prev) => prev.map((r) => (r.key === rowKey ? { ...r, measureMethod } : r)));
  }, [setRows]);

  const updateTolerance = useCallback((rowKey: string, tolerance: string) => {
    setRows((prev) => prev.map((r) => (r.key === rowKey ? { ...r, tolerance } : r)));
  }, [setRows]);

  const applyGradingToRow = useCallback((row: MatrixRow): MatrixRow => {
    if (!sizeColumns.length) return row;
    const baseSize = sizeColumns.includes(String(row.baseSize || '').trim())
      ? String(row.baseSize).trim() : '';
    const baseIndex = sizeColumns.indexOf(baseSize);
    if (baseIndex < 0) return { ...row, baseSize };
    const zones = normalizeGradingZones(row.gradingZones || [], sizeColumns);
    if (!zones.length) return { ...row, baseSize, gradingZones: [] };
    const baseValue = toNumberSafe(row.cells[baseSize]?.value);
    const getStepForSize = (sizeName: string): number => {
      for (const zone of zones) {
        if ((zone.frontSizes || []).includes(sizeName)) return toNumberSafe(zone.frontStep);
        if ((zone.backSizes || []).includes(sizeName)) return toNumberSafe(zone.backStep);
        for (const col of zone.sizeStepColumns || []) {
          if ((col.sizes || []).includes(sizeName)) return toNumberSafe(col.step);
        }
      }
      return 0;
    };
    const nextCells = { ...row.cells };
    nextCells[baseSize] = { ...(nextCells[baseSize] || { value: 0 }), value: baseValue };
    for (let index = 0; index < sizeColumns.length; index += 1) {
      if (index === baseIndex) continue;
      const currentSize = sizeColumns[index];
      const step = getStepForSize(currentSize);
      const distance = Math.abs(index - baseIndex);
      const value = index < baseIndex ? baseValue - step * distance : baseValue + step * distance;
      nextCells[currentSize] = { ...(nextCells[currentSize] || { value: 0 }), value: Number(value.toFixed(2)) };
    }
    return { ...row, baseSize, gradingZones: zones, cells: nextCells };
  }, [sizeColumns]);

  const updateBaseSize = useCallback((rowKey: string, baseSize: string) => {
    setRows((prev) => prev.map((row) => (
      row.key === rowKey ? applyGradingToRow({ ...row, baseSize: String(baseSize || '').trim() }) : row
    )));
  }, [setRows, applyGradingToRow]);

  const openGradingConfig = useCallback((row: MatrixRow) => {
    setGradingTargetRowKey(row.key);
    const baseSize = row.baseSize || '';
    setGradingDraftBaseSize(baseSize);
    const baseIndex = baseSize ? sizeColumns.indexOf(baseSize) : -1;
    const defaultFrontSizes = baseIndex > 0 ? sizeColumns.slice(0, baseIndex) : [];
    const defaultBackSizes = baseIndex >= 0 && baseIndex < sizeColumns.length - 1 ? sizeColumns.slice(baseIndex + 1) : [];
    const existingZones = normalizeGradingZones(row.gradingZones || [], sizeColumns);
    if (existingZones.length > 0) {
      setGradingDraftZones(existingZones.map((z: any) => ({
        ...z,
        frontSizes: (z.frontSizes || []).length > 0 ? z.frontSizes : defaultFrontSizes,
        backSizes: (z.backSizes || []).length > 0 ? z.backSizes : defaultBackSizes,
        partKeys: [row.key],
      })));
    } else {
      setGradingDraftZones([createGradingZone([], '1', [row.key], defaultFrontSizes, defaultBackSizes)]);
    }
    setGradingConfigOpen(true);
  }, [sizeColumns, setGradingTargetRowKey, setGradingDraftBaseSize, setGradingDraftZones, setGradingConfigOpen]);

  const openBatchGradingConfig = useCallback(() => {
    if (selectedRowKeys.length === 0) { message.warning('请先选择要配置的部位'); return; }
    setGradingTargetRowKey('batch');
    const firstSelectedRow = rows.find((r) => selectedRowKeys.includes(r.key));
    const baseSize = firstSelectedRow?.baseSize || '';
    setGradingDraftBaseSize(baseSize);
    const baseIndex = baseSize ? sizeColumns.indexOf(baseSize) : -1;
    const frontSizes = baseIndex > 0 ? sizeColumns.slice(0, baseIndex) : [];
    const backSizes = baseIndex >= 0 && baseIndex < sizeColumns.length - 1 ? sizeColumns.slice(baseIndex + 1) : [];
    setGradingDraftZones([createGradingZone([], '1', selectedRowKeys.map(String), frontSizes, backSizes)]);
    setGradingConfigOpen(true);
  }, [rows, selectedRowKeys, sizeColumns, message, setGradingTargetRowKey, setGradingDraftBaseSize, setGradingDraftZones, setGradingConfigOpen]);

  const applyGradingDraft = useCallback(() => {
    const targetKey = gradingTargetRowKey;
    if (!targetKey) return;
    if (!gradingDraftBaseSize || !sizeColumns.includes(gradingDraftBaseSize)) {
      message.error('请先选择样版码');
      return;
    }
    if (targetKey === 'batch') {
      setRows((prev) => prev.map((row) => {
        const matchingZones = gradingDraftZones.filter((zone: any) => (zone.partKeys || []).includes(row.key));
        if (matchingZones.length === 0) return row;
        return applyGradingToRow({
          ...row, baseSize: gradingDraftBaseSize,
          gradingZones: matchingZones.map((z: any) => ({
            key: z.key, label: z.label, sizes: z.sizes || [], step: z.step || 0,
            frontSizes: z.frontSizes || [], frontStep: z.frontStep || 0,
            backSizes: z.backSizes || [], backStep: z.backStep || 0,
            sizeStepColumns: z.sizeStepColumns || [],
          })),
        });
      }));
      setSelectedRowKeys([]);
    } else {
      setRows((prev) => prev.map((row) => (
        row.key === targetKey
          ? applyGradingToRow({ ...row, baseSize: gradingDraftBaseSize, gradingZones: normalizeGradingZones(gradingDraftZones, sizeColumns) })
          : row
      )));
    }
    setGradingConfigOpen(false);
    setGradingTargetRowKey('');
  }, [gradingTargetRowKey, gradingDraftBaseSize, gradingDraftZones, sizeColumns, applyGradingToRow, message, setRows, setSelectedRowKeys, setGradingConfigOpen, setGradingTargetRowKey]);

  const updateCellValue = useCallback((rowKey: string, sizeName: string, value: number) => {
    setRows((prev) => prev.map((r) =>
      r.key === rowKey ? { ...r, cells: { ...r.cells, [sizeName]: { ...(r.cells[sizeName] || { value: 0 }), value: toNumberSafe(value) } } } : r
    ));
  }, [setRows]);

  const setChunkImageUrls = useCallback((chunkRowKeys: string[], nextImages: string[]) => {
    const ownerRowKey = String(chunkRowKeys[0] || '');
    const rowKeySet = new Set(chunkRowKeys);
    const sanitized = nextImages.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 2);
    setRows((prev) => prev.map((row) => {
      if (!rowKeySet.has(row.key)) return row;
      return { ...row, imageUrls: String(row.key) === ownerRowKey && sanitized.length ? sanitized : undefined };
    }));
  }, [setRows]);

  const handleAddPartInGroup = useCallback((groupName: string) => {
    if (readOnly) return;
    const key = `tmp-part-${Date.now()}-${Math.random()}`;
    const cells: Record<string, MatrixCell> = {};
    sizeColumns.forEach((sn) => { cells[sn] = { value: 0 }; });
    setRows((prev) => {
      const groupRowIndices: number[] = [];
      prev.forEach((r, i) => { if (resolveGroupName(r.groupName, r.partName) === groupName) groupRowIndices.push(i); });
      const insertAt = groupRowIndices.length ? groupRowIndices[groupRowIndices.length - 1] + 1 : prev.length;
      const next = [...prev];
      next.splice(insertAt, 0, { key, groupName, partName: '', measureMethod: '', baseSize: '', gradingZones: [], tolerance: '', sort: 0, cells });
      return normalizeRowSorts(next);
    });
    if (!editMode) enterEdit();
  }, [readOnly, sizeColumns, editMode, enterEdit, setRows]);

  const confirmAddGroup = useCallback(() => {
    if (readOnly) return;
    const groupName = String(newGroupName || '').trim();
    if (!groupName) { message.error('请输入分组名称'); return; }
    const key = `tmp-group-${Date.now()}-${Math.random()}`;
    const cells: Record<string, MatrixCell> = {};
    sizeColumns.forEach((sn) => { cells[sn] = { value: 0 }; });
    setRows((prev) => normalizeRowSorts([...prev, {
      key, groupName, partName: '', measureMethod: '', baseSize: '', gradingZones: [], tolerance: '',
      sort: prev.length ? Math.max(...prev.map((r) => toNumberSafe(r.sort))) + 1 : 1, cells,
    }]));
    setNewGroupName('');
    if (!editMode) enterEdit();
  }, [readOnly, newGroupName, sizeColumns, editMode, enterEdit, message, setRows, setNewGroupName]);

  const confirmAddSize = useCallback(() => {
    if (readOnly) return;
    const raw = String(newSizeName || '').trim();
    if (!raw) { message.error('请输入尺码'); return; }
    const parts = raw.split(/[\n,，、;；]+/g).map((x) => String(x || '').trim()).filter(Boolean);
    if (!parts.length) { message.error('请输入尺码'); return; }
    const nextToAdd: string[] = [];
    const seen = new Set<string>();
    for (const p of parts) {
      if (sizeColumns.includes(p)) { message.error(`尺码已存在：${p}`); return; }
      if (seen.has(p)) continue;
      seen.add(p);
      nextToAdd.push(p);
    }
    if (!nextToAdd.length) { message.error('请输入尺码'); return; }
    const merged = sortSizeNames([...sizeColumns, ...nextToAdd]);
    setSizeColumns(merged);
    setRows((prev) => prev.map((r) => {
      const nextCells = { ...r.cells };
      nextToAdd.forEach((sn) => { nextCells[sn] = { value: 0 }; });
      return { ...r, baseSize: merged.includes(r.baseSize) ? r.baseSize : '', gradingZones: normalizeGradingZones(r.gradingZones || [], merged), cells: nextCells };
    }));
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
    const ids = Object.values(row.cells).map((c) => c.id).filter((id): id is string | number => id != null && String(id).trim() !== '');
    setDeletedIds((prev) => [...prev, ...ids]);
    setRows((prev) => prev.filter((r) => r.key !== row.key));
  }, [readOnly, setDeletedIds, setRows]);

  const handleDeleteSize = useCallback((sizeName: string) => {
    if (readOnly) return;
    const ids: Array<string | number> = [];
    rows.forEach((r) => { const id = r.cells[sizeName]?.id; if (id != null && String(id).trim() !== '') ids.push(id); });
    setDeletedIds((prev) => [...prev, ...ids]);
    setSizeColumns((prev) => prev.filter((s) => s !== sizeName));
    setRows((prev) => prev.map((r) => {
      const nextCells = { ...r.cells };
      delete nextCells[sizeName];
      const nextSizes = sizeColumns.filter((s) => s !== sizeName);
      return { ...r, baseSize: nextSizes.includes(r.baseSize) ? r.baseSize : '', gradingZones: normalizeGradingZones(r.gradingZones || [], nextSizes), cells: nextCells };
    }));
  }, [readOnly, rows, sizeColumns, setDeletedIds, setSizeColumns, setRows]);

  const saveAll = useCallback(async () => {
    if (readOnly) return;
    const normalizedRows = normalizeChunkImageAssignments(rows);
    const invalid = normalizedRows.some((r) => !String(r.partName || '').trim());
    if (invalid) { message.error('请先填写部位'); return; }
    if (!sizeColumns.length) { message.error('请先添加尺码'); return; }
    const originals = originalRef.current;
    const originalById = new Map<string, StyleSize>();
    originals.forEach((o) => { if (o.id != null) originalById.set(String(o.id), o); });
    const obsoleteOriginalIds = originals
      .filter((item) => item.id != null && !sizeColumns.includes(String(item.sizeName || '').trim()))
      .map((item) => String(item.id));
    setSaving(true);
    try {
      const combinedIds = combinedSizeIdsRef.current || [];
      const deleteTasks = Array.from(new Set([...deletedIds.map((x) => String(x)), ...combinedIds.map((x) => String(x)), ...obsoleteOriginalIds].filter(Boolean)))
        .map((id) => api.delete(`/style/size/${id}`));
      if (deleteTasks.length) await Promise.all(deleteTasks);
      const tasks: Array<Promise<any>> = [];
      normalizedRows.forEach((r) => {
        const groupName = resolveGroupName(r.groupName, r.partName);
        const imageUrlsJson = r.imageUrls && r.imageUrls.length > 0 ? JSON.stringify(r.imageUrls.slice(0, 2)) : null;
        const gradingRule = serializeGradingRule(r, sizeColumns);
        sizeColumns.forEach((sn) => {
          const cell = r.cells[sn];
          const id = cell?.id;
          const payload: any = {
            id: id != null ? id : undefined, styleId, sizeName: sn, partName: r.partName,
            groupName, measureMethod: r.measureMethod, baseSize: r.baseSize || '',
            standardValue: toNumberSafe(cell?.value), tolerance: r.tolerance,
            sort: toNumberSafe(r.sort), imageUrls: imageUrlsJson, gradingRule,
          };
          if (id != null && String(id).trim() !== '') {
            const old = originalById.get(String(id));
            const changed = !old ||
              String(old.sizeName || '').trim() !== sn ||
              String(old.partName || '').trim() !== String(r.partName || '').trim() ||
              String((old as Record<string, unknown>).groupName || '').trim() !== String(payload.groupName || '').trim() ||
              String((old as Record<string, unknown>).measureMethod || '').trim() !== String(r.measureMethod || '').trim() ||
              String((old as Record<string, unknown>).baseSize || '').trim() !== String(payload.baseSize || '').trim() ||
              toNumberSafe(old.standardValue) !== toNumberSafe(payload.standardValue) ||
              String(old.tolerance ?? '') !== String(payload.tolerance ?? '') ||
              toNumberSafe((old as Record<string, unknown>).sort) !== toNumberSafe(payload.sort) ||
              String((old as Record<string, unknown>).imageUrls || '') !== String(payload.imageUrls || '') ||
              String((old as Record<string, unknown>).gradingRule || '') !== String(payload.gradingRule || '');
            if (changed) tasks.push(api.put('/style/size', payload));
          } else {
            const createPayload = { ...payload }; delete createPayload.id;
            tasks.push(api.post('/style/size', createPayload));
          }
        });
      });
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
