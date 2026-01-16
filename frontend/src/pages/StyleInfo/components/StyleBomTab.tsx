import React, { useEffect, useRef, useState } from 'react';
import { Button, Input, InputNumber, Popconfirm, Form, Select, message, Space, Tag } from 'antd';
import { PlusOutlined, DeleteOutlined, SaveOutlined, EditOutlined } from '@ant-design/icons';
import { StyleBom, TemplateLibrary } from '../../../types/style';
import api from '../../../utils/api';
import ResizableTable from '../../../components/ResizableTable';
import { useAuth } from '../../../utils/authContext';
import { getMaterialSortWeight, getMaterialTypeLabel, normalizeMaterialType } from '../../../utils/materialType';

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

  const locked = Boolean(readOnly);

  const isSupervisorOrAbove = (() => {
    const role = String((user as any)?.role || '').trim();
    const username = String((user as any)?.username || '').trim();
    const lower = role.toLowerCase();
    const perms = Array.isArray((user as any)?.permissions) ? (user as any).permissions : [];
    return (
      username === 'admin' ||
      role === '1' ||
      lower.includes('admin') ||
      lower.includes('manager') ||
      lower.includes('supervisor') ||
      role.includes('管理员') ||
      role.includes('主管') ||
      perms.includes('all')
    );
  })();

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

  useEffect(() => {
    fetchBom();
  }, [styleId]);

  useEffect(() => {
    fetchBomTemplates('');
    fetchStyleNoOptions('');
  }, []);

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
            <Form.Item name={rowName(record.id, 'unit')} style={{ margin: 0 }}>
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
            <Form.Item name={rowName(record.id, 'supplier')} style={{ margin: 0 }}>
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
            <Space>
              <Popconfirm title="确定删除?" onConfirm={() => handleDelete(record.id!)}>
                <Button type="link" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </Space>
          );
        }

        if (!isSupervisorOrAbove) {
          return null;
        }

        const editable = isEditing(record);
        return editable ? (
          <Space>
            <Button type="link" icon={<SaveOutlined />} onClick={() => save(String(record.id!))} />
            <Popconfirm title="确定取消?" onConfirm={cancel}>
              <Button type="link">取消</Button>
            </Popconfirm>
          </Space>
        ) : (
          <Space>
            <Button type="link" disabled={editingKey !== ''} icon={<EditOutlined />} onClick={() => edit(record)} />
            <Popconfirm title="确定删除?" onConfirm={() => handleDelete(record.id!)}>
              <Button type="link" danger disabled={editingKey !== ''} icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
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
        </Space>
      </div>
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
