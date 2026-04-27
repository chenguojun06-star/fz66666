import { useCallback, useRef, useState } from 'react';
import { App } from 'antd';
import { modal } from '@/utils/antdStatic';
import api, { toNumberSafe } from '@/utils/api';
import { intelligenceApi, ProcessPriceHintResponse, ProcessTemplateItem } from '@/services/intelligence/intelligenceApi';
import { CATEGORY_CODE_OPTIONS } from '@/utils/styleCategory';
import { useDictOptions } from '@/hooks/useDictOptions';
import type { SizePrice, StyleProcessWithSizePrice } from '../styleProcessTabUtils';
import { norm, isTempId } from '../styleProcessTabUtils';

type UseStyleProcessActionsParams = {
  styleId: number | string;
  readOnly: boolean;
  processStartTime: string | undefined;
  data: StyleProcessWithSizePrice[];
  setData: React.Dispatch<React.SetStateAction<StyleProcessWithSizePrice[]>>;
  sizes: string[];
  setSizes: React.Dispatch<React.SetStateAction<string[]>>;
  fetchProcess: () => Promise<void>;
  editMode: boolean;
  setEditMode: React.Dispatch<React.SetStateAction<boolean>>;
  deletedIds: Array<string | number>;
  setDeletedIds: React.Dispatch<React.SetStateAction<Array<string | number>>>;
  snapshotRef: React.MutableRefObject<StyleProcessWithSizePrice[] | null>;
  onRefresh?: () => void;
  enterEdit: () => Promise<void>;
};

