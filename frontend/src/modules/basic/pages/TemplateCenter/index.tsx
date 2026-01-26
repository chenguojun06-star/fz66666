import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Card, Form, Input, InputNumber, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, EditOutlined, EyeOutlined, HolderOutlined, PlusOutlined, RollbackOutlined } from '@ant-design/icons';
import Layout from '@/components/Layout';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';
import api from '@/utils/api';
import { isAdminUser as isAdminUserFn, useAuth } from '@/utils/authContext';
import { useViewport } from '@/utils/useViewport';
import { getMaterialTypeLabel } from '@/utils/materialType';
import type { TemplateLibrary } from '@/types/style';

type ProgressNodeInput = { name: string };

type ProcessPriceStepInput = { processName: string; unitPrice?: number };

type PageResp<T> = {
  records: T[];
  total: number;
};

const { Text } = Typography;

const typeLabel = (t: string) => {
  const v = String(t || '').trim().toLowerCase();
  if (v === 'bom') return 'BOM';
  if (v === 'size') return '尺寸';
  if (v === 'process') return '工艺';
  if (v === 'process_price') return '工序单价';
  if (v === 'progress') return '进度';
  return v || '-';
};

const typeColor = (t: string) => {
  const v = String(t || '').trim().toLowerCase();
  if (v === 'bom') return 'blue';
  if (v === 'size') return 'purple';
  if (v === 'process') return 'green';
  if (v === 'process_price') return 'cyan';
  if (v === 'progress') return 'orange';
  return 'default';
};

const formatTemplateKey = (raw: unknown) => {
  const key = String(raw ?? '').trim();
  if (!key) return { text: '-', full: '' };
  if (key === 'default') return { text: '系统默认', full: key };
  if (key.startsWith('style_')) return { text: key.slice(6) || key, full: key };
  if (key.startsWith('progress_custom_')) return { text: '自定义', full: key };
  return { text: key, full: key };
};

const hasErrorFields = (err: unknown): err is { errorFields: unknown } => {
  return typeof err === 'object' && err !== null && 'errorFields' in err;
};

const getErrorMessage = (err: unknown, fallback: string) => {
  if (err instanceof Error) return err.message || fallback;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === 'string' && msg.trim()) return msg;
  }
  if (typeof err === 'string' && err.trim()) return err;
  return fallback;
};

const parseProgressNodeItems = (raw: string): Array<{ name: string; unitPrice: number }> => {
  const text = String(raw ?? '').trim();
  if (!text) return [];
  try {
    const obj = JSON.parse(text);
    const nodesRaw = (obj as Record<string, unknown>)?.nodes;
    if (!Array.isArray(nodesRaw)) return [];
    return nodesRaw
      .map((n) => {
        const item = n as { name?: unknown; unitPrice?: unknown };
        const name = String(item?.name || '').trim();
        const p = Number(item?.unitPrice);
        const unitPrice = Number.isFinite(p) && p >= 0 ? p : 0;
        return { name, unitPrice };
      })
      .filter((n) => n.name);
  } catch {
    return [];
  }
};

const parseProcessPriceSteps = (raw: string): Array<{ processName: string; unitPrice: number; estimatedMinutes?: number }> => {
  const text = String(raw ?? '').trim();
  if (!text) return [];
  try {
    const obj = JSON.parse(text);
    const stepsRaw = (obj as Record<string, unknown>)?.steps;
    if (!Array.isArray(stepsRaw)) return [];
    return stepsRaw
      .map((s) => {
        const item = s as { processName?: unknown; unitPrice?: unknown; price?: unknown; estimatedMinutes?: unknown };
        const processName = String(item?.processName || '').trim();
        const p = Number(item?.unitPrice ?? item?.price);
        const unitPrice = Number.isFinite(p) && p >= 0 ? p : 0;
        const m = Number(item?.estimatedMinutes);
        const estimatedMinutes = Number.isFinite(m) && m > 0 ? m : undefined;
        return { processName, unitPrice, estimatedMinutes };
      })
      .filter((s) => s.processName);
  } catch {
    return [];
  }
};

