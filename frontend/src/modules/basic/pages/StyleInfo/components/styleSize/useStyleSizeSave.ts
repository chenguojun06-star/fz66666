import React, { useState } from 'react';
import { StyleSize } from '@/types/style';
import api, { toNumberSafe } from '@/utils/api';
import {
  MatrixRow,
  resolveGroupName,
  normalizeChunkImageAssignments,
  serializeGradingRule,
} from './shared';

interface Params {
  styleId: string | number;
  readOnly?: boolean;
  rows: MatrixRow[];
  sizeColumns: string[];
  setRows: React.Dispatch<React.SetStateAction<MatrixRow[]>>;
  setEditMode: React.Dispatch<React.SetStateAction<boolean>>;
  deletedIds: Array<string | number>;
  originalRef: React.MutableRefObject<StyleSize[]>;
  combinedSizeIdsRef: React.MutableRefObject<Array<string | number>>;
  snapshotRef: React.MutableRefObject<{ sizeColumns: string[]; rows: MatrixRow[] } | null>;
  fetchSize: () => Promise<void>;
  message: { error: (msg: string) => void; success: (msg: string) => void };
}

function buildPayload(
  r: MatrixRow,
  sn: string,
  styleId: string | number,
  sizeColumns: string[],
): { id: string | number | undefined; payload: Record<string, unknown> } {
  const groupName = resolveGroupName(r.groupName, r.partName);
  const imageUrlsJson = r.imageUrls && r.imageUrls.length > 0 ? JSON.stringify(r.imageUrls.slice(0, 2)) : null;
  const gradingRule = serializeGradingRule(r, sizeColumns);
  const cell = r.cells[sn];
  const id = cell?.id;
  return {
    id,
    payload: {
      id: id != null ? id : undefined,
      styleId,
      sizeName: sn,
      partName: r.partName,
      groupName,
      measureMethod: r.measureMethod,
      baseSize: r.baseSize || '',
      standardValue: toNumberSafe(cell?.value),
      tolerance: r.tolerance,
      sort: toNumberSafe(r.sort),
      imageUrls: imageUrlsJson,
      gradingRule,
    },
  };
}

function isCellChanged(old: StyleSize | undefined, sn: string, r: MatrixRow, payload: Record<string, unknown>): boolean {
  if (!old) return true;
  const o = old as Record<string, unknown>;
  return String(old.sizeName || '').trim() !== sn
    || String(old.partName || '').trim() !== String(r.partName || '').trim()
    || String(o.groupName || '').trim() !== String(payload.groupName || '').trim()
    || String(o.measureMethod || '').trim() !== String(r.measureMethod || '').trim()
    || String(o.baseSize || '').trim() !== String(payload.baseSize || '').trim()
    || toNumberSafe(old.standardValue) !== toNumberSafe(payload.standardValue)
    || String(old.tolerance ?? '') !== String(payload.tolerance ?? '')
    || toNumberSafe(o.sort) !== toNumberSafe(payload.sort)
    || String(o.imageUrls || '') !== String(payload.imageUrls || '')
    || String(o.gradingRule || '') !== String(payload.gradingRule || '');
}

export function useStyleSizeSave({
  styleId, readOnly, rows, sizeColumns, setRows, setEditMode,
  deletedIds, originalRef, combinedSizeIdsRef, snapshotRef, fetchSize, message,
}: Params) {
  const [saving, setSaving] = useState(false);

  const saveAll = async () => {
    if (readOnly) return;
    const normalizedRows = normalizeChunkImageAssignments(rows);
    if (normalizedRows.some((r) => !String(r.partName || '').trim())) { message.error('请先填写部位'); return; }
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
      const deleteTasks = Array.from(new Set([
        ...deletedIds.map((x) => String(x)),
        ...combinedIds.map((x) => String(x)),
        ...obsoleteOriginalIds,
      ].filter(Boolean))).map((id) => api.delete(`/style/size/${id}`));
      if (deleteTasks.length) await Promise.all(deleteTasks);

      const tasks: Array<Promise<any>> = [];
      normalizedRows.forEach((r) => {
        sizeColumns.forEach((sn) => {
          const { id, payload } = buildPayload(r, sn, styleId, sizeColumns);
          if (id != null && String(id).trim() !== '') {
            if (isCellChanged(originalById.get(String(id)), sn, r, payload)) {
              tasks.push(api.put('/style/size', payload));
            }
          } else {
            const createPayload = { ...payload };
            delete createPayload.id;
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
  };

  return { saving, saveAll };
}
