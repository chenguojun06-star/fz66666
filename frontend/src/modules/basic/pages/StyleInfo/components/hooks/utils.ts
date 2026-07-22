import { StyleSize } from '@/types/style';
import { toNumberSafe } from '@/utils/api';
import {
  MatrixCell, MatrixRow,
  resolveGroupName, normalizeRowSorts,
  normalizeChunkImageAssignments, normalizeGradingZones,
  serializeGradingRule, createGradingZone,
} from '../styleSize/shared';

export function applyGradingToRow(row: MatrixRow, sizeColumns: string[]): MatrixRow {
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
}

export function buildGradingDraftZones(row: MatrixRow, sizeColumns: string[]): any[] {
  const baseSize = row.baseSize || '';
  const baseIndex = baseSize ? sizeColumns.indexOf(baseSize) : -1;
  const defaultFrontSizes = baseIndex > 0 ? sizeColumns.slice(0, baseIndex) : [];
  const defaultBackSizes = baseIndex >= 0 && baseIndex < sizeColumns.length - 1 ? sizeColumns.slice(baseIndex + 1) : [];
  const existingZones = normalizeGradingZones(row.gradingZones || [], sizeColumns);
  if (existingZones.length > 0) {
    return existingZones.map((z: any) => ({
      ...z,
      frontSizes: (z.frontSizes || []).length > 0 ? z.frontSizes : defaultFrontSizes,
      backSizes: (z.backSizes || []).length > 0 ? z.backSizes : defaultBackSizes,
      partKeys: [row.key],
    }));
  }
  return [createGradingZone([], '1', [row.key], defaultFrontSizes, defaultBackSizes)];
}

export function buildBatchGradingDraftZones(
  selectedRowKeys: React.Key[],
  rows: MatrixRow[],
  sizeColumns: string[],
): any[] {
  const firstSelectedRow = rows.find((r) => selectedRowKeys.includes(r.key));
  const baseSize = firstSelectedRow?.baseSize || '';
  const baseIndex = baseSize ? sizeColumns.indexOf(baseSize) : -1;
  const frontSizes = baseIndex > 0 ? sizeColumns.slice(0, baseIndex) : [];
  const backSizes = baseIndex >= 0 && baseIndex < sizeColumns.length - 1 ? sizeColumns.slice(baseIndex + 1) : [];
  return [createGradingZone([], '1', selectedRowKeys.map(String), frontSizes, backSizes)];
}

export function createNewPartRow(groupName: string, sizeColumns: string[], key: string): MatrixRow {
  const cells: Record<string, MatrixCell> = {};
  sizeColumns.forEach((sn) => { cells[sn] = { value: 0 }; });
  return { key, groupName, partName: '', measureMethod: '', baseSize: '', gradingZones: [], tolerance: '', sort: 0, cells };
}

export function insertPartInGroup(prev: MatrixRow[], groupName: string, newRow: MatrixRow): MatrixRow[] {
  const groupRowIndices: number[] = [];
  prev.forEach((r, i) => { if (resolveGroupName(r.groupName, r.partName) === groupName) groupRowIndices.push(i); });
  const insertAt = groupRowIndices.length ? groupRowIndices[groupRowIndices.length - 1] + 1 : prev.length;
  const next = [...prev];
  next.splice(insertAt, 0, newRow);
  return normalizeRowSorts(next);
}

export function createNewGroupRow(groupName: string, sizeColumns: string[], key: string, maxSort: number): MatrixRow {
  const cells: Record<string, MatrixCell> = {};
  sizeColumns.forEach((sn) => { cells[sn] = { value: 0 }; });
  return {
    key, groupName, partName: '', measureMethod: '', baseSize: '', gradingZones: [], tolerance: '',
    sort: maxSort, cells,
  };
}

export function parseAndValidateSizeNames(
  raw: string,
  existingSizes: string[],
): { sizes: string[]; error?: string } {
  const parts = raw.split(/[\n,，、;；]+/g).map((x) => String(x || '').trim()).filter(Boolean);
  if (!parts.length) return { sizes: [], error: '请输入尺码' };
  const nextToAdd: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    if (existingSizes.includes(p)) return { sizes: [], error: `尺码已存在：${p}` };
    if (seen.has(p)) continue;
    seen.add(p);
    nextToAdd.push(p);
  }
  if (!nextToAdd.length) return { sizes: [], error: '请输入尺码' };
  return { sizes: nextToAdd };
}

export function addSizeColumnsToRows(rows: MatrixRow[], newSizes: string[], allSizes: string[]): MatrixRow[] {
  return rows.map((r) => {
    const nextCells = { ...r.cells };
    newSizes.forEach((sn) => { nextCells[sn] = { value: 0 }; });
    return { ...r, baseSize: allSizes.includes(r.baseSize) ? r.baseSize : '', gradingZones: normalizeGradingZones(r.gradingZones || [], allSizes), cells: nextCells };
  });
}

export function deleteSizeColumnFromRows(
  rows: MatrixRow[],
  sizeName: string,
  remainingSizes: string[],
): MatrixRow[] {
  return rows.map((r) => {
    const nextCells = { ...r.cells };
    delete nextCells[sizeName];
    return { ...r, baseSize: remainingSizes.includes(r.baseSize) ? r.baseSize : '', gradingZones: normalizeGradingZones(r.gradingZones || [], remainingSizes), cells: nextCells };
  });
}

