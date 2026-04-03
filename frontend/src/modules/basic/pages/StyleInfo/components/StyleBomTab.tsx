import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Dropdown, Input, InputNumber, Form, Select, Space, Modal, Tabs, Image, Tag, Popover } from 'antd';
import { DownOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { StyleBom, TemplateLibrary } from '@/types/style';
import api from '@/utils/api';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import DictAutoComplete from '@/components/common/DictAutoComplete';
import SupplierSelect from '@/components/common/SupplierSelect';
import { isSupervisorOrAboveUser, useAuth } from '@/utils/AuthContext';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { getMaterialSortWeight, getMaterialTypeLabel, normalizeMaterialType } from '@/utils/materialType';
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_PAGE_SIZE_OPTIONS,
  buildPageSizeStorageKey,
  readPageSizeByKey,
  savePageSizeByKey,
} from '@/utils/pageSizeStore';
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
  sizeColorConfig?: {
    sizes?: string[];
    colors?: string[];
    matrixRows?: Array<{ color: string; quantities: number[]; imageUrl?: string }>;
  };
}

const sortBomRows = (rows: StyleBom[]) => {
  const list = Array.isArray(rows) ? [...rows] : [];
  list.sort((a, b) => {
    const ga = String((a as Record<string, unknown>)?.groupName || '').trim();
    const gb = String((b as Record<string, unknown>)?.groupName || '').trim();
    if (ga !== gb) {
      if (!ga) return 1;
      if (!gb) return -1;
      return ga.localeCompare(gb, 'zh-CN');
    }
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

const MATERIAL_SELECT_STORAGE_KEY = 'style-bom-material-select';
const MATERIAL_SELECT_PAGE_SIZE_KEY = buildPageSizeStorageKey(MATERIAL_SELECT_STORAGE_KEY);

const normalizeUniqueValues = (values?: string[]) => {
  const seen = new Set<string>();
  return (Array.isArray(values) ? values : [])
    .map((item) => String(item || '').trim())
    .filter((item) => {
      if (!item || seen.has(item)) return false;
      seen.add(item);
      return true;
    });
};

const isZipperMaterial = (record: Partial<StyleBom>) => /拉链/.test(String(record.materialName || '').trim());
const isCountLikeUnit = (unit?: string) => /^(个|套|条|只|双|粒|枚|包|张|件|根|片|台|桶|卷)$/.test(String(unit || '').trim());
const resolvePatternUnit = (record: Partial<StyleBom>) => {
  const patternUnit = String(record.patternUnit || '').trim();
  const unit = String(record.unit || '').trim();
  const materialType = String(record.materialType || '').trim().toLowerCase();
  const materialName = String(record.materialName || '').trim();
  const specification = String(record.specification || '').trim();
  if (patternUnit && patternUnit !== '米') {
    return patternUnit;
  }
  if (!isZipperMaterial(record) && (
    unit === '米'
    || (!isCountLikeUnit(unit) && (
      materialType.startsWith('fabric')
      || materialType.startsWith('lining')
      || /松紧|织带|绳|带|滚条|包边|魔术贴/.test(`${materialName} ${specification}`)
    ))
  )) {
    return '米';
  }
  return unit || patternUnit || '';
};

const StyleBomTab: React.FC<Props> = ({
  styleId,
  readOnly,
  bomAssignee,
  bomStartTime,
  bomCompletedTime,
  onRefresh,
  sizeColorConfig,
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
  const [materialPageSize, setMaterialPageSize] = useState(() => readPageSizeByKey(MATERIAL_SELECT_PAGE_SIZE_KEY, DEFAULT_PAGE_SIZE));
  const [materialKeyword, setMaterialKeyword] = useState('');
  const [materialTargetRowId, setMaterialTargetRowId] = useState('');
  const activeSizes = normalizeUniqueValues(sizeColorConfig?.sizes);
  const activeColors = normalizeUniqueValues(sizeColorConfig?.colors);
  const parseNumberMap = useCallback((value?: string) => {
    try {
      const parsed = JSON.parse(String(value || '{}'));
      return parsed && typeof parsed === 'object' ? parsed as Record<string, number> : {};
    } catch {
      return {};
    }
  }, []);
  const extractSpecLength = useCallback((value?: string) => {
    const matched = String(value || '').match(/(\d+(?:\.\d+)?)/);
    return matched ? Number(matched[1]) : 0;
  }, []);
  const buildSizeUsageMap = useCallback((usageAmount: number, existing?: string) => {
    const parsed = parseNumberMap(existing);
    if (!activeSizes.length) return existing || '';
    return JSON.stringify(
      Object.fromEntries(activeSizes.map((size) => [size, Number(parsed[size] ?? usageAmount ?? 0)]))
    );
  }, [activeSizes, parseNumberMap]);
  const buildSizeSpecMap = useCallback((specification?: string, existing?: string) => {
    const parsed = parseNumberMap(existing);
    const defaultSpec = extractSpecLength(specification);
    if (!activeSizes.length) return existing || '';
    return JSON.stringify(
      Object.fromEntries(activeSizes.map((size) => [size, Number(parsed[size] ?? defaultSpec ?? 0)]))
    );
  }, [activeSizes, extractSpecLength, parseNumberMap]);
  const [materialCreateForm] = Form.useForm();

  const [checkingStock, setCheckingStock] = useState(false);

  const locked = Boolean(readOnly);

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
        patternUnit: '',
        conversionRate: 1,
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
      patternUnit: '',
      conversionRate: 1,
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

  const fetchMaterials = async (page: number, keyword?: string, pageSizeOverride?: number) => {
    const p = Number(page) || 1;
    const kw = String(keyword ?? '').trim();
    const nextPageSize = pageSizeOverride ?? materialPageSize;
    setMaterialLoading(true);
    try {
      const res = await api.get<{ code: number; data: { records: any[]; total: number } }>('/material/database/list', {
        params: {
          page: p,
          pageSize: nextPageSize,
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

  const handleMaterialPageChange = (page: number, pageSize: number) => {
    if (pageSize !== materialPageSize) {
      savePageSizeByKey(MATERIAL_SELECT_PAGE_SIZE_KEY, pageSize);
      setMaterialPageSize(pageSize);
      void fetchMaterials(1, materialKeyword, pageSize);
      return;
    }
    void fetchMaterials(page, materialKeyword);
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
      fabricWeight: String(m.fabricWeight || '').trim(),
      unit: String(m.unit || '').trim(),
      patternUnit: String(m.patternUnit || m.unit || '').trim(),
      conversionRate: Number(m.conversionRate ?? 1) || 1,
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
    patch.sizeSpecMap = buildSizeSpecMap(patch.specification, m.sizeSpecMap);
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
          const requiredQty = Math.ceil(usageAmount);

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
          const requiredQty = Math.ceil(usageAmount);

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
      next[rid] = {
        ...r,
        materialType: normalizeMaterialType<MaterialType>((r as Record<string, unknown>).materialType),
        sizeUsageMapObject: parseNumberMap(r.patternSizeUsageMap || r.sizeUsageMap),
        sizeSpecMapObject: parseNumberMap(r.sizeSpecMap),
        patternUnit: String(r.patternUnit || r.unit || '').trim(),
        conversionRate: Number(r.conversionRate ?? 1) || 1,
      };
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
      [rid]: {
        ...record,
        materialType: normalizeMaterialType<MaterialType>((record as Record<string, unknown>).materialType),
        sizeUsageMapObject: parseNumberMap(record.patternSizeUsageMap || record.sizeUsageMap),
        sizeSpecMapObject: parseNumberMap(record.sizeSpecMap),
        patternUnit: String(record.patternUnit || record.unit || '').trim(),
        conversionRate: Number(record.conversionRate ?? 1) || 1,
      },
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
      // 修复：先获取基础值，再获取用户输入的值
      const item = data.find((d) => key === String(d.id));
      const baseRow = item ? { ...item } : {};
      const userRow = (form.getFieldValue(String(key)) || {}) as any;
      const row = { ...baseRow, ...userRow };
      const newData = [...data];
      const index = newData.findIndex((item) => key === String(item.id));

      if (index > -1) {
        const item = newData[index];
        const newItem: any = { ...item, ...row };
        // 确保groupName不被丢失（因为表格中没有groupName的表单控件）
        if (item.groupName && !row.groupName) {
          newItem.groupName = item.groupName;
        }
        const conversionRate = Number(row?.conversionRate ?? newItem.conversionRate ?? 1) || 1;
        const rawSizeUsageMap = activeSizes.length
          ? Object.fromEntries(activeSizes.map((size) => [size, Number(row?.sizeUsageMapObject?.[size] ?? item.usageAmount ?? newItem.usageAmount ?? 0)]))
          : parseNumberMap(item.patternSizeUsageMap || item.sizeUsageMap);
        newItem.patternUnit = resolvePatternUnit(newItem);
        newItem.conversionRate = conversionRate;
        newItem.patternSizeUsageMap = activeSizes.length ? JSON.stringify(rawSizeUsageMap) : item.patternSizeUsageMap;
        newItem.sizeUsageMap = activeSizes.length ? JSON.stringify(rawSizeUsageMap) : item.sizeUsageMap;
        newItem.sizeSpecMap = activeSizes.length
          ? JSON.stringify(Object.fromEntries(activeSizes.map((size) => [size, Number(row?.sizeSpecMapObject?.[size] ?? extractSpecLength(newItem.specification) ?? 0)])))
          : item.sizeSpecMap;
        delete newItem.sizeUsageMapObject;
        delete newItem.sizeSpecMapObject;
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

  const applyBomTemplate = async (mode: 'overwrite' | 'append' = 'overwrite') => {
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
        mode,
      });
      const result = res as Record<string, unknown>;
      if (result.code !== 200) {
        message.error(String(result.message || '导入失败'));
        return;
      }
      message.success(mode === 'append' ? '已追加导入BOM模板' : '已覆盖导入BOM模板');
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
      // 修复：先用buildFormValues初始化所有行的表单值，再获取用户输入的值
      // 这样可以确保不在视图中的行也能正确获取到值
      const baseValues = buildFormValues(data);
      const userValues = form.getFieldsValue() || {};
      const allValues = Object.keys(baseValues).reduce((acc, key) => {
        acc[key] = { ...baseValues[key] as object, ...(userValues[key] as object || {}) };
        return acc;
      }, {} as Record<string, unknown>);

      setLoading(true);
      for (const item of data) {
        const key = String(item.id);
        const row = (allValues?.[key] || {}) as any;
        const newItem: any = { ...item, ...row };
        // 确保groupName不被丢失（因为表格中没有groupName的表单控件）
        if (item.groupName && !row.groupName) {
          newItem.groupName = item.groupName;
        }
        const conversionRate = Number(row?.conversionRate ?? newItem.conversionRate ?? 1) || 1;
        const rawSizeUsageMap = activeSizes.length
          ? Object.fromEntries(activeSizes.map((size) => [size, Number(row?.sizeUsageMapObject?.[size] ?? item.usageAmount ?? newItem.usageAmount ?? 0)]))
          : parseNumberMap(item.patternSizeUsageMap || item.sizeUsageMap);
        newItem.patternUnit = resolvePatternUnit(newItem);
        newItem.conversionRate = conversionRate;
        newItem.patternSizeUsageMap = activeSizes.length ? JSON.stringify(rawSizeUsageMap) : item.patternSizeUsageMap;
        newItem.sizeUsageMap = activeSizes.length ? JSON.stringify(rawSizeUsageMap) : item.sizeUsageMap;
        newItem.sizeSpecMap = activeSizes.length
          ? JSON.stringify(Object.fromEntries(activeSizes.map((size) => [size, Number(row?.sizeSpecMapObject?.[size] ?? extractSpecLength(newItem.specification) ?? 0)])))
          : item.sizeSpecMap;
        delete newItem.sizeUsageMapObject;
        delete newItem.sizeSpecMapObject;
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

    // 先同步form中的数据到data，避免丢失用户输入
    const allValues = form.getFieldsValue() || {};
    const syncedData = data.map((item) => {
      const key = String(item.id);
      const row = allValues[key] || {};
      return { ...item, ...row };
    });

    // 生成一个临时编号，用于标识临时行
    const newId = `tmp_${Date.now()}`;
    const newBom: StyleBom = {
      id: newId,
      styleId,
      materialType: 'fabricA',
      materialCode: '',
      materialName: '',
      color: activeColors.length === 1 ? activeColors[0] : activeColors.join('/'),
      specification: '',
      size: activeSizes.join('/'),
      sizeUsageMap: buildSizeUsageMap(0),
      patternSizeUsageMap: buildSizeUsageMap(0),
      sizeSpecMap: buildSizeSpecMap(''),
      unit: '',
      patternUnit: '',
      conversionRate: 1,
      usageAmount: 0,
      lossRate: 0,
      unitPrice: 0,
      totalPrice: 0,
      supplier: ''
    };
    setData(sortBomRows([...syncedData, newBom]));

    const rid = String(newId);
    // 修复：tableEditable=false 时 Form.Item 未挂载，allValues 为空，必须先用
    // buildFormValues 初始化所有已有行，再叠加 allValues（保留已挂载行的用户输入）
    form.setFieldsValue({
      ...buildFormValues(syncedData),
      ...allValues,
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

    // 分离临时数据和已保存数据
    const tempRows = data.filter((item) => isTempId(item.id));
    const savedRows = data.filter((item) => !isTempId(item.id));

    if (savedRows.length === 0) {
      message.warning('暂无已保存的BOM数据，请先保存后再检查库存');
      return;
    }

    setCheckingStock(true);
    try {
      const res = await api.post<{ code: number; message: string; data: StyleBom[] }>(
        `/style/bom/check-stock/${sid}`
      );
      const result = res as Record<string, unknown>;

      if (result.code === 200) {
        const checkedBomList = result.data as StyleBom[];

        // 合并：已检查的数据 + 临时数据（保留未保存的行）
        const mergedData = [...checkedBomList, ...tempRows];
        setData(sortBomRows(mergedData));

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
          await api.post('/production/picking/pending', {
            picking: {
              styleId: String(styleId || ''),
              styleNo: currentStyleNo,
              pickerId: String(user?.id || ''),
              pickerName: String((user as any)?.name || user?.username || ''),
              remark: 'BOM_PICK',
            },
            items: [{
              materialId: record.materialId,
              materialCode: record.materialCode,
              materialName: record.materialName,
              color: record.color ?? '',
              size: '',
              quantity: record.usageAmount != null ? Number(record.usageAmount) : 1,
              unit: record.unit ?? '',
            }],
          });
          message.success('申请领取成功，将在「面辅料进销存 → 待出库领料」中显示');
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
    isTempId,
    fetchMaterials,
    materialCreateForm,
    calcTotalPrice,
    isSupervisorOrAbove,
    setMaterialKeyword,
    setMaterialModalOpen,
    setMaterialTab,
    setMaterialTargetRowId,
    onApplyPickup: handleApplyPickup,
    activeSizes,
  });

  // 按分组聚合数据
  const groupedData = useMemo(() => {
    const groups = new Map<string, StyleBom[]>();
    const noGroupName = '未分组';

    data.forEach((item) => {
      const groupName = String(item.groupName || '').trim() || noGroupName;
      if (!groups.has(groupName)) {
        groups.set(groupName, []);
      }
      groups.get(groupName)!.push(item);
    });

    const result: { groupName: string; items: StyleBom[]; isDefault: boolean }[] = [];
    groups.forEach((items, groupName) => {
      result.push({
        groupName,
        items,
        isDefault: groupName === noGroupName,
      });
    });

    result.sort((a, b) => {
      if (a.isDefault) return 1;
      if (b.isDefault) return -1;
      return a.groupName.localeCompare(b.groupName, 'zh-CN');
    });

    return result;
  }, [data]);

  // 删除整个分组
  const handleDeleteGroup = (groupName: string) => {
    if (locked) {
      message.error('已完成，无法操作');
      return;
    }
    const groupItems = data.filter((item) => (String(item.groupName || '').trim() || '未分组') === groupName);
    if (!groupItems.length) return;

    Modal.confirm({
      width: '30vw',
      title: `确定删除分组「${groupName}」？`,
      content: `该分组下有 ${groupItems.length} 条物料记录，将一并删除。`,
      okText: '确定删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        setLoading(true);
        try {
          const deleteTasks = groupItems
            .filter((item) => !isTempId(item.id))
            .map((item) => api.delete(`/style/bom/${encodeURIComponent(String(item.id))}`));
          await Promise.all(deleteTasks);
          message.success('删除成功');
          fetchBom();
        } catch (error: any) {
          message.error(`删除失败（${error?.message || '请求失败'}）`);
        } finally {
          setLoading(false);
        }
      },
    });
  };

  // 在分组内添加物料
  const handleAddInGroup = (groupName: string, count: number = 1) => {
    if (locked) {
      message.error('已完成，无法操作');
      return;
    }
    const actualGroupName = groupName === '未分组' ? '' : groupName;

    // 先同步form中的数据到data，避免丢失用户输入
    const allValues = form.getFieldsValue() || {};
    const syncedData = data.map((item) => {
      const key = String(item.id);
      const row = allValues[key] || {};
      return { ...item, ...row };
    });

    const newRows: StyleBom[] = [];
    const newFormValues: Record<string, StyleBom> = {};

    for (let i = 0; i < count; i++) {
      const newId = `tmp_${Date.now()}_${i}`;
      const newBom: StyleBom = {
        id: newId,
        styleId,
        materialType: 'fabricA',
        groupName: actualGroupName,
        materialCode: '',
        materialName: '',
        color: activeColors.length === 1 ? activeColors[0] : '',
        specification: '',
        size: activeSizes.join('/'),
        sizeUsageMap: buildSizeUsageMap(0),
        patternSizeUsageMap: buildSizeUsageMap(0),
        sizeSpecMap: buildSizeSpecMap(''),
        unit: '',
        patternUnit: '',
        conversionRate: 1,
        usageAmount: 0,
        lossRate: 0,
        unitPrice: 0,
        totalPrice: 0,
        supplier: '',
      };
      newRows.push(newBom);
      newFormValues[String(newId)] = { ...newBom };
    }

    setData(sortBomRows([...syncedData, ...newRows]));
    form.setFieldsValue({
      ...allValues,
      ...newFormValues,
    });
    setEditingKey('');
    setTableEditable(true);
  };

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
      {(activeSizes.length || activeColors.length) ? (
        <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 12, background: 'rgba(37, 99, 235, 0.04)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {activeSizes.length ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}>基础码数</span>
              {activeSizes.map((size) => <Tag key={size} style={{ margin: 0 }}>{size}</Tag>)}
            </div>
          ) : null}
          {activeColors.length ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}>基础颜色</span>
              {activeColors.map((color) => <Tag key={color} style={{ margin: 0 }}>{color}</Tag>)}
            </div>
          ) : null}
        </div>
      ) : null}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {/* 左侧：库存检查和生成采购单 */}
        <Space>
          <Button
            onClick={handleCheckStock}
            disabled={locked || !data.length || loading || tableEditable}
            loading={checkingStock}
          >
             检查库存
          </Button>
          <Button
            type="primary"
            onClick={handleGeneratePurchase}
            disabled={locked || !data.length || loading || tableEditable}
            loading={loading}
          >
             生成采购单
          </Button>
        </Space>

        {/* 右侧：BOM配置操作按钮 */}
        <Space wrap>
          <Button
            type={tableEditable ? 'primary' : 'default'}
            onClick={tableEditable ? saveAll : () => enterTableEdit()}
            disabled={locked || loading || templateLoading || Boolean(editingKey) || (tableEditable ? false : !data.length)}
            loading={loading}
          >
            {tableEditable ? '保存' : '编辑'}
          </Button>
          {tableEditable && (
            <Button onClick={exitTableEdit} disabled={loading}>
              取消
            </Button>
          )}

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

          <Dropdown
            disabled={locked || Boolean(editingKey) || loading || templateLoading || tableEditable}
            menu={{
              items: [
                { key: 'overwrite', label: '覆盖导入（清除现有数据）' },
                { key: 'append', label: '追加导入（保留现有数据）' },
              ],
              onClick: ({ key }) => {
                if (!bomTemplateId) { message.error('请选择模板'); return; }
                void applyBomTemplate(key as 'overwrite' | 'append');
              },
            }}
          >
            <Button disabled={locked || Boolean(editingKey) || loading || templateLoading || tableEditable}>
              导入模板 <DownOutlined />
            </Button>
          </Dropdown>

          <Dropdown
            disabled={locked || Boolean(editingKey) || loading || templateLoading}
            menu={{
              items: [
                { key: '1', label: '+1行' },
                { key: '5', label: '+5行' },
                { key: '10', label: '+10行' },
              ],
              onClick: ({ key }) => handleAddInGroup('未分组', Number(key)),
            }}
          >
            <Button type="primary">
              添加物料
            </Button>
          </Dropdown>
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
                    storageKey={MATERIAL_SELECT_STORAGE_KEY}
                    size="small"
                    loading={materialLoading}
                    dataSource={materialList}
                    rowKey={(r) => String((r as Record<string, unknown>)?.id || (r as Record<string, unknown>)?.materialCode || `material-${Math.random()}`)}
                    pagination={{
                      current: materialPage,
                      pageSize: materialPageSize,
                      total: materialTotal,
                      showTotal: (total) => `共 ${total} 条`,
                      onChange: handleMaterialPageChange,
                      showSizeChanger: true,
                      pageSizeOptions: [...DEFAULT_PAGE_SIZE_OPTIONS],
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
                          const url = getFullAuthedFileUrl(raw.startsWith('http') ? raw : `/api${raw.startsWith('/') ? '' : '/'}${raw}`);
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
                      { title: '克重', dataIndex: 'fabricWeight', key: 'fabricWeight', width: 90, ellipsis: true,
                        render: (v: unknown) => String(v || '').trim() || '-' },
                      { title: '类型', dataIndex: 'materialType', width: 90,
                        render: (v: unknown) => getMaterialTypeLabel(v) },
                      { title: '颜色', dataIndex: 'color', width: 90, ellipsis: true },
                      { title: '规格/幅宽', dataIndex: 'specifications', width: 120, ellipsis: true },
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
                        fabricWeight: String(values.fabricWeight || '').trim(),
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
                      <Input id="materialCode" />
                    </Form.Item>
                    <Form.Item name="materialName" label="物料名称" rules={[{ required: true, message: '必填' }]}>
                      <Input id="materialName" />
                    </Form.Item>
                    <Form.Item name="unit" label="单位" rules={[{ required: true, message: '必填' }]}>
                      <DictAutoComplete dictType="material_unit" placeholder="请输入或选择单位" id="unit" />
                    </Form.Item>
                    <Form.Item name="supplierId" hidden>
                      <Input id="supplierId" />
                    </Form.Item>
                    <Form.Item name="supplierContactPerson" hidden>
                      <Input id="supplierContactPerson" />
                    </Form.Item>
                    <Form.Item name="supplierContactPhone" hidden>
                      <Input id="supplierContactPhone" />
                    </Form.Item>
                    <Form.Item name="supplierName" label="供应商" rules={[{ required: true, message: '必填' }]}>
                      <SupplierSelect
                        id="supplierName"
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
                        id="materialType"
                        options={[
                          { value: 'fabric', label: 'fabric' },
                          { value: 'lining', label: 'lining' },
                          { value: 'accessory', label: 'accessory' },
                        ]}
                      />
                    </Form.Item>
                    <Form.Item name="color" label="颜色">
                      <DictAutoComplete dictType="color" placeholder="请输入或选择颜色" id="color" />
                    </Form.Item>
                    <Form.Item name="specifications" label="规格">
                      <DictAutoComplete dictType="material_specification" placeholder="请输入或选择规格" id="specifications" />
                    </Form.Item>
                    <Form.Item name="fabricComposition" label="成分">
                      <Input id="fabricComposition" placeholder="如：100%棉" />
                    </Form.Item>
                    <Form.Item name="fabricWeight" label="克重">
                      <Input id="fabricWeight" placeholder="如：220g" />
                    </Form.Item>
                    <Form.Item name="unitPrice" label="单价" initialValue={0}>
                      <InputNumber id="unitPrice" min={0} step={0.01} style={{ width: '100%' }} prefix="¥" />
                    </Form.Item>
                    <Form.Item name="remark" label="备注">
                      <Input id="remark" />
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
        {groupedData.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-text-secondary)' }}>
            暂无BOM数据，请点击"添加物料"开始配置
          </div>
        ) : (
          groupedData.map((group, groupIndex) => (
            <div
              key={group.groupName}
              style={{
                marginBottom: 24,
                borderRadius: 12,
                border: '1px solid var(--color-border)',
                overflow: 'hidden',
              }}
            >
              {/* 分组标题栏 */}
              {!group.isDefault && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 16px',
                    background: 'var(--color-bg-layout)',
                    borderBottom: '1px solid var(--color-border)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Tag
                      color="blue"
                      style={{ margin: 0, fontSize: 14, padding: '4px 12px' }}
                    >
                      {group.groupName}
                    </Tag>
                    <span style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}>
                      {group.items.length} 项物料
                    </span>
                  </div>
                  <Button
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    disabled={locked || Boolean(editingKey) || loading || templateLoading}
                    onClick={() => handleDeleteGroup(group.groupName)}
                  >
                    删除分组
                  </Button>
                </div>
              )}
              {/* 分组表格 */}
              <ResizableTable
                components={{
                  body: {
                    cell: ({ children, ...restProps }: any) => <td {...restProps}>{children}</td>,
                  },
                }}
                bordered
                dataSource={group.items}
                columns={columns}
                rowClassName="editable-row"
                pagination={false}
                loading={loading && groupIndex === 0}
                rowKey="id"
                scroll={{ x: 'max-content' }}
                storageKey={`style-bom-v2-${String(styleId)}-${group.groupName}`}
                minColumnWidth={70}
                footer={() => (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0' }}>
                    <Dropdown
                      disabled={locked || Boolean(editingKey) || loading || templateLoading}
                      menu={{
                        items: [
                          { key: '1', label: '+1行' },
                          { key: '5', label: '+5行' },
                          { key: '10', label: '+10行' },
                        ],
                        onClick: ({ key }) => handleAddInGroup(group.groupName, Number(key)),
                      }}
                    >
                      <Button type="dashed">
                        添加物料
                      </Button>
                    </Dropdown>
                  </div>
                )}
              />
            </div>
          ))
        )}
      </Form>
    </div>
  );
};

export default StyleBomTab;
