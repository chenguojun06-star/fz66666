import React, { useState } from 'react';
import { sortSizeNames, toNumberSafe } from '@/utils/api';
import api from '@/utils/api';
import {
  MatrixCell,
  MatrixRow,
  resolveGroupName,
  normalizeRowSorts,
  normalizeGradingZones,
  getSizeDedupeKey,
  hasSameSizeKey,
} from './shared';

interface Params {
  styleId: string | number;
  readOnly?: boolean;
  editMode: boolean;
  enterEdit: () => void;
  setEditMode: React.Dispatch<React.SetStateAction<boolean>>;
  rows: MatrixRow[];
  sizeColumns: string[];
  setRows: React.Dispatch<React.SetStateAction<MatrixRow[]>>;
  setSizeColumns: React.Dispatch<React.SetStateAction<string[]>>;
  setDeletedIds: React.Dispatch<React.SetStateAction<Array<string | number>>>;
  fetchSize: () => Promise<void>;
  message: { error: (msg: string) => void; success: (msg: string) => void };
}

/**
 * 尺码矩阵的行/列结构变更：增删部位、增删尺码、模板导入。
 * 不含跳码逻辑（见 useStyleSizeGrading）与基础字段编辑（见 useStyleSizeRowMutations）。
 */
export function useStyleSizeStructure({
  styleId,
  readOnly,
  editMode,
  enterEdit,
  setEditMode,
  rows,
  sizeColumns,
  setRows,
  setSizeColumns,
  setDeletedIds,
  fetchSize,
  message,
}: Params) {
  const [addSizeOpen, setAddSizeOpen] = useState(false);
  const [newSizeName, setNewSizeName] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [sizeTemplateKey, setSizeTemplateKey] = useState<string | undefined>(undefined);

  const handleAddPartInGroup = (groupName: string) => {
    if (readOnly) return;
    const key = `tmp-part-${Date.now()}-${Math.random()}`;
    const cells: Record<string, MatrixCell> = {};
    sizeColumns.forEach((sn) => { cells[sn] = { value: 0 }; });
    setRows((prev) => {
      const groupRowIndices: number[] = [];
      prev.forEach((r, i) => {
        if (resolveGroupName(r.groupName, r.partName) === groupName) groupRowIndices.push(i);
      });
      const insertAt = groupRowIndices.length ? groupRowIndices[groupRowIndices.length - 1] + 1 : prev.length;
      const next = [...prev];
      next.splice(insertAt, 0, {
        key, groupName, partName: '', measureMethod: '',
        baseSize: '', gradingZones: [], tolerance: '', sort: 0, cells,
      });
      return normalizeRowSorts(next);
    });
    if (!editMode) enterEdit();
  };

  const confirmAddGroup = () => {
    if (readOnly) return;
    const groupName = String(newGroupName || '').trim();
    if (!groupName) { message.error('请输入分组名称'); return; }
    const key = `tmp-group-${Date.now()}-${Math.random()}`;
    const cells: Record<string, MatrixCell> = {};
    sizeColumns.forEach((sn) => { cells[sn] = { value: 0 }; });
    setRows((prev) => normalizeRowSorts([
      ...prev,
      {
        key, groupName, partName: '', measureMethod: '', baseSize: '',
        gradingZones: [], tolerance: '',
        sort: prev.length ? Math.max(...prev.map((r) => toNumberSafe(r.sort))) + 1 : 1,
        cells,
      },
    ]));
    setNewGroupName('');
    if (!editMode) enterEdit();
  };

  // 免分组直接添加行：单件款式（只有上装/只有下装）不该被迫先建分组。
  // groupName 留空，展示层按部位名自动归组（resolveGroupName 推断上装区/下装区/其他区），
  // 日后真需要显式分组时再在分组列下拉里选即可。
  const handleAddPartRow = () => {
    if (readOnly) return;
    const key = `tmp-part-${Date.now()}-${Math.random()}`;
    const cells: Record<string, MatrixCell> = {};
    sizeColumns.forEach((sn) => { cells[sn] = { value: 0 }; });
    setRows((prev) => normalizeRowSorts([
      ...prev,
      {
        key, groupName: '', partName: '', measureMethod: '', baseSize: '',
        gradingZones: [], tolerance: '',
        sort: prev.length ? Math.max(...prev.map((r) => toNumberSafe(r.sort))) + 1 : 1,
        cells,
      },
    ]));
    if (!editMode) enterEdit();
  };

  const parseSizeInput = (raw: string): string[] | null => {
    const parts = raw.split(/[\n,，、;；]+/g).map((x) => String(x || '').trim()).filter(Boolean);
    if (!parts.length) { message.error('请输入尺码'); return null; }
    const seenKeys = new Set<string>();
    const next: string[] = [];
    for (const p of parts) {
      if (hasSameSizeKey(sizeColumns, p)) { message.error(`尺码已存在（含近似码）：${p}`); return null; }
      const key = getSizeDedupeKey(p);
      if (key && seenKeys.has(key)) continue;
      if (key) seenKeys.add(key);
      next.push(p);
    }
    if (!next.length) { message.error('请输入尺码'); return null; }
    return next;
  };

  const mergeSizeColumns = (additions: string[]) => {
    const merged = sortSizeNames([...sizeColumns, ...additions]);
    setSizeColumns(merged);
    setRows((prev) => prev.map((r) => {
      const nextCells = { ...r.cells };
      additions.forEach((sn) => { nextCells[sn] = { value: 0 }; });
      return {
        ...r,
        baseSize: merged.includes(r.baseSize) ? r.baseSize : '',
        gradingZones: normalizeGradingZones(r.gradingZones || [], merged),
        cells: nextCells,
      };
    }));
  };

  const confirmAddSize = () => {
    if (readOnly) return;
    const next = parseSizeInput(String(newSizeName || '').trim());
    if (!next) return;
    mergeSizeColumns(next);
    setAddSizeOpen(false);
    setNewSizeName('');
    if (!editMode) enterEdit();
  };

  const applySizeTemplate = async (templateId: string, mode: 'merge' | 'overwrite' = 'overwrite') => {
    if (readOnly) return;
    if (editMode) { message.error('请先保存或退出编辑再导入模板'); return; }
    const sid = Number(styleId);
    if (!Number.isFinite(sid) || sid <= 0) { message.error('styleId不合法'); return; }
    try {
      const res = await api.post<{ code: number; message: string; data: boolean }>('/template-library/apply-to-style', {
        templateId, targetStyleId: sid, mode,
      });
      const result = res as any;
      if (result.code !== 200) { message.error(result.message as any || '导入失败'); return; }
      message.success(mode === 'merge' ? '已按模板回填空缺尺寸（已填数据保持不变）' : '已覆盖导入尺寸模板');
      setSizeTemplateKey(undefined);
      await fetchSize();
      setEditMode(true);
    } catch (e: unknown) {
      message.error((e as any)?.message || '导入失败');
    }
  };

  const handleDeletePart = (row: MatrixRow) => {
    if (readOnly) return;
    const ids = Object.values(row.cells)
      .map((c) => c.id)
      .filter((id): id is string | number => id != null && String(id).trim() !== '');
    setDeletedIds((prev) => [...prev, ...ids]);
    setRows((prev) => prev.filter((r) => r.key !== row.key));
  };

  const handleDeleteSize = (sizeName: string) => {
    if (readOnly) return;
    const ids: Array<string | number> = [];
    rows.forEach((r) => {
      const id = r.cells[sizeName]?.id;
      if (id != null && String(id).trim() !== '') ids.push(id);
    });
    setDeletedIds((prev) => [...prev, ...ids]);
    setSizeColumns((prev) => prev.filter((s) => s !== sizeName));
    const nextSizes = sizeColumns.filter((s) => s !== sizeName);
    setRows((prev) => prev.map((r) => {
      const nextCells = { ...r.cells };
      delete nextCells[sizeName];
      return {
        ...r,
        baseSize: nextSizes.includes(r.baseSize) ? r.baseSize : '',
        gradingZones: normalizeGradingZones(r.gradingZones || [], nextSizes),
        cells: nextCells,
      };
    }));
  };

  return {
    addSizeOpen, setAddSizeOpen,
    newSizeName, setNewSizeName,
    newGroupName, setNewGroupName,
    sizeTemplateKey, setSizeTemplateKey,
    handleAddPartInGroup,
    handleAddPartRow,
    confirmAddGroup,
    confirmAddSize,
    mergeSizeColumns,
    applySizeTemplate,
    handleDeletePart,
    handleDeleteSize,
  };
}
