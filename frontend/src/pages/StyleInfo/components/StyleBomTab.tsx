import React, { useEffect, useRef, useState } from 'react';
import { App, Button, Input, InputNumber, Form, Select, Space, Tag, Modal, Table, Tabs } from 'antd';
import { PlusOutlined, DeleteOutlined, SaveOutlined, EditOutlined, CloseOutlined, CheckOutlined } from '@ant-design/icons';
import { StyleBom, TemplateLibrary } from '../../../types/style';
import api from '../../../utils/api';
import ResizableTable from '../../../components/common/ResizableTable';
import RowActions from '../../../components/common/RowActions';
import { isSupervisorOrAboveUser, useAuth } from '../../../utils/authContext';
import { getMaterialSortWeight, getMaterialTypeLabel, normalizeMaterialType } from '../../../utils/materialType';
import { useViewport } from '../../../utils/useViewport';

interface Props {
  styleId: string | number;
  readOnly?: boolean;
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
    const wa = getMaterialSortWeight((a as any)?.materialType);
    const wb = getMaterialSortWeight((b as any)?.materialType);
    if (wa !== wb) return wa - wb;
    const ca = String((a as any)?.materialCode || '');
    const cb = String((b as any)?.materialCode || '');
    if (ca !== cb) return ca.localeCompare(cb);
    return String((a as any)?.id || '').localeCompare(String((b as any)?.id || ''));
  });
  return list;
};

