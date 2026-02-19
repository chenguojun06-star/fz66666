import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, AutoComplete, Button, Card, Checkbox, Form, Image, Input, InputNumber, Select, Space, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined } from '@ant-design/icons';
import Layout from '@/components/Layout';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';
import api from '@/utils/api';
import { isAdminUser as isAdminUserFn, useAuth } from '@/utils/AuthContext';
import { useViewport } from '@/utils/useViewport';
import { getMaterialTypeLabel } from '@/utils/materialType';
import type { TemplateLibrary } from '@/types/style';

type PageResp<T> = {
  records: T[];
  total: number;
};

const { Text } = Typography;

const typeLabel = (t: string) => {
  const v = String(t || '').trim().toLowerCase();
  if (v === 'bom') return 'BOM';
  if (v === 'size') return '尺寸';
  if (v === 'process') return '工序进度单价';
  return v || '-';
};

const typeColor = (t: string) => {
  const v = String(t || '').trim().toLowerCase();
  if (v === 'bom') return 'blue';
  if (v === 'size') return 'purple';
  if (v === 'process') return 'green';
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

const MAIN_PROGRESS_STAGE_OPTIONS = [
  { value: '采购', label: '采购' },
  { value: '裁剪', label: '裁剪' },
  { value: '车缝', label: '车缝' },
  { value: '二次工艺', label: '二次工艺' },
  { value: '尾部', label: '尾部' }, // 包含整烫、包装、质检、后整、剪线
  { value: '入库', label: '入库' },
];

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


const TemplateCenter: React.FC = () => {
  const { modal, message } = App.useApp();
  const { user } = useAuth();
  const { modalWidth } = useViewport();
  const [queryForm] = Form.useForm();
  const [templateType, setTemplateType] = useState('');
  const [keyword, setKeyword] = useState('');
  const [sourceStyleNo, setSourceStyleNo] = useState('');
  const [createForm] = Form.useForm();
  const [applyForm] = Form.useForm();

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
  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editingRow, setEditingRow] = useState<TemplateLibrary | null>(null);
  const [editTableData, setEditTableData] = useState<unknown>(null);

  // 按款号更新工序进度单价
  const [syncPriceOpen, setSyncPriceOpen] = useState(false);
  const [syncPriceStyleNo, setSyncPriceStyleNo] = useState('');
  const [syncPriceLoading, setSyncPriceLoading] = useState(false);

  const sizeColumns = useMemo(() => {
    if (!editTableData) return null;
    if (editingRow?.templateType !== 'size') return null;
    if (!isSizeTableData(editTableData)) return null;
    const sizeTable = editTableData as any;
    const baseColumn = {
      title: '部位',
      dataIndex: 'partName',
      width: 100,
      render: (text: string, _: SizeTablePart, index: number) => (
        <Input
          size="small"
          value={text}
          onChange={(e) => {
            const newData = { ...sizeTable, parts: [...sizeTable.parts] };
            const part = newData.parts[index];
            if (!part) return;
            newData.parts[index] = { ...part, partName: e.target.value };
            setEditTableData(newData);
          }}
          style={{ border: 'none' }}
        />
      ),
    };
    const dynamicColumns = sizeTable.sizes.map((size: string, sIdx: number) => ({
      title: (
        <Input
          size="small"
          value={size}
          onChange={(e) => {
            const newData = { ...sizeTable };
            newData.sizes[sIdx] = e.target.value;
            setEditTableData(newData);
          }}
          style={{ border: 'none', background: 'transparent', textAlign: 'center' }}
        />
      ),
      dataIndex: ['values', size],
      width: 80,
      render: (_: string, record: SizeTablePart, pIdx: number) => (
        <Input
          size="small"
          value={record.values?.[size] || ''}
          onChange={(e) => {
            const newData = { ...sizeTable, parts: [...sizeTable.parts] };
            const part = newData.parts[pIdx];
            if (!part) return;
            const values = { ...(part.values || {}) } as Record<string, string>;
            values[size] = e.target.value;
            newData.parts[pIdx] = { ...part, values };
            setEditTableData(newData);
          }}
          style={{ border: 'none' }}
        />
      ),
    }));
    return [baseColumn, ...dynamicColumns];
  }, [editTableData, editingRow?.templateType]);
  const [activeRow, _setActiveRow] = useState<TemplateLibrary | null>(null);
  const [viewContent, _setViewContent] = useState<string>('');
  const [viewObj, _setViewObj] = useState<unknown>(null);

  // 多码单价相关状态
  const [showSizePrices, setShowSizePrices] = useState(false);
  const [templateSizes, setTemplateSizes] = useState<string[]>(['XS', 'S', 'M', 'L', 'XL', 'XXL']);
  const [newSizeName, setNewSizeName] = useState('');

  const isAdminUser = useMemo(() => isAdminUserFn(user), [user]);

  const isLocked = (row?: TemplateLibrary | null) => {
    const v = Number(row?.locked);
    return Number.isFinite(v) && v === 1;
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
    setEditingRow(latestRow);
    let contentData: unknown = row?.templateContent;
    if (row?.id) {
      try {
        const res = await api.get<{ code: number; data: TemplateLibrary }>(`/template-library/${row.id}`);
        if (res.code === 200) {
          contentData = res.data?.templateContent ?? contentData;
        }
      } catch {
        // Intentionally empty
        // 忽略错误
      }
    }

    // 解析JSON为表格数据（templateContent 现在可能是对象或字符串）
    let parsed: unknown = null;
    if (typeof contentData === 'object' && contentData !== null) {
      // 已经是对象，直接使用
      parsed = contentData;
    } else {
      // 是字符串，尝试解析
      const content = String(contentData ?? '');
      try {
        parsed = JSON.parse(content);
      } catch {
        // 解析失败
        setEditTableData(null);
        setTemplateSizes(['XS', 'S', 'M', 'L', 'XL', 'XXL']);
        setShowSizePrices(false);
        setEditOpen(true);
        return;
      }
    }

    const normalizedType = String(latestRow?.templateType || '').trim().toLowerCase();
    if (normalizedType === 'process' && Array.isArray(parsed)) {
      parsed = { steps: normalizeProcessSteps(parsed as ProcessStepRow[]) };
    }
    if (normalizedType === 'process' && parsed && typeof parsed === 'object' && Array.isArray((parsed as any).steps)) {
      parsed = {
        ...(parsed as any),
        steps: normalizeProcessSteps(((parsed as any).steps as ProcessStepRow[])),
      };
    }
    if (normalizedType === 'size' && Array.isArray(parsed)) {
      parsed = convertStyleSizeListToTable(parsed as any[]);
    }
    setEditTableData(parsed);
    // 初始化尺码列表
    if (parsed && typeof parsed === 'object' && 'sizes' in parsed && Array.isArray(parsed.sizes)) {
      setTemplateSizes(parsed.sizes);
      setShowSizePrices(true);
    } else {
      setTemplateSizes(['XS', 'S', 'M', 'L', 'XL', 'XXL']);
      setShowSizePrices(false);
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
        // 如果是工序模板且开启了多码单价，保存尺码列表
        const finalData = { ...editTableData as any };
        if (templateType === 'process' && showSizePrices && templateSizes.length > 0) {
          finalData.sizes = templateSizes;
        } else if (templateType === 'process') {
          // 不显示多码单价时，删除sizes字段
          delete finalData.sizes;
        }
        templateContent = JSON.stringify(finalData);
      } else {
        message.error('模板内容无效');
        return;
      }

      // 如果是工序单价模板，显示自动同步提醒
      if (templateType === 'process') {
        const confirmed = await new Promise<boolean>((resolve) => {
          modal.confirm({
            title: '工序单价自动同步提醒',
            content: (
              <div>
                <p style={{ marginBottom: 12 }}>保存工序单价后，系统将自动执行以下操作：</p>
                <ul style={{ paddingLeft: 20, marginBottom: 12 }}>
                  <li>✅ 自动同步所有未完成订单的工序单价</li>
                  <li>✅ 自动更新工序跟踪表中的单价</li>
                  <li>✅ 后续扫码将自动使用最新单价</li>
                </ul>
                <p style={{ marginTop: 8, fontSize: 13, color: '#8c8c8c' }}>
                  提示：自动同步过程通常需要 1-3 秒完成
                </p>
              </div>
            ),
            okText: '确认保存',
            cancelText: '取消',
            width: 480,
            onOk: () => resolve(true),
            onCancel: () => resolve(false),
          });
        });

        if (!confirmed) {
          return; // 用户取消保存
        }
      }

      setEditSaving(true);
      const body = {
        id: editingRow?.id,
        templateName,
        templateKey: String(v.templateKey || '').trim() || null,
        templateType,
        sourceStyleNo: v.sourceStyleNo || null,
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
    } catch (e: any) {
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
      const selectedType = String(v.templateType || '').trim();
      const requestType = selectedType === 'process_size' ? 'process' : selectedType;
      const res = await api.get<{ code: number; message: string; data: PageResp<TemplateLibrary> }>('/template-library/list', {
        params: {
          page: p,
          pageSize: ps,
          templateType: requestType || '',
          keyword: v.keyword || '',
          sourceStyleNo: v.sourceStyleNo || '',
        },
      });
      if (res.code !== 200) {
        message.error(res.message || '获取模板列表失败');
        return;
      }
      const pageData: PageResp<TemplateLibrary> = res.data || { records: [], total: 0 };
      const records = Array.isArray(pageData.records) ? pageData.records : [];
      const filtered = records.filter((row) => {
        const t = String(row?.templateType || '').trim().toLowerCase();
        if (t === 'process_price' || t === 'progress') return false;
        if (selectedType === 'process_size') {
          try {
            const raw = (row as TemplateLibrary & Record<string, unknown>)?.templateContent;
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            const sizes = parsed && typeof parsed === 'object' && Array.isArray((parsed as any).sizes)
              ? (parsed as any).sizes as unknown[]
              : [];
            return sizes.length > 0;
          } catch {
            return false;
          }
        }
        return true;
      });
      setData(filtered);
      setTotal(Number(pageData.total || 0));
      pageRef.current = p;
      pageSizeRef.current = ps;
      setPage(p);
      setPageSize(ps);
    } catch (e: any) {
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
      { value: 'process', label: '工序进度单价' },
      { value: 'process_size', label: '多码工序进度单价' },
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
    } catch (e: any) {
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
    } catch (e: any) {
      if (hasErrorFields(e)) return;
      message.error(getErrorMessage(e, '套用失败'));
    }
  };

  // const openView = async (row: TemplateLibrary) => {
  //   setActiveRow(row);
  //   setViewContent('');
  //   setViewObj(null);
  //   setViewOpen(true);
  //   if (!row?.id) return;
  //   try {
  //     const res = await api.get<{ code: number; message: string; data: TemplateLibrary }>(`/template-library/${row.id}`);
  //     if (res.code !== 200) {
  //       message.error(res.message || '获取模板失败');
  //       return;
  //     }
  //     const tpl: TemplateLibrary = res.data;
  //     const content = tpl?.templateContent;
  //
  //     // templateContent 现在可能是对象（@JsonRawValue）或字符串
  //     let obj: unknown = null;
  //     if (typeof content === 'object' && content !== null) {
  //       // 已经是对象，直接使用
  //       obj = content;
  //     } else {
  //       // 是字符串，尝试解析
  //       const raw = String(content ?? '');
  //       try {
  //         obj = JSON.parse(raw);
  //       } catch {
  //         // 解析失败，保留原始字符串
  //         setViewContent(raw);
  //         return;
  //       }
  //     }
  //
  //     setViewObj(obj);
  //     setViewContent(JSON.stringify(obj, null, 2));
  //   } catch (e: any) {
  //     message.error(getErrorMessage(e, '获取模板失败'));
  //   }
  // };

  const renderVisualContent = () => {
    const t = String(activeRow?.templateType || '').trim().toLowerCase();
    const obj = viewObj;

    if (!obj || typeof obj !== 'object') {
      return (
        <pre style={{ margin: 0, maxHeight: '60vh', overflow: 'auto', background: '#0b1020', color: '#e6edf3', padding: 12 }}>
          {viewContent || ''}
        </pre>
      );
    }

    if (t === 'progress') {
      const nodesRaw = Array.isArray((obj as any)?.nodes)
        ? ((obj as any).nodes as Array<Record<string, unknown>>)
        : [];
      const nodes = nodesRaw.map((n) => {
        const name = String(n?.name ?? '').trim();
        const unitPriceValue = Number(n?.unitPrice);
        const unitPrice = Number.isFinite(unitPriceValue) ? unitPriceValue : undefined;
        return { name, unitPrice };
      });
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div style={{ border: '1px solid var(--color-border)', padding: 8 }}>
            <div style={{ fontSize: "var(--font-size-sm)", fontWeight: 500, marginBottom: 8 }}>进度节点</div>
            <div style={{ maxHeight: 480, overflow: 'auto' }}>
              {nodes.map((n, idx) => (
                <div key={idx} style={{ padding: '6px 8px', borderBottom: '1px solid #f0f0f0', fontSize: "var(--font-size-sm)" }}>
                  {String(n?.name || '-')}
                </div>
              ))}
              {nodes.length === 0 && <div style={{ padding: 12, textAlign: 'center', color: 'var(--neutral-text-disabled)' }}>暂无数据</div>}
            </div>
          </div>
          <div style={{ border: '1px solid var(--color-border)', padding: 8 }}>
            <div style={{ fontSize: "var(--font-size-sm)", fontWeight: 500, marginBottom: 8 }}>单价工序库</div>
            <div style={{ maxHeight: 480, overflow: 'auto' }}>
              {nodes.filter((n) => n?.unitPrice != null && n.unitPrice !== 0).map((n, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', borderBottom: '1px solid #f0f0f0', fontSize: "var(--font-size-sm)" }}>
                  <span>{String(n?.name || '-')}</span>
                  <span style={{ fontWeight: 500 }}>¥ {Number(n?.unitPrice || 0).toFixed(2)}</span>
                </div>
              ))}
              {nodes.filter((n) => n?.unitPrice != null && n.unitPrice !== 0).length === 0 &&
                <div style={{ padding: 12, textAlign: 'center', color: 'var(--neutral-text-disabled)' }}>暂无单价数据</div>
              }
            </div>
          </div>
        </div>
      );
    }

    if (t === 'process' || t === 'process_price') {
      const stepsRaw = Array.isArray((obj as any)?.steps)
        ? ((obj as any).steps as Array<Record<string, unknown>>)
        : (Array.isArray(obj) ? (obj as Array<Record<string, unknown>>) : []);
      const steps = stepsRaw.map((s) => {
        const processName = String(s?.processName ?? '').trim();
        const processCode = s?.processCode == null ? '' : String(s.processCode);
        const machineType = s?.machineType == null ? '' : String(s.machineType);
        const standardTime = s?.standardTime == null ? '' : String(s.standardTime);
        const unitPrice = s?.unitPrice;
        const price = s?.price;
        return { processName, processCode, machineType, standardTime, unitPrice, price };
      });
      // 对于 process 类型，优先使用 unitPrice，其次使用 price
      const getPriceValue = (s: Record<string, unknown>) => {
        const up = Number(s?.unitPrice);
        if (Number.isFinite(up) && up > 0) return up;
        const p = Number(s?.price);
        if (Number.isFinite(p) && p > 0) return p;
        return 0;
      };
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div style={{ border: '1px solid var(--color-border)', padding: 8 }}>
            <div style={{ fontSize: "var(--font-size-sm)", fontWeight: 500, marginBottom: 8 }}>
              {t === 'process_price' ? '工序节点' : '工艺节点'}
            </div>
            <div style={{ maxHeight: 480, overflow: 'auto' }}>
              {steps.map((s, idx) => (
                <div key={idx} style={{ padding: '6px 8px', borderBottom: '1px solid #f0f0f0', fontSize: "var(--font-size-sm)" }}>
                  <div>{String(s?.processName || '-')}</div>
                  {s?.processCode && <div style={{ fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-disabled)', marginTop: 2 }}>编码: {s.processCode}</div>}
                  {t === 'process' && s?.machineType && <div style={{ fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-disabled)', marginTop: 2 }}>机器: {s.machineType}</div>}
                  {t === 'process' && s?.standardTime && <div style={{ fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-disabled)', marginTop: 2 }}>工时: {s.standardTime}秒</div>}
                </div>
              ))}
              {steps.length === 0 && <div style={{ padding: 12, textAlign: 'center', color: 'var(--neutral-text-disabled)' }}>暂无数据</div>}
            </div>
          </div>
          <div style={{ border: '1px solid var(--color-border)', padding: 8 }}>
            <div style={{ fontSize: "var(--font-size-sm)", fontWeight: 500, marginBottom: 8 }}>
              {t === 'process_price' ? '单价工序库' : '工价工序库'}
            </div>
            <div style={{ maxHeight: 480, overflow: 'auto' }}>
              {steps.filter((s) => getPriceValue(s) > 0).map((s, idx) => {
                const price = getPriceValue(s);
                return (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', borderBottom: '1px solid #f0f0f0', fontSize: "var(--font-size-sm)" }}>
                    <span>{String(s?.processName || '-')}</span>
                    <span style={{ fontWeight: 500 }}>¥ {price.toFixed(2)}</span>
                  </div>
                );
              })}
              {steps.filter((s) => getPriceValue(s) > 0).length === 0 &&
                <div style={{ padding: 12, textAlign: 'center', color: 'var(--neutral-text-disabled)' }}>暂无价格数据</div>
              }
            </div>
          </div>
        </div>
      );
    }

    if (t === 'bom') {
      const rows = Array.isArray((obj as any)?.rows)
        ? ((obj as any).rows as any[])
        : (Array.isArray(obj) ? (obj as any[]) : []);
      return (
        <ResizableTable
          storageKey="template-bom-preview"
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

    if (t === 'size') {
      const tableData = isSizeTableData(obj)
        ? obj
        : (Array.isArray(obj) ? convertStyleSizeListToTable(obj as any[]) : null);
      if (!tableData) {
        return (
          <div style={{ padding: 12, textAlign: 'center', color: 'var(--neutral-text-disabled)' }}>暂无数据</div>
        );
      }
      const sizes = tableData.sizes.map((s) => String(s || '').trim()).filter(Boolean);
      const parts = tableData.parts as any[];

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
        <ResizableTable
          storageKey="template-size-preview"
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
      <pre style={{ margin: 0, maxHeight: '60vh', overflow: 'auto', background: '#0b1020', color: '#e6edf3', padding: 12 }}>
        {viewContent || ''}
      </pre>
    );
  };

  const handleDelete = async (row: TemplateLibrary) => {
    if (!row?.id) return;

    let deleteReason = '';

    modal.confirm({
      title: '确认删除该模板？',
      content: (
        <div>
          <div style={{ marginBottom: '12px', color: 'var(--color-text-secondary)' }}>{row.templateName || ''}</div>
          <div style={{ marginBottom: '8px' }}>
            <span style={{ color: 'red' }}>*</span> 请输入删除原因：
          </div>
          <Input.TextArea
            placeholder="请输入删除原因（必填）"
            rows={3}
            maxLength={200}
            showCount
            onChange={(e) => { deleteReason = e.target.value.trim(); }}
            onPressEnter={(e) => e.stopPropagation()}
          />
        </div>
      ),
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        if (!deleteReason) {
          message.warning('请输入删除原因');
          return Promise.reject();
        }
        try {
          const res = await api.delete<{ code: number; message: string }>(`/template-library/${row.id}`, {
            params: { reason: deleteReason }
          });
          if (res.code !== 200) {
            message.error(res.message || '删除失败');
            return;
          }
          message.success('已删除');
          fetchList({ page: 1 });
        } catch (e: any) {
          const msg = e instanceof Error
            ? e.message
            : (typeof e === 'object' && e && 'message' in e ? String((e as { message?: unknown }).message || '') : '');
          message.error(msg || '删除失败');
        }
      },
    });
  };

  type TemplateLibraryRecord = TemplateLibrary & Record<string, unknown>;
  type SizeTablePart = { partName: string; values?: Record<string, string>; measureMethod?: string; tolerance?: string | number };
  type SizeTableData = { sizes: string[]; parts: SizeTablePart[] };
  type BomTableRow = { materialName?: string; spec?: string; quantity?: string | number; unit?: string };
  type BomTableData = BomTableRow[];
  type BomTableContainer = { rows: BomTableRow[] };
  // 合并后的工序进度单价模板行类型
  type ProcessStepRow = {
    processCode?: string;
    processName?: string;
    progressStage?: string;  // 进度节点
    machineType?: string;
    standardTime?: number;
    unitPrice?: number;      // 工价（统一使用 unitPrice）
    price?: number;          // 兼容旧数据
    sizePrices?: Record<string, number>;  // 多码单价 { 'XS': 1.5, 'S': 1.5, 'M': 2.0 }
  };
  type ProcessTableData = { steps: ProcessStepRow[]; sizes?: string[] };  // 添加 sizes 字段存储尺码列表
  type ProcessPriceRow = { processCode?: string; processName?: string; unitPrice?: number };
  type ProcessPriceTableData = { steps: ProcessPriceRow[] };

  const isSizeTableData = (data: any): data is SizeTableData => {
    if (!data || typeof data !== 'object') return false;
    const rec = data as any;
    return Array.isArray(rec.sizes) && Array.isArray(rec.parts);
  };

  const isBomTableData = (data: any): data is BomTableData => Array.isArray(data);

  const isBomTableContainer = (data: any): data is BomTableContainer => {
    if (!data || typeof data !== 'object') return false;
    const rec = data as any;
    return Array.isArray(rec.rows);
  };

  const isProcessTableData = (data: any): data is ProcessTableData => {
    if (!data || typeof data !== 'object') return false;
    const rec = data as any;
    return Array.isArray(rec.steps);
  };

  const isProcessPriceTableData = (data: any): data is ProcessPriceTableData => {
    if (!data || typeof data !== 'object') return false;
    const rec = data as any;
    return Array.isArray(rec.steps);
  };

  const convertStyleSizeListToTable = (rows: Record<string, unknown>[]): SizeTableData => {
    const sizeSet: string[] = [];
    const partMap = new Map<string, SizeTablePart>();
    rows.forEach((row) => {
      const sizeName = String(row?.sizeName ?? '').trim();
      const partName = String(row?.partName ?? '').trim();
      if (!sizeName || !partName) return;
      if (!sizeSet.includes(sizeName)) sizeSet.push(sizeName);
      if (!partMap.has(partName)) {
        partMap.set(partName, {
          partName,
          measureMethod: String(row?.measureMethod ?? '').trim() || undefined,
          tolerance: row?.tolerance as string | number | undefined,
          values: {},
        });
      }
      const part = partMap.get(partName)!;
      const value = row?.standardValue;
      const v = value == null ? '' : String(value);
      part.values = { ...(part.values || {}), [sizeName]: v };
    });
    return { sizes: sizeSet, parts: Array.from(partMap.values()) };
  };

  const normalizeProcessSteps = (steps: ProcessStepRow[]) => {
    const sorted = [...steps].sort((a, b) => {
      const na = Number.parseInt(String(a.processCode ?? '').trim() || '0', 10);
      const nb = Number.parseInt(String(b.processCode ?? '').trim() || '0', 10);
      if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) {
        return na - nb;
      }
      return 0;
    });
    return sorted.map((s, idx) => ({
      ...s,
      processCode: String(idx + 1).padStart(2, '0'),
    }));
  };

  const columns: ColumnsType<TemplateLibraryRecord> = [
    {
      title: '图片',
      dataIndex: 'styleCoverUrl',
      key: 'styleCoverUrl',
      width: 72,
      align: 'center' as const,
      render: (url: string) =>
        url ? (
          <Image
            src={url}
            width={50}
            height={50}
            style={{ objectFit: 'cover', borderRadius: 4 }}
            preview={{ src: url }}
          />
        ) : (
          <div
            style={{
              width: 50,
              height: 50,
              margin: '0 auto',
              background: '#f5f5f5',
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#bbb',
              fontSize: 11,
            }}
          >
            无图
          </div>
        ),
    },
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
        const locked = isLocked(row);

        const primaryAction: RowAction = locked
          ? {
              key: 'rollback',
              label: '退回',
              title: '退回',
              onClick: () => handleRollback(row),
            }
          : {
              key: 'edit',
              label: '编辑',
              title: '编辑',
              onClick: () => openEdit(row),
            };

        return (
          <RowActions
            actions={[
              { ...primaryAction, primary: true },
              {
                key: 'delete',
                label: '删除',
                title: '删除',
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
        title="单价维护"
      >
        <Card size="small" className="filter-card mb-sm">
          <Form form={queryForm}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: 16 }}>
              <Space wrap size={12}>
                <Form.Item name="keyword" noStyle>
                  <Input
                    value={keyword}
                    onChange={(e) => {
                      setKeyword(e.target.value);
                      queryForm.setFieldsValue({ keyword: e.target.value });
                    }}
                    placeholder="名称/关键字"
                    allowClear
                    style={{ width: 200 }}
                  />
                </Form.Item>
                <Form.Item name="templateType" noStyle>
                  <Select
                    value={templateType || undefined}
                    onChange={(value) => {
                      setTemplateType(value || '');
                      queryForm.setFieldsValue({ templateType: value });
                    }}
                    options={templateTypeOptions.map((opt) => ({ label: opt.label, value: opt.value }))}
                    placeholder="全部类型"
                    allowClear
                    style={{ width: 140 }}
                  />
                </Form.Item>
                <Form.Item name="sourceStyleNo" noStyle>
                  <Select
                    allowClear
                    showSearch={{ filterOption: false, onSearch: scheduleFetchStyleNos }}
                    loading={styleNoLoading}
                    style={{ width: 200 }}
                    placeholder="搜索/选择款号"
                    options={styleNoOptions}
                    value={sourceStyleNo || undefined}
                    onChange={(value) => {
                      const v = String(value || '').trim();
                      setSourceStyleNo(v);
                      queryForm.setFieldsValue({ sourceStyleNo: v || undefined });
                    }}
                    onOpenChange={(open) => {
                      if (open && !styleNoOptions.length) fetchStyleNoOptions('');
                    }}
                  />
                </Form.Item>
              </Space>
              <Button type="primary" onClick={() => fetchList({ page: 1 })}>
                刷新
              </Button>
              <Button
                onClick={() => {
                  setSyncPriceStyleNo('');
                  setSyncPriceOpen(true);
                }}
              >
                按款号更新工序单价
              </Button>
            </div>
          </Form>
        </Card>

        <div style={{ height: 12 }} />

        <ResizableTable<TemplateLibraryRecord>
          rowKey={(r) => String(r.id || r.templateKey)}
          columns={columns}
          dataSource={data as TemplateLibraryRecord[]}
          loading={loading}
          scroll={{ x: 'max-content' }}
          pagination={{
            current: page,
            pageSize,
            total,
            showTotal: (total) => `共 ${total} 条`,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
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
                { value: 'process', label: '工序进度单价' },
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
      >
        <Form form={createForm} layout="vertical">
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <Form.Item name="templateName" label="模板名称" rules={[{ required: true, message: '请输入模板名称' }]} style={{ flex: 2, marginBottom: 0 }}>
              <Input placeholder="例如：外协款-BOM模板" />
            </Form.Item>
            <Form.Item name="templateKey" label="模板标识(可选)" style={{ flex: 1, marginBottom: 0 }}>
              <Input placeholder="不填则保持原标识" />
            </Form.Item>
            <Form.Item name="templateType" label="模板类型" rules={[{ required: true, message: '请选择模板类型' }]} style={{ flex: 1, marginBottom: 0 }}>
              <Select
                placeholder="请选择"
                options={[
                  { value: 'bom', label: 'BOM' },
                  { value: 'size', label: '尺寸' },
                  { value: 'process', label: '工艺' },
                ]}
                disabled
              />
            </Form.Item>
            <Form.Item name="sourceStyleNo" label="来源款号(可选)" style={{ flex: 1, marginBottom: 0 }}>
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
          </div>
          <Form.Item label="模板内容">
            {editTableData ? (
              <div style={{ maxHeight: 400, overflow: 'auto', border: '1px solid var(--color-border)', padding: 8 }}>
                {(() => {
                  const type = editingRow?.templateType;
                  // 尺寸表模板
                  if (type === 'size' && isSizeTableData(editTableData) && sizeColumns) {
                    return (
                      <ResizableTable
                        storageKey="template-size-edit"
                        dataSource={editTableData.parts}
                        columns={sizeColumns}
                        pagination={false}
                        size="small"
                        bordered
                        rowKey={(record) => (record as any).size || `size-${Math.random()}`}
                      />
                    );
                  }
                  // BOM表模板
                  if (type === 'bom' && (isBomTableData(editTableData) || isBomTableContainer(editTableData))) {
                    const bomRows = isBomTableContainer(editTableData) ? editTableData.rows : editTableData;
                    const bomColumns = [
                      {
                        title: '物料名称',
                        dataIndex: 'materialName',
                        width: 150,
                        render: (text: string, _: BomTableRow, idx: number) => (
                          <Input
                            size="small"
                            value={text || ''}
                            onChange={(e) => {
                              const newRows = [...bomRows];
                              newRows[idx] = { ...newRows[idx], materialName: e.target.value };
                              const newData = isBomTableContainer(editTableData) ? { rows: newRows } : newRows;
                              setEditTableData(newData);
                            }}
                            style={{ border: 'none' }}
                          />
                        ),
                      },
                      {
                        title: '规格',
                        dataIndex: 'spec',
                        width: 120,
                        render: (text: string, _: BomTableRow, idx: number) => (
                          <Input
                            size="small"
                            value={text || ''}
                            onChange={(e) => {
                              const newRows = [...bomRows];
                              newRows[idx] = { ...newRows[idx], spec: e.target.value };
                              const newData = isBomTableContainer(editTableData) ? { rows: newRows } : newRows;
                              setEditTableData(newData);
                            }}
                            style={{ border: 'none' }}
                          />
                        ),
                      },
                      {
                        title: '用量',
                        dataIndex: 'quantity',
                        width: 100,
                        render: (text: string, _: BomTableRow, idx: number) => (
                          <Input
                            size="small"
                            value={text || ''}
                            onChange={(e) => {
                              const newRows = [...bomRows];
                              newRows[idx] = { ...newRows[idx], quantity: e.target.value };
                              const newData = isBomTableContainer(editTableData) ? { rows: newRows } : newRows;
                              setEditTableData(newData);
                            }}
                            style={{ border: 'none' }}
                          />
                        ),
                      },
                      {
                        title: '单位',
                        dataIndex: 'unit',
                        width: 80,
                        render: (text: string, _: BomTableRow, idx: number) => (
                          <Input
                            size="small"
                            value={text || ''}
                            onChange={(e) => {
                              const newRows = [...bomRows];
                              newRows[idx] = { ...newRows[idx], unit: e.target.value };
                              const newData = isBomTableContainer(editTableData) ? { rows: newRows } : newRows;
                              setEditTableData(newData);
                            }}
                            style={{ border: 'none' }}
                          />
                        ),
                      },
                    ];
                    return (
                      <ResizableTable
                        storageKey="template-bom-edit"
                        dataSource={bomRows}
                        columns={bomColumns}
                        pagination={false}
                        size="small"
                        bordered
                        rowKey={(record) => (record as any).materialCode || (record as any).id || `bom-${Math.random()}`}
                      />
                    );
                  }
                  // 工序进度单价模板（合并后的综合模板）
                  if (type === 'process' && isProcessTableData(editTableData)) {
                    // 多码单价管理组件
                    const SizePriceManager = () => (
                      <div style={{ marginBottom: 12, padding: 12, background: '#f9f9f9' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                          <Checkbox
                            checked={showSizePrices}
                            onChange={(e) => setShowSizePrices(e.target.checked)}
                          >
                            显示多码单价
                          </Checkbox>
                          {showSizePrices && (
                            <span style={{ color: 'var(--neutral-text-secondary)', fontSize: "var(--font-size-xs)" }}>
                              (各尺码单价不同时使用，默认使用工价)
                            </span>
                          )}
                        </div>
                        {showSizePrices && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ color: 'var(--neutral-text-secondary)', fontSize: "var(--font-size-sm)" }}>尺码：</span>
                            {templateSizes.map((s) => (
                              <Tag
                                key={s}
                                closable
                                onClose={() => {
                                  setTemplateSizes((prev) => prev.filter((x) => x !== s));
                                  // 从所有工序中删除该尺码
                                  const newData = {
                                    ...editTableData,
                                    sizes: templateSizes.filter((x) => x !== s),
                                    steps: editTableData.steps.map((step: ProcessStepRow) => {
                                      if (step.sizePrices) {
                                        const { [s]: _, ...rest } = step.sizePrices;
                                        return { ...step, sizePrices: rest };
                                      }
                                      return step;
                                    }),
                                  };
                                  setEditTableData(newData);
                                }}
                              >
                                {s}
                              </Tag>
                            ))}
                            <Input
                              size="small"
                              placeholder="添加尺码"
                              value={newSizeName}
                              onChange={(e) => setNewSizeName(e.target.value)}
                              onPressEnter={() => {
                                const trimmed = newSizeName.trim().toUpperCase();
                                if (!trimmed || templateSizes.includes(trimmed)) return;
                                setTemplateSizes((prev) => [...prev, trimmed]);
                                // 为所有工序添加该尺码
                                const newData = {
                                  ...editTableData,
                                  sizes: [...templateSizes, trimmed],
                                  steps: editTableData.steps.map((step: ProcessStepRow) => ({
                                    ...step,
                                    sizePrices: {
                                      ...(step.sizePrices || {}),
                                      [trimmed]: step.unitPrice ?? step.price ?? 0,
                                    },
                                  })),
                                };
                                setEditTableData(newData);
                                setNewSizeName('');
                              }}
                              style={{ width: 100 }}
                            />
                            <Button
                              size="small"
                              type="primary"
                              onClick={() => {
                                const trimmed = newSizeName.trim().toUpperCase();
                                if (!trimmed || templateSizes.includes(trimmed)) return;
                                setTemplateSizes((prev) => [...prev, trimmed]);
                                const newData = {
                                  ...editTableData,
                                  sizes: [...templateSizes, trimmed],
                                  steps: editTableData.steps.map((step: ProcessStepRow) => ({
                                    ...step,
                                    sizePrices: {
                                      ...(step.sizePrices || {}),
                                      [trimmed]: step.unitPrice ?? step.price ?? 0,
                                    },
                                  })),
                                };
                                setEditTableData(newData);
                                setNewSizeName('');
                              }}
                            >
                              添加
                            </Button>
                          </div>
                        )}
                      </div>
                    );

                    // 构建工序列配置（不使用useMemo，避免Hooks规则违反）
                    const baseColumns = [
                      {
                        title: '排序',
                        width: 40,
                        render: (_: unknown, __: ProcessStepRow, idx: number) => (
                          <span style={{ color: 'var(--neutral-text-disabled)', fontSize: "var(--font-size-xs)" }}>
                            {idx + 1}
                          </span>
                        ),
                      },
                        {
                          title: '工序编号',
                          dataIndex: 'processCode',
                          width: 55,
                          render: (text: string, _: ProcessStepRow, idx: number) => (
                            <Input
                              size="small"
                              value={text || ''}
                              onChange={(e) => {
                                const newData = { ...editTableData, steps: [...editTableData.steps] };
                                newData.steps[idx] = { ...newData.steps[idx], processCode: e.target.value };
                                setEditTableData(newData);
                              }}
                              style={{ border: 'none', fontSize: "var(--font-size-xs)" }}
                            />
                          ),
                        },
                        {
                          title: '工序名称',
                          dataIndex: 'processName',
                          width: 80,
                          render: (text: string, _: ProcessStepRow, idx: number) => (
                            <Input
                              size="small"
                              value={text || ''}
                              onChange={(e) => {
                                const newData = { ...editTableData, steps: [...editTableData.steps] };
                                newData.steps[idx] = { ...newData.steps[idx], processName: e.target.value };
                                setEditTableData(newData);
                              }}
                              style={{ border: 'none', fontSize: "var(--font-size-xs)" }}
                            />
                          ),
                        },
                        {
                          title: '进度节点',
                          dataIndex: 'progressStage',
                          width: 70,
                          render: (value: string, _: ProcessStepRow, idx: number) => (
                            <Select
                              size="small"
                              value={value || undefined}
                              options={MAIN_PROGRESS_STAGE_OPTIONS}
                              placeholder="选择父节点"
                              allowClear
                              onChange={(val) => {
                                const newData = { ...editTableData, steps: [...editTableData.steps] };
                                newData.steps[idx] = { ...newData.steps[idx], progressStage: val || '' };
                                setEditTableData(newData);
                              }}
                              style={{ width: '100%', fontSize: "var(--font-size-xs)" }}
                              variant="borderless"
                            />
                          ),
                        },
                        {
                          title: '机器类型',
                          dataIndex: 'machineType',
                          width: 70,
                          render: (text: string, _: ProcessStepRow, idx: number) => (
                            <Input
                              size="small"
                              value={text || ''}
                              onChange={(e) => {
                                const newData = { ...editTableData, steps: [...editTableData.steps] };
                                newData.steps[idx] = { ...newData.steps[idx], machineType: e.target.value };
                                setEditTableData(newData);
                              }}
                              style={{ border: 'none', fontSize: "var(--font-size-xs)" }}
                            />
                          ),
                        },
                        {
                          title: '工时(秒)',
                          dataIndex: 'standardTime',
                          width: 55,
                          render: (value: number, _: ProcessStepRow, idx: number) => (
                            <InputNumber
                              size="small"
                              value={value || 0}
                              min={0}
                              onChange={(val) => {
                                const newData = { ...editTableData, steps: [...editTableData.steps] };
                                newData.steps[idx] = { ...newData.steps[idx], standardTime: val || 0 };
                                setEditTableData(newData);
                              }}
                              style={{ width: '100%', fontSize: "var(--font-size-xs)" }}
                            />
                          ),
                        },
                        {
                          title: '工价(元)',
                          dataIndex: 'unitPrice',
                          width: 60,
                          render: (_: unknown, item: ProcessStepRow, idx: number) => (
                            <InputNumber
                              size="small"
                              value={item.unitPrice ?? item.price ?? 0}
                              min={0}
                              precision={2}
                              onChange={(val) => {
                                const newData = { ...editTableData, steps: [...editTableData.steps] };
                                newData.steps[idx] = { ...newData.steps[idx], unitPrice: val || 0 };
                                setEditTableData(newData);
                              }}
                              style={{ width: '100%', fontSize: "var(--font-size-xs)" }}
                            />
                          ),
                        },
                      ];

                      const sizeColumns = showSizePrices ? templateSizes.map((size) => ({
                        title: `${size}码`,
                        width: 55,
                        render: (_: unknown, item: ProcessStepRow, idx: number) => (
                          <div style={{ background: 'var(--color-bg-container)' }}>
                            <InputNumber
                              size="small"
                              value={item.sizePrices?.[size] ?? item.unitPrice ?? item.price ?? 0}
                              min={0}
                              precision={2}
                              onChange={(val) => {
                                const newData = { ...editTableData, steps: [...editTableData.steps] };
                                newData.steps[idx] = {
                                  ...newData.steps[idx],
                                  sizePrices: {
                                    ...(newData.steps[idx].sizePrices || {}),
                                    [size]: val || 0,
                                  },
                                };
                                setEditTableData(newData);
                              }}
                              style={{ width: '100%', fontSize: "var(--font-size-xs)" }}
                            />
                          </div>
                        ),
                      })) : [];

                    const actionColumn = {
                      title: '操作',
                      width: 36,
                      render: (_: unknown, __: ProcessStepRow, idx: number) => (
                        <Button
                          type="link"
                          danger
                          size="small"
                          icon={<DeleteOutlined style={{ fontSize: "var(--font-size-xs)" }} />}
                          onClick={() => {
                            const kept = editTableData.steps.filter((_s: ProcessStepRow, i: number) => i !== idx);
                            const newData = { ...editTableData, steps: normalizeProcessSteps(kept) };
                            setEditTableData(newData);
                          }}
                          style={{ padding: 0 }}
                        />
                      ),
                    };

                    const processColumns = [...baseColumns, ...sizeColumns, actionColumn];

                    return (
                      <div>
                        <SizePriceManager />
                        <ResizableTable
                          storageKey="template-process-edit"
                          dataSource={editTableData.steps}
                          columns={processColumns}
                          pagination={false}
                          size="small"
                          bordered
                          scroll={{ x: showSizePrices ? 650 + templateSizes.length * 60 : 650 }}
                          rowKey={(record) => (record as any).processCode || (record as any).id || `process-${Math.random()}`}
                          footer={() => (
                            <Button
                              type="dashed"
                              size="small"
                              style={{ width: '100%' }}
                              onClick={() => {
                                // 计算下一个序号：找出当前最大序号 + 1
                                const maxCode = editTableData.steps.reduce((max, step) => {
                                  const code = Number.parseInt(String(step.processCode ?? '').trim() || '0', 10);
                                  return Number.isFinite(code) && code > max ? code : max;
                                }, 0);
                                const nextCode = String(maxCode + 1).padStart(2, '0');

                                const newRow: ProcessStepRow = {
                                  processCode: nextCode,
                                  processName: '',
                                  progressStage: '',
                                  machineType: '',
                                  standardTime: 0,
                                  unitPrice: 0,
                                  sizePrices: templateSizes.reduce((acc, size) => ({ ...acc, [size]: 0 }), {}),
                                };
                                // 直接添加到末尾，不调用 normalizeProcessSteps
                                const newData = { ...editTableData, steps: [...editTableData.steps, newRow] };
                                setEditTableData(newData);
                              }}
                            >
                              添加工序
                            </Button>
                          )}
                        />
                      </div>
                    );
                  }
                  // 工序单价模板（旧格式，兼容）
                  if (type === 'process_price' && isProcessPriceTableData(editTableData)) {
                    const processPriceColumns = [
                      {
                        title: '工序编号',
                        dataIndex: 'processCode',
                        width: 100,
                        render: (text: string, _: ProcessPriceRow, idx: number) => (
                          <Input
                            size="small"
                            value={text || ''}
                            onChange={(e) => {
                              const newData = { ...editTableData, steps: [...editTableData.steps] };
                              newData.steps[idx] = { ...newData.steps[idx], processCode: e.target.value };
                              setEditTableData(newData);
                            }}
                            style={{ border: 'none' }}
                          />
                        ),
                      },
                      {
                        title: '工序名称',
                        dataIndex: 'processName',
                        width: 150,
                        render: (text: string, _: ProcessPriceRow, idx: number) => (
                          <Input
                            size="small"
                            value={text || ''}
                            onChange={(e) => {
                              const newData = { ...editTableData, steps: [...editTableData.steps] };
                              newData.steps[idx] = { ...newData.steps[idx], processName: e.target.value };
                              setEditTableData(newData);
                            }}
                            style={{ border: 'none' }}
                          />
                        ),
                      },
                      {
                        title: '单价(元)',
                        dataIndex: 'unitPrice',
                        width: 100,
                        render: (value: number, _: ProcessPriceRow, idx: number) => (
                          <InputNumber
                            size="small"
                            value={value || 0}
                            min={0}
                            precision={2}
                            onChange={(val) => {
                              const newData = { ...editTableData, steps: [...editTableData.steps] };
                              newData.steps[idx] = { ...newData.steps[idx], unitPrice: val || 0 };
                              setEditTableData(newData);
                            }}
                            style={{ width: '100%' }}
                          />
                        ),
                      },
                    ];
                    return (
                      <ResizableTable
                        storageKey="template-process-price-edit"
                        dataSource={editTableData.steps}
                        columns={processPriceColumns}
                        pagination={false}
                        size="small"
                        bordered
                        rowKey={(record) => (record as any).processCode || (record as any).id || `price-${Math.random()}`}
                      />
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
              <div style={{ color: 'var(--neutral-text-disabled)', padding: 8 }}>无效的模板内容</div>
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
      >
        {renderVisualContent()}
      </ResizableModal>

      {/* 按款号批量刷新工序进度单价 */}
      <ResizableModal
        open={syncPriceOpen}
        title="按款号更新工序进度单价"
        width={400}
        centered
        onCancel={() => setSyncPriceOpen(false)}
        okText="开始同步"
        confirmLoading={syncPriceLoading}
        onOk={async () => {
          const sn = syncPriceStyleNo.trim();
          if (!sn) { message.error('请输入款号'); return; }
          setSyncPriceLoading(true);
          try {
            const res = await api.post<{ code: number; message: string; data?: Record<string, unknown> }>('/template-library/sync-process-prices', { styleNo: sn });
            if (res.code === 200) {
              const d = res.data as any;
              message.success(`同步完成：${d?.totalOrders ?? 0}个订单，共更新 ${d?.totalSynced ?? 0} 条工序单价`);
              setSyncPriceOpen(false);
            } else {
              message.error(res.message || '同步失败');
            }
          } catch {
            message.error('同步失败');
          } finally {
            setSyncPriceLoading(false);
          }
        }}
        initialHeight={260}
      >
        <Space direction="vertical" style={{ width: '100%', padding: '8px 0' }}>
          <Typography.Text type="secondary">
            输入款号，自动将模板库配置的工序单价同步到该款号下所有大货生产订单。
          </Typography.Text>
          <AutoComplete
            value={syncPriceStyleNo}
            style={{ width: '100%' }}
            placeholder="输入或选择款号"
            options={styleNoOptions}
            onSearch={(v) => fetchStyleNoOptions(v)}
            onChange={(v) => setSyncPriceStyleNo(String(v || ''))}
            allowClear
          />
        </Space>
      </ResizableModal>
    </Layout>
  );
};

export default TemplateCenter;
