import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, Tooltip, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, EditOutlined, EyeOutlined, HolderOutlined, ImportOutlined, PlusOutlined, RollbackOutlined } from '@ant-design/icons';
import Layout from '../../components/Layout';
import ResizableModal from '../../components/common/ResizableModal';
import ResizableTable from '../../components/common/ResizableTable';
import RowActions from '../../components/common/RowActions';
import api from '../../utils/api';
import { isAdminUser as isAdminUserFn, useAuth } from '../../utils/authContext';
import type { TemplateLibrary } from '../../types/style';

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

const formatTemplateKey = (raw: any) => {
  const key = String(raw ?? '').trim();
  if (!key) return { text: '-', full: '' };
  if (key === 'default') return { text: '系统默认', full: key };
  if (key.startsWith('style_')) return { text: key.slice(6) || key, full: key };
  if (key.startsWith('progress_custom_')) return { text: '自定义', full: key };
  return { text: key, full: key };
};

const TemplateCenter: React.FC = () => {
  const { user } = useAuth();
  const [queryForm] = Form.useForm();
  const [createForm] = Form.useForm();
  const [applyForm] = Form.useForm();
  const [progressForm] = Form.useForm();

  const [styleNoOptions, setStyleNoOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [styleNoLoading, setStyleNoLoading] = useState(false);
  const styleNoReqSeq = useRef(0);
  const styleNoTimerRef = useRef<number | undefined>(undefined);

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TemplateLibrary[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);

  const [createOpen, setCreateOpen] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressSaving, setProgressSaving] = useState(false);
  const [progressEditing, setProgressEditing] = useState<TemplateLibrary | null>(null);
  const [activeRow, setActiveRow] = useState<TemplateLibrary | null>(null);
  const [viewContent, setViewContent] = useState<string>('');
  const [viewObj, setViewObj] = useState<any>(null);

  const isAdminUser = useMemo(() => isAdminUserFn(user), [user]);

  const isLocked = (row?: TemplateLibrary | null) => {
    const v = Number((row as any)?.locked);
    return Number.isFinite(v) && v === 1;
  };

  const parseProgressNodeItems = (raw: string): Array<{ name: string; unitPrice: number }> => {
    const text = String(raw ?? '').trim();
    if (!text) return [];
    try {
      const obj = JSON.parse(text);
      const nodesRaw = (obj as any)?.nodes;
      if (!Array.isArray(nodesRaw)) return [];
      return nodesRaw
        .map((n: any) => {
          const name = String(n?.name || '').trim();
          const p = Number(n?.unitPrice);
          const unitPrice = Number.isFinite(p) && p >= 0 ? p : 0;
          return { name, unitPrice };
        })
        .filter((n: any) => n.name);
    } catch {
      return [];
    }
  };

  const parseProcessPriceSteps = (raw: string): Array<{ processName: string; unitPrice: number }> => {
    const text = String(raw ?? '').trim();
    if (!text) return [];
    try {
      const obj = JSON.parse(text);
      const stepsRaw = (obj as any)?.steps;
      if (!Array.isArray(stepsRaw)) return [];
      return stepsRaw
        .map((s: any) => {
          const processName = String(s?.processName || '').trim();
          const p = Number(s?.unitPrice ?? s?.price);
          const unitPrice = Number.isFinite(p) && p >= 0 ? p : 0;
          return { processName, unitPrice };
        })
        .filter((s: any) => s.processName);
    } catch {
      return [];
    }
  };

  const normalizeStageName = (v: any) => String(v ?? '').trim().replace(/\s+/g, '');

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

  const loadProcessPriceForStyle = async (styleNo: string) => {
    const sn = String(styleNo || '').trim();
    if (!sn) return { tpl: null as TemplateLibrary | null, steps: [] as Array<{ processName: string; unitPrice: number }> };
    try {
      const res = await api.get<any>('/template-library/list', {
        params: {
          page: 1,
          pageSize: 50,
          templateType: 'process_price',
          sourceStyleNo: sn,
          keyword: '',
        },
      });
      const result = res as any;
      if (result.code !== 200) return { tpl: null, steps: [] };
      const records = Array.isArray(result.data?.records) ? (result.data.records as TemplateLibrary[]) : [];
      const list = [...records];
      const expectedKey = `style_${sn}`;
      const picked = list.find((t) => String(t?.templateKey || '').trim() === expectedKey) || list[0] || null;
      if (!picked?.id) return { tpl: null, steps: [] };

      let content = String(picked.templateContent ?? '');
      try {
        const det = await api.get<any>(`/template-library/${picked.id}`);
        const detRes = det as any;
        if (detRes.code === 200) {
          content = String((detRes.data as any)?.templateContent ?? content);
        }
      } catch {
      }

      return { tpl: picked, steps: parseProcessPriceSteps(content) };
    } catch {
      return { tpl: null, steps: [] };
    }
  };

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
  }, [progressOpen, watchProgressStyleNo, progressForm]);

  const openProgressCreate = () => {
    setProgressEditing(null);
    setProcessPriceEditing(null);
    progressForm.resetFields();
    progressForm.setFieldsValue({
      templateName: '自定义进度模板',
      templateKey: '',
      sourceStyleNo: undefined,
      nodes: [{ name: '裁剪' }, { name: '缝制' }, { name: '整烫' }, { name: '检验' }, { name: '包装' }],
      priceSteps: [{ processName: '裁剪', unitPrice: 0 }, { processName: '缝制', unitPrice: 0 }, { processName: '整烫', unitPrice: 0 }, { processName: '检验', unitPrice: 0 }, { processName: '包装', unitPrice: 0 }],
    });
    setProgressOpen(true);
  };

  const openProgressEdit = async (row: TemplateLibrary) => {
    if (isLocked(row)) {
      message.error('模板已锁定，如需修改请先退回');
      return;
    }
    setProgressEditing(row);
    progressForm.resetFields();
    let content = String(row?.templateContent ?? '');
    if (row?.id) {
      try {
        const res = await api.get<any>(`/template-library/${row.id}`);
        const result = res as any;
        if (result.code === 200) {
          content = String((result.data as any)?.templateContent ?? content);
        }
      } catch {
      }
    }

    const items = parseProgressNodeItems(content);
    const styleNo = String(row.sourceStyleNo || '').trim();
    const loaded = styleNo ? await loadProcessPriceForStyle(styleNo) : { tpl: null, steps: [] as Array<{ processName: string; unitPrice: number }> };
    setProcessPriceEditing(loaded.tpl);
    const priceSteps = loaded.steps.length
      ? loaded.steps
      : items.map((n) => ({ processName: String(n?.name || '').trim(), unitPrice: Number(n?.unitPrice) || 0 })).filter((s) => s.processName);
    progressForm.setFieldsValue({
      templateName: row.templateName,
      templateKey: row.templateKey,
      sourceStyleNo: row.sourceStyleNo || undefined,
      nodes: (items.length
        ? items
        : ['裁剪', '缝制', '整烫', '检验', '包装'].map((n) => ({ name: n }))
      ).map((n: any) => ({ name: String(n?.name || '').trim() })),
      priceSteps,
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

      const priceStepsRaw = Array.isArray((v as any)?.priceSteps) ? ((v as any).priceSteps as ProcessPriceStepInput[]) : [];
      const priceSteps = priceStepsRaw
        .map((s) => {
          const processName = String((s as any)?.processName || '').trim();
          const p = Number((s as any)?.unitPrice);
          const unitPrice = Number.isFinite(p) && p >= 0 ? p : 0;
          return { processName, unitPrice };
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
        const tplContent = JSON.stringify({ steps: priceSteps.map((s) => ({ processName: s.processName, unitPrice: s.unitPrice })) });
        if (processPriceEditing?.id) {
          const res = await api.put<any>('/template-library', {
            id: processPriceEditing.id,
            templateType: 'process_price',
            templateKey: tplKey,
            templateName: tplName,
            sourceStyleNo: sn,
            templateContent: tplContent,
          });
          const result = res as any;
          if (result.code !== 200) {
            throw new Error(result.message || '保存单价工序库失败');
          }
          return;
        }
        const existed = await loadProcessPriceForStyle(sn);
        if (existed.tpl?.id) {
          setProcessPriceEditing(existed.tpl);
          const res = await api.put<any>('/template-library', {
            id: existed.tpl.id,
            templateType: 'process_price',
            templateKey: tplKey,
            templateName: tplName,
            sourceStyleNo: sn,
            templateContent: tplContent,
          });
          const result = res as any;
          if (result.code !== 200) {
            throw new Error(result.message || '保存单价工序库失败');
          }
          return;
        }
        const res = await api.post<any>('/template-library', {
          templateType: 'process_price',
          templateKey: tplKey,
          templateName: tplName,
          sourceStyleNo: sn,
          templateContent: tplContent,
        });
        const result = res as any;
        if (result.code !== 200) {
          throw new Error(result.message || '保存单价工序库失败');
        }
      };

      setProgressSaving(true);
      await saveProcessPriceTemplate();
      if (progressEditing?.id) {
        const res = await api.put<any>('/template-library', {
          id: progressEditing.id,
          templateType: 'progress',
          templateKey,
          templateName,
          sourceStyleNo: sourceStyleNo || null,
          templateContent,
        });
        const result = res as any;
        if (result.code !== 200) {
          message.error(result.message || '保存失败');
          return;
        }
        message.success('已保存并锁定');
      } else {
        const res = await api.post<any>('/template-library', {
          templateType: 'progress',
          templateKey,
          templateName,
          sourceStyleNo: sourceStyleNo || null,
          templateContent,
        });
        const result = res as any;
        if (result.code !== 200) {
          message.error(result.message || '保存失败');
          return;
        }
        message.success('已创建并锁定');
      }

      setProgressOpen(false);
      setProgressEditing(null);
      fetchList({ page: 1 });
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.message || '保存失败');
    } finally {
      setProgressSaving(false);
    }
  };

  const handleRollback = async (row: TemplateLibrary) => {
    if (!row?.id) return;
    if (!isAdminUser) {
      message.error('仅管理员可退回修改');
      return;
    }
    Modal.confirm({
      title: '退回该模板为可编辑？',
      content: String(row.templateName || ''),
      okText: '退回',
      cancelText: '取消',
      onOk: async () => {
        const res = await api.post<any>(`/template-library/${row.id}/rollback`);
        const result = res as any;
        if (result.code !== 200) {
          message.error(result.message || '退回失败');
          return;
        }
        message.success('已退回，可修改');
        fetchList({ page: 1 });
      },
    });
  };

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

  const fetchList = async (next?: { page?: number; pageSize?: number }) => {
    const p = next?.page ?? page;
    const ps = next?.pageSize ?? pageSize;
    setLoading(true);
    try {
      const v = queryForm.getFieldsValue();
      const res = await api.get<any>('/template-library/list', {
        params: {
          page: p,
          pageSize: ps,
          templateType: v.templateType || '',
          keyword: v.keyword || '',
          sourceStyleNo: v.sourceStyleNo || '',
        },
      });
      const result = res as any;
      if (result.code !== 200) {
        message.error(result.message || '获取模板列表失败');
        return;
      }
      const pageData: PageResp<TemplateLibrary> = result.data || { records: [], total: 0 };
      setData(Array.isArray(pageData.records) ? pageData.records : []);
      setTotal(Number(pageData.total || 0));
      setPage(p);
      setPageSize(ps);
    } catch (e: any) {
      message.error(e?.message || '获取模板列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList({ page: 1, pageSize });
    fetchStyleNoOptions('');
  }, []);

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

  const openCreate = () => {
    createForm.resetFields();
    createForm.setFieldsValue({ templateTypes: ['bom', 'size', 'process', 'progress'] });
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    try {
      const v = await createForm.validateFields();
      const sourceStyleNo = String(v.sourceStyleNo || '').trim();
      if (!sourceStyleNo) {
        message.error('请输入来源款号');
        return;
      }
      const templateTypes = Array.isArray(v.templateTypes) ? v.templateTypes : [];

      const res = await api.post<any>('/template-library/create-from-style', {
        sourceStyleNo,
        templateTypes,
      });
      const result = res as any;
      if (result.code !== 200) {
        message.error(result.message || '生成模板失败');
        return;
      }
      message.success('模板已生成/更新');
      setCreateOpen(false);
      fetchList({ page: 1 });
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.message || '生成模板失败');
    }
  };

  const openApply = (row: TemplateLibrary) => {
    const t = String(row?.templateType || '').trim().toLowerCase();
    if (t === 'progress') {
      message.info('进度模板请在“生产进度”页面导入');
      return;
    }
    setActiveRow(row);
    applyForm.resetFields();
    applyForm.setFieldsValue({ mode: 'overwrite' });
    setApplyOpen(true);
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
      const res = await api.post<any>('/template-library/apply-to-style', {
        templateId: activeRow.id,
        targetStyleNo,
        mode: v.mode,
      });
      const result = res as any;
      if (result.code !== 200) {
        message.error(result.message || '导入失败');
        return;
      }
      message.success('已套用到目标款号');
      setApplyOpen(false);
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.message || '套用失败');
    }
  };

  const openView = async (row: TemplateLibrary) => {
    setActiveRow(row);
    setViewContent('');
    setViewObj(null);
    setViewOpen(true);
    if (!row?.id) return;
    try {
      const res = await api.get<any>(`/template-library/${row.id}`);
      const result = res as any;
      if (result.code !== 200) {
        message.error(result.message || '获取模板失败');
        return;
      }
      const tpl: TemplateLibrary = result.data;
      const raw = String(tpl?.templateContent ?? '');
      try {
        const obj = JSON.parse(raw);
        setViewObj(obj);
        setViewContent(JSON.stringify(obj, null, 2));
      } catch {
        setViewContent(raw);
      }
    } catch (e: any) {
      message.error(e?.message || '获取模板失败');
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
      const nodes = Array.isArray((obj as any)?.nodes) ? (obj as any).nodes : [];
      return (
        <Table
          size="small"
          rowKey={(r: any) => String(r?.name || '')}
          pagination={false}
          scroll={{ x: 'max-content', y: 520 }}
          columns={[
            { title: '环节', dataIndex: 'name', key: 'name', width: 220, render: (v: any) => String(v || '-') },
            {
              title: '单价',
              dataIndex: 'unitPrice',
              key: 'unitPrice',
              width: 120,
              align: 'right',
              render: (v: any) => {
                const n = typeof v === 'number' ? v : Number(v);
                return Number.isFinite(n) ? n.toFixed(2) : '-';
              },
            },
          ]}
          dataSource={nodes}
        />
      );
    }

    if (t === 'process' || t === 'process_price') {
      const steps = Array.isArray((obj as any)?.steps) ? (obj as any).steps : [];
      const unitField = t === 'process_price' ? 'unitPrice' : 'price';
      return (
        <Table
          size="small"
          rowKey={(r: any) => String(r?.processCode || r?.processName || '')}
          pagination={false}
          scroll={{ x: 'max-content', y: 520 }}
          columns={[
            { title: '工序编码', dataIndex: 'processCode', key: 'processCode', width: 120, render: (v: any) => String(v || '-') },
            { title: '工序名称', dataIndex: 'processName', key: 'processName', width: 180, render: (v: any) => String(v || '-') },
            ...(t === 'process'
              ? [{ title: '机器类型', dataIndex: 'machineType', key: 'machineType', width: 140, render: (v: any) => String(v || '-') }]
              : []),
            {
              title: t === 'process_price' ? '单价' : '工价',
              dataIndex: unitField,
              key: unitField,
              width: 120,
              align: 'right',
              render: (v: any) => {
                const n = typeof v === 'number' ? v : Number(v);
                return Number.isFinite(n) ? n.toFixed(2) : '-';
              },
            },
            ...(t === 'process'
              ? [
                {
                  title: '标准工时(秒)',
                  dataIndex: 'standardTime',
                  key: 'standardTime',
                  width: 140,
                  align: 'right',
                  render: (v: any) => {
                    const n = typeof v === 'number' ? v : Number(v);
                    return Number.isFinite(n) ? n : '-';
                  },
                },
              ]
              : []),
          ] as any}
          dataSource={steps}
        />
      );
    }

    if (t === 'bom') {
      const rows = Array.isArray((obj as any)?.rows) ? (obj as any).rows : [];
      return (
        <Table
          size="small"
          rowKey={(r: any) => String(r?.materialCode || r?.materialName || '')}
          pagination={false}
          scroll={{ x: 'max-content', y: 520 }}
          columns={[
            { title: '类型', dataIndex: 'materialType', key: 'materialType', width: 140, render: (v: any) => String(v || '-') },
            { title: '物料名称', dataIndex: 'materialName', key: 'materialName', width: 180, ellipsis: true, render: (v: any) => String(v || '-') },
            { title: '颜色', dataIndex: 'color', key: 'color', width: 110, render: (v: any) => String(v || '-') },
            { title: '规格', dataIndex: 'specification', key: 'specification', width: 160, ellipsis: true, render: (v: any) => String(v || '-') },
            { title: '单位', dataIndex: 'unit', key: 'unit', width: 90, render: (v: any) => String(v || '-') },
            {
              title: '单件用量',
              dataIndex: 'usageAmount',
              key: 'usageAmount',
              width: 110,
              align: 'right',
              render: (v: any) => {
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
              render: (v: any) => {
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
              render: (v: any) => {
                const n = typeof v === 'number' ? v : Number(v);
                return Number.isFinite(n) ? n.toFixed(2) : '-';
              },
            },
            { title: '供应商', dataIndex: 'supplier', key: 'supplier', width: 160, ellipsis: true, render: (v: any) => String(v || '-') },
          ]}
          dataSource={rows}
        />
      );
    }

    if (t === 'size') {
      const sizes = Array.isArray((obj as any)?.sizes) ? (obj as any).sizes.map((s: any) => String(s || '').trim()).filter(Boolean) : [];
      const parts = Array.isArray((obj as any)?.parts) ? (obj as any).parts : [];

      const baseCols: any[] = [
        { title: '部位', dataIndex: 'partName', key: 'partName', width: 160, render: (v: any) => String(v || '-') },
        { title: '测量方式', dataIndex: 'measureMethod', key: 'measureMethod', width: 140, render: (v: any) => String(v || '-') },
        {
          title: '公差',
          dataIndex: 'tolerance',
          key: 'tolerance',
          width: 100,
          align: 'right',
          render: (v: any) => {
            const n = typeof v === 'number' ? v : Number(v);
            return Number.isFinite(n) ? n : '-';
          },
        },
      ];

      const sizeCols: any[] = sizes.map((sz: string) => ({
        title: sz,
        dataIndex: ['values', sz],
        key: `size_${sz}`,
        width: 110,
        align: 'right',
        render: (v: any) => {
          const n = typeof v === 'number' ? v : Number(v);
          return Number.isFinite(n) ? n : '-';
        },
      }));

      return (
        <Table
          size="small"
          rowKey={(r: any) => String(r?.partName || '')}
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
    Modal.confirm({
      title: '确认删除该模板？',
      content: `${row.templateName || ''}`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          const res = await api.delete<any>(`/template-library/${row.id}`);
          const result = res as any;
          if (result.code !== 200) {
            message.error(result.message || '删除失败');
            return;
          }
          message.success('已删除');
          fetchList({ page: 1 });
        } catch (e: any) {
          message.error(e?.message || '删除失败');
        }
      },
    });
  };

  const columns: ColumnsType<TemplateLibrary> = [
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
      title: '状态',
      dataIndex: 'locked',
      key: 'locked',
      width: 110,
      render: (_: any, row) => (isLocked(row) ? <Tag color="green">已锁定</Tag> : <Tag color="gold">可编辑</Tag>),
    },
    {
      title: '操作',
      key: 'action',
      width: 170,
      render: (_, row) => {
        const isProgress = String(row?.templateType || '').trim().toLowerCase() === 'progress';
        const locked = isLocked(row);

        const primaryAction = isProgress
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
          : {
            key: 'apply',
            label: '套用',
            title: '套用',
            icon: <ImportOutlined />,
            onClick: () => openApply(row),
          };

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
              { ...(primaryAction as any), primary: true },
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
            <Button type="primary" onClick={openCreate}>
              按款号生成
            </Button>
            <Button onClick={openProgressCreate}>自定义进度模板</Button>
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
              showSearch
              filterOption={false}
              loading={styleNoLoading}
              style={{ width: 200 }}
              placeholder="搜索/选择款号"
              options={styleNoOptions}
              onSearch={scheduleFetchStyleNos}
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

        <ResizableTable
          rowKey={(r) => String(r.id || r.templateKey)}
          columns={columns}
          dataSource={data}
          loading={loading}
          scroll={{ x: 'max-content', y: typeof window === 'undefined' ? 560 : window.innerWidth < 768 ? 360 : 560 }}
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
        width={520}
      >
        <Form form={createForm} layout="vertical">
          <Form.Item name="sourceStyleNo" label="来源款号" rules={[{ required: true, message: '请输入来源款号' }]}>
            <Select
              allowClear
              showSearch
              filterOption={false}
              loading={styleNoLoading}
              placeholder="搜索/选择款号"
              options={styleNoOptions}
              onSearch={scheduleFetchStyleNos}
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
        width={520}
      >
        <Form form={applyForm} layout="vertical">
          <Form.Item label="模板" >
            <Input value={activeRow ? `${activeRow.templateName || ''}（${typeLabel(activeRow.templateType)}）` : ''} disabled />
          </Form.Item>
          <Form.Item name="targetStyleNo" label="目标款号" rules={[{ required: true, message: '请输入目标款号' }]}>
            <Select
              allowClear
              showSearch
              filterOption={false}
              loading={styleNoLoading}
              placeholder="搜索/选择款号"
              options={styleNoOptions}
              onSearch={scheduleFetchStyleNos}
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
        width={
          typeof window === 'undefined'
            ? '60vw'
            : window.innerWidth < 768
              ? '96vw'
              : window.innerWidth < 1024
                ? '66vw'
                : '60vw'
        }
        initialHeight={720}
        scaleWithViewport
      >
        {renderVisualContent()}
      </ResizableModal>

      <ResizableModal
        title={progressEditing?.id ? '编辑进度模板' : '自定义进度模板'}
        open={progressOpen}
        centered
        onCancel={() => {
          setProgressOpen(false);
          setProgressEditing(null);
          setProcessPriceEditing(null);
        }}
        onOk={submitProgress}
        okText="保存"
        cancelText="取消"
        confirmLoading={progressSaving}
        width={
          typeof window === 'undefined'
            ? '60vw'
            : window.innerWidth < 768
              ? '96vw'
              : window.innerWidth < 1024
                ? '66vw'
                : '60vw'
        }
        initialHeight={720}
        scaleWithViewport
      >
        <Form form={progressForm} layout="vertical">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="templateName" label="模板名称" rules={[{ required: true, message: '请输入模板名称' }]}>
              <Input placeholder="例如：外协款-进度模板" />
            </Form.Item>
            <Form.Item name="templateKey" label="模板标识(可选)">
              <Input placeholder="不填则自动生成" />
            </Form.Item>
          </div>

          <Form.Item name="sourceStyleNo" label="绑定款号(可选)">
            <Select
              allowClear
              showSearch
              filterOption={false}
              loading={styleNoLoading}
              placeholder="绑定后打开该款订单会自动尝试套用"
              options={styleNoOptions}
              onSearch={scheduleFetchStyleNos}
              onOpenChange={(open) => {
                if (open && !styleNoOptions.length) fetchStyleNoOptions('');
              }}
            />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', gap: 12, alignItems: 'start' }}>
            <Card size="small" title="环节列表" styles={{ body: { padding: 12 } }}>
              <Form.List name="nodes">
                {(fields, { add, remove, move }) => (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <Text type="secondary">仅维护顺序；单价来自右侧工序库</Text>
                      <Button
                        type="primary"
                        size="small"
                        icon={<PlusOutlined />}
                        title="添加环节"
                        aria-label="添加环节"
                        onClick={() => add({ name: '' })}
                        disabled={progressSaving}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                            gap: 8,
                            padding: 6,
                            borderRadius: 10,
                            background: nodeDragOverIndex === idx ? 'rgba(45, 127, 249, 0.08)' : 'transparent',
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
                              }
                            }}
                            onDragEnd={() => {
                              draggingNodeIndexRef.current = null;
                              setNodeDragOverIndex(null);
                            }}
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 8,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'rgba(0, 0, 0, 0.45)',
                              background: 'rgba(0, 0, 0, 0.03)',
                              cursor: progressSaving ? 'not-allowed' : 'grab',
                              userSelect: 'none',
                              marginTop: 2,
                              flex: '0 0 auto',
                            }}
                            aria-label="拖动排序"
                            title="拖动排序"
                          >
                            <HolderOutlined />
                          </span>
                          <Form.Item
                            name={[f.name, 'name']}
                            rules={[{ required: true, message: '请输入环节名称' }]}
                            style={{ margin: 0, flex: 1 }}
                          >
                            <Input placeholder="例如：裁剪 / 缝制 / 后整 / 出货" />
                          </Form.Item>
                          <RowActions
                            maxInline={1}
                            actions={[
                              {
                                key: 'delete',
                                label: '删除',
                                title: '删除',
                                icon: <DeleteOutlined />,
                                danger: true,
                                disabled: progressSaving,
                                onClick: () => remove(f.name),
                              },
                            ]}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Form.List>
            </Card>

            <Card
              size="small"
              title="单价工序库"
              extra={processPriceEditing?.id ? <Tag color="cyan">已存在</Tag> : <Tag>未创建</Tag>}
              styles={{ body: { padding: 12 } }}
            >
              <Text type="secondary">绑定款号后会保存为该款号的工序单价模板</Text>
              <div style={{ height: 10 }} />
              <Form.List name="priceSteps">
                {(fields, { add, remove }) => (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <Space size={8}>
                        <Button
                          size="small"
                          onClick={() => {
                            const nodes = (progressForm.getFieldValue('nodes') || []) as Array<{ name?: string }>;
                            const names = nodes.map((n) => String(n?.name || '').trim()).filter(Boolean);
                            const current = (progressForm.getFieldValue('priceSteps') || []) as Array<{ processName?: string; unitPrice?: number }>;
                            const map = new Map(current.map((s) => [String(s?.processName || '').trim(), Number(s?.unitPrice) || 0]));
                            const next = Array.from(new Set(names)).map((n) => ({ processName: n, unitPrice: map.get(n) ?? 0 }));
                            progressForm.setFieldsValue({ priceSteps: next });
                          }}
                          disabled={progressSaving}
                        >
                          从环节生成
                        </Button>
                      </Space>
                      <Button
                        type="primary"
                        size="small"
                        icon={<PlusOutlined />}
                        onClick={() => add({ processName: '', unitPrice: 0 })}
                        disabled={progressSaving}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {fields.map((f) => (
                        <Space key={f.key} style={{ display: 'flex' }} align="start">
                          <Form.Item
                            name={[f.name, 'processName']}
                            rules={[{ required: true, message: '请输入工序名称' }]}
                            style={{ margin: 0, flex: 1 }}
                          >
                            <Input placeholder="工序名称" />
                          </Form.Item>
                          <Form.Item name={[f.name, 'unitPrice']} style={{ margin: 0 }}>
                            <InputNumber min={0} step={0.01} precision={2} prefix="¥" placeholder="单价" style={{ width: 140 }} />
                          </Form.Item>
                          <RowActions
                            maxInline={1}
                            actions={[
                              {
                                key: 'delete',
                                label: '删除',
                                title: '删除',
                                icon: <DeleteOutlined />,
                                danger: true,
                                disabled: progressSaving,
                                onClick: () => remove(f.name),
                              },
                            ]}
                          />
                        </Space>
                      ))}
                    </div>
                  </div>
                )}
              </Form.List>
            </Card>
          </div>
        </Form>
      </ResizableModal>
    </Layout>
  );
};

export default TemplateCenter;