export const useStyleProcessActions = ({
  styleId, readOnly, processStartTime, data, setData, sizes, setSizes,
  fetchProcess, editMode, setEditMode, deletedIds, setDeletedIds, snapshotRef, onRefresh, enterEdit,
}: UseStyleProcessActionsParams) => {
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);

  const exitEdit = () => {
    const snap = snapshotRef.current;
    if (snap) setData(snap);
    setDeletedIds([]);
    setEditMode(false);
    snapshotRef.current = null;
  };

  const handleAdd = async (targetStage?: string) => {
    if (readOnly) return;
    if (!processStartTime) { message.warning('请先点击上方「开始工序单价」按钮再进行编辑'); return; }
    if (!editMode) await enterEdit();
    if (!editMode && !snapshotRef.current) return;
    const maxSort = data.length ? Math.max(...data.map((d) => toNumberSafe(d.sortOrder))) : 0;
    const newId = -Date.now();
    const nextSort = maxSort + 1;
    const autoCode = String(nextSort).padStart(2, '0');
    const sizePrices: Record<string, number> = {};
    const sizePriceTouched: Record<string, boolean> = {};
    sizes.forEach((s) => { sizePrices[s] = 0; sizePriceTouched[s] = false; });
    const newProcess: StyleProcessWithSizePrice = { id: newId, styleId, processCode: autoCode, processName: '', progressStage: targetStage || '车缝', machineType: '', standardTime: 0, price: 0, sortOrder: nextSort, sizePrices, sizePriceTouched };
    setData((prev) => [...prev, newProcess]);
  };

  const handleRemoveSize = (size: string) => {
    setSizes((prev) => prev.filter((s) => s !== size));
    setData((prev) => prev.map((row) => { const { [size]: _, ...restSizePrices } = row.sizePrices || {}; const { [size]: __, ...restTouched } = row.sizePriceTouched || {}; return { ...row, sizePrices: restSizePrices, sizePriceTouched: restTouched }; }));
    message.success(`已删除尺码: ${size}`);
  };

  const updateSizePrice = (id: string | number, size: string, value: number) => {
    setData((prev) => prev.map((r) => r.id === id ? { ...r, sizePrices: { ...(r.sizePrices || {}), [size]: value }, sizePriceTouched: { ...(r.sizePriceTouched || {}), [size]: true } } : r));
  };

  const applyProcessTemplate = async (templateId: string) => {
    if (readOnly) return;
    if (editMode) { message.error('请先保存或退出编辑再导入模板'); return; }
    const sid = Number(styleId);
    if (!Number.isFinite(sid) || sid <= 0) { message.error('styleId不合法'); return; }
    try {
      const res = await api.post<{ code: number; message: string; data: boolean }>('/template-library/apply-to-style', { templateId, targetStyleId: sid, mode: 'overwrite' });
      const result = res as any;
      if (result.code !== 200) { message.error(result.message || '导入失败'); return; }
      message.success('已导入工艺模板');
      await fetchProcess();
      void enterEdit();
    } catch (e: unknown) { message.error(e instanceof Error ? e.message : '导入失败'); }
  };

  const handleDelete = (id: string | number) => {
    if (readOnly) return;
    if (!processStartTime) { message.warning('请先点击上方「开始工序单价」按钮再进行编辑'); return; }
    if (!editMode) enterEdit();
    if (!isTempId(id)) setDeletedIds((prev) => [...prev, id]);
    setData((prev) => { const filtered = prev.filter((x) => x.id !== id); return filtered.map((item, index) => ({ ...item, sortOrder: index + 1, processCode: String(index + 1).padStart(2, '0') })); });
  };

  const updateField = (id: string | number, field: keyof import('@/types/style').StyleProcess, value: any, fetchPriceHint?: (rowId: string | number, processName: string, standardTime?: number) => void) => {
    setData((prev) => prev.map((r) => {
      if (r.id !== id) return r;
      if (field !== 'price') {
        if (field === 'processName' && typeof value === 'string' && fetchPriceHint) fetchPriceHint(id, value, r.standardTime ?? undefined);
        return { ...r, [field]: value };
      }
      const nextPrice = toNumberSafe(value);
      const oldPrice = toNumberSafe(r.price);
      const nextSizePrices: Record<string, number> = { ...(r.sizePrices || {}) };
      const touched = r.sizePriceTouched || {};
      sizes.forEach((s) => { const current = toNumberSafe(nextSizePrices[s]); const isTouched = Boolean(touched[s]); if (!isTouched || current === oldPrice) nextSizePrices[s] = nextPrice; });
      return { ...r, price: nextPrice, sizePrices: nextSizePrices };
    }));
  };

  const saveAll = async () => {
    if (readOnly) return;
    const rows = data.map((r, index) => ({ ...r, sortOrder: index + 1, processCode: String(index + 1).padStart(2, '0') }));
    if (!rows.length) { message.error('请先添加工序'); return; }
    const codes = rows.map((r) => norm(r.processCode)).filter(Boolean);
    if (codes.length !== new Set(codes).size) { message.error('工序编码不能重复'); return; }
    const invalid = rows.find((r) => !norm(r.processCode) || !norm(r.processName) || r.price == null);
    if (invalid) { message.error('请完善必填项：工序编码、工序名称、工价'); return; }
    setSaving(true);
    try {
      const deleteTasks = Array.from(new Set(deletedIds.map((x) => String(x)).filter(Boolean))).map((id) => api.delete(`/style/process/${id}`));
      if (deleteTasks.length) { const delResults = await Promise.all(deleteTasks); const delBad = delResults.find((r: Record<string, unknown>) => (r as any)?.code !== 200); if (delBad) { message.error((delBad as any)?.message || '删除失败'); return; } }
      const tasks: Array<Promise<unknown>> = [];
      rows.forEach((r) => {
        const payload: any = { id: r.id, styleId, processCode: norm(r.processCode), processName: norm(r.processName), description: norm(r.description), progressStage: norm(r.progressStage) || '车缝', machineType: norm(r.machineType), standardTime: r.standardTime != null ? toNumberSafe(r.standardTime) : 0, price: toNumberSafe(r.price), sortOrder: toNumberSafe(r.sortOrder) };
        if (!isTempId(r.id)) tasks.push(api.put('/style/process', payload)); else { const createPayload = { ...payload }; delete createPayload.id; tasks.push(api.post('/style/process', createPayload)); }
      });
      const results = await Promise.all(tasks);
      const bad = results.find((r: Record<string, unknown>) => (r as any)?.code !== 200);
      if (bad) { message.error((bad as any)?.message || '保存失败'); return; }
      if (sizes.length > 0) {
        try {
          const sizePriceList: SizePrice[] = [];
          rows.forEach((row) => { sizes.forEach((size) => { sizePriceList.push({ styleId: Number(styleId), processCode: norm(row.processCode), processName: norm(row.processName), progressStage: norm(row.progressStage) || '车缝', size, price: toNumberSafe(row.sizePrices?.[size] ?? row.price) }); }); });
          await api.post('/style/size-price/batch-save', sizePriceList);
        } catch (error) { console.error('保存多码单价失败:', error); }
      }
      message.success('保存成功，请点击"完成"按鈕锁定工序单价');
      setEditMode(false);
      snapshotRef.current = null;
      await fetchProcess();
      if (onRefresh) onRefresh();
    } catch (e: unknown) { message.error(e instanceof Error ? e.message : '保存失败'); } finally { setSaving(false); }
  };

  return { saving, exitEdit, handleAdd, handleRemoveSize, updateSizePrice, applyProcessTemplate, handleDelete, updateField, saveAll };
};
