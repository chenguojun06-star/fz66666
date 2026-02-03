import React, { useEffect, useRef, useState } from 'react';
import { App, Button, Input, InputNumber, Form, Select, Space, Tag, Modal, Table, Tabs } from 'antd';
import { PlusOutlined, DeleteOutlined, SaveOutlined, EditOutlined, CloseOutlined, CheckOutlined } from '@ant-design/icons';
import { StyleBom, TemplateLibrary } from '@/types/style';
import api from '@/utils/api';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import { isSupervisorOrAboveUser, useAuth } from '@/utils/AuthContext';
import { getMaterialSortWeight, getMaterialTypeLabel, normalizeMaterialType } from '@/utils/materialType';
import { useViewport } from '@/utils/useViewport';
import { formatDateTime } from '@/utils/datetime';

interface Props {
  styleId: string | number;
  readOnly?: boolean;
  bomAssignee?: string;
  bomStartTime?: string;
  bomCompletedTime?: string;
  onRefresh?: () => void | Promise<void>;
}

type MaterialType = NonNullable<StyleBom['materialType']>;

const materialTypeOptions = [
  { value: 'fabricA', label: '面料A' },
  { value: 'fabricB', label: '面料B' },
  { value: 'fabricC', label: '面料C' },
  { value: 'fabricD', label: '面料D' },
  { value: 'fabricE', label: '面料E' },
  { value: 'liningA', label: '里料A' },
  { value: 'liningB', label: '里料B' },
  { value: 'liningC', label: '里料C' },
  { value: 'liningD', label: '里料D' },
  { value: 'liningE', label: '里料E' },
  { value: 'accessoryA', label: '辅料A' },
  { value: 'accessoryB', label: '辅料B' },
  { value: 'accessoryC', label: '辅料C' },
  { value: 'accessoryD', label: '辅料D' },
  { value: 'accessoryE', label: '辅料E' },
] as const;

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
  const [templateSourceStyleNo, setTemplateSourceStyleNo] = useState('');
  const [templateLoading, setTemplateLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [currentStyleNo, setCurrentStyleNo] = useState('');

  const [syncJobId, setSyncJobId] = useState('');
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncJob, setSyncJob] = useState<unknown>(null);
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

  const locked = Boolean(readOnly);

  const isSupervisorOrAbove = isSupervisorOrAboveUser(user);

  const [styleNoOptions, setStyleNoOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [styleNoLoading, setStyleNoLoading] = useState(false);
  const styleNoReqSeq = useRef(0);
  const styleNoTimerRef = useRef<number | undefined>(undefined);

  const fetchStyleNoOptions = async (keyword?: string) => {
    const seq = (styleNoReqSeq.current += 1);
    setStyleNoLoading(true);
    try {
      const res = await api.get<{ code: number; data: { records: unknown[]; total: number } }>('/style/info/list', {
        params: {
          page: 1,
          pageSize: 200,
          styleNo: String(keyword ?? '').trim(),
        },
      });
      const result = res as Record<string, unknown>;
      if (seq !== styleNoReqSeq.current) return;
      if (result.code !== 200) return;
      const records = (result.data?.records || []) as Array<unknown>;
      const next = (Array.isArray(records) ? records : [])
        .map((r) => String(r?.styleNo || '').trim())
        .filter(Boolean)
        .map((sn) => ({ value: sn, label: sn }));
      setStyleNoOptions(next);
    } catch {
    // Intentionally empty
      // 忽略错误
    } finally {
      if (seq === styleNoReqSeq.current) setStyleNoLoading(false);
    }
  };

  const scheduleFetchStyleNos = (keyword: string) => {
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
        const data = result.data as unknown;
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
      const result = res as Record<string, unknown>;
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

  const syncToMaterialDatabase = async () => {
    if (locked) {
      message.error('已完成，无法操作');
      return;
    }
    if (Boolean(editingKey) || tableEditable) {
      message.error('请先保存或取消编辑');
      return;
    }
    try {
      setSyncLoading(true);
      const sid = encodeURIComponent(String(styleId));
      const res = await api.post<{ code: number; data: unknown }>(`/style/bom/${sid}/sync-material-database/async`);
      const result = res as Record<string, unknown>;
      if (result.code === 200) {
        const d = result.data || {};
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
      message.error(result?.message || '同步失败');
    } catch (error: unknown) {
      message.error(`同步失败（${error?.message || '请求失败'}）`);
    } finally {
      setSyncLoading(false);
    }
  };

  const fetchCurrentStyleNo = async () => {
    const sid = Number(styleId);
    if (!Number.isFinite(sid) || sid <= 0) {
      setCurrentStyleNo('');
      return;
    }
    try {
      const res = await api.get<{ code: number; data: unknown }>(`/style/info/${sid}`);
      const result = res as Record<string, unknown>;
      if (result.code === 200) {
        setCurrentStyleNo(String(result.data?.styleNo || '').trim());
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
      const res = await api.get<{ code: number; data: unknown }>(`/style/bom/sync-jobs/${encodeURIComponent(id)}`);
      const result = res as Record<string, unknown>;
      if (result.code === 200) {
        setSyncJob(result.data);
        const st = String(result.data?.status || '').trim().toLowerCase();
        if (st === 'done') {
          const r = result.data?.result || {};
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
          const err = String(result.data?.error || '同步失败');
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
      const res = await api.get<{ code: number; data: { records: unknown[]; total: number } }>('/material/database/list', {
        params: {
          page: p,
          pageSize: 10,
          materialCode: kw,
          materialName: kw,
        },
      });
      const result = res as Record<string, unknown>;
      if (result.code === 200) {
        const records = Array.isArray(result.data?.records) ? result.data.records : [];
        setMaterialList(records);
        setMaterialTotal(Number(result.data?.total) || 0);
        setMaterialPage(p);
      }
    } catch {
    // Intentionally empty
      // 忽略错误
    } finally {
      setMaterialLoading(false);
    }
  };

  const openMaterialModal = () => {
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
    const patch: unknown = {
      materialCode: String(m.materialCode || '').trim(),
      materialName: String(m.materialName || '').trim(),
      unit: String(m.unit || '').trim(),
      supplier: String(m.supplierName || '').trim(),
      specification: String(m.specifications || '').trim(),
      unitPrice: Number(m.unitPrice) || 0,
      materialType: mapDbTypeToBomType(m.materialType),
    };
    const current = form.getFieldValue(rowId) || {};
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
      // console.log('自动库存检查失败:', error);
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
      const requiredPaths: unknown[] = [
        rowName(key, 'materialCode'),
        rowName(key, 'materialName'),
        rowName(key, 'unit'),
        rowName(key, 'supplier'),
        rowName(key, 'usageAmount'),
        rowName(key, 'unitPrice'),
      ];
      await form.validateFields(requiredPaths);
      const row = form.getFieldValue(String(key)) || {};
      const newData = [...data];
      const index = newData.findIndex((item) => key === String(item.id));

      if (index > -1) {
        const item = newData[index];
        const newItem: unknown = { ...item, ...row };
        newItem.totalPrice = calcTotalPrice(newItem);
        let res;

        if (isTempId(item.id)) {
          // 临时行，调用新增接口保存
          const { id: _id, ...payload } = newItem;
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
          message.error(result.message || '保存失败');
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
        message.error(result.message || '导入失败');
        return;
      }
      message.success('已导入BOM模板');
      setBomTemplateId(undefined);
      const next = await fetchBom();
      if (Array.isArray(next) && next.length) enterTableEdit(next);
    } catch (e: unknown) {
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
      const requiredPaths: unknown[] = [];
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
        const row = allValues?.[key] || {};
        const newItem: unknown = { ...item, ...row };
        newItem.totalPrice = calcTotalPrice(newItem);

        if (isTempId(item.id)) {
          const { id: _id, ...payload } = newItem;
          const res = await api.post('/style/bom', payload);
          const result = res as Record<string, unknown>;
          if (result.code !== 200) {
            message.error(result.message || '保存失败');
            return;
          }
        } else {
          const res = await api.put('/style/bom', newItem);
          const result = res as Record<string, unknown>;
          if (result.code !== 200) {
            message.error(result.message || '保存失败');
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

    if (!tableEditable) {
      setEditingKey(rid);
    }
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

    Modal.confirm({
      title: '确认生成采购单',
      content: `将根据当前BOM配置（${data.length}个物料）生成物料采购记录，是否继续？`,
      onOk: async () => {
        setLoading(true);
        try {
          const res = await api.post<{ code: number; message: string; data: number }>('/style/bom/generate-purchase', {
            styleId: sid,
          });
          const result = res as Record<string, unknown>;
          if (result.code === 200) {
            const count = Number(result.data) || 0;
            message.success(`成功生成 ${count} 条物料采购记录`);
          } else {
            message.error(result.message || '生成失败');
          }
        } catch (error: unknown) {
          message.error(`生成失败：${error?.message || '请求失败'}`);
        } finally {
          setLoading(false);
        }
      },
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
        message.error(result.message || '检查失败');
      }
    } catch (error: unknown) {
      message.error(`检查失败：${error?.message || '请求失败'}`);
    } finally {
      setCheckingStock(false);
    }
  };

  // 开始BOM配置
  const handleBomStart = async () => {
    const sid = Number(styleId);
    if (!Number.isFinite(sid) || sid <= 0) {
      message.error('无效的款式ID');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post<{ code: number; message: string }>(`/style/info/${sid}/bom/start`);
      const result = res as Record<string, unknown>;
      if (result.code === 200) {
        message.success('已开始BOM配置');
        // 调用父组件的刷新回调，更新款式数据
        if (onRefresh) {
          await onRefresh();
        }
      } else {
        message.error(result.message || '操作失败');
      }
    } catch (error: unknown) {
      message.error(`操作失败：${error?.message || '请求失败'}`);
    } finally {
      setLoading(false);
    }
  };

  // 标记BOM完成
  const handleBomComplete = async () => {
    if (!data || data.length === 0) {
      message.error('请先配置BOM物料');
      return;
    }

    const sid = Number(styleId);
    if (!Number.isFinite(sid) || sid <= 0) {
      message.error('无效的款式ID');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post<{ code: number; message: string }>(`/style/info/${sid}/bom/complete`);
      const result = res as Record<string, unknown>;
      if (result.code === 200) {
        message.success('BOM配置已完成');
        // 调用父组件的刷新回调，更新款式数据
        if (onRefresh) {
          await onRefresh();
        }
      } else {
        message.error(result.message || '操作失败');
      }
    } catch (error: unknown) {
      message.error(`操作失败：${error?.message || '请求失败'}`);
    } finally {
      setLoading(false);
    }
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
    } catch (error: unknown) {
      message.error(`删除失败（${error?.message || '请求失败'}）`);
    }
  };

  // 列定义
  const columns = [
    {
      title: '面料辅料类型',
      dataIndex: 'materialType',
      width: 120,
      ellipsis: true,
      editable: true,
      render: (text: string, record: StyleBom) => {
        const label = getMaterialTypeLabel(text);
        if (!locked && (tableEditable || isEditing(record))) {
          return (
            <Form.Item name={rowName(record.id, 'materialType')} style={{ margin: 0 }}>
              <Select
                options={materialTypeOptions as Record<string, unknown>}
                style={{ width: '100%' }}
              />
            </Form.Item>
          );
        }
        return label;
      }
    },
    {
      title: '物料编码',
      dataIndex: 'materialCode',
      width: 180,
      ellipsis: true,
      editable: true,
      render: (text: string, record: StyleBom) => {
        if (!locked && (tableEditable || isEditing(record))) {
          return (
            <div style={{ display: 'flex', gap: 4 }}>
              <Form.Item name={rowName(record.id, 'materialCode')} style={{ margin: 0, flex: 1 }} rules={[{ required: true, message: '必填' }]}>
                <Input placeholder="输入编码或点击选择→" />
              </Form.Item>
              <Button
                size="small"
                onClick={() => {
                  setMaterialTargetRowId(String(record.id));
                  setMaterialTab('select');
                  setMaterialKeyword('');
                  setMaterialModalOpen(true);
                  materialCreateForm.resetFields();
                  fetchMaterials(1, '');
                }}
                style={{ flexShrink: 0 }}
              >
                选择
              </Button>
            </div>
          );
        }
        return text;
      }
    },
    {
      title: '物料名称',
      dataIndex: 'materialName',
      width: 140,
      ellipsis: true,
      editable: true,
      render: (text: string, record: StyleBom) => {
        if (!locked && (tableEditable || isEditing(record))) {
          return (
            <Form.Item name={rowName(record.id, 'materialName')} style={{ margin: 0 }} rules={[{ required: true, message: '必填' }]}>
              <Input />
            </Form.Item>
          );
        }
        return text;
      }
    },
    {
      title: '颜色',
      dataIndex: 'color',
      width: 90,
      ellipsis: true,
      editable: true,
      render: (text: string, record: StyleBom) => {
        if (!locked && (tableEditable || isEditing(record))) {
          return (
            <Form.Item name={rowName(record.id, 'color')} style={{ margin: 0 }}>
              <Input />
            </Form.Item>
          );
        }
        return text;
      }
    },
    {
      title: '规格(cm)',
      dataIndex: 'specification',
      width: 120,
      ellipsis: true,
      editable: true,
      render: (text: string, record: StyleBom) => {
        if (!locked && (tableEditable || isEditing(record))) {
          return (
            <Form.Item name={rowName(record.id, 'specification')} style={{ margin: 0 }}>
              <Input />
            </Form.Item>
          );
        }
        return text;
      }
    },
    {
      title: '单件用量',
      dataIndex: 'usageAmount',
      width: 100,
      editable: true,
      render: (text: number, record: StyleBom) => {
        if (!locked && (tableEditable || isEditing(record))) {
          return (
            <Form.Item name={rowName(record.id, 'usageAmount')} style={{ margin: 0 }} rules={[{ required: true, message: '必填' }]}>
              <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
            </Form.Item>
          );
        }
        return text;
      }
    },
    {
      title: '损耗率(%)',
      dataIndex: 'lossRate',
      width: 100,
      editable: true,
      render: (text: number, record: StyleBom) => {
        if (!locked && (tableEditable || isEditing(record))) {
          return (
            <Form.Item name={rowName(record.id, 'lossRate')} style={{ margin: 0 }}>
              <InputNumber min={0} max={100} style={{ width: '100%' }} />
            </Form.Item>
          );
        }
        return `${text}%`;
      }
    },
    {
      title: '单价',
      dataIndex: 'unitPrice',
      width: 110,
      editable: true,
      render: (text: number, record: StyleBom) => {
        if (!locked && (tableEditable || isEditing(record))) {
          return (
            <Form.Item name={rowName(record.id, 'unitPrice')} style={{ margin: 0 }} rules={[{ required: true, message: '必填' }]}>
              <InputNumber min={0} step={0.01} prefix="¥" style={{ width: '100%' }} />
            </Form.Item>
          );
        }
        return `¥${Number(text || 0).toFixed(2)}`;
      }
    },
    {
      title: '小计',
      dataIndex: 'totalPrice',
      width: 110,
      render: (text: number, record: StyleBom) => {
        if (!locked && (tableEditable || isEditing(record))) {
          const rid = String(record.id);
          return (
            <Form.Item
              noStyle
              shouldUpdate={(prev, next) =>
                JSON.stringify(prev?.[rid]) !== JSON.stringify(next?.[rid])
              }
            >
              {() => {
                const row = form.getFieldValue(rid) || {};
                const base = { ...record, ...row };
                const value = calcTotalPrice(base);
                return `¥${Number(value || 0).toFixed(2)}`;
              }}
            </Form.Item>
          );
        }

        const value = Number.isFinite(Number(text)) ? Number(text) : calcTotalPrice(record);
        return `¥${Number(value || 0).toFixed(2)}`;
      }
    },
    {
      title: '单位',
      dataIndex: 'unit',
      width: 80,
      ellipsis: true,
      editable: true,
      render: (text: string, record: StyleBom) => {
        if (!locked && (tableEditable || isEditing(record))) {
          return (
            <Form.Item name={rowName(record.id, 'unit')} style={{ margin: 0 }} rules={[{ required: true, message: '必填' }]}>
              <Input />
            </Form.Item>
          );
        }
        return text;
      }
    },
    {
      title: '供应商',
      dataIndex: 'supplier',
      width: 140,
      ellipsis: true,
      editable: true,
      render: (text: string, record: StyleBom) => {
        if (!locked && (tableEditable || isEditing(record))) {
          return (
            <Form.Item name={rowName(record.id, 'supplier')} style={{ margin: 0 }} rules={[{ required: true, message: '必填' }]}>
              <Input />
            </Form.Item>
          );
        }
        return text;
      }
    },
    {
      title: '库存状态',
      dataIndex: 'stockStatus',
      width: 110,
      render: (status: string, record: StyleBom) => {
        if (!status) {
          return <Tag color="default">未检查</Tag>;
        }

        const statusConfig: Record<string, { color: string; text: string }> = {
          sufficient: { color: 'success', text: '库存充足' },
          insufficient: { color: 'warning', text: '库存不足' },
          none: { color: 'error', text: '无库存' },
          unchecked: { color: 'default', text: '未检查' },
        };

        const config = statusConfig[status] || { color: 'default', text: '未知' };

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Tag color={config.color}>{config.text}</Tag>
            {status === 'insufficient' || status === 'none' ? (
              <span style={{ fontSize: "var(--font-size-xs)", color: 'var(--error-color)' }}>
                需采购: {record.requiredPurchase || 0}
              </span>
            ) : null}
            {status === 'sufficient' && record.availableStock !== undefined ? (
              <span style={{ fontSize: "var(--font-size-xs)", color: 'var(--success-color)' }}>
                可用: {record.availableStock}
              </span>
            ) : null}
          </div>
        );
      }
    },
    {
      title: '操作',
      dataIndex: 'operation',
      width: 110,
      resizable: false,
      render: (_: any, record: StyleBom) => {
        if (locked) {
          return (
            <Space>
              <Tag color="default">已完成</Tag>
              <span style={{ color: 'var(--neutral-text-lighter)' }}>无法操作</span>
            </Space>
          );
        }
        if (tableEditable) {
          return (
            <RowActions
              maxInline={1}
              actions={[
                {
                  key: 'delete',
                  label: '删除',
                  title: '删除',
                  icon: <DeleteOutlined />,
                  danger: true,
                  onClick: () => {
                    Modal.confirm({
                      title: '确定删除?',
                      onOk: () => handleDelete(record.id!),
                    });
                  },
                },
              ]}
            />
          );
        }

        if (!isSupervisorOrAbove) {
          return null;
        }

        const editable = isEditing(record);
        return editable ? (
          <RowActions
            maxInline={2}
            actions={[
              {
                key: 'save',
                label: '保存',
                title: '保存',
                icon: <SaveOutlined />,
                onClick: () => save(String(record.id!)),
                primary: true,
              },
              {
                key: 'cancel',
                label: '取消',
                title: '取消',
                icon: <CloseOutlined />,
                onClick: () => {
                  Modal.confirm({
                    title: '确定取消?',
                    onOk: cancel,
                  });
                },
              },
            ]}
          />
        ) : (
          <RowActions
            maxInline={2}
            actions={[
              {
                key: 'edit',
                label: '编辑',
                title: '编辑',
                icon: <EditOutlined />,
                disabled: editingKey !== '',
                onClick: () => edit(record),
                primary: true,
              },
              {
                key: 'delete',
                label: '删除',
                title: '删除',
                icon: <DeleteOutlined />,
                danger: true,
                disabled: editingKey !== '',
                onClick: () => {
                  Modal.confirm({
                    title: '确定删除?',
                    onOk: () => handleDelete(record.id!),
                  });
                },
              },
            ]}
          />
        );
      },
    },
  ];

  return (
    <div>
      {/* 状态栏 */}
      <div style={{
        marginBottom: 16,
        padding: '12px 16px',
        background: '#f5f5f5',
        borderRadius: 4,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <Space size="large" wrap>
          <span style={{ color: 'var(--neutral-text-secondary)' }}>
            领取人：<span style={{ color: 'var(--neutral-text)', fontWeight: 500 }}>{bomAssignee || '-'}</span>
          </span>
          <span style={{ color: 'var(--neutral-text-secondary)' }}>
            开始时间：<span style={{ color: 'var(--neutral-text)', fontWeight: 500 }}>{formatDateTime(bomStartTime)}</span>
          </span>
          <span style={{ color: 'var(--neutral-text-secondary)' }}>
            完成时间：<span style={{ color: 'var(--neutral-text)', fontWeight: 500 }}>{formatDateTime(bomCompletedTime)}</span>
          </span>
        </Space>

        <Space wrap>
          {locked ? (
            <Tag color="success">已完成</Tag>
          ) : bomStartTime ? (
            <Tag color="processing">进行中</Tag>
          ) : (
            <Tag color="default">未开始</Tag>
          )}

          {!locked && !bomStartTime && (
            <Button onClick={handleBomStart} loading={loading} size="small">
              开始BOM配置
            </Button>
          )}

          {!locked && bomStartTime && !bomCompletedTime && data.length > 0 && (
            <Button type="primary" onClick={handleBomComplete} loading={loading} size="small">
              标记完成
            </Button>
          )}
        </Space>
      </div>
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
            icon={<PlusOutlined />}
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
          <div>状态：{String(syncJob?.status || '-')}</div>
          <div>错误：{String(syncJob?.error || '')}</div>
          <div>款号：{String(syncJob?.result?.styleNo || currentStyleNo || '')}</div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <Button
            onClick={() => fetchSyncJob(syncJobId)}
            disabled={!syncJobId}
          >
            刷新
          </Button>
        </div>
        <Table
          size="small"
          rowKey={(r, index) => String((r as Record<string, unknown>)?.materialCode || (r as Record<string, unknown>)?.id || `detail-${index}`)}
          dataSource={Array.isArray(syncJob?.result?.details) ? syncJob.result.details : []}
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
          onChange={(k) => setMaterialTab(k as Record<string, unknown>)}
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
                  <Table
                    size="small"
                    loading={materialLoading}
                    dataSource={materialList}
                    rowKey={(r, index) => String((r as Record<string, unknown>)?.id || (r as Record<string, unknown>)?.materialCode || `material-${index}`)}
                    pagination={{
                      current: materialPage,
                      pageSize: 10,
                      total: materialTotal,
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
                      { title: '物料编码', dataIndex: 'materialCode', width: 140 },
                      { title: '物料名称', dataIndex: 'materialName', width: 160, ellipsis: true },
                      { title: '类型', dataIndex: 'materialType', width: 90 },
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
                            <span style={{ color: qty > 0 ? 'var(--success-color)' : '#ff4d4f', fontWeight: 600 }}>
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
                                icon: <CheckOutlined />,
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
                      const payload: unknown = {
                        materialCode: String(values.materialCode || '').trim(),
                        materialName: String(values.materialName || '').trim(),
                        unit: String(values.unit || '').trim(),
                        supplierName: String(values.supplierName || '').trim(),
                        materialType: String(values.materialType || 'accessory').trim(),
                        specifications: String(values.specifications || '').trim(),
                        unitPrice: Number(values.unitPrice) || 0,
                        remark: String(values.remark || '').trim(),
                        styleNo: String(currentStyleNo || '').trim(),
                      };
                      const res = await api.post<{ code: number; message: string; data: boolean }>('/material/database', payload);
                      const result = res as Record<string, unknown>;
                      if (result.code !== 200 || result.data !== true) {
                        message.error(result.message || '创建失败');
                        return;
                      }
                      message.success('已创建面辅料');
                      fillRowFromMaterial(materialTargetRowId, payload);
                      setMaterialModalOpen(false);
                    } catch (e: unknown) {
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
                      <Input />
                    </Form.Item>
                    <Form.Item name="supplierName" label="供应商" rules={[{ required: true, message: '必填' }]}>
                      <Input />
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
                    <Form.Item name="specifications" label="规格">
                      <Input />
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
          storageKey={`style-bom-${String(styleId)}`}
          minColumnWidth={70}
        />
      </Form>
    </div>
  );
};

export default StyleBomTab;