export function collectIdsFromDeletedRow(row: MatrixRow): Array<string | number> {
  return Object.values(row.cells).map((c) => c.id).filter((id): id is string | number => id != null && String(id).trim() !== '');
}

export function collectIdsFromDeletedSize(rows: MatrixRow[], sizeName: string): Array<string | number> {
  const ids: Array<string | number> = [];
  rows.forEach((r) => { const id = r.cells[sizeName]?.id; if (id != null && String(id).trim() !== '') ids.push(id); });
  return ids;
}

export function applyGradingDraftToRows(
  rows: MatrixRow[],
  targetKey: string,
  draftBaseSize: string,
  draftZones: any[],
  sizeColumns: string[],
): { rows: MatrixRow[]; clearSelection: boolean } {
  if (targetKey === 'batch') {
    return {
      rows: rows.map((row) => {
        const matchingZones = draftZones.filter((zone: any) => (zone.partKeys || []).includes(row.key));
        if (matchingZones.length === 0) return row;
        return applyGradingToRow({
          ...row, baseSize: draftBaseSize,
          gradingZones: matchingZones.map((z: any) => ({
            key: z.key, label: z.label, sizes: z.sizes || [], step: z.step || 0,
            frontSizes: z.frontSizes || [], frontStep: z.frontStep || 0,
            backSizes: z.backSizes || [], backStep: z.backStep || 0,
            sizeStepColumns: z.sizeStepColumns || [],
          })),
        }, sizeColumns);
      }),
      clearSelection: true,
    };
  }
  return {
    rows: rows.map((row) => (
      row.key === targetKey
        ? applyGradingToRow({ ...row, baseSize: draftBaseSize, gradingZones: normalizeGradingZones(draftZones, sizeColumns) }, sizeColumns)
        : row
    )),
    clearSelection: false,
  };
}

export function setChunkImageUrlsForRows(
  rows: MatrixRow[],
  chunkRowKeys: string[],
  nextImages: string[],
): MatrixRow[] {
  const ownerRowKey = String(chunkRowKeys[0] || '');
  const rowKeySet = new Set(chunkRowKeys);
  const sanitized = nextImages.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 2);
  return rows.map((row) => {
    if (!rowKeySet.has(row.key)) return row;
    return { ...row, imageUrls: String(row.key) === ownerRowKey && sanitized.length ? sanitized : undefined };
  });
}

export function updateChunkGroupNameForRows(
  rows: MatrixRow[],
  chunkRowKeys: string[],
  groupName: string,
): MatrixRow[] {
  const normalizedGroupName = String(groupName || '').trim() || '其他区';
  if (!chunkRowKeys.length) return rows;
  const rowKeySet = new Set(chunkRowKeys);
  let changed = false;
  const nextRows = rows.map((row) => {
    if (!rowKeySet.has(row.key)) return row;
    const currentResolvedGroup = resolveGroupName(row.groupName, row.partName);
    if (currentResolvedGroup === normalizedGroupName && String(row.groupName || '').trim() === normalizedGroupName) {
      return row;
    }
    changed = true;
    return { ...row, groupName: normalizedGroupName };
  });
  return changed ? normalizeRowSorts(nextRows) : rows;
}

export interface SaveTaskBuildInput {
  rows: MatrixRow[];
  sizeColumns: string[];
  deletedIds: Array<string | number>;
  originals: StyleSize[];
  combinedSizeIds: Array<string | number>;
  styleId: string | number;
}

export function buildSaveTasks(input: SaveTaskBuildInput): {
  deleteIds: string[];
  updateTasks: Array<{ payload: any; isNew: boolean }>;
  hasInvalid: boolean;
  normalizedRows: MatrixRow[];
} {
  const { rows, sizeColumns, deletedIds, originals, combinedSizeIds, styleId } = input;
  const normalizedRows = normalizeChunkImageAssignments(rows);
  const hasInvalid = normalizedRows.some((r) => !String(r.partName || '').trim()) || !sizeColumns.length;
  if (hasInvalid) {
    return { deleteIds: [], updateTasks: [], hasInvalid: true, normalizedRows };
  }
  const originalById = new Map<string, StyleSize>();
  originals.forEach((o) => { if (o.id != null) originalById.set(String(o.id), o); });
  const obsoleteOriginalIds = originals
    .filter((item) => item.id != null && !sizeColumns.includes(String(item.sizeName || '').trim()))
    .map((item) => String(item.id));
  const deleteIds = Array.from(new Set([
    ...deletedIds.map((x) => String(x)),
    ...combinedSizeIds.map((x) => String(x)),
    ...obsoleteOriginalIds,
  ].filter(Boolean)));
  const updateTasks: Array<{ payload: any; isNew: boolean }> = [];
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
        if (changed) updateTasks.push({ payload, isNew: false });
      } else {
        const createPayload = { ...payload };
        delete createPayload.id;
        updateTasks.push({ payload: createPayload, isNew: true });
      }
    });
  });
  return { deleteIds, updateTasks, hasInvalid: false, normalizedRows };
}
