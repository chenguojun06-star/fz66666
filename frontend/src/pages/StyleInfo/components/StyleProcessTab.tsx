import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, InputNumber, message, Space, Select, Modal } from 'antd';
import { PlusOutlined, DeleteOutlined, SaveOutlined, EditOutlined } from '@ant-design/icons';
import { StyleProcess, TemplateLibrary } from '../../../types/style';
import api, { toNumberSafe } from '../../../utils/api';
import { useViewport } from '../../../utils/useViewport';
import ResizableTable from '../../../components/common/ResizableTable';
import RowActions from '../../../components/common/RowActions';

interface Props {
  styleId: string | number;
  readOnly?: boolean;
}

const norm = (v: unknown) => String(v || '').trim();

const isTempId = (id: any) => {
  const s = String(id ?? '').trim();
  if (!s) return true;
  return s.startsWith('-');
};

const StyleProcessTab: React.FC<Props> = ({ styleId, readOnly }) => {
  const [data, setData] = useState<StyleProcess[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [deletedIds, setDeletedIds] = useState<Array<string | number>>([]);
  const snapshotRef = useRef<StyleProcess[] | null>(null);
  const [processTemplateKey, setProcessTemplateKey] = useState<string | undefined>(undefined);
  const [processTemplates, setProcessTemplates] = useState<TemplateLibrary[]>([]);
  const [templateSourceStyleNo, setTemplateSourceStyleNo] = useState('');
  const [templateLoading, setTemplateLoading] = useState(false);

  const [styleNoOptions, setStyleNoOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [styleNoLoading, setStyleNoLoading] = useState(false);
  const styleNoReqSeq = useRef(0);
  const styleNoTimerRef = useRef<number | undefined>(undefined);
  const { tableScrollY } = useViewport();

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

  const fetchProcessTemplates = async (sourceStyleNo?: string) => {
    const sn = String(sourceStyleNo ?? '').trim();
    setTemplateLoading(true);
    try {
      const res = await api.get<{ code: number; data: { records: unknown[]; total: number } }>('/template-library/list', {
        params: {
          page: 1,
          pageSize: 200,
          templateType: 'process',
          keyword: '',
          sourceStyleNo: sn,
        },
      });
      const result = res as Record<string, unknown>;
      if (result.code === 200) {
        const records = (result.data?.records || []) as TemplateLibrary[];
        setProcessTemplates(Array.isArray(records) ? records : []);
        return;
      }
    } catch {
    // Intentionally empty
      // 忽略错误
    } finally {
      setTemplateLoading(false);
    }

    try {
      const res = await api.get<{ code: number; data: unknown[] }>('/template-library/type/process');
      const result = res as Record<string, unknown>;
      if (result.code === 200) {
        setProcessTemplates(Array.isArray(result.data) ? result.data : []);
      }
    } catch {
    // Intentionally empty
      // 忽略错误
    }
  };

  // 获取数据
  const fetchProcess = async () => {
    setLoading(true);
    try {
      const res = await api.get<StyleProcess[]>(`/style/process/list?styleId=${styleId}`);
      const result = res as Record<string, unknown>;
      if (result.code === 200) {
        setData(result.data || []);
        setDeletedIds([]);
        setEditMode(false);
        snapshotRef.current = null;
      }
    } catch (error) {
      message.error('获取工序表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProcess();
  }, [styleId]);

  useEffect(() => {
    fetchProcessTemplates('');
    fetchStyleNoOptions('');
  }, []);

  const enterEdit = () => {
    if (readOnly) return;
    if (editMode) return;
    snapshotRef.current = JSON.parse(JSON.stringify(data)) as StyleProcess[];
    setEditMode(true);
  };

  const exitEdit = () => {
    const snap = snapshotRef.current;
    if (snap) {
      setData(snap);
    }
    setDeletedIds([]);
    setEditMode(false);
    snapshotRef.current = null;
  };

  // 新增行
  const handleAdd = () => {
    if (readOnly) return;
    if (!editMode) enterEdit();
    const maxSort = data.length ? Math.max(...data.map((d) => toNumberSafe(d.sortOrder))) : 0;
    const newId = -Date.now();
    const newProcess: StyleProcess = {
      id: newId,
      styleId,
      processCode: '',
      processName: '',
      machineType: '',
      standardTime: 0,
      price: 0,
      sortOrder: maxSort + 1,
    };
    setData((prev) => [...prev, newProcess]);
  };

  const applyProcessTemplate = async (templateId: string) => {
    if (readOnly) return;
    if (editMode) {
      message.error('请先保存或退出编辑再导入模板');
      return;
    }
    const sid = Number(styleId);
    if (!Number.isFinite(sid) || sid <= 0) {
      message.error('styleId不合法');
      return;
    }
    try {
      const res = await api.post<{ code: number; message: string; data: boolean }>('/template-library/apply-to-style', {
        templateId,
        targetStyleId: sid,
        mode: 'overwrite',
      });
      const result = res as Record<string, unknown>;
      if (result.code !== 200) {
        message.error(result.message || '导入失败');
        return;
      }
      message.success('已导入工艺模板');
      setProcessTemplateKey(undefined);
      fetchProcess();
    } catch (e: unknown) {
      message.error(e?.message || '导入失败');
    }
  };

  // 删除行
  const handleDelete = (id: string | number) => {
    if (readOnly) return;
    if (!editMode) enterEdit();
    if (!isTempId(id)) setDeletedIds((prev) => [...prev, id]);
    setData((prev) => prev.filter((x) => x.id !== id));
  };

  const updateField = (id: string | number, field: keyof StyleProcess, value: any) => {
    setData((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const saveAll = async () => {
    if (readOnly) return;
    const rows = data;
    if (!rows.length) {
      message.error('请先添加工序');
      return;
    }

    const codes = rows.map((r) => norm(r.processCode)).filter(Boolean);
    if (codes.length !== new Set(codes).size) {
      message.error('工序编码不能重复');
      return;
    }

    const invalid = rows.find((r) => !norm(r.processCode) || !norm(r.processName) || r.price == null);
    if (invalid) {
      message.error('请完善必填项：工序编码、工序名称、工价');
      return;
    }

    setSaving(true);
    try {
      const deleteTasks = Array.from(new Set(deletedIds.map((x) => String(x)).filter(Boolean))).map((id) =>
        api.delete(`/style/process/${id}`),
      );
      if (deleteTasks.length) {
        const delResults = await Promise.all(deleteTasks);
        const delBad = delResults.find((r: Record<string, unknown>) => (r as Record<string, unknown>)?.code !== 200);
        if (delBad) {
          message.error((delBad as Record<string, unknown>)?.message || '删除失败');
          return;
        }
      }

      const tasks: Array<Promise<unknown>> = [];
      rows.forEach((r) => {
        const payload: unknown = {
          id: r.id,
          styleId,
          processCode: norm(r.processCode),
          processName: norm(r.processName),
          machineType: norm(r.machineType),
          standardTime: toNumberSafe(r.standardTime),
          price: toNumberSafe(r.price),
          sortOrder: toNumberSafe(r.sortOrder),
        };
        if (!isTempId(r.id)) {
          tasks.push(api.put('/style/process', payload));
        } else {
          const createPayload = { ...payload };
          delete createPayload.id;
          tasks.push(api.post('/style/process', createPayload));
        }
      });

      const results = await Promise.all(tasks);
      const bad = results.find((r: Record<string, unknown>) => (r as Record<string, unknown>)?.code !== 200);
      if (bad) {
        message.error((bad as Record<string, unknown>)?.message || '保存失败');
        return;
      }

      message.success('保存成功');
      setEditMode(false);
      snapshotRef.current = null;
      await fetchProcess();
    } catch (e: unknown) {
      message.error(e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  // 列定义
  const columns = useMemo(() => {
    const editableMode = editMode && !readOnly;
    return [
      {
        title: '工序编码',
        dataIndex: 'processCode',
        width: 120,
        ellipsis: true,
        render: (text: string, record: StyleProcess) =>
          editableMode ? (
            <Input value={record.processCode} onChange={(e) => updateField(record.id!, 'processCode', e.target.value)} />
          ) : (
            text
          ),
      },
      {
        title: '工序名称',
        dataIndex: 'processName',
        width: 160,
        ellipsis: true,
        render: (text: string, record: StyleProcess) =>
          editableMode ? (
            <Input value={record.processName} onChange={(e) => updateField(record.id!, 'processName', e.target.value)} />
          ) : (
            text
          ),
      },
      {
        title: '机器类型',
        dataIndex: 'machineType',
        width: 130,
        ellipsis: true,
        render: (text: string, record: StyleProcess) =>
          editableMode ? (
            <Input
              value={record.machineType}
              placeholder="平车/锁眼/钉扣"
              onChange={(e) => updateField(record.id!, 'machineType', e.target.value)}
            />
          ) : (
            text
          ),
      },
      {
        title: '标准工时(秒)',
        dataIndex: 'standardTime',
        width: 140,
        render: (text: number, record: StyleProcess) =>
          editableMode ? (
            <InputNumber
              value={record.standardTime}
              min={0}
              style={{ width: '100%' }}
              onChange={(v) => updateField(record.id!, 'standardTime', toNumberSafe(v))}
            />
          ) : (
            text
          ),
      },
      {
        title: '工价(元)',
        dataIndex: 'price',
        width: 130,
        render: (text: number, record: StyleProcess) =>
          editableMode ? (
            <InputNumber
              value={record.price}
              min={0}
              step={0.01}
              prefix="¥"
              style={{ width: '100%' }}
              onChange={(v) => updateField(record.id!, 'price', v)}
            />
          ) : (
            `¥${toNumberSafe(text)}`
          ),
      },
      {
        title: '排序',
        dataIndex: 'sortOrder',
        width: 80,
        render: (text: number, record: StyleProcess) =>
          editableMode ? (
            <InputNumber
              value={record.sortOrder}
              min={0}
              style={{ width: '100%' }}
              onChange={(v) => updateField(record.id!, 'sortOrder', toNumberSafe(v))}
            />
          ) : (
            text
          ),
      },
      {
        title: '操作',
        dataIndex: 'operation',
        width: 120,
        resizable: false,
        render: (_: any, record: StyleProcess) =>
          editableMode ? (
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
          ) : null,
      },
    ];
  }, [data, editMode, readOnly]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Space>
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
            disabled={Boolean(readOnly) || loading || saving || templateLoading}
          />

          <Button disabled={Boolean(readOnly) || loading || saving || templateLoading} onClick={() => fetchProcessTemplates(templateSourceStyleNo)}>
            筛选
          </Button>

          <Button
            disabled={Boolean(readOnly) || loading || saving || templateLoading}
            onClick={() => {
              setTemplateSourceStyleNo('');
              fetchProcessTemplates('');
            }}
          >
            全部
          </Button>

          <Select
            allowClear
            style={{ width: 220 }}
            placeholder="导入工艺模板"
            value={processTemplateKey}
            onChange={(v) => setProcessTemplateKey(v)}
            options={processTemplates.map((t) => ({
              value: String(t.id || ''),
              label: t.sourceStyleNo ? `${t.templateName}（${t.sourceStyleNo}）` : t.templateName,
            }))}
            disabled={Boolean(readOnly) || loading || saving || templateLoading}
          />

          <Button
            onClick={() => {
              if (!processTemplateKey) {
                message.error('请选择模板');
                return;
              }
              applyProcessTemplate(processTemplateKey);
            }}
            disabled={Boolean(readOnly) || loading || saving || templateLoading}
          >
            导入模板
          </Button>

          <Button onClick={handleAdd} disabled={Boolean(readOnly)} type="primary" icon={<PlusOutlined />}>
            添加工序
          </Button>

          {!editMode || readOnly ? (
            <Button icon={<EditOutlined />} onClick={enterEdit} disabled={loading || saving || Boolean(readOnly)}>
              编辑
            </Button>
          ) : (
            <>
              <Button icon={<SaveOutlined />} type="primary" onClick={saveAll} loading={saving}>
                保存
              </Button>
              <Button
                disabled={saving}
                onClick={() => {
                  Modal.confirm({
                    title: '放弃未保存的修改？',
                    onOk: exitEdit,
                  });
                }}
              >
                取消
              </Button>
            </>
          )}
        </Space>
      </div>
      <ResizableTable
        bordered
        dataSource={data}
        columns={columns as Record<string, unknown>}
        pagination={false}
        loading={loading}
        rowKey="id"
        scroll={{ x: 'max-content', y: tableScrollY }}
        storageKey={`style-process-${String(styleId)}`}
        minColumnWidth={70}
      />
    </div>
  );
};

export default StyleProcessTab;