const StyleBomTab: React.FC<Props> = ({ styleId, readOnly }) => {
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

  const locked = Boolean(readOnly);

  const isSupervisorOrAbove = isSupervisorOrAboveUser(user);
  const { tableScrollY } = useViewport();

  const [styleNoOptions, setStyleNoOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [styleNoLoading, setStyleNoLoading] = useState(false);
  const styleNoReqSeq = useRef(0);
  const styleNoTimerRef = useRef<number | undefined>(undefined);

  const fetchStyleNoOptions = async (keyword?: string) => {
    const seq = (styleNoReqSeq.current += 1);
    setStyleNoLoading(true);
    try {
      const res = await api.get<any>('/style/info/list', {
        params: {
          page: 1,
          pageSize: 200,
          styleNo: String(keyword ?? '').trim(),
        },
      });
      const result = res as any;
      if (seq !== styleNoReqSeq.current) return;
      if (result.code !== 200) return;
      const records = (result.data?.records || []) as Array<any>;
      const next = (Array.isArray(records) ? records : [])
        .map((r) => String(r?.styleNo || '').trim())
        .filter(Boolean)
        .map((sn) => ({ value: sn, label: sn }));
      setStyleNoOptions(next);
    } catch {
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
      const res = await api.get<any>('/template-library/list', {
        params: {
          page: 1,
          pageSize: 200,
          templateType: 'bom',
          keyword: '',
          sourceStyleNo: sn,
        },
      });
      const result = res as any;
      if (result.code === 200) {
        const records = (result.data?.records || []) as TemplateLibrary[];
        setBomTemplates(Array.isArray(records) ? records : []);
        return;
      }
    } catch {
    } finally {
      setTemplateLoading(false);
    }

    try {
      const res = await api.get<any>('/template-library/type/bom');
      const result = res as any;
      if (result.code === 200) {
        setBomTemplates(Array.isArray(result.data) ? result.data : []);
      }
    } catch {
    }
  };

  const isTempId = (id: any) => {
    if (typeof id === 'string') return id.startsWith('tmp_');
    if (typeof id === 'number') return id < 0;
    return false;
  };

  const debugValue = (value: any) => {
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value);
    } catch {
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
          materialType: normalizeMaterialType<MaterialType>((row as any).materialType),
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
      const res = await api.post<any>(`/style/bom/${sid}/sync-material-database/async`);
      const result = res as any;
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
    } catch (error: any) {
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
      const res = await api.get<any>(`/style/info/${sid}`);
      const result = res as any;
      if (result.code === 200) {
        setCurrentStyleNo(String(result.data?.styleNo || '').trim());
      }
    } catch {
      setCurrentStyleNo('');
    }
  };

  const fetchSyncJob = async (jid: string) => {
    const id = String(jid || '').trim();
    if (!id) return;
    try {
      const res = await api.get<any>(`/style/bom/sync-jobs/${encodeURIComponent(id)}`);
      const result = res as any;
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
      const res = await api.get<any>('/material/database/list', {
        params: {
          page: p,
          pageSize: 10,
          materialCode: kw,
          materialName: kw,
        },
      });
      const result = res as any;
      if (result.code === 200) {
        const records = Array.isArray(result.data?.records) ? result.data.records : [];
        setMaterialList(records);
        setMaterialTotal(Number(result.data?.total) || 0);
        setMaterialPage(p);
      }
    } catch {
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

  const fillRowFromMaterial = (rid: string, material: any) => {
    const rowId = String(rid || '').trim();
    if (!rowId) return;
    const m = material || {};
    const patch: any = {
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
    const next: Record<string, any> = {};
    for (const r of Array.isArray(rows) ? rows : []) {
      const rid = String(r?.id ?? '');
      if (!rid) continue;
      next[rid] = { ...r, materialType: normalizeMaterialType<MaterialType>((r as any).materialType) };
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
      [rid]: { ...record, materialType: normalizeMaterialType<MaterialType>((record as any).materialType) },
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
      const row = form.getFieldValue(String(key)) || {};
      const newData = [...data];
      const index = newData.findIndex((item) => key === String(item.id));

      if (index > -1) {
        const item = newData[index];
        const newItem: any = { ...item, ...row };
        newItem.totalPrice = calcTotalPrice(newItem);
        let res;

        if (isTempId(item.id)) {
          // 临时行，调用新增接口保存
          const { id, ...payload } = newItem;
          res = await api.post('/style/bom', payload);
        } else {
          // 现有行，调用更新接口保存
          res = await api.put('/style/bom', newItem);
        }

        const result = res as any;
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
      const res = await api.post<any>('/template-library/apply-to-style', {
        templateId: bomTemplateId,
        targetStyleId: sid,
        mode: importMode,
      });
      const result = res as any;
      if (result.code !== 200) {
        message.error(result.message || '导入失败');
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
        const row = allValues?.[key] || {};
        const newItem: any = { ...item, ...row };
        newItem.totalPrice = calcTotalPrice(newItem);

        if (isTempId(item.id)) {
          const { id, ...payload } = newItem;
          const res = await api.post('/style/bom', payload);
          const result = res as any;
          if (result.code !== 200) {
            message.error(result.message || '保存失败');
            return;
          }
        } else {
          const res = await api.put('/style/bom', newItem);
          const result = res as any;
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
        }
        message.success('删除成功');
      } else {
        // 现有行，调用删除接口
        const res = await api.delete(`/style/bom/${encodeURIComponent(deletingId)}`);
        const result = res as any;
        if (result.code === 200 && result.data === true) {
          message.success('删除成功');
          if (tableEditable) {
            setData((prev) => sortBomRows(prev.filter((item) => String(item.id) !== deletingId)));
            try {
              form.resetFields([deletingId]);
            } catch {
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
                options={materialTypeOptions as any}
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
      width: 120,
      ellipsis: true,
      editable: true,
      render: (text: string, record: StyleBom) => {
        if (!locked && (tableEditable || isEditing(record))) {
          return (
            <Form.Item name={rowName(record.id, 'materialCode')} style={{ margin: 0 }} rules={[{ required: true, message: '必填' }]}>
              <Input />
            </Form.Item>
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
      title: '操作',
      dataIndex: 'operation',
      width: 110,
      resizable: false,
      render: (_: any, record: StyleBom) => {
        if (locked) {
          return (
            <Space>
              <Tag color="green">已完成</Tag>
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
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <Space wrap>
          <Button
            onClick={handleAdd}
            type="primary"
            icon={<PlusOutlined />}
            disabled={locked || Boolean(editingKey) || loading || templateLoading || (!tableEditable && !isSupervisorOrAbove)}
          >
            添加物料
          </Button>

          <Button
            disabled={locked || loading || templateLoading || syncLoading || (!tableEditable && !isSupervisorOrAbove)}
            onClick={openMaterialModal}
          >
            选择面辅料
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
              onClick={() => enterTableEdit()}
              disabled={locked || loading || templateLoading || Boolean(editingKey) || !data.length}
            >
              退回编辑
            </Button>
          ) : null}

          <Select
            allowClear
            showSearch
            filterOption={false}
            loading={styleNoLoading}
            value={templateSourceStyleNo || undefined}
            placeholder="来源款号"
            style={{ width: 180 }}
            options={styleNoOptions}
            onSearch={scheduleFetchStyleNos}
            onChange={(v) => setTemplateSourceStyleNo(String(v || ''))}
            onOpenChange={(open) => {
              if (open && !styleNoOptions.length) fetchStyleNoOptions('');
            }}
            disabled={locked || Boolean(editingKey) || loading || templateLoading}
          />

          <Button disabled={locked || Boolean(editingKey) || loading || templateLoading} onClick={() => fetchBomTemplates(templateSourceStyleNo)}>
            筛选
          </Button>

          <Button
            disabled={locked || Boolean(editingKey) || loading || templateLoading}
            onClick={() => {
              setTemplateSourceStyleNo('');
              fetchBomTemplates('');
            }}
          >
            全部
          </Button>

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
          />

          <Select
            value={importMode}
            style={{ width: 120 }}
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

          {isSupervisorOrAbove ? (
            <Button
              disabled={locked || Boolean(editingKey) || loading || templateLoading || tableEditable || !data.length}
              loading={syncLoading}
              onClick={syncToMaterialDatabase}
            >
              一键同步到面辅料数据库
            </Button>
          ) : null}
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
          rowKey={(r, index) => String((r as any)?.materialCode || (r as any)?.id || `detail-${index}`)}
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
                  <Table
                    size="small"
                    loading={materialLoading}
                    dataSource={materialList}
                    rowKey={(r, index) => String((r as any)?.id || (r as any)?.materialCode || `material-${index}`)}
                    pagination={{
                      current: materialPage,
                      pageSize: 10,
                      total: materialTotal,
                      onChange: (p) => fetchMaterials(p, materialKeyword),
                      showSizeChanger: false,
                    }}
                    onRow={(record) => ({
                      onDoubleClick: () => {
                        fillRowFromMaterial(materialTargetRowId, record);
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
                        render: (v: any) => `¥${Number(v || 0).toFixed(2)}`,
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
                                onClick: () => {
                                  fillRowFromMaterial(materialTargetRowId, record);
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
                      const payload: any = {
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
                      const res = await api.post<any>('/material/database', payload);
                      const result = res as any;
                      if (result.code !== 200 || result.data !== true) {
                        message.error(result.message || '创建失败');
                        return;
                      }
                      message.success('已创建面辅料');
                      fillRowFromMaterial(materialTargetRowId, payload);
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
          scroll={{ x: 'max-content', y: tableScrollY }}
          storageKey={`style-bom-${String(styleId)}`}
          minColumnWidth={70}
        />
      </Form>
    </div>
  );
};

export default StyleBomTab;
