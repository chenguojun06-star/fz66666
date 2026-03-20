import React, { useEffect, useRef, useState } from 'react';
import { App, Button, Input, InputNumber, Form, Select, Space, Modal, Tabs, Image } from 'antd';
import { StyleBom, TemplateLibrary } from '@/types/style';
import api from '@/utils/api';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import DictAutoComplete from '@/components/common/DictAutoComplete';
import SupplierSelect from '@/components/common/SupplierSelect';
import { isSupervisorOrAboveUser, useAuth } from '@/utils/AuthContext';
import { getMaterialSortWeight, getMaterialTypeLabel, normalizeMaterialType } from '@/utils/materialType';
import { useViewport } from '@/utils/useViewport';
import StyleStageControlBar from './StyleStageControlBar';
import { useBomColumns } from './hooks/useBomColumns';
import type { MaterialType } from './hooks/useBomColumns';

interface Props {
  styleId: string | number;
  readOnly?: boolean;
  bomAssignee?: string;
  bomStartTime?: string;
  bomCompletedTime?: string;
  onRefresh?: () => void | Promise<void>;
}

const sortBomRows = (rows: StyleBom[]) => {
  const list = Array.isArray(rows) ? [...rows] : [];
  list.sort((a, b) => {
    const wa = getMaterialSortWeight((a as Record<string, unknown>)?.materialType);
    const wb = getMaterialSortWeight((b as Record<string, unknown>)?.materialType);
    if (wa !== wb) return wa - wb;
    const ca = String((a as Record<string, unknown>)?.materialCode || '');
    const cb = String((b as Record<string, unknown>)?.materialCode || '');
    if (ca !== cb) return ca.localeCompare(cb);
    return String((a as Record<string, unknown>)?.id || '').localeCompare(String((b as Record<string, unknown>)?.id || ''));
  });
  return list;
};

