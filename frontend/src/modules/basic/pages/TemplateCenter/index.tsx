import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Card, Form, Image, Input, Select, Space, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
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
import SyncProcessPriceModal from './components/SyncProcessPriceModal';
import CreateFromStyleModal from './components/CreateFromStyleModal';
import ApplyToStyleModal from './components/ApplyToStyleModal';
import EditTemplateModal from './components/EditTemplateModal';
import type { EditTemplateModalRef } from './components/EditTemplateModal';
import { typeLabel, typeColor, formatTemplateKey, getErrorMessage, hasErrorFields, isSizeTableData, convertStyleSizeListToTable } from './utils/templateUtils';
import type { TemplateLibraryRecord } from './utils/templateUtils';

type PageResp<T> = {
  records: T[];
  total: number;
};

const { Text } = Typography;
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
  const editModalRef = useRef<EditTemplateModalRef>(null);

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

  // 按款号更新工序进度单价
  const [syncPriceOpen, setSyncPriceOpen] = useState(false);
  const [activeRow, _setActiveRow] = useState<TemplateLibrary | null>(null);
  const [viewContent, _setViewContent] = useState<string>('');
  const [viewObj, _setViewObj] = useState<unknown>(null);

  // 多码单价相关状态

  const isAdminUser = useMemo(() => isAdminUserFn(user), [user]);

  const isLocked = (row?: TemplateLibrary | null) => {
    const v = Number(row?.locked);
    return Number.isFinite(v) && v === 1;
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
      width: 500,
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
              onClick: () => editModalRef.current?.openEdit(row),
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
                onClick={() => setSyncPriceOpen(true)}
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

      <CreateFromStyleModal
        open={createOpen}
        form={createForm}
        styleNoOptions={styleNoOptions}
        styleNoLoading={styleNoLoading}
        modalWidth={modalWidth}
        onCancel={() => setCreateOpen(false)}
        onOk={submitCreate}
        onStyleNoSearch={scheduleFetchStyleNos}
        onStyleNoDropdownOpen={(open) => { if (open && !styleNoOptions.length) fetchStyleNoOptions(''); }}
      />

      <ApplyToStyleModal
        open={applyOpen}
        form={applyForm}
        activeRow={activeRow}
        styleNoOptions={styleNoOptions}
        styleNoLoading={styleNoLoading}
        modalWidth={modalWidth}
        typeLabel={typeLabel}
        onCancel={() => setApplyOpen(false)}
        onOk={submitApply}
        onStyleNoSearch={scheduleFetchStyleNos}
        onStyleNoDropdownOpen={(open) => { if (open && !styleNoOptions.length) fetchStyleNoOptions(''); }}
      />

      <EditTemplateModal
        ref={editModalRef}
        styleNoOptions={styleNoOptions}
        styleNoLoading={styleNoLoading}
        modalWidth={modalWidth}
        onFetchList={fetchList}
        onStyleNoSearch={scheduleFetchStyleNos}
        onStyleNoDropdownOpen={(open) => { if (open && !styleNoOptions.length) fetchStyleNoOptions(''); }}
      />

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
      <SyncProcessPriceModal
        open={syncPriceOpen}
        styleNoOptions={styleNoOptions}
        onCancel={() => setSyncPriceOpen(false)}
        onSearch={fetchStyleNoOptions}
      />
    </Layout>
  );
};

export default TemplateCenter;