const TemplateCenter: React.FC = () => {
  const { modal, message } = App.useApp();
  const { user } = useAuth();
  const { modalWidth, isMobile } = useViewport();
  const [queryForm] = Form.useForm();
  const [createForm] = Form.useForm();
  const [applyForm] = Form.useForm();
  const [progressForm] = Form.useForm();
  const [processPriceForm] = Form.useForm();

  const [styleNoOptions, setStyleNoOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [styleNoLoading, setStyleNoLoading] = useState(false);
  const styleNoReqSeq = useRef(0);
  const styleNoTimerRef = useRef<number | undefined>(undefined);

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TemplateLibrary[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const pageRef = useRef(1);
  const pageSizeRef = useRef(10);

  const [createOpen, setCreateOpen] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressSaving, setProgressSaving] = useState(false);
  const [progressEditing, setProgressEditing] = useState<TemplateLibrary | null>(null);
  const [processPriceOpen, setProcessPriceOpen] = useState(false);
  const [processPriceSaving, setProcessPriceSaving] = useState(false);
  const [processPriceEditingRow, setProcessPriceEditingRow] = useState<TemplateLibrary | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editingRow, setEditingRow] = useState<TemplateLibrary | null>(null);
  const [editTableData, setEditTableData] = useState<unknown>(null);
  const [activeRow, setActiveRow] = useState<TemplateLibrary | null>(null);
  const [viewContent, setViewContent] = useState<string>('');
  const [viewObj, setViewObj] = useState<unknown>(null);

  const isAdminUser = useMemo(() => isAdminUserFn(user), [user]);

  const isLocked = (row?: TemplateLibrary | null) => {
    const v = Number(row?.locked);
    return Number.isFinite(v) && v === 1;
  };


  const normalizeStageName = (v: unknown) => String(v ?? '').trim().replace(/\s+/g, '');

  const isProductionStage = (name: string) => {
    const n = normalizeStageName(name);
    if (!n) return false;
    return n.includes('生产') || n.includes('车缝') || n.includes('缝制') || n.includes('缝纫') || n.includes('车工');
  };

  const isIroningStage = (name: string) => {
    const n = normalizeStageName(name);
    if (!n) return false;
    return n.includes('整烫') || n.includes('熨烫');
  };

  const isCuttingStage = (name: string) => {
    const n = normalizeStageName(name);
    if (!n) return false;
    return n.includes('裁剪') || n.includes('裁床') || n.includes('剪裁') || n.includes('开裁');
  };

  const isShipmentStage = (name: string) => {
    const n = normalizeStageName(name);
    if (!n) return false;
    return n.includes('出货') || n.includes('发货') || n.includes('发运');
  };

  const isQualityStage = (name: string) => {
    const n = normalizeStageName(name);
    if (!n) return false;
    return n.includes('质检') || n.includes('检验') || n.includes('品检') || n.includes('验货');
  };

  const isPackagingStage = (name: string) => {
    const n = normalizeStageName(name);
    if (!n) return false;
    return n.includes('包装') || n.includes('后整') || n.includes('打包') || n.includes('装箱');
  };

  const stageNameMatches = (stageName: string, recordProcessName: string) => {
    const a = normalizeStageName(stageName);
    const b = normalizeStageName(recordProcessName);
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.includes(b) || b.includes(a)) return true;
    if (isCuttingStage(a) && isCuttingStage(b)) return true;
    if (isQualityStage(a) && isQualityStage(b)) return true;
    if (isPackagingStage(a) && isPackagingStage(b)) return true;
    if (isIroningStage(a) && isIroningStage(b)) return true;
    if (isProductionStage(a) && isProductionStage(b)) return true;
    if (isShipmentStage(a) && isShipmentStage(b)) return true;
    return false;
  };

  const [processPriceEditing, setProcessPriceEditing] = useState<TemplateLibrary | null>(null);
  const lastLoadedPriceStyleNoRef = useRef<string>('');
  const draggingNodeIndexRef = useRef<number | null>(null);
  const [nodeDragOverIndex, setNodeDragOverIndex] = useState<number | null>(null);

  const loadProcessPriceForStyle = useCallback(async (styleNo: string) => {
    const sn = String(styleNo || '').trim();
    if (!sn) return { tpl: null as TemplateLibrary | null, steps: [] as Array<{ processName: string; unitPrice: number; estimatedMinutes?: number }> };
    try {
      // 1. 尝试从 process_price 模板读取
      const res = await api.get<{ code: number; data: PageResp<TemplateLibrary> }>('/template-library/list', {
        params: {
          page: 1,
          pageSize: 50,
          templateType: 'process_price',
          sourceStyleNo: sn,
          keyword: '',
        },
      });
      let tpl: TemplateLibrary | null = null;
      let templateSteps: Array<{ processName: string; unitPrice: number; estimatedMinutes?: number }> = [];

      if (res.code === 200) {
        const records = Array.isArray(res.data?.records) ? (res.data.records as TemplateLibrary[]) : [];
        const list = [...records];
        const expectedKey = `style_${sn}`;
        const picked = list.find((t) => String(t?.templateKey || '').trim() === expectedKey) || list[0] || null;
        if (picked?.id) {
          tpl = picked;
          let content = String(picked.templateContent ?? '');
          try {
            const det = await api.get<{ code: number; data: TemplateLibrary }>(`/template-library/${picked.id}`);
            if (det.code === 200) {
              content = String(det.data?.templateContent ?? content);
            }
          } catch {
            // Intentionally empty
            // 忽略错误
          }
          templateSteps = parseProcessPriceSteps(content);
        }
      }

      // 2. 从 t_style_process 表读取实际单价（优先使用）
      let processSteps: Array<{ processName: string; unitPrice: number; estimatedMinutes?: number }> = [];
      try {
        // 先获取款号ID
        const styleRes = await api.get<{ code: number; data: { records: Array<{ id: string }> } }>('/style/info/list', {
          params: { page: 1, pageSize: 1, styleNo: sn },
        });
        if (styleRes.code === 200 && styleRes.data?.records?.length > 0) {
          const styleId = styleRes.data.records[0].id;
          const procRes = await api.get<{ code: number; data: Array<{ processName: string; price: number }> }>('/style/process/list', {
            params: { styleId },
          });
          if (procRes.code === 200 && Array.isArray(procRes.data)) {
            processSteps = procRes.data.map((p) => ({
              processName: String(p?.processName || '').trim(),
              unitPrice: Number(p?.price) || 0,
              estimatedMinutes: 0,
            })).filter((s) => s.processName);
          }
        }
      } catch {
        // Intentionally empty
        // 忽略错误
      }

      // 3. 合并数据：优先使用 t_style_process 的单价，回退到模板
      const steps = processSteps.length > 0 ? processSteps : templateSteps;

      return { tpl, steps };
    } catch {
      // Intentionally empty
      // 忽略错误
      return { tpl: null, steps: [] };
    }
  }, []);

  const watchProgressStyleNo = Form.useWatch('sourceStyleNo', progressForm);

  useEffect(() => {
    if (!progressOpen) {
      lastLoadedPriceStyleNoRef.current = '';
      return;
    }
    const sn = String(watchProgressStyleNo || '').trim();
    if (!sn) {
      setProcessPriceEditing(null);
      lastLoadedPriceStyleNoRef.current = '';
      return;
    }
    if (lastLoadedPriceStyleNoRef.current === sn) return;
    lastLoadedPriceStyleNoRef.current = sn;
    void (async () => {
      const loaded = await loadProcessPriceForStyle(sn);
      setProcessPriceEditing(loaded.tpl);
      if (loaded.steps.length) {
        progressForm.setFieldsValue({ priceSteps: loaded.steps });
      }
    })();
  }, [progressOpen, watchProgressStyleNo, progressForm, loadProcessPriceForStyle]);

  const openProgressCreate = () => {
    setProgressEditing(null);
    setProcessPriceEditing(null);
    progressForm.resetFields();
    progressForm.setFieldsValue({
      templateName: '进度模板',
      templateKey: '',
      sourceStyleNo: undefined,
      nodes: [{ name: '采购' }, { name: '裁剪' }, { name: '车缝' }, { name: '大烫' }, { name: '质检' }, { name: '包装' }, { name: '入库' }],
    });
    setProgressOpen(true);
  };

  const openProcessPriceCreate = () => {
    setProcessPriceEditingRow(null);
    processPriceForm.resetFields();
    processPriceForm.setFieldsValue({
      templateName: '工序单价模板',
      templateKey: '',
      sourceStyleNo: undefined,
      priceSteps: [
        { processName: '采购', unitPrice: 0, estimatedMinutes: 0 },
        { processName: '裁剪', unitPrice: 0, estimatedMinutes: 0 },
        { processName: '车缝', unitPrice: 0, estimatedMinutes: 0 },
        { processName: '大烫', unitPrice: 0, estimatedMinutes: 0 },
        { processName: '质检', unitPrice: 0, estimatedMinutes: 0 },
        { processName: '包装', unitPrice: 0, estimatedMinutes: 0 },
        { processName: '入库', unitPrice: 0, estimatedMinutes: 0 },
      ],
    });
    setProcessPriceOpen(true);
  };

  const openProgressEdit = async (row: TemplateLibrary) => {
    if (isLocked(row)) {
      message.error('模板已锁定，如需修改请先退回');
      return;
    }
    setProgressEditing(row);
    progressForm.resetFields();

    const templateType = String(row?.templateType || '').trim().toLowerCase();
    let content = String(row?.templateContent ?? '');
    if (row?.id) {
      try {
        const res = await api.get<{ code: number; data: TemplateLibrary }>(`/template-library/${row.id}`);
        if (res.code === 200) {
          content = String(res.data?.templateContent ?? content);
        }
      } catch {
        // Intentionally empty
        // 忽略错误
      }
    }

    // 如果是工序单价模板，解析 steps 而不是 nodes
    let items: Array<{ name: string; unitPrice?: number }> = [];
    let priceSteps: Array<{ processName: string; unitPrice: number; estimatedMinutes?: number }> = [];

    if (templateType === 'process_price') {
      // 工序单价模板：从 steps 解析
      priceSteps = parseProcessPriceSteps(content);
      items = priceSteps.map(s => ({ name: s.processName, unitPrice: s.unitPrice }));
    } else {
      // 进度单价模板：从 nodes 解析
      items = parseProgressNodeItems(content);
    }

    const styleNo = String(row.sourceStyleNo || '').trim();
    const loaded = styleNo ? await loadProcessPriceForStyle(styleNo) : { tpl: null, steps: [] as Array<{ processName: string; unitPrice: number; estimatedMinutes?: number }> };

    // 如果是工序单价模板，不需要设置 processPriceEditing（避免显示"已存在"标签）
    if (templateType !== 'process_price') {
      setProcessPriceEditing(loaded.tpl);
    } else {
      setProcessPriceEditing(null);
    }

    const finalPriceSteps = priceSteps.length > 0
      ? priceSteps
      : (loaded.steps.length
        ? loaded.steps
        : items.map((n) => ({ processName: String(n?.name || '').trim(), unitPrice: Number(n?.unitPrice) || 0, estimatedMinutes: 0 })).filter((s) => s.processName));

    progressForm.setFieldsValue({
      templateName: row.templateName,
      templateKey: row.templateKey,
      sourceStyleNo: row.sourceStyleNo || undefined,
      nodes: (items.length
        ? items
        : ['采购', '裁剪', '车缝', '大烫', '质检', '包装', '入库'].map((n) => ({ name: n }))
      ).map((n) => ({ name: String(n?.name || '').trim() })),
      priceSteps: finalPriceSteps,
    });
    setProgressOpen(true);
  };

  const submitProgress = async () => {
    try {
      const v = await progressForm.validateFields();
      const templateName = String(v.templateName || '').trim();
      if (!templateName) {
        message.error('请输入模板名称');
        return;
      }
      const templateKey = String(v.templateKey || '').trim() || `progress_custom_${Date.now()}`;
      const sourceStyleNo = String(v.sourceStyleNo || '').trim();
      const nodesRaw = Array.isArray(v.nodes) ? (v.nodes as ProgressNodeInput[]) : [];
      const names = nodesRaw.map((n) => String(n?.name || '').trim()).filter(Boolean);
      if (!names.length) {
        message.error('请至少添加一个环节');
        return;
      }
      const uniqNames = Array.from(new Set(names));
      if (uniqNames.length !== names.length) {
        message.error('环节名称不能重复');
        return;
      }

      const priceStepsRaw = Array.isArray((v as Record<string, unknown>)?.priceSteps) ? ((v as Record<string, unknown>).priceSteps as ProcessPriceStepInput[]) : [];
      const priceSteps = priceStepsRaw
        .map((s) => {
          const processName = String((s as Record<string, unknown>)?.processName || '').trim();
          const p = Number((s as Record<string, unknown>)?.unitPrice);
          const unitPrice = Number.isFinite(p) && p >= 0 ? p : 0;
          const m = Number((s as Record<string, unknown>)?.estimatedMinutes);
          const estimatedMinutes = Number.isFinite(m) && m > 0 ? m : undefined;
          return { processName, unitPrice, estimatedMinutes };
        })
        .filter((s) => s.processName);
      const priceNames = priceSteps.map((s) => s.processName);
      const uniqPriceNames = Array.from(new Set(priceNames));
      if (uniqPriceNames.length !== priceNames.length) {
        message.error('单价工序库的工序名称不能重复');
        return;
      }

      const entries = priceSteps.map((s) => ({ name: s.processName, unitPrice: s.unitPrice, key: normalizeStageName(s.processName) }));
      const resolveUnitPrice = (nodeName: string) => {
        const n = String(nodeName || '').trim();
        if (!n) return 0;
        const nk = normalizeStageName(n);
        const exact = entries.find((e) => e.key === nk);
        if (exact) return exact.unitPrice;
        const fuzzy = entries.find((e) => stageNameMatches(e.name, n));
        return fuzzy ? fuzzy.unitPrice : 0;
      };

      const nodes = names.map((name) => ({ name, unitPrice: resolveUnitPrice(name) }));
      const templateContent = JSON.stringify({ nodes: nodes.map((n) => ({ name: n.name, unitPrice: n.unitPrice })) });

      const saveProcessPriceTemplate = async () => {
        if (!sourceStyleNo) {
          return;
        }
        const sn = sourceStyleNo;
        const tplKey = `style_${sn}`;
        const tplName = `${sn}-工序单价模板`;
        const tplContent = JSON.stringify({
          steps: priceSteps.map((s) => ({
            processName: s.processName,
            unitPrice: s.unitPrice,
            estimatedMinutes: s.estimatedMinutes || undefined
          }))
        });
        if (processPriceEditing?.id) {
          const res = await api.put<{ code: number; message: string }>('/template-library', {
            id: processPriceEditing.id,
            templateType: 'process_price',
            templateKey: tplKey,
            templateName: tplName,
            sourceStyleNo: sn,
            templateContent: tplContent,
          });
          if (res.code !== 200) {
            throw new Error(res.message || '保存单价工序库失败');
          }
          return;
        }
        const existed = await loadProcessPriceForStyle(sn);
        if (existed.tpl?.id) {
          setProcessPriceEditing(existed.tpl);
          const res = await api.put<{ code: number; message: string }>('/template-library', {
            id: existed.tpl.id,
            templateType: 'process_price',
            templateKey: tplKey,
            templateName: tplName,
            sourceStyleNo: sn,
            templateContent: tplContent,
          });
          if (res.code !== 200) {
            throw new Error(res.message || '保存单价工序库失败');
          }
          return;
        }
        const res = await api.post<{ code: number; message: string }>('/template-library', {
          templateType: 'process_price',
          templateKey: tplKey,
          templateName: tplName,
          sourceStyleNo: sn,
          templateContent: tplContent,
        });
        if (res.code !== 200) {
          throw new Error(res.message || '保存单价工序库失败');
        }
      };

      setProgressSaving(true);

      // 判断当前编辑的是什么类型的模板
      const editingType = String(progressEditing?.templateType || '').trim().toLowerCase();

      if (editingType === 'process_price') {
        if (!progressEditing?.id) {
          message.error('保存失败');
          return;
        }
        // 如果编辑的是工序单价模板，只保存 steps
        const tplContent = JSON.stringify({
          steps: priceSteps.map((s) => ({
            processName: s.processName,
            unitPrice: s.unitPrice,
          }))
        });
        const res = await api.put<{ code: number; message: string }>('/template-library', {
          id: progressEditing.id,
          templateType: 'process_price',
          templateKey,
          templateName,
          sourceStyleNo: sourceStyleNo || null,
          templateContent: tplContent,
        });
        if (res.code !== 200) {
          message.error(res.message || '保存失败');
          return;
        }
        message.success('已保存并锁定');
      } else {
        // 如果编辑的是进度单价模板，保存 nodes 并同时保存工序单价库
        await saveProcessPriceTemplate();
        if (progressEditing?.id) {
          const res = await api.put<{ code: number; message: string }>('/template-library', {
            id: progressEditing.id,
            templateType: 'progress',
            templateKey,
            templateName,
            sourceStyleNo: sourceStyleNo || null,
            templateContent,
          });
          if (res.code !== 200) {
            message.error(res.message || '保存失败');
            return;
          }
          message.success('已保存并锁定');
        } else {
          const res = await api.post<{ code: number; message: string }>('/template-library', {
            templateType: 'progress',
            templateKey,
            templateName,
            sourceStyleNo: sourceStyleNo || null,
            templateContent,
          });
          if (res.code !== 200) {
            message.error(res.message || '保存失败');
            return;
          }
          message.success('已创建并锁定');
        }
      }

      setProgressOpen(false);
      setProgressEditing(null);
      fetchList({ page: 1 });
    } catch (e: unknown) {
      if (hasErrorFields(e)) return;
      message.error(getErrorMessage(e, '保存失败'));
    } finally {
      setProgressSaving(false);
    }
  };

  const submitProcessPrice = async () => {
    try {
      const v = await processPriceForm.validateFields();
      const templateName = String(v.templateName || '').trim();
      if (!templateName) {
        message.error('请输入模板名称');
        return;
      }
      const templateKey = String(v.templateKey || '').trim();
      const sourceStyleNo = String(v.sourceStyleNo || '').trim();

      const priceStepsRaw = Array.isArray((v as Record<string, unknown>)?.priceSteps) ? ((v as Record<string, unknown>).priceSteps as ProcessPriceStepInput[]) : [];
      const priceSteps = priceStepsRaw
        .map((s) => {
          const processName = String((s as Record<string, unknown>)?.processName || '').trim();
          const p = Number((s as Record<string, unknown>)?.unitPrice);
          const unitPrice = Number.isFinite(p) && p >= 0 ? p : 0;
          const m = Number((s as Record<string, unknown>)?.estimatedMinutes);
          const estimatedMinutes = Number.isFinite(m) && m > 0 ? m : undefined;
          return { processName, unitPrice, estimatedMinutes };
        })
        .filter((s) => s.processName);

      if (!priceSteps.length) {
        message.error('请至少添加一个工序');
        return;
      }

      const priceNames = priceSteps.map((s) => s.processName);
      const uniqPriceNames = Array.from(new Set(priceNames));
      if (uniqPriceNames.length !== priceNames.length) {
        message.error('工序名称不能重复');
        return;
      }

      const templateContent = JSON.stringify({
        steps: priceSteps.map((s) => ({
          processName: s.processName,
          unitPrice: s.unitPrice,
          estimatedMinutes: s.estimatedMinutes || undefined
        }))
      });

      setProcessPriceSaving(true);

      if (processPriceEditingRow?.id) {
        const res = await api.put<{ code: number; message: string }>('/template-library', {
          id: processPriceEditingRow.id,
          templateType: 'process_price',
          templateKey,
          templateName,
          sourceStyleNo: sourceStyleNo || null,
          templateContent,
        });
        if (res.code !== 200) {
          message.error(res.message || '保存失败');
          return;
        }
        message.success('已保存并锁定');
      } else {
        const res = await api.post<{ code: number; message: string }>('/template-library', {
          templateType: 'process_price',
          templateKey,
          templateName,
          sourceStyleNo: sourceStyleNo || null,
          templateContent,
        });
        if (res.code !== 200) {
          message.error(res.message || '保存失败');
          return;
        }
        message.success('已创建并锁定');
      }

      setProcessPriceOpen(false);
      setProcessPriceEditingRow(null);
      fetchList({ page: 1 });
    } catch (e: unknown) {
      if (hasErrorFields(e)) return;
      message.error(getErrorMessage(e, '保存失败'));
    } finally {
      setProcessPriceSaving(false);
    }
  };

  const openEdit = async (row: TemplateLibrary) => {
    // 先从服务器获取最新数据，确保 locked 状态是最新的
    let latestRow = row;
    if (row?.id) {
      try {
        const res = await api.get<{ code: number; data: TemplateLibrary }>(`/template-library/${row.id}`);
        if (res.code === 200 && res.data) {
          latestRow = res.data as TemplateLibrary;
        }
      } catch {
        // Intentionally empty
        // 忽略错误
      }
    }

    if (isLocked(latestRow)) {
      message.error('模板已锁定，如需修改请先退回');
      return;
    }
    const t = String(latestRow?.templateType || '').trim().toLowerCase();

    // 进度单价和工序单价都使用同一个友好编辑界面
    if (t === 'progress' || t === 'process_price') {
      openProgressEdit(latestRow);
      return;
    }

    setEditingRow(latestRow);
    let content = String(row?.templateContent ?? '');
    if (row?.id) {
      try {
        const res = await api.get<{ code: number; data: TemplateLibrary }>(`/template-library/${row.id}`);
        if (res.code === 200) {
          content = String(res.data?.templateContent ?? content);
        }
      } catch {
        // Intentionally empty
        // 忽略错误
      }
    }

    // 解析JSON为表格数据
    try {
      const parsed = JSON.parse(content);
      setEditTableData(parsed);
    } catch {
      // Intentionally empty
      // 忽略错误
      setEditTableData(null);
    }

    setEditOpen(true);

    // 延迟操作表单，等待 Modal 和 Form 渲染完成
    setTimeout(() => {
      createForm.resetFields();
      createForm.setFieldsValue({
        templateName: row.templateName,
        templateKey: row.templateKey,
        templateType: row.templateType,
        sourceStyleNo: row.sourceStyleNo || undefined,
      });
    }, 0);
  };

  const submitEdit = async () => {
    try {
      const v = await createForm.validateFields();
      const templateName = String(v.templateName || '').trim();
      if (!templateName) {
        message.error('请输入模板名称');
        return;
      }
      const templateType = String(v.templateType || '').trim();
      if (!templateType) {
        message.error('请选择模板类型');
        return;
      }

      // 将表格数据转换为JSON字符串
      let templateContent = '';
      if (editTableData) {
        templateContent = JSON.stringify(editTableData);
      } else {
        message.error('模板内容无效');
        return;
      }

      setEditSaving(true);
      const body = {
        id: editingRow?.id,
        templateName,
        templateKey: String(v.templateKey || '').trim() || undefined,
        templateType,
        sourceStyleNo: v.sourceStyleNo || undefined,
        templateContent,
      };

      const res = await api.put<{ code: number; message: string }>(`/template-library/${editingRow?.id}`, body);
      if (res.code !== 200) {
        message.error(res.message || '更新失败');
        return;
      }

      message.success('更新成功');
      setEditOpen(false);
      setEditingRow(null);
      setEditTableData(null);
      fetchList({ page: 1 });
    } catch (e: unknown) {
      if (hasErrorFields(e)) return;
      message.error(getErrorMessage(e, '更新失败'));
    } finally {
      setEditSaving(false);
    }
  };

  const handleRollback = async (row: TemplateLibrary) => {
    if (!row?.id) return;
    if (!isAdminUser) {
      message.error('仅管理员可退回修改');
      return;
    }
    let reason = '';
    modal.confirm({
      title: '退回该模板为可编辑？',
      content: (
        <div>
          <div style={{ marginBottom: 8 }}>{String(row.templateName || '')}</div>
          <div style={{ marginBottom: 12, fontWeight: 600 }}>退回原因</div>
          <Input.TextArea
            placeholder="请输入退回原因"
            autoSize={{ minRows: 3, maxRows: 6 }}
            maxLength={200}
            showCount
            onChange={(e) => {
              reason = String(e?.target?.value || '');
            }}
          />
        </div>
      ),
      okText: '确认退回',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        const remark = String(reason || '').trim();
        if (!remark) {
          message.error('请输入退回原因');
          return Promise.reject(new Error('请输入退回原因'));
        }
        const res = await api.post<{ code: number; message: string }>(`/template-library/${row.id}/rollback`, { reason: remark });
        if (res.code !== 200) {
          message.error(res.message || '退回失败');
          return;
        }
        message.success('已退回，可修改');
        fetchList({ page: 1 });
      },
    });
  };

  const fetchStyleNoOptions = useCallback(async (keyword?: string) => {
    const seq = (styleNoReqSeq.current += 1);
    setStyleNoLoading(true);
    try {
      const res = await api.get<{ code: number; data: { records: Array<{ styleNo: string }> } }>('/style/info/list', {
        params: {
          page: 1,
          pageSize: 200,
          styleNo: String(keyword ?? '').trim(),
        },
      });
      if (seq !== styleNoReqSeq.current) return;
      if (res.code !== 200) return;
      const records = (res.data?.records || []) as Array<{ styleNo?: unknown }>;
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
  }, []);

  const scheduleFetchStyleNos = (keyword: string) => {
    if (styleNoTimerRef.current != null) {
      window.clearTimeout(styleNoTimerRef.current);
    }
    styleNoTimerRef.current = window.setTimeout(() => {
      fetchStyleNoOptions(keyword);
    }, 250);
  };

  const fetchList = useCallback(async (next?: { page?: number; pageSize?: number }) => {
    const p = next?.page ?? pageRef.current;
    const ps = next?.pageSize ?? pageSizeRef.current;
    setLoading(true);
    try {
      const v = queryForm.getFieldsValue();
      const res = await api.get<{ code: number; message: string; data: PageResp<TemplateLibrary> }>('/template-library/list', {
        params: {
          page: p,
          pageSize: ps,
          templateType: v.templateType || '',
          keyword: v.keyword || '',
          sourceStyleNo: v.sourceStyleNo || '',
        },
      });
      if (res.code !== 200) {
        message.error(res.message || '获取模板列表失败');
        return;
      }
      const pageData: PageResp<TemplateLibrary> = res.data || { records: [], total: 0 };
      setData(Array.isArray(pageData.records) ? pageData.records : []);
      setTotal(Number(pageData.total || 0));
      pageRef.current = p;
      pageSizeRef.current = ps;
      setPage(p);
      setPageSize(ps);
    } catch (e: unknown) {
      message.error(getErrorMessage(e, '获取模板列表失败'));
    } finally {
      setLoading(false);
    }
  }, [queryForm, message]);

  useEffect(() => {
    fetchList({ page: 1, pageSize: pageSizeRef.current });
    fetchStyleNoOptions('');
  }, [fetchList, fetchStyleNoOptions]);

  const templateTypeOptions = useMemo(
    () => [
      { value: '', label: '全部类型' },
      { value: 'bom', label: 'BOM' },
      { value: 'size', label: '尺寸' },
      { value: 'process', label: '工艺' },
      { value: 'process_price', label: '工序单价' },
      { value: 'progress', label: '进度' },
    ],
    []
  );

  const submitCreate = async () => {
    try {
      const v = await createForm.validateFields();
      const sourceStyleNo = String(v.sourceStyleNo || '').trim();
      if (!sourceStyleNo) {
        message.error('请输入来源款号');
        return;
      }
      const templateTypes = Array.isArray(v.templateTypes) ? v.templateTypes : [];

      const res = await api.post<{ code: number; message: string }>('/template-library/create-from-style', {
        sourceStyleNo,
        templateTypes,
      });
      if (res.code !== 200) {
        message.error(res.message || '生成模板失败');
        return;
      }
      message.success('模板已生成/更新');
      setCreateOpen(false);
      fetchList({ page: 1 });
    } catch (e: unknown) {
      if (hasErrorFields(e)) return;
      message.error(getErrorMessage(e, '生成模板失败'));
    }
  };

  const submitApply = async () => {
    if (!activeRow?.id) {
      message.error('模板不完整');
      return;
    }
    const t = String(activeRow?.templateType || '').trim().toLowerCase();
    if (t === 'progress') {
      message.info('进度模板请在“生产进度”页面导入');
      return;
    }
    try {
      const v = await applyForm.validateFields();
      const targetStyleNo = String(v.targetStyleNo || '').trim();
      if (!targetStyleNo) {
        message.error('请输入目标款号');
        return;
      }
      const res = await api.post<{ code: number; message: string }>('/template-library/apply-to-style', {
        templateId: activeRow.id,
        targetStyleNo,
        mode: v.mode,
      });
      if (res.code !== 200) {
        message.error(res.message || '导入失败');
        return;
      }
      message.success('已套用到目标款号');
      setApplyOpen(false);
    } catch (e: unknown) {
      if (hasErrorFields(e)) return;
      message.error(getErrorMessage(e, '套用失败'));
    }
  };

  const openView = async (row: TemplateLibrary) => {
    setActiveRow(row);
    setViewContent('');
    setViewObj(null);
    setViewOpen(true);
    if (!row?.id) return;
    try {
      const res = await api.get<{ code: number; message: string; data: TemplateLibrary }>(`/template-library/${row.id}`);
      if (res.code !== 200) {
        message.error(res.message || '获取模板失败');
        return;
      }
      const tpl: TemplateLibrary = res.data;
      const raw = String(tpl?.templateContent ?? '');
      try {
        const obj = JSON.parse(raw);
        setViewObj(obj);
        setViewContent(JSON.stringify(obj, null, 2));
      } catch {
        // Intentionally empty
        // 忽略错误
        setViewContent(raw);
      }
    } catch (e: unknown) {
      message.error(getErrorMessage(e, '获取模板失败'));
    }
  };

  const renderVisualContent = () => {
    const t = String(activeRow?.templateType || '').trim().toLowerCase();
    const obj = viewObj;

    if (!obj || typeof obj !== 'object') {
      return (
        <pre style={{ margin: 0, maxHeight: '60vh', overflow: 'auto', background: '#0b1020', color: '#e6edf3', padding: 12, borderRadius: 6 }}>
          {viewContent || ''}
        </pre>
      );
    }

    if (t === 'progress') {
      const nodesRaw = Array.isArray((obj as Record<string, unknown>)?.nodes)
        ? ((obj as Record<string, unknown>).nodes as Array<Record<string, unknown>>)
        : [];
      const nodes = nodesRaw.map((n) => {
        const name = String(n?.name ?? '').trim();
        const unitPriceValue = Number(n?.unitPrice);
        const unitPrice = Number.isFinite(unitPriceValue) ? unitPriceValue : undefined;
        return { name, unitPrice };
      });
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div style={{ border: '1px solid #d9d9d9', padding: 8, borderRadius: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>进度节点</div>
            <div style={{ maxHeight: 480, overflow: 'auto' }}>
              {nodes.map((n, idx) => (
                <div key={idx} style={{ padding: '6px 8px', borderBottom: '1px solid #f0f0f0', fontSize: 13 }}>
                  {String(n?.name || '-')}
                </div>
              ))}
              {nodes.length === 0 && <div style={{ padding: 12, textAlign: 'center', color: '#999' }}>暂无数据</div>}
            </div>
          </div>
          <div style={{ border: '1px solid #d9d9d9', padding: 8, borderRadius: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>单价工序库</div>
            <div style={{ maxHeight: 480, overflow: 'auto' }}>
              {nodes.filter((n) => n?.unitPrice != null && n.unitPrice !== 0).map((n, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', borderBottom: '1px solid #f0f0f0', fontSize: 13 }}>
                  <span>{String(n?.name || '-')}</span>
                  <span style={{ fontWeight: 500 }}>¥ {Number(n?.unitPrice || 0).toFixed(2)}</span>
                </div>
              ))}
              {nodes.filter((n) => n?.unitPrice != null && n.unitPrice !== 0).length === 0 &&
                <div style={{ padding: 12, textAlign: 'center', color: '#999' }}>暂无单价数据</div>
              }
            </div>
          </div>
        </div>
      );
    }

    if (t === 'process' || t === 'process_price') {
      const stepsRaw = Array.isArray((obj as Record<string, unknown>)?.steps)
        ? ((obj as Record<string, unknown>).steps as Array<Record<string, unknown>>)
        : [];
      const steps = stepsRaw.map((s) => {
        const processName = String(s?.processName ?? '').trim();
        const processCode = s?.processCode == null ? '' : String(s.processCode);
        const machineType = s?.machineType == null ? '' : String(s.machineType);
        const standardTime = s?.standardTime == null ? '' : String(s.standardTime);
        const unitPrice = s?.unitPrice;
        const price = s?.price;
        return { processName, processCode, machineType, standardTime, unitPrice, price };
      });
      const unitField = t === 'process_price' ? 'unitPrice' : 'price';
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div style={{ border: '1px solid #d9d9d9', padding: 8, borderRadius: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
              {t === 'process_price' ? '工序节点' : '工艺节点'}
            </div>
            <div style={{ maxHeight: 480, overflow: 'auto' }}>
              {steps.map((s, idx) => (
                <div key={idx} style={{ padding: '6px 8px', borderBottom: '1px solid #f0f0f0', fontSize: 13 }}>
                  <div>{String(s?.processName || '-')}</div>
                  {s?.processCode && <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>编码: {s.processCode}</div>}
                  {t === 'process' && s?.machineType && <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>机器: {s.machineType}</div>}
                  {t === 'process' && s?.standardTime && <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>工时: {s.standardTime}秒</div>}
                </div>
              ))}
              {steps.length === 0 && <div style={{ padding: 12, textAlign: 'center', color: '#999' }}>暂无数据</div>}
            </div>
          </div>
          <div style={{ border: '1px solid #d9d9d9', padding: 8, borderRadius: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
              {t === 'process_price' ? '单价工序库' : '工价工序库'}
            </div>
            <div style={{ maxHeight: 480, overflow: 'auto' }}>
              {steps.filter((s) => {
                const price = s?.[unitField];
                return price != null && price !== 0;
              }).map((s, idx) => {
                const price = Number(s?.[unitField] || 0);
                return (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', borderBottom: '1px solid #f0f0f0', fontSize: 13 }}>
                    <span>{String(s?.processName || '-')}</span>
                    <span style={{ fontWeight: 500 }}>¥ {price.toFixed(2)}</span>
                  </div>
                );
              })}
              {steps.filter((s) => {
                const price = s?.[unitField];
                return price != null && price !== 0;
              }).length === 0 &&
                <div style={{ padding: 12, textAlign: 'center', color: '#999' }}>暂无价格数据</div>
              }
            </div>
          </div>
        </div>
      );
    }

    if (t === 'bom') {
      const rows = Array.isArray((obj as Record<string, unknown>)?.rows) ? ((obj as Record<string, unknown>).rows as Record<string, unknown>[]) : [];
      return (
        <Table
          size="small"
          rowKey={(r: Record<string, unknown>) => String(r?.materialCode || r?.materialName || '')}
          pagination={false}
          scroll={{ x: 'max-content', y: 520 }}
          columns={[
            { title: '类型', dataIndex: 'materialType', key: 'materialType', width: 140, render: (v: unknown) => getMaterialTypeLabel(v) },
            { title: '物料名称', dataIndex: 'materialName', key: 'materialName', width: 180, ellipsis: true, render: (v: unknown) => String(v || '-') },
            { title: '颜色', dataIndex: 'color', key: 'color', width: 110, render: (v: unknown) => String(v || '-') },
            { title: '规格', dataIndex: 'specification', key: 'specification', width: 160, ellipsis: true, render: (v: unknown) => String(v || '-') },
            { title: '单位', dataIndex: 'unit', key: 'unit', width: 90, render: (v: unknown) => String(v || '-') },
            {
              title: '单件用量',
              dataIndex: 'usageAmount',
              key: 'usageAmount',
              width: 110,
              align: 'right',
              render: (v: unknown) => {
                const n = typeof v === 'number' ? v : Number(v);
                return Number.isFinite(n) ? n : '-';
              },
            },
            {
              title: '损耗率(%)',
              dataIndex: 'lossRate',
              key: 'lossRate',
              width: 110,
              align: 'right',
              render: (v: unknown) => {
                const n = typeof v === 'number' ? v : Number(v);
                return Number.isFinite(n) ? n : '-';
              },
            },
            {
              title: '单价',
              dataIndex: 'unitPrice',
              key: 'unitPrice',
              width: 110,
              align: 'right',
              render: (v: unknown) => {
                const n = typeof v === 'number' ? v : Number(v);
                return Number.isFinite(n) ? n.toFixed(2) : '-';
              },
            },
            { title: '供应商', dataIndex: 'supplier', key: 'supplier', width: 160, ellipsis: true, render: (v: unknown) => String(v || '-') },
          ]}
          dataSource={rows}
        />
      );
    }

    if (t === 'size' && isSizeTableData(obj)) {
      const sizes = obj.sizes.map((s) => String(s || '').trim()).filter(Boolean);
      const parts = obj.parts as Record<string, unknown>[];

      const baseCols: ColumnsType<Record<string, unknown>> = [
        { title: '部位', dataIndex: 'partName', key: 'partName', width: 160, render: (v: unknown) => String(v || '-') },
        { title: '测量方式', dataIndex: 'measureMethod', key: 'measureMethod', width: 140, render: (v: unknown) => String(v || '-') },
        {
          title: '公差',
          dataIndex: 'tolerance',
          key: 'tolerance',
          width: 100,
          align: 'right',
          render: (v: unknown) => {
            const n = typeof v === 'number' ? v : Number(v);
            return Number.isFinite(n) ? n : '-';
          },
        },
      ];

      const sizeCols: ColumnsType<Record<string, unknown>> = sizes.map((sz) => ({
        title: sz,
        dataIndex: ['values', sz],
        key: `size_${sz}`,
        width: 110,
        align: 'right',
        render: (v: unknown) => {
          const n = typeof v === 'number' ? v : Number(v);
          return Number.isFinite(n) ? n : '-';
        },
      }));

      return (
        <Table
          size="small"
          rowKey={(r: Record<string, unknown>) => String(r?.partName || '')}
          pagination={false}
          scroll={{ x: 'max-content', y: 520 }}
          columns={[...baseCols, ...sizeCols]}
          dataSource={parts}
        />
      );
    }

    return (
      <pre style={{ margin: 0, maxHeight: '60vh', overflow: 'auto', background: '#0b1020', color: '#e6edf3', padding: 12, borderRadius: 6 }}>
        {viewContent || ''}
      </pre>
    );
  };

  const handleDelete = async (row: TemplateLibrary) => {
    if (!row?.id) return;
    modal.confirm({
      title: '确认删除该模板？',
      content: `${row.templateName || ''}`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          const res = await api.delete<{ code: number; message: string }>(`/template-library/${row.id}`);
          if (res.code !== 200) {
            message.error(res.message || '删除失败');
            return;
          }
          message.success('已删除');
          fetchList({ page: 1 });
        } catch (e: unknown) {
          const msg = e instanceof Error
            ? e.message
            : (typeof e === 'object' && e && 'message' in e ? String((e as { message?: unknown }).message || '') : '');
          message.error(msg || '删除失败');
        }
      },
    });
  };

  type TemplateLibraryRecord = TemplateLibrary & Record<string, unknown>;
  type SizeTablePart = { partName: string; values?: Record<string, string> };
  type SizeTableData = { sizes: string[]; parts: SizeTablePart[] };
  type BomTableRow = { materialName?: string; spec?: string; quantity?: string | number; unit?: string };
  type BomTableData = BomTableRow[];

  const isSizeTableData = (data: unknown): data is SizeTableData => {
    if (!data || typeof data !== 'object') return false;
    const rec = data as Record<string, unknown>;
    return Array.isArray(rec.sizes) && Array.isArray(rec.parts);
  };

  const isBomTableData = (data: unknown): data is BomTableData => Array.isArray(data);

  const columns: ColumnsType<TemplateLibraryRecord> = [
    {
      title: '名称',
      dataIndex: 'templateName',
      key: 'templateName',
      width: 220,
      render: (v) => String(v || '-'),
    },
    {
      title: '类型',
      dataIndex: 'templateType',
      key: 'templateType',
      width: 90,
      render: (v) => <Tag color={typeColor(String(v || ''))}>{typeLabel(String(v || ''))}</Tag>,
    },
    {
      title: (
        <Space size={6}>
          <span>标识</span>
          <Tooltip title="系统内部用来识别模板来源/用途，部分场景用于自动套用">
            <span style={{ cursor: 'help', color: 'rgba(0,0,0,0.45)' }}>?</span>
          </Tooltip>
        </Space>
      ),
      dataIndex: 'templateKey',
      key: 'templateKey',
      width: 180,
      render: (v) => {
        const formatted = formatTemplateKey(v);
        if (!formatted.full) return '-';
        return (
          <Text
            ellipsis={{ tooltip: formatted.full }}
            style={{ maxWidth: 160, display: 'inline-block' }}
          >
            {formatted.text}
          </Text>
        );
      },
    },
    {
      title: '来源款号',
      dataIndex: 'sourceStyleNo',
      key: 'sourceStyleNo',
      width: 140,
      render: (v) => String(v || '-'),
    },
    {
      title: '更新时间',
      dataIndex: 'updateTime',
      key: 'updateTime',
      width: 170,
      render: (v) => String(v || '-'),
    },
    {
      title: '操作人',
      dataIndex: 'operatorName',
      key: 'operatorName',
      width: 120,
      render: (v) => String(v || '-'),
    },
    {
      title: '状态',
      dataIndex: 'locked',
      key: 'locked',
      width: 110,
      render: (_: unknown, row) => (isLocked(row) ? <Tag color="default">已锁定</Tag> : <Tag color="success">可编辑</Tag>),
    },
    {
      title: '操作',
      key: 'action',
      width: 170,
      render: (_, row) => {
        const isProgress = String(row?.templateType || '').trim().toLowerCase() === 'progress';
        const locked = isLocked(row);

        const primaryAction: RowAction = isProgress
          ? (locked
            ? {
              key: 'rollback',
              label: '退回',
              title: '退回',
              icon: <RollbackOutlined />,
              onClick: () => handleRollback(row),
            }
            : {
              key: 'edit',
              label: '编辑',
              title: '编辑',
              icon: <EditOutlined />,
              onClick: () => openProgressEdit(row),
            })
          : (locked
            ? {
              key: 'rollback',
              label: '退回',
              title: '退回',
              icon: <RollbackOutlined />,
              onClick: () => handleRollback(row),
            }
            : {
              key: 'edit',
              label: '编辑',
              title: '编辑',
              icon: <EditOutlined />,
              onClick: () => openEdit(row),
            });

        return (
          <RowActions
            actions={[
              {
                key: 'view',
                label: '查看',
                title: '查看',
                icon: <EyeOutlined />,
                onClick: () => openView(row),
                primary: true,
              },
              { ...primaryAction, primary: true },
              {
                key: 'delete',
                label: '删除',
                title: '删除',
                icon: <DeleteOutlined />,
                danger: true,
                onClick: () => handleDelete(row),
              },
            ]}
          />
        );
      },
    },
  ];

  return (
    <Layout>
      <Card
        className="page-card"
        title="单价流程"
        extra={
          <Space>
            <Button type="primary" onClick={openProgressCreate}>进度模板</Button>
            <Button onClick={openProcessPriceCreate}>工序单价</Button>
          </Space>
        }
      >
        <Form form={queryForm} layout="inline" initialValues={{ templateType: '' }}>
          <Form.Item name="templateType" label="类型">
            <Select style={{ width: 160 }} options={templateTypeOptions} />
          </Form.Item>
          <Form.Item name="keyword" label="名称">
            <Input style={{ width: 180 }} placeholder="模糊搜索" allowClear />
          </Form.Item>
          <Form.Item name="sourceStyleNo" label="来源款号">
            <Select
              allowClear
              showSearch={{ filterOption: false, onSearch: scheduleFetchStyleNos }}
              loading={styleNoLoading}
              style={{ width: 200 }}
              placeholder="搜索/选择款号"
              options={styleNoOptions}
              onOpenChange={(open) => {
                if (open && !styleNoOptions.length) fetchStyleNoOptions('');
              }}
            />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" onClick={() => fetchList({ page: 1 })}>
                查询
              </Button>
              <Button
                onClick={() => {
                  queryForm.resetFields();
                  fetchList({ page: 1 });
                }}
              >
                重置
              </Button>
            </Space>
          </Form.Item>
        </Form>

        <div style={{ height: 12 }} />

        <ResizableTable<TemplateLibraryRecord>
          rowKey={(r) => String(r.id || r.templateKey)}
          columns={columns}
          dataSource={data as TemplateLibraryRecord[]}
          loading={loading}
          scroll={{ x: 'max-content', y: isMobile ? 360 : 560 }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            onChange: (p, ps) => fetchList({ page: p, pageSize: ps }),
          }}
        />
      </Card>

      <ResizableModal
        title="按款号生成模板"
        open={createOpen}
        centered
        onCancel={() => setCreateOpen(false)}
        onOk={submitCreate}
        okText="生成"
        cancelText="取消"
        width={modalWidth}
      >
        <Form form={createForm} layout="vertical">
          <Form.Item name="sourceStyleNo" label="来源款号" rules={[{ required: true, message: '请输入来源款号' }]}>
            <Select
              allowClear
              showSearch={{ filterOption: false, onSearch: scheduleFetchStyleNos }}
              loading={styleNoLoading}
              placeholder="搜索/选择款号"
              options={styleNoOptions}
              onOpenChange={(open) => {
                if (open && !styleNoOptions.length) fetchStyleNoOptions('');
              }}
            />
          </Form.Item>
          <Form.Item name="templateTypes" label="生成类型">
            <Select
              mode="multiple"
              options={[
                { value: 'bom', label: 'BOM' },
                { value: 'size', label: '尺寸' },
                { value: 'process', label: '工艺' },
                { value: 'process_price', label: '工序单价' },
                { value: 'progress', label: '进度' },
              ]}
            />
          </Form.Item>
        </Form>
      </ResizableModal>

      <ResizableModal
        title="套用到目标款号"
        open={applyOpen}
        centered
        onCancel={() => setApplyOpen(false)}
        onOk={submitApply}
        okText="套用"
        cancelText="取消"
        width={modalWidth}
      >
        <Form form={applyForm} layout="vertical">
          <Form.Item label="模板" >
            <Input value={activeRow ? `${activeRow.templateName || ''}（${typeLabel(activeRow.templateType)}）` : ''} disabled />
          </Form.Item>
          <Form.Item name="targetStyleNo" label="目标款号" rules={[{ required: true, message: '请输入目标款号' }]}>
            <Select
              allowClear
              showSearch={{ filterOption: false, onSearch: scheduleFetchStyleNos }}
              loading={styleNoLoading}
              placeholder="搜索/选择款号"
              options={styleNoOptions}
              onOpenChange={(open) => {
                if (open && !styleNoOptions.length) fetchStyleNoOptions('');
              }}
            />
          </Form.Item>
          <Form.Item name="mode" label="套用方式" initialValue="overwrite">
            <Select
              options={[
                { value: 'overwrite', label: '覆盖' },
                { value: 'append', label: '追加' },
              ]}
            />
          </Form.Item>
        </Form>
      </ResizableModal>

      <ResizableModal
        title={editingRow?.id ? '编辑模板' : '编辑模板'}
        open={editOpen}
        centered
        onCancel={() => {
          setEditOpen(false);
          setEditingRow(null);
        }}
        onOk={submitEdit}
        okText="保存"
        cancelText="取消"
        confirmLoading={editSaving}
        width={modalWidth}
        initialHeight={typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800}
        scaleWithViewport
      >
        <Form form={createForm} layout="vertical">
          <Form.Item name="templateName" label="模板名称" rules={[{ required: true, message: '请输入模板名称' }]}>
            <Input placeholder="例如：外协款-BOM模板" />
          </Form.Item>
          <Form.Item name="templateKey" label="模板标识(可选)">
            <Input placeholder="不填则保持原标识" />
          </Form.Item>
          <Form.Item name="templateType" label="模板类型" rules={[{ required: true, message: '请选择模板类型' }]}>
            <Select
              placeholder="请选择"
              options={[
                { value: 'bom', label: 'BOM' },
                { value: 'size', label: '尺寸' },
                { value: 'process', label: '工艺' },
                { value: 'process_price', label: '工序单价' },
              ]}
              disabled
            />
          </Form.Item>
          <Form.Item name="sourceStyleNo" label="来源款号(可选)">
            <Select
              allowClear
              showSearch={{ filterOption: false, onSearch: scheduleFetchStyleNos }}
              loading={styleNoLoading}
              placeholder="搜索/选择款号"
              options={styleNoOptions}
              onOpenChange={(open) => {
                if (open && !styleNoOptions.length) fetchStyleNoOptions('');
              }}
            />
          </Form.Item>
          <Form.Item label="模板内容">
            {editTableData ? (
              <div style={{ maxHeight: 400, overflow: 'auto', border: '1px solid #d9d9d9', padding: 8 }}>
                {(() => {
                  const type = editingRow?.templateType;
                  // 尺寸表模板
                  if (type === 'size' && isSizeTableData(editTableData)) {
                    return (
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr>
                            <th style={{ border: '1px solid #ccc', padding: 4, background: '#f5f5f5' }}>部位</th>
                            {editTableData.sizes.map((size: string, idx: number) => (
                              <th key={idx} style={{ border: '1px solid #ccc', padding: 4, background: '#f5f5f5' }}>
                                <Input
                                  size="small"
                                  value={size}
                                  onChange={(e) => {
                                    const newData = { ...editTableData };
                                    newData.sizes[idx] = e.target.value;
                                    setEditTableData(newData);
                                  }}
                                  style={{ border: 'none', background: 'transparent', textAlign: 'center' }}
                                />
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {editTableData.parts.map((part: SizeTablePart, pIdx: number) => (
                            <tr key={pIdx}>
                              <td style={{ border: '1px solid #ccc', padding: 4 }}>
                                <Input
                                  size="small"
                                  value={part.partName}
                                  onChange={(e) => {
                                    const newData = { ...editTableData, parts: [...editTableData.parts] };
                                    const part = newData.parts[pIdx];
                                    if (!part) return;
                                    newData.parts[pIdx] = { ...part, partName: e.target.value };
                                    setEditTableData(newData);
                                  }}
                                  style={{ border: 'none' }}
                                />
                              </td>
                              {editTableData.sizes.map((size: string, sIdx: number) => (
                                <td key={sIdx} style={{ border: '1px solid #ccc', padding: 4 }}>
                                  <Input
                                    size="small"
                                    value={part.values?.[size] || ''}
                                    onChange={(e) => {
                                      const newData = { ...editTableData, parts: [...editTableData.parts] };
                                      const part = newData.parts[pIdx];
                                      if (!part) return;
                                      const values = { ...(part.values || {}) } as Record<string, string>;
                                      values[size] = e.target.value;
                                      newData.parts[pIdx] = { ...part, values };
                                      setEditTableData(newData);
                                    }}
                                    style={{ border: 'none' }}
                                  />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    );
                  }
                  // BOM表模板
                  if (type === 'bom' && isBomTableData(editTableData)) {
                    return (
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr>
                            <th style={{ border: '1px solid #ccc', padding: 4, background: '#f5f5f5' }}>物料名称</th>
                            <th style={{ border: '1px solid #ccc', padding: 4, background: '#f5f5f5' }}>规格</th>
                            <th style={{ border: '1px solid #ccc', padding: 4, background: '#f5f5f5' }}>用量</th>
                            <th style={{ border: '1px solid #ccc', padding: 4, background: '#f5f5f5' }}>单位</th>
                          </tr>
                        </thead>
                        <tbody>
                          {editTableData.map((item: BomTableRow, idx: number) => (
                            <tr key={idx}>
                              <td style={{ border: '1px solid #ccc', padding: 4 }}>
                                <Input
                                  size="small"
                                  value={item.materialName || ''}
                                  onChange={(e) => {
                                    const newData = [...editTableData];
                                    newData[idx].materialName = e.target.value;
                                    setEditTableData(newData);
                                  }}
                                  style={{ border: 'none' }}
                                />
                              </td>
                              <td style={{ border: '1px solid #ccc', padding: 4 }}>
                                <Input
                                  size="small"
                                  value={item.spec || ''}
                                  onChange={(e) => {
                                    const newData = [...editTableData];
                                    newData[idx].spec = e.target.value;
                                    setEditTableData(newData);
                                  }}
                                  style={{ border: 'none' }}
                                />
                              </td>
                              <td style={{ border: '1px solid #ccc', padding: 4 }}>
                                <Input
                                  size="small"
                                  value={item.quantity || ''}
                                  onChange={(e) => {
                                    const newData = [...editTableData];
                                    newData[idx].quantity = e.target.value;
                                    setEditTableData(newData);
                                  }}
                                  style={{ border: 'none' }}
                                />
                              </td>
                              <td style={{ border: '1px solid #ccc', padding: 4 }}>
                                <Input
                                  size="small"
                                  value={item.unit || ''}
                                  onChange={(e) => {
                                    const newData = [...editTableData];
                                    newData[idx].unit = e.target.value;
                                    setEditTableData(newData);
                                  }}
                                  style={{ border: 'none' }}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    );
                  }
                  // 其他类型暂时显示JSON
                  return (
                    <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
                      {JSON.stringify(editTableData, null, 2)}
                    </pre>
                  );
                })()}
              </div>
            ) : (
              <div style={{ color: '#999', padding: 8 }}>无效的模板内容</div>
            )}
          </Form.Item>
        </Form>
      </ResizableModal>

      <ResizableModal
        title={
          activeRow
            ? `模板内容 - ${String(activeRow.templateName || '')}（${typeLabel(String(activeRow.templateType || ''))}）`
            : '模板内容'
        }
        open={viewOpen}
        centered
        onCancel={() => setViewOpen(false)}
        footer={
          <div className="modal-footer-actions">
            <Button onClick={() => setViewOpen(false)}>关闭</Button>
          </div>
        }
        width={modalWidth}
        initialHeight={typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800}
        scaleWithViewport
      >
        {renderVisualContent()}
      </ResizableModal>

      <ResizableModal
        title={progressEditing?.id ? '编辑进度模板' : '进度模板'}
        open={progressOpen}
        centered
        onCancel={() => {
          setProgressOpen(false);
          setProgressEditing(null);
        }}
        onOk={submitProgress}
        okText="保存"
        cancelText="取消"
        confirmLoading={progressSaving}
        width={modalWidth}
        initialHeight={typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800}
        scaleWithViewport
      >
        <div style={{ maxHeight: '60vh', overflow: 'auto', padding: '0 2px' }}>
          <Form form={progressForm} layout="vertical">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Form.Item name="templateName" label="模板名称" rules={[{ required: true, message: '请输入模板名称' }]} style={{ marginBottom: 8 }}>
                <Input placeholder="例如：外协款-进度模板" size="small" />
              </Form.Item>
              <Form.Item name="templateKey" label="模板标识(可选)" style={{ marginBottom: 8 }}>
                <Input placeholder="不填则自动生成" size="small" />
              </Form.Item>
            </div>

            <Form.Item name="sourceStyleNo" label="绑定款号(可选)" style={{ marginBottom: 12 }}>
              <Select
                allowClear
                showSearch={{ filterOption: false, onSearch: scheduleFetchStyleNos }}
                size="small"
                loading={styleNoLoading}
                placeholder="绑定后打开该款订单会自动尝试套用"
                options={styleNoOptions}
                onOpenChange={(open) => {
                  if (open && !styleNoOptions.length) fetchStyleNoOptions('');
                }}
              />
            </Form.Item>

            <div style={{ border: '1px solid #d9d9d9', padding: 8, borderRadius: 4 }}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>进度节点</div>
              <Form.List name="nodes">
                {(fields, { add, remove, move }) => (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, fontSize: 11, color: '#666' }}>
                      <span>定义生产进度的工序顺序</span>
                      <Button
                        type="primary"
                        size="small"
                        icon={<PlusOutlined />}
                        onClick={() => add({ name: '' })}
                        disabled={progressSaving}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {fields.map((f, idx) => (
                        <div
                          key={f.key}
                          onDragOver={(e) => {
                            if (progressSaving) return;
                            e.preventDefault();
                            if (nodeDragOverIndex !== idx) setNodeDragOverIndex(idx);
                          }}
                          onDragLeave={() => {
                            if (nodeDragOverIndex === idx) setNodeDragOverIndex(null);
                          }}
                          onDrop={(e) => {
                            if (progressSaving) return;
                            e.preventDefault();
                            const from = draggingNodeIndexRef.current;
                            if (from == null || from === idx) return;
                            move(from, idx);
                            draggingNodeIndexRef.current = idx;
                            setNodeDragOverIndex(null);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 4,
                            padding: 2,
                            background: nodeDragOverIndex === idx ? '#e6f7ff' : 'transparent',
                          }}
                        >
                          <span
                            draggable={!progressSaving}
                            onDragStart={(e) => {
                              if (progressSaving) return;
                              draggingNodeIndexRef.current = idx;
                              setNodeDragOverIndex(null);
                              try {
                                e.dataTransfer.effectAllowed = 'move';
                                e.dataTransfer.setData('text/plain', String(idx));
                              } catch {
                                // Intentionally empty
                                // 忽略错误
                              }
                            }}
                            onDragEnd={() => {
                              draggingNodeIndexRef.current = null;
                              setNodeDragOverIndex(null);
                            }}
                            style={{
                              width: 20,
                              height: 20,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#999',
                              cursor: progressSaving ? 'not-allowed' : 'grab',
                              userSelect: 'none',
                              fontSize: 12,
                            }}
                          >
                            <HolderOutlined />
                          </span>
                          <Form.Item
                            name={[f.name, 'name']}
                            rules={[{ required: true, message: '请输入节点名称' }]}
                            style={{ margin: 0, flex: 1 }}
                          >
                            <Input placeholder="生产进度" size="small" />
                          </Form.Item>
                          <Button
                            type="text"
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                            disabled={progressSaving}
                            onClick={() => remove(f.name)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Form.List>
            </div>
          </Form>
        </div>
      </ResizableModal>

      {/* 工序单价弹窗 */}
      <ResizableModal
        title={processPriceEditingRow?.id ? '编辑工序单价' : '工序单价'}
        open={processPriceOpen}
        centered
        onCancel={() => {
          setProcessPriceOpen(false);
          setProcessPriceEditingRow(null);
        }}
        onOk={submitProcessPrice}
        okText="保存"
        cancelText="取消"
        confirmLoading={processPriceSaving}
        width={modalWidth}
        initialHeight={typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800}
        scaleWithViewport
      >
        <div style={{ maxHeight: '60vh', overflow: 'auto', padding: '0 2px' }}>
          <Form form={processPriceForm} layout="vertical">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Form.Item name="templateName" label="模板名称" rules={[{ required: true, message: '请输入模板名称' }]} style={{ marginBottom: 8 }}>
                <Input placeholder="例如：外协款-工序单价" size="small" />
              </Form.Item>
              <Form.Item name="templateKey" label="模板标识(可选)" style={{ marginBottom: 8 }}>
                <Input placeholder="不填则自动生成" size="small" />
              </Form.Item>
            </div>

            <Form.Item name="sourceStyleNo" label="绑定款号(可选)" style={{ marginBottom: 12 }}>
              <Select
                allowClear
                showSearch={{ filterOption: false, onSearch: scheduleFetchStyleNos }}
                size="small"
                loading={styleNoLoading}
                placeholder="绑定后打开该款订单会自动尝试套用"
                options={styleNoOptions}
                onOpenChange={(open) => {
                  if (open && !styleNoOptions.length) fetchStyleNoOptions('');
                }}
              />
            </Form.Item>

            <div style={{ border: '1px solid #d9d9d9', padding: 8, borderRadius: 4 }}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>工序单价列表</div>
              <Form.List name="priceSteps">
                {(fields, { add, remove }) => (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 6 }}>
                      <Button
                        type="primary"
                        size="small"
                        icon={<PlusOutlined />}
                        onClick={() => add({ processName: '', unitPrice: 0, estimatedMinutes: 0 })}
                        disabled={processPriceSaving}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {fields.map((f) => (
                        <div key={f.key} style={{ display: 'flex', gap: 4, alignItems: 'flex-start' }}>
                          <Form.Item
                            name={[f.name, 'processName']}
                            rules={[{ required: true, message: '请输入工序名称' }]}
                            style={{ margin: 0, flex: 1 }}
                          >
                            <Input placeholder="工序名称" size="small" />
                          </Form.Item>
                          <Form.Item name={[f.name, 'estimatedMinutes']} style={{ margin: 0 }} tooltip="预计耗时(分钟/件)，不填则使用默认">
                            <InputNumber min={0} step={1} precision={0} placeholder="时间(分)" size="small" style={{ width: 90 }} />
                          </Form.Item>
                          <Form.Item name={[f.name, 'unitPrice']} style={{ margin: 0 }}>
                            <InputNumber min={0} step={0.01} precision={2} prefix="¥" placeholder="单价" size="small" style={{ width: 100 }} />
                          </Form.Item>
                          <Button
                            type="text"
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                            disabled={processPriceSaving}
                            onClick={() => remove(f.name)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Form.List>
            </div>
          </Form>
        </div>
      </ResizableModal>
    </Layout>
  );
};

export default TemplateCenter;