const StyleBomTab: React.FC<Props> = ({
  styleId,
  readOnly,
  bomAssignee,
  bomStartTime,
  bomCompletedTime,
  onRefresh,
}) => {
  const { user } = useAuth();
  const { message } = App.useApp();
  const { modalWidth } = useViewport();
  const [data, setData] = useState<StyleBom[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingKey, setEditingKey] = useState('');
  const [tableEditable, setTableEditable] = useState(false);
  const [form] = Form.useForm();
  const [bomTemplateId, setBomTemplateId] = useState<string | undefined>(undefined);
  const [bomTemplates, setBomTemplates] = useState<TemplateLibrary[]>([]);
  const [importMode, setImportMode] = useState<'overwrite' | 'append'>('overwrite');
  const [_templateSourceStyleNo, _setTemplateSourceStyleNo] = useState('');
  const [templateLoading, setTemplateLoading] = useState(false);
  const [_syncLoading, _setSyncLoading] = useState(false);
  const [currentStyleNo, setCurrentStyleNo] = useState('');

  const [syncJobId, setSyncJobId] = useState('');
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncJob, setSyncJob] = useState<any>(null);
  const syncPollRef = useRef<number | undefined>(undefined);

  const [materialModalOpen, setMaterialModalOpen] = useState(false);
  const [materialTab, setMaterialTab] = useState<'select' | 'create'>('select');
  const [materialLoading, setMaterialLoading] = useState(false);
  const [materialList, setMaterialList] = useState<any[]>([]);
  const [materialTotal, setMaterialTotal] = useState(0);
  const [materialPage, setMaterialPage] = useState(1);
  const [materialKeyword, setMaterialKeyword] = useState('');
  const [materialTargetRowId, setMaterialTargetRowId] = useState('');
  const [materialCreateForm] = Form.useForm();

  const [checkingStock, setCheckingStock] = useState(false);
  const [productionQty, setProductionQty] = useState(1);

  // 未开始时禁止编辑（需先点击「开始BOM清单」）
  const notStarted = !bomStartTime && !bomCompletedTime;
  const locked = Boolean(readOnly) || notStarted;

  const isSupervisorOrAbove = isSupervisorOrAboveUser(user);

  const [_styleNoOptions, _setStyleNoOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [_styleNoLoading, _setStyleNoLoading] = useState(false);
  const styleNoReqSeq = useRef(0);
  const styleNoTimerRef = useRef<number | undefined>(undefined);

  const fetchStyleNoOptions = async (keyword?: string) => {
    const seq = (styleNoReqSeq.current += 1);
    _setStyleNoLoading(true);
    try {
      const res = await api.get<{ code: number; data: { records: any[]; total: number } }>('/style/info/list', {
        params: {
          page: 1,
          pageSize: 200,
          styleNo: String(keyword ?? '').trim(),
        },
      });
      const result = res as Record<string, unknown>;
      if (seq !== styleNoReqSeq.current) return;
      if (result.code !== 200) return;
      const records = ((result.data as any)?.records || []) as Array<any>;
      const next = (Array.isArray(records) ? records : [])
        .map((r) => String(r?.styleNo || '').trim())
        .filter(Boolean)
        .map((sn) => ({ value: sn, label: sn }));
      _setStyleNoOptions(next);
    } catch {
    // Intentionally empty
      // 忽略错误
    } finally {
      if (seq === styleNoReqSeq.current) _setStyleNoLoading(false);
    }
  };

  const _scheduleFetchStyleNos = (keyword: string) => {
    if (styleNoTimerRef.current != null) {
      window.clearTimeout(styleNoTimerRef.current);
    }
    styleNoTimerRef.current = window.setTimeout(() => {
      fetchStyleNoOptions(keyword);
    }, 250);
  };

  const fetchBomTemplates = async (sourceStyleNo?: string) => {
    const sn = String(sourceStyleNo ?? '').trim();
    setTemplateLoading(true);
    try {
      const res = await api.get<{ code: number; data: unknown }>('/template-library/list', {
        params: {
          page: 1,
          pageSize: 200,
          templateType: 'bom',
          keyword: '',
          sourceStyleNo: sn,
        },
      });
      const result = res as Record<string, unknown>;
      if (result.code === 200) {
        // 兼容两种格式：直接数组 或 分页对象 { records: [...] }
        const data = result.data as any;
        let records: TemplateLibrary[] = [];
        if (Array.isArray(data)) {
          // 后端返回直接数组（listByType）
          records = data as TemplateLibrary[];
        } else if (data && typeof data === 'object' && 'records' in data) {
          // 后端返回分页对象（queryPage）
          records = ((data as Record<string, unknown>).records || []) as TemplateLibrary[];
        }
        setBomTemplates(records);
        return;
      }
    } catch {
    // Intentionally empty
      // 忽略错误
    } finally {
      setTemplateLoading(false);
    }

    try {
      const res = await api.get<{ code: number; data: unknown[] }>('/template-library/type/bom');
      const result = res as Record<string, unknown>;
      if (result.code === 200) {
        setBomTemplates(Array.isArray(result.data) ? result.data : []);
      }
    } catch {
    // Intentionally empty
      // 忽略错误
    }
  };

  const isTempId = (id: any) => {
    if (typeof id === 'string') return id.startsWith('tmp_');
    if (typeof id === 'number') return id < 0;
    return false;
  };

  const debugValue = (value: unknown) => {
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value);
    } catch {
    // Intentionally empty
      // 忽略错误
      return String(value);
    }
  };

  const calcTotalPrice = (item: Partial<StyleBom>) => {
    const usageAmount = Number(item.usageAmount) || 0;
    const lossRate = Number(item.lossRate) || 0;
    const unitPrice = Number(item.unitPrice) || 0;
    const qty = usageAmount * (1 + lossRate / 100);
    return Number((qty * unitPrice).toFixed(2));
  };

  // 获取数据
  const fetchBom = async (): Promise<StyleBom[]> => {
    let nextData: StyleBom[] = [];
    setLoading(true);
    try {
      const res = await api.get<StyleBom[]>(`/style/bom/list?styleId=${styleId}`);
      const result = res as any;
      if (result.code === 200) {
        const list = (result.data || []) as StyleBom[];
        const normalized = list.map((row) => ({
          ...row,
          materialType: normalizeMaterialType<MaterialType>((row as Record<string, unknown>).materialType),
        }));
        nextData = sortBomRows(normalized);
        setData(nextData);
        setEditingKey('');
        form.resetFields();
      }
    } catch (error) {
      message.error('获取BOM失败');
    } finally {
      setLoading(false);
    }

    return nextData;
  };

  const _syncToMaterialDatabase = async () => {
    if (locked) {
      message.error('已完成，无法操作');
      return;
    }
    if (Boolean(editingKey) || tableEditable) {
      message.error('请先保存或取消编辑');
      return;
    }
    try {
      _setSyncLoading(true);
      const sid = encodeURIComponent(String(styleId));
      const res = await api.post<{ code: number; data: any }>(`/style/bom/${sid}/sync-material-database`, undefined, { params: { async: true } });
      const result = res as Record<string, unknown>;
      if (result.code === 200) {
        const d = (result.data || {}) as any;
        const jid = String(d.jobId || '').trim();
        if (!jid) {
          message.error('未获取到任务ID');
          return;
        }
        setSyncJobId(jid);
        setSyncModalOpen(true);
        message.success('已提交同步任务');
        return;
      }
      message.error(String(result?.message || '同步失败'));
    } catch (error: any) {
      message.error(`同步失败（${error?.message || '请求失败'}）`);
    } finally {
      _setSyncLoading(false);
    }
  };

  const fetchCurrentStyleNo = async () => {
    const sid = Number(styleId);
    if (!Number.isFinite(sid) || sid <= 0) {
      setCurrentStyleNo('');
      return;
    }
    try {
      const res = await api.get<{ code: number; data: any }>(`/style/info/${sid}`);
      const result = res as Record<string, unknown>;
      if (result.code === 200) {
        setCurrentStyleNo(String((result.data as any)?.styleNo || '').trim());
      }
    } catch {
    // Intentionally empty
      // 忽略错误
      setCurrentStyleNo('');
    }
  };

  const fetchSyncJob = async (jid: string) => {
    const id = String(jid || '').trim();
    if (!id) return;
    try {
      const res = await api.get<{ code: number; data: any }>(`/style/bom/sync-jobs/${encodeURIComponent(id)}`);
      const result = res as Record<string, unknown>;
      if (result.code === 200) {
        setSyncJob(result.data);
        const st = String((result.data as any)?.status || '').trim().toLowerCase();
        if (st === 'done') {
          const r = (result.data as any)?.result || {};
          const created = Number(r.created) || 0;
          const updated = Number(r.updated) || 0;
          const skippedInvalid = Number(r.skippedInvalid) || 0;
          const skippedCompleted = Number(r.skippedCompleted) || 0;
          const failed = Number(r.failed) || 0;
          message.success(`同步完成：新增${created}，更新${updated}，跳过${skippedInvalid + skippedCompleted}，失败${failed}`);
          if (syncPollRef.current != null) window.clearInterval(syncPollRef.current);
          syncPollRef.current = undefined;
        }
        if (st === 'failed') {
          const err = String((result.data as any)?.error || '同步失败');
          message.error(err);
          if (syncPollRef.current != null) window.clearInterval(syncPollRef.current);
          syncPollRef.current = undefined;
        }
      }
    } catch {
    // Intentionally empty
      // 忽略错误
    }
  };

  const mapDbTypeToBomType = (mt: any): MaterialType => {
    const t = String(mt || '').trim().toLowerCase();
    if (t.startsWith('fabric')) return 'fabricA';
    if (t.startsWith('lining')) return 'liningA';
    if (t.startsWith('accessory')) return 'accessoryA';
    return 'accessoryA';
  };

  const ensureMaterialTargetRowId = () => {
    if (locked) return '';
    if (tableEditable) {
      const newId = `tmp_${Date.now()}`;
      const newBom: StyleBom = {
        id: newId,
        styleId,
        materialType: 'fabricA',
        materialCode: '',
        materialName: '',
        color: '',
        specification: '',
        size: '',
        unit: '',
        usageAmount: 0,
        lossRate: 0,
        unitPrice: 0,
        totalPrice: 0,
        supplier: '',
      };
      setData((prev) => sortBomRows([...(Array.isArray(prev) ? prev : []), newBom]));
      const rid = String(newId);
      form.setFieldsValue({ [rid]: { ...newBom } });
      return rid;
    }
    if (editingKey) return String(editingKey);
    const newId = `tmp_${Date.now()}`;
    const newBom: StyleBom = {
      id: newId,
      styleId,
      materialType: 'fabricA',
      materialCode: '',
      materialName: '',
      color: '',
      specification: '',
      size: '',
      unit: '',
      usageAmount: 0,
      lossRate: 0,
      unitPrice: 0,
      totalPrice: 0,
      supplier: '',
    };
    setData((prev) => sortBomRows([...(Array.isArray(prev) ? prev : []), newBom]));
    const rid = String(newId);
    form.setFieldsValue({ [rid]: { ...newBom } });
    setEditingKey(rid);
    return rid;
  };

  const fetchMaterials = async (page: number, keyword?: string) => {
    const p = Number(page) || 1;
    const kw = String(keyword ?? '').trim();
    setMaterialLoading(true);
    try {
      const res = await api.get<{ code: number; data: { records: any[]; total: number } }>('/material/database/list', {
        params: {
          page: p,
          pageSize: 10,
          materialCode: kw,
          materialName: kw,
        },
      });
      const result = res as Record<string, unknown>;
      if (result.code === 200) {
        const records = Array.isArray((result.data as any)?.records) ? (result.data as any).records : [];
        setMaterialList(records);
        setMaterialTotal(Number((result.data as any)?.total) || 0);
        setMaterialPage(p);
      }
    } catch {
    // Intentionally empty
      // 忽略错误
    } finally {
      setMaterialLoading(false);
    }
  };

  const _openMaterialModal = () => {
    if (locked) {
      message.error('已完成，无法操作');
      return;
    }
    const rid = ensureMaterialTargetRowId();
    if (!rid) return;
    setMaterialTargetRowId(rid);
    setMaterialTab('select');
    setMaterialKeyword('');
    setMaterialModalOpen(true);
    materialCreateForm.resetFields();
    fetchMaterials(1, '');
  };

  const fillRowFromMaterial = async (rid: string, material: any) => {
    const rowId = String(rid || '').trim();
    if (!rowId) return;
    const m = material || {};
    const patch: any = {
      materialCode: String(m.materialCode || '').trim(),
      materialName: String(m.materialName || '').trim(),
      fabricComposition: String(m.fabricComposition || '').trim(),
      unit: String(m.unit || '').trim(),
      supplier: String(m.supplierName || '').trim(),
      specification: String(m.specifications ?? m.specification ?? '').trim(),
      unitPrice: Number(m.unitPrice) || 0,
      materialType: mapDbTypeToBomType(m.materialType),
      // 自动从面辅料资料带出图片（面辅料资料 image 字段，包装成 JSON 数组）
      imageUrls: m.image ? JSON.stringify([String(m.image).trim()]) : undefined,
    };
    const materialColor = String(m.color ?? m.materialColor ?? '').trim();
    if (materialColor) {
      patch.color = materialColor;
    }
    const current = (form.getFieldValue(rowId) || {}) as any;
    const merged = { ...current, ...patch };
    merged.totalPrice = calcTotalPrice(merged);
    form.setFieldsValue({ [rowId]: merged });
    setData((prev) =>
      sortBomRows(
        (Array.isArray(prev) ? prev : []).map((it: any) => {
          if (String(it?.id) !== rowId) return it;
          return { ...it, ...merged };
        })
      )
    );

    // 自动检查该物料的库存状态
    try {
      const materialCode = String(m.materialCode || '').trim();
      const color = String(merged.color || '').trim();

      if (materialCode) {
        // 使用MaterialStockService查询库存（与后端StyleBomService相同逻辑）
        const res = await api.get<{ code: number; data: { records: any[] } }>(
          '/production/material/stock/list',
          { params: {
            materialCode,
            color: color || undefined,  // 如果颜色为空，不传参数
            page: 1,
            pageSize: 1
          } }
        );

        if (res.code === 200 && res.data?.records?.length > 0) {
          const stock = res.data.records[0];
          const availableQty = Number(stock.quantity || 0) - Number(stock.lockedQuantity || 0);
          const usageAmount = Number(merged.usageAmount || 0);
          const lossRate = Number(merged.lossRate || 0);
          const requiredQty = Math.ceil(usageAmount * productionQty * (1 + lossRate / 100));

          const stockStatus = availableQty >= requiredQty ? 'sufficient' : availableQty > 0 ? 'insufficient' : 'none';
          const requiredPurchase = Math.max(0, requiredQty - availableQty);

          // 更新data数组中的对应行
          setData(prev => sortBomRows(
            prev.map(item =>
              String(item.id) === rowId ? {
                ...item,
                ...merged,
                stockStatus,
                availableStock: availableQty,
                requiredPurchase,
              } : item
            )
          ));

          const statusText = stockStatus === 'sufficient' ? '库存充足' : stockStatus === 'insufficient' ? '库存不足' : '无库存';
          message.success(`${materialCode} 库存检查完成：${statusText}（可用：${availableQty}）`);
        } else {
          // 无库存记录
          const usageAmount = Number(merged.usageAmount || 0);
          const lossRate = Number(merged.lossRate || 0);
          const requiredQty = Math.ceil(usageAmount * productionQty * (1 + lossRate / 100));

          setData(prev => sortBomRows(
            prev.map(item =>
              String(item.id) === rowId ? {
                ...item,
                ...merged,
                stockStatus: 'none',
                availableStock: 0,
                requiredPurchase: requiredQty,
              } : item
            )
          ));

          message.warning(`${materialCode} 无库存记录`);
        }
      }
    } catch (error) {
      message.error('库存检查失败，请稍后重试');
    }
  };

  useEffect(() => {
    fetchBom();
    fetchCurrentStyleNo();
  }, [styleId]);

  useEffect(() => {
    fetchBomTemplates('');
    fetchStyleNoOptions('');
  }, []);

  useEffect(() => {
    if (!syncModalOpen || !syncJobId) return;
    fetchSyncJob(syncJobId);
    if (syncPollRef.current != null) window.clearInterval(syncPollRef.current);
    syncPollRef.current = window.setInterval(() => {
      fetchSyncJob(syncJobId);
    }, 1000);
    return () => {
      if (syncPollRef.current != null) window.clearInterval(syncPollRef.current);
      syncPollRef.current = undefined;
    };
  }, [syncModalOpen, syncJobId]);

  useEffect(() => {
    if (!locked) return;
    if (editingKey) setEditingKey('');
    if (tableEditable) setTableEditable(false);
  }, [editingKey, locked, tableEditable]);

  // 编辑相关
  const isEditing = (record: StyleBom) => String(record.id) === editingKey;

  const rowName = (id: any, field: string) => [String(id), field];

  const buildFormValues = (rows: StyleBom[]) => {
    const next: Record<string, unknown> = {};
    for (const r of Array.isArray(rows) ? rows : []) {
      const rid = String(r?.id ?? '');
      if (!rid) continue;
      next[rid] = { ...r, materialType: normalizeMaterialType<MaterialType>((r as Record<string, unknown>).materialType) };
    }
    return next;
  };

  const enterTableEdit = (rows?: StyleBom[]) => {
    if (locked) {
      message.error('已完成，无法操作');
      return;
    }
    const list = Array.isArray(rows) ? rows : data;
    setEditingKey('');
    setTableEditable(true);
    form.setFieldsValue(buildFormValues(list));
  };

  const exitTableEdit = async () => {
    setEditingKey('');
    setTableEditable(false);
    await fetchBom();
  };

  const edit = (record: StyleBom) => {
    if (locked) {
      message.error('已完成，无法操作');
      return;
    }
    const rid = String(record.id!);
    form.setFieldsValue({
      [rid]: { ...record, materialType: normalizeMaterialType<MaterialType>((record as Record<string, unknown>).materialType) },
    });
    setEditingKey(rid);
  };

  const cancel = () => {
    // 如果取消的是临时行，直接从数据中移除
    if (editingKey && isTempId(editingKey)) {
      setData((prev) => prev.filter((item) => String(item.id) !== editingKey));
    }
    setEditingKey('');
  };

  const save = async (key: string) => {
    if (locked) {
      message.error('已完成，无法操作');
      return;
    }
    try {
      const requiredPaths: any[] = [
        rowName(key, 'materialCode'),
        rowName(key, 'materialName'),
        rowName(key, 'unit'),
        rowName(key, 'supplier'),
        rowName(key, 'usageAmount'),
        rowName(key, 'unitPrice'),
      ];
      await form.validateFields(requiredPaths);
      const row = (form.getFieldValue(String(key)) || {}) as any;
      const newData = [...data];
      const index = newData.findIndex((item) => key === String(item.id));

      if (index > -1) {
        const item = newData[index];
        const newItem: any = { ...item, ...row };
        newItem.totalPrice = calcTotalPrice(newItem as any);
        let res;

        if (isTempId(item.id)) {
          // 临时行，调用新增接口保存
          const { id: _id, ...payload } = newItem as Record<string, any>;
          res = await api.post('/style/bom', payload);
        } else {
          // 现有行，调用更新接口保存
          res = await api.put('/style/bom', newItem);
        }

        const result = res as Record<string, unknown>;
        if (result.code === 200 && result.data) {
          message.success('保存成功');
          setEditingKey('');
          fetchBom();
        } else {
          message.error(String(result.message || '保存失败'));
        }
      }
    } catch (errInfo: any) {
      const fields = errInfo?.errorFields;
      const first = Array.isArray(fields) ? fields[0] : null;
      const content = first?.errors?.[0] || '请完善必填项后再保存';
      message.error({ content, key: 'table-validate', duration: 2 });
      if (first?.name) {
        try {
          form.scrollToField(first.name, { block: 'center' });
        } catch {
    // Intentionally empty
      // 忽略错误
        }
      }
    }
  };

  const applyBomTemplate = async () => {
    if (locked) {
      message.error('已完成，无法操作');
      return;
    }
    if (editingKey) {
      message.error('请先完成当前编辑再导入模板');
      return;
    }
    if (tableEditable) {
      message.error('请先保存或取消编辑后再导入模板');
      return;
    }
    if (!bomTemplateId) {
      message.error('请选择模板');
      return;
    }

    const sid = Number(styleId);
    if (!Number.isFinite(sid) || sid <= 0) {
      message.error('styleId不合法');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post<{ code: number; message: string; data: boolean }>('/template-library/apply-to-style', {
        templateId: bomTemplateId,
        targetStyleId: sid,
        mode: importMode,
      });
      const result = res as Record<string, unknown>;
      if (result.code !== 200) {
        message.error(String(result.message || '导入失败'));
        return;
      }
      message.success('已导入BOM模板');
      setBomTemplateId(undefined);
      const next = await fetchBom();
      if (Array.isArray(next) && next.length) enterTableEdit(next);
    } catch (e: any) {
      message.error(e?.message || '导入失败');
    } finally {
      setLoading(false);
    }
  };

  const saveAll = async () => {
    if (locked) {
      message.error('已完成，无法操作');
      return;
    }
    try {
      const ids = data.map((d) => String(d.id)).filter(Boolean);
      const requiredPaths: any[] = [];
      for (const id of ids) {
        requiredPaths.push(rowName(id, 'materialCode'));
        requiredPaths.push(rowName(id, 'materialName'));
        requiredPaths.push(rowName(id, 'unit'));
        requiredPaths.push(rowName(id, 'supplier'));
        requiredPaths.push(rowName(id, 'usageAmount'));
        requiredPaths.push(rowName(id, 'unitPrice'));
      }

      await form.validateFields(requiredPaths);
      const allValues = form.getFieldsValue() || {};

      setLoading(true);
      for (const item of data) {
        const key = String(item.id);
        const row = (allValues?.[key] || {}) as any;
        const newItem: any = { ...item, ...row };
        newItem.totalPrice = calcTotalPrice(newItem as any);

        if (isTempId(item.id)) {
          const { id: _id, ...payload } = newItem as Record<string, any>;
          const res = await api.post('/style/bom', payload);
          const result = res as Record<string, unknown>;
          if (result.code !== 200) {
            message.error(String(result.message || '保存失败'));
            return;
          }
        } else {
          const res = await api.put('/style/bom', newItem);
          const result = res as Record<string, unknown>;
          if (result.code !== 200) {
            message.error(String(result.message || '保存失败'));
            return;
          }
        }
      }

      message.success('保存成功');
      setTableEditable(false);
      await fetchBom();
    } catch (errInfo: any) {
      const fields = errInfo?.errorFields;
      const first = Array.isArray(fields) ? fields[0] : null;
      const content = first?.errors?.[0] || '请完善必填项后再保存';
      message.error({ content, key: 'table-validate', duration: 2 });
      if (first?.name) {
        try {
          form.scrollToField(first.name, { block: 'center' });
        } catch {
    // Intentionally empty
      // 忽略错误
        }
      }
    } finally {
      setLoading(false);
    }
  };

  // 新增行
  const handleAdd = () => {
    if (locked) {
      message.error('已完成，无法操作');
      return;
    }
    // 生成一个临时编号，用于标识临时行
    const newId = `tmp_${Date.now()}`;
    const newBom: StyleBom = {
      id: newId,
      styleId,
      materialType: 'fabricA',
      materialCode: '',
      materialName: '',
      color: '',
      specification: '',
      size: '',
      unit: '',
      usageAmount: 0,
      lossRate: 0,
      unitPrice: 0,
      totalPrice: 0,
      supplier: ''
    };
    setData(sortBomRows([...data, newBom]));

    const rid = String(newId);
    form.setFieldsValue({
      [rid]: { ...newBom },
    });

    setEditingKey('');
    setTableEditable(true);
  };

  // 生成采购单（手动触发）
  const handleGeneratePurchase = async () => {
    if (!data || data.length === 0) {
      message.error('请先配置BOM物料');
      return;
    }

    const sid = Number(styleId);
    if (!Number.isFinite(sid) || sid <= 0) {
      message.error('无效的款式ID');
      return;
    }

    const doGenerate = async (force: boolean) => {
      setLoading(true);
      try {
        const res = await api.post<{ code: number; message: string; data: number }>('/style/bom/generate-purchase', {
          styleId: sid,
          force,
        });
        const result = res as Record<string, unknown>;
        if (result.code === 200) {
          const count = Number(result.data) || 0;
          message.success(`成功生成 ${count} 条物料采购记录`);
        } else {
          const errMsg = String(result.message || '生成失败');
          // 已生成过时，提示是否强制重新生成
          if (errMsg.includes('已生成过') && !force) {
            Modal.confirm({
              width: '30vw',
              title: '已存在样衣采购记录',
              content: '该款式已生成过样衣采购记录。是否删除旧的【待采购】记录并重新生成？（已领取/已完成的记录不会被删除）',
              okText: '重新生成',
              okButtonProps: { danger: true, type: 'default' },
              cancelText: '取消',
              onOk: () => doGenerate(true),
            });
          } else {
            message.error(errMsg);
          }
        }
      } catch (error: any) {
        message.error(`生成失败：${error?.message || '请求失败'}`);
      } finally {
        setLoading(false);
      }
    };

    Modal.confirm({
      width: '30vw',
      title: '确认生成采购单',
      content: `将根据当前BOM配置（${data.length}个物料）及款式颜色数量生成物料采购记录，是否继续？`,
      onOk: () => doGenerate(false),
    });
  };

  // 检查库存状态
  const handleCheckStock = async () => {
    const sid = Number(styleId);
    if (!Number.isFinite(sid) || sid <= 0) {
      message.error('无效的款式ID');
      return;
    }

    if (!data || data.length === 0) {
      message.warning('暂无BOM数据，无需检查');
      return;
    }

    setCheckingStock(true);
    try {
      const res = await api.post<{ code: number; message: string; data: StyleBom[] }>(
        `/style/bom/check-stock/${sid}`,
        null,
        { params: { productionQty } }
      );
      const result = res as Record<string, unknown>;

      if (result.code === 200) {
        const checkedBomList = result.data as StyleBom[];
        setData(sortBomRows(checkedBomList));

        // 统计库存状态
        const stats = {
          sufficient: 0,
          insufficient: 0,
          none: 0,
          unchecked: 0,
        };

        checkedBomList.forEach((bom) => {
          const status = bom.stockStatus || 'unchecked';
          stats[status as keyof typeof stats] = (stats[status as keyof typeof stats] || 0) + 1;
        });

        message.success(
          `库存检查完成：充足 ${stats.sufficient} | 不足 ${stats.insufficient} | 无库存 ${stats.none}`
        );
      } else {
        message.error(String(result.message || '检查失败'));
      }
    } catch (error: any) {
      message.error(`检查失败：${error?.message || '请求失败'}`);
    } finally {
      setCheckingStock(false);
    }
  };

  // 申请领取面辅料（BOM行 → 仓库出库领料申请）
  const handleApplyPickup = (record: StyleBom) => {
    Modal.confirm({
      width: '40vw',
      title: '申请领取',
      content: `确认申请领取「${record.materialCode || ''} ${record.materialName || ''}」，数量：${record.usageAmount ?? ''}${record.unit || ''}？`,
      okText: '确认申请',
      cancelText: '取消',
      onOk: async () => {
        try {
          await api.post('/warehouse/material-pickup', {
            pickupType: 'INTERNAL',
            styleNo: currentStyleNo,
            materialId: record.materialId,
            materialCode: record.materialCode,
            materialName: record.materialName,
            materialType: record.materialType,
            color: record.color,
            specification: record.specification,
            fabricComposition: record.fabricComposition,
            fabricWidth: record.fabricWidth,
            fabricWeight: record.fabricWeight,
            quantity: record.usageAmount,
            unit: record.unit,
            unitPrice: record.unitPrice,
          });
          message.success('申请领取成功，等待仓库审核');
        } catch (error: any) {
          message.error(`申请失败：${error?.message || '请求错误'}`);
        }
      },
    });
  };

  // 删除行
  const handleDelete = async (id: string | number) => {
    if (locked) {
      message.error('已完成，无法操作');
      return;
    }
    try {
      const deletingId = String(id);
      if (isTempId(id)) {
        // 临时行，直接从前端移除
        setData((prev) => prev.filter((item) => String(item.id) !== deletingId));
        try {
          form.resetFields([deletingId]);
        } catch {
    // Intentionally empty
      // 忽略错误
        }
        message.success('删除成功');
      } else {
        // 现有行，调用删除接口
        const res = await api.delete(`/style/bom/${encodeURIComponent(deletingId)}`);
        const result = res as Record<string, unknown>;
        if (result.code === 200 && result.data === true) {
          message.success('删除成功');
          if (tableEditable) {
            setData((prev) => sortBomRows(prev.filter((item) => String(item.id) !== deletingId)));
            try {
              form.resetFields([deletingId]);
            } catch {
    // Intentionally empty
      // 忽略错误
            }
          } else {
            fetchBom();
          }
        } else {
          const detail = `code:${debugValue(result?.code)}, data:${debugValue(result?.data)}`;
          message.error(`${result?.message || '删除失败'}（${detail}）`);
        }
      }
    } catch (error: any) {
      message.error(`删除失败（${error?.message || '请求失败'}）`);
    }
  };

  // 列定义
  const columns = useBomColumns({
    locked,
    tableEditable,
    editingKey,
    data,
    form,
    isEditing,
    rowName,
    save,
    cancel,
    edit,
    handleDelete,
    fetchMaterials,
    materialCreateForm,
    calcTotalPrice,
    isSupervisorOrAbove,
    setMaterialKeyword,
    setMaterialModalOpen,
    setMaterialTab,
    setMaterialTargetRowId,
    onApplyPickup: handleApplyPickup,
  });

  return (
    <div>
      {/* 统一状态控制栏 */}
      <StyleStageControlBar
        stageName="BOM清单"
        styleId={styleId}
        apiPath="bom"
        status={bomCompletedTime ? 'COMPLETED' : bomStartTime ? 'IN_PROGRESS' : 'NOT_STARTED'}
        assignee={bomAssignee}
        startTime={bomStartTime}
        completedTime={bomCompletedTime}
        readOnly={readOnly}
        onRefresh={onRefresh}
        onBeforeComplete={async () => {
          if (!data || data.length === 0) {
            message.error('请先配置BOM物料');
            return false;
          }
          if (tableEditable) {
            message.error('请先点击"保存全部"保存单价数据，再完成BOM配置');
            return false;
          }
          const hasZeroPrices = data.some(item => !Number(item.unitPrice));
          if (hasZeroPrices) {
            return new Promise<boolean>((resolve) => {
              Modal.confirm({
                width: '30vw',
                title: '部分单价为0',
                content: '存在单价为0的BOM物料，确认仍然完成BOM配置？',
                okText: '确认完成',
                cancelText: '返回填写',
                onOk: () => resolve(true),
                onCancel: () => resolve(false),
              });
            });
          }
          return true;
        }}
      />
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {/* 左侧：库存检查和生成采购单 */}
        <Space>
          <Space.Compact>
            <Input style={{ width: 60 }} disabled value="数量" />
            <InputNumber
              min={1}
              value={productionQty}
              onChange={(v) => setProductionQty(v || 1)}
              style={{ width: 100 }}
              disabled={checkingStock}
            />
          </Space.Compact>
          <Button
            onClick={handleCheckStock}
            disabled={!data.length || loading}
            loading={checkingStock}
          >
            🔍 检查库存
          </Button>
          <Button
            type="primary"
            onClick={handleGeneratePurchase}
            disabled={locked || !data.length || loading}
            loading={loading}
          >
            📦 生成采购单
          </Button>
        </Space>

        {/* 右侧：BOM配置操作按钮 */}
        <Space wrap>
          <Button
            onClick={handleAdd}
            disabled={locked || Boolean(editingKey) || loading || templateLoading}
          >
            添加物料
          </Button>

          {tableEditable ? (
            <>
              <Button type="primary" onClick={saveAll} loading={loading}>
                保存
              </Button>
              <Button onClick={exitTableEdit} disabled={loading}>
                取消编辑
              </Button>
            </>
          ) : isSupervisorOrAbove ? (
            <Button
              type="default"
              onClick={() => enterTableEdit()}
              disabled={locked || loading || templateLoading || Boolean(editingKey) || !data.length}
            >
              退回编辑
            </Button>
          ) : null}

          <Select
            allowClear
            placeholder="导入BOM模板"
            value={bomTemplateId}
            style={{ width: 240 }}
            options={bomTemplates.map((t) => ({
              value: String(t.id || ''),
              label: t.sourceStyleNo ? `${t.templateName}（${t.sourceStyleNo}）` : t.templateName,
            }))}
            onChange={(v) => setBomTemplateId(v)}
            disabled={locked || Boolean(editingKey) || loading || templateLoading}
            onOpenChange={(open) => {
              if (open && !bomTemplates.length) fetchBomTemplates('');
            }}
          />

          <Select
            value={importMode}
            style={{ width: 100 }}
            options={[
              { value: 'overwrite', label: '覆盖' },
              { value: 'append', label: '追加' },
            ]}
            onChange={(v) => setImportMode(v)}
            disabled={locked || Boolean(editingKey) || loading || templateLoading}
          />

          <Button disabled={locked || Boolean(editingKey) || loading || templateLoading || tableEditable} onClick={applyBomTemplate}>
            导入模板
          </Button>
        </Space>
      </div>
      <Modal
        title="同步状态"
        open={syncModalOpen}
        onCancel={() => {
          setSyncModalOpen(false);
        }}
        footer={null}
        width={modalWidth}
        destroyOnHidden
      >
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
          <div>任务ID：{syncJobId || '-'}</div>
          <div>状态：{String((syncJob as any)?.status || '-')}</div>
          <div>错误：{String((syncJob as any)?.error || '')}</div>
          <div>款号：{String((syncJob as any)?.result?.styleNo || currentStyleNo || '')}</div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <Button
            onClick={() => fetchSyncJob(syncJobId)}
            disabled={!syncJobId}
          >
            刷新
          </Button>
        </div>
        <ResizableTable
          storageKey="style-bom-sync-details"
          size="small"
          rowKey={(r) => String((r as Record<string, unknown>)?.materialCode || (r as Record<string, unknown>)?.id || `detail-${Math.random()}`)}
          dataSource={Array.isArray((syncJob as any)?.result?.details) ? (syncJob as any).result.details : []}
          pagination={false}
          columns={[
            { title: '物料编码', dataIndex: 'materialCode', width: 160 },
            { title: '状态', dataIndex: 'status', width: 100 },
            { title: '原因', dataIndex: 'reason' },
          ]}
        />
      </Modal>

      <Modal
        title="面辅料选择"
        open={materialModalOpen}
        onCancel={() => setMaterialModalOpen(false)}
        footer={null}
        width={modalWidth}
        destroyOnHidden
      >
        <Tabs
          activeKey={materialTab}
          onChange={(k) => setMaterialTab(k as any)}
          items={[
            {
              key: 'select',
              label: '选择已有',
              children: (
                <div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <Input
                      value={materialKeyword}
                      onChange={(e) => setMaterialKeyword(e.target.value)}
                      placeholder="输入物料编码/名称"
                      allowClear
                    />
                    <Button onClick={() => fetchMaterials(1, materialKeyword)} loading={materialLoading}>
                      搜索
                    </Button>
                  </div>
                  <ResizableTable
                    storageKey="style-bom-material-select"
                    size="small"
                    loading={materialLoading}
                    dataSource={materialList}
                    rowKey={(r) => String((r as Record<string, unknown>)?.id || (r as Record<string, unknown>)?.materialCode || `material-${Math.random()}`)}
                    pagination={{
                      current: materialPage,
                      pageSize: 10,
                      total: materialTotal,
                      showTotal: (total) => `共 ${total} 条`,
                      onChange: (p) => fetchMaterials(p, materialKeyword),
                      showSizeChanger: false,
                    }}
                    onRow={(record) => ({
                      onDoubleClick: async () => {
                        await fillRowFromMaterial(materialTargetRowId, record);
                        setMaterialModalOpen(false);
                      },
                    })}
                    columns={[
                      {
                        title: '图片',
                        dataIndex: 'image',
                        width: 80,
                        render: (v: unknown) => {
                          const raw = String(v || '').trim();
                          if (!raw) return null;
                          const url = raw.startsWith('http') ? raw : `/api${raw.startsWith('/') ? '' : '/'}${raw}`;
                          return (
                            <Image
                              src={url}
                              width={40}
                              height={40}
                              style={{ objectFit: 'cover', borderRadius: 4, border: '1px solid #eee' }}
                              preview={{ src: url }}
                            />
                          );
                        },
                      },
                      { title: '物料编码', dataIndex: 'materialCode', key: 'materialCode', width: 140 },
                      { title: '物料名称', dataIndex: 'materialName', key: 'materialName', width: 160, ellipsis: true },
                      { title: '成分', dataIndex: 'fabricComposition', key: 'fabricComposition', width: 160, ellipsis: true,
                        render: (v: unknown) => String(v || '').trim() || '-' },
                      { title: '类型', dataIndex: 'materialType', width: 90,
                        render: (v: unknown) => getMaterialTypeLabel(v) },
                      { title: '颜色', dataIndex: 'color', width: 90, ellipsis: true },
                      { title: '规格', dataIndex: 'specifications', width: 120, ellipsis: true },
                      { title: '单位', dataIndex: 'unit', width: 70 },
                      { title: '供应商', dataIndex: 'supplierName', width: 140, ellipsis: true },
                      {
                        title: '单价',
                        dataIndex: 'unitPrice',
                        width: 90,
                        render: (v: unknown) => `¥${Number(v || 0).toFixed(2)}`,
                      },
                      {
                        title: '库存',
                        dataIndex: 'quantity',
                        width: 80,
                        render: (v: unknown) => {
                          const qty = Number(v || 0);
                          return (
                            <span style={{ color: qty > 0 ? 'var(--color-success)' : 'var(--color-danger)', fontWeight: 600 }}>
                              {qty}
                            </span>
                          );
                        },
                      },
                      { title: '状态', dataIndex: 'status', width: 90 },
                      {
                        title: '操作',
                        dataIndex: 'op',
                        width: 90,
                        render: (_: any, record: any) => (
                          <RowActions
                            maxInline={1}
                            actions={[
                              {
                                key: 'use',
                                label: '选用',
                                title: '选用',
                                onClick: async () => {
                                  await fillRowFromMaterial(materialTargetRowId, record);
                                  setMaterialModalOpen(false);
                                },
                                primary: true,
                              },
                            ]}
                          />
                        ),
                      },
                    ]}
                  />
                </div>
              ),
            },
            {
              key: 'create',
              label: '新建并使用',
              children: (
                <Form
                  form={materialCreateForm}
                  layout="vertical"
                  onFinish={async (values) => {
                    try {
                      const localColor = String(values.color || '').trim();
                      const payload: any = {
                        materialCode: String(values.materialCode || '').trim(),
                        materialName: String(values.materialName || '').trim(),
                        unit: String(values.unit || '').trim(),
                        supplierName: String(values.supplierName || '').trim(),
                        materialType: String(values.materialType || 'accessory').trim(),
                        specifications: String(values.specifications || '').trim(),
                        fabricComposition: String(values.fabricComposition || '').trim(),
                        unitPrice: Number(values.unitPrice) || 0,
                        remark: String(values.remark || '').trim(),
                        styleNo: String(currentStyleNo || '').trim(),
                      };
                      const res = await api.post<{ code: number; message: string; data: boolean }>('/material/database', payload);
                      const result = res as Record<string, unknown>;
                      if (result.code !== 200 || result.data !== true) {
                        message.error(String(result.message || '创建失败'));
                        return;
                      }
                      message.success('已创建面辅料');
                      fillRowFromMaterial(materialTargetRowId, { ...payload, color: localColor });
                      setMaterialModalOpen(false);
                    } catch (e: any) {
                      message.error(e?.message || '创建失败');
                    }
                  }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                    <Form.Item name="materialCode" label="物料编码" rules={[{ required: true, message: '必填' }]}>
                      <Input />
                    </Form.Item>
                    <Form.Item name="materialName" label="物料名称" rules={[{ required: true, message: '必填' }]}>
                      <Input />
                    </Form.Item>
                    <Form.Item name="unit" label="单位" rules={[{ required: true, message: '必填' }]}>
                      <DictAutoComplete dictType="material_unit" placeholder="请输入或选择单位" />
                    </Form.Item>
                    <Form.Item name="supplierId" hidden>
                      <Input />
                    </Form.Item>
                    <Form.Item name="supplierContactPerson" hidden>
                      <Input />
                    </Form.Item>
                    <Form.Item name="supplierContactPhone" hidden>
                      <Input />
                    </Form.Item>
                    <Form.Item name="supplierName" label="供应商" rules={[{ required: true, message: '必填' }]}>
                      <SupplierSelect
                        placeholder="选择供应商"
                        onChange={(value, option) => {
                          if (option) {
                            materialCreateForm.setFieldsValue({
                              supplierId: option.id,
                              supplierContactPerson: option.supplierContactPerson,
                              supplierContactPhone: option.supplierContactPhone,
                            });
                          }
                        }}
                      />
                    </Form.Item>
                    <Form.Item name="materialType" label="类型" initialValue="accessory">
                      <Select
                        options={[
                          { value: 'fabric', label: 'fabric' },
                          { value: 'lining', label: 'lining' },
                          { value: 'accessory', label: 'accessory' },
                        ]}
                      />
                    </Form.Item>
                    <Form.Item name="color" label="颜色">
                      <DictAutoComplete dictType="color" placeholder="请输入或选择颜色" />
                    </Form.Item>
                    <Form.Item name="specifications" label="规格">
                      <DictAutoComplete dictType="material_specification" placeholder="请输入或选择规格" />
                    </Form.Item>
                    <Form.Item name="fabricComposition" label="成分">
                      <Input placeholder="如：100%棉" />
                    </Form.Item>
                    <Form.Item name="unitPrice" label="单价" initialValue={0}>
                      <InputNumber min={0} step={0.01} style={{ width: '100%' }} prefix="¥" />
                    </Form.Item>
                    <Form.Item name="remark" label="备注">
                      <Input />
                    </Form.Item>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <Button onClick={() => setMaterialModalOpen(false)}>取消</Button>
                    <Button type="primary" htmlType="submit">
                      创建并填入BOM
                    </Button>
                  </div>
                </Form>
              ),
            },
          ]}
        />
      </Modal>
      <Form form={form} component={false}>
        <ResizableTable
          components={{
            body: {
              cell: ({ children, ...restProps }: any) => <td {...restProps}>{children}</td>,
            },
          }}
          bordered
          dataSource={data}
          columns={columns}
          rowClassName="editable-row"
          pagination={false}
          loading={loading}
          rowKey="id"
          scroll={{ x: 'max-content' }}
          storageKey={`style-bom-v2-${String(styleId)}`}
          minColumnWidth={70}
        />
      </Form>
    </div>
  );
};

export default StyleBomTab;
