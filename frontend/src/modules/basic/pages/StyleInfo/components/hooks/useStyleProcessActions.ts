import React from 'react';
import { useState } from 'react';
import { App } from 'antd';
import api, { toNumberSafe } from '@/utils/api';
import type { SizePrice, StyleProcessWithSizePrice } from '../styleProcessTabUtils';
import { norm, isTempId } from '../styleProcessTabUtils';
import { STAGE_ORDER } from '@/utils/productionStage';

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
    // D-264：编码按现有最大编码+1（删行不再重编后，sortOrder 可能小于最大编码，按 sortOrder 取会撞号）
    const maxCode = data.reduce((acc, d) => { const m = String(d.processCode || '').match(/\d+/); return Math.max(acc, m ? Number(m[0]) : 0); }, 0);
    let codeVal = maxCode + 1;
    while (data.some((d) => String(d.processCode || '').trim() === String(codeVal).padStart(2, '0'))) codeVal += 1;
    const autoCode = String(codeVal).padStart(2, '0');
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

  /**
   * 应用工艺模板到当前款式。
   *
   * D-252：新增 mode 参数，让用户选择「覆盖现有」还是「追加新增」。
   * 此前恒为 overwrite，用户无法在保留现有工序的前提下追加模板工序。
   * 后端 TemplateStyleOrchestrator 早已支持 mode（overwrite/cover/true → 覆盖，其余 → 追加），
   * 且 D-252 已为追加模式补上幂等去重与编码续接，重复导入不会产生重复行。
   */
  const applyProcessTemplate = async (templateId: string, mode: 'overwrite' | 'append' = 'overwrite') => {
    if (readOnly) return;
    if (editMode) { message.error('请先保存或退出编辑再导入模板'); return; }
    const sid = Number(styleId);
    if (!Number.isFinite(sid) || sid <= 0) { message.error('styleId不合法'); return; }
    try {
      const res = await api.post<{ code: number; message: string; data: boolean }>('/template-library/apply-to-style', { templateId, targetStyleId: sid, mode });
      const result = res as any;
      if (result.code !== 200) { message.error(result.message || '导入失败'); return; }
      message.success(mode === 'append' ? '已追加导入工艺模板（已自动跳过重复工序）' : '已覆盖导入工艺模板');
      await fetchProcess();
      // D-264：按模板步骤顺序就地纠正编码与排序。后端写入顺序不受控（旧版后端/模板内容
      // 无编码时按数组序重编号），此前多次出现"01裁剪导入变03/05"的乱序——
      // 以模板 steps 的顺序为准在前端重排列并重编码（按工序名称匹配），保存后即固化。
      await reorderRowsByTemplate(templateId);
      void enterEdit();
    } catch (e: unknown) { message.error(e instanceof Error ? e.message : '导入失败'); }
  };

  /** 按模板 steps 顺序重排当前工序行并按 01..N 重编码（按工序名匹配模板顺序） */
  const reorderRowsByTemplate = async (templateId: string) => {
    try {
      const res = await api.get<any>('/template-library/list', { params: { templateType: 'process', page: 1, pageSize: 200 } });
      const records: any[] = res?.data?.records || res?.data || [];
      const tpl = records.find((t) => String(t?.id || '') === String(templateId));
      if (!tpl?.templateContent) return;
      let steps: any[] = [];
      const content: any = tpl.templateContent;
      if (typeof content === 'object') {
        steps = content.steps || content.rows || content.data || [];
      } else {
        try {
          const parsed = JSON.parse(String(content));
          steps = parsed?.steps || parsed?.rows || parsed?.data || [];
        } catch { return; }
      }
      // D-288：排序口径改为 阶段(裁剪→二次工艺→车缝→尾部)优先，模板步骤序/编码作阶段内次序——
      // 修复"导入的模板不按父进度顺序、车缝排在裁剪前面"的乱套问题；随后按 01..N 重编码固化
      const stageIndexOf = (row: StyleProcessWithSizePrice) => {
        const st = String(row.progressStage || '').trim();
        const idx = STAGE_ORDER.indexOf(st);
        return idx === -1 ? STAGE_ORDER.length : idx;
      };
      const codeOrdinal = (row: StyleProcessWithSizePrice) => {
        const m = String(row.processCode || '').match(/\d+/);
        return m ? Number(m[0]) : Number.MAX_SAFE_INTEGER;
      };
      const ordinalByName = new Map<string, number>();
      if (Array.isArray(steps)) {
        steps.forEach((s: any, i: number) => {
          const key = String(s?.processName || '').trim();
          if (key && !ordinalByName.has(key)) ordinalByName.set(key, i);
        });
      }
      setData((prev) => {
        const ordered = [...prev].sort((a, b) => {
          const sa = stageIndexOf(a);
          const sb = stageIndexOf(b);
          if (sa !== sb) return sa - sb;
          const oa = ordinalByName.get(String(a.processName || '').trim()) ?? Number.MAX_SAFE_INTEGER;
          const ob = ordinalByName.get(String(b.processName || '').trim()) ?? Number.MAX_SAFE_INTEGER;
          if (oa !== ob) return oa - ob;
          return codeOrdinal(a) - codeOrdinal(b);
        });
        return ordered.map((r, index) => ({ ...r, sortOrder: index + 1, processCode: String(index + 1).padStart(2, '0') }));
      });
    } catch { /* 纠序失败不影响导入结果 */ }
  };

  const handleDelete = (id: string | number) => {
    if (readOnly) return;
    if (!processStartTime) { message.warning('请先点击上方「开始工序单价」按钮再进行编辑'); return; }
    if (!editMode) enterEdit();
    if (!isTempId(id)) setDeletedIds((prev) => [...prev, id]);
    // D-264：删除只删行、不重编码——工序编码是身份（码数单价按 processCode 关联），
    // 此前按剩余行顺序 processCode=index+1 全量重编，把编码与工序名的配对洗乱
    setData((prev) => prev.filter((x) => x.id !== id));
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
    // D-264：保存不得按显示顺序重编 processCode——编码是身份（模板导入配对、码数单价关联都靠它），
    // 此前每次保存 processCode=index+1，导入模板后一保存就把"01裁剪"洗成别的编码。
    // 只为没有编码的行（手工新增漏发）按现有最大编码+1 补号；sortOrder 仍按当前顺序持久化。
    let maxCode = 0;
    data.forEach((r) => { const m = String(r.processCode || '').match(/\d+/); if (m) maxCode = Math.max(maxCode, Number(m[0])); });
    const usedCodes = new Set(data.map((r) => norm(r.processCode)).filter(Boolean));
    const rows = data.map((r, index) => {
      let code = norm(r.processCode);
      if (!code) {
        do { maxCode += 1; code = String(maxCode).padStart(2, '0'); } while (usedCodes.has(code));
        usedCodes.add(code);
      }
      return { ...r, sortOrder: index + 1, processCode: code };
    });
    if (!rows.length) { message.error('请先添加工序'); return; }
    const codes = rows.map((r) => norm(r.processCode)).filter(Boolean);
    if (codes.length !== new Set(codes).size) { message.error('工序编码不能重复'); return; }
    const invalid = rows.find((r) => !norm(r.processCode) || !norm(r.processName) || r.price == null);
    if (invalid) { message.error('请完善必填项：工序编码、工序名称、工价'); return; }
    setSaving(true);
    try {
      // D-264：404（数据已不存在）视作删除成功——deletedIds 此前保存成功后从不清空，
      // 下次保存会把上次已删的行再删一遍，后端 404 直接中断整次保存，
      // 用户看到"保存的信息不存在"且自己编辑的工序全部没保存
      const deleteIds = Array.from(new Set(deletedIds.map((x) => String(x)).filter(Boolean)));
      if (deleteIds.length) {
        const delResults = await Promise.all(deleteIds.map((id) =>
          api.delete(`/style/process/${id}`).catch((e: any) => ({ code: 404, message: e?.message }))
        ));
        const delBad = delResults.find((r: Record<string, unknown>) => (r as any)?.code !== 200 && (r as any)?.code !== 404);
        if (delBad) { message.error((delBad as any)?.message || '删除失败'); return; }
        setDeletedIds([]);
      }
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
