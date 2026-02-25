import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, InputNumber, Space, Select, Modal, App, Popover } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { StyleProcess, TemplateLibrary } from '@/types/style';
import api, { toNumberSafe } from '@/utils/api';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';

import StyleStageControlBar from './StyleStageControlBar';

interface Props {
  styleId: string | number;
  readOnly?: boolean;
  hidePrice?: boolean; // 是否隐藏单价列
  progressNode?: string; // 进度节点
  processAssignee?: string;
  processStartTime?: string;
  processCompletedTime?: string;
  onRefresh?: () => void; // 刷新父组件的回调
}

// 多码单价数据接口
interface SizePrice {
  id?: string;
  styleId: number;
  processCode: string;
  processName: string;
  progressStage?: string;
  size: string;
  price: number;
}

// 扩展的工序数据，包含各尺码单价
interface StyleProcessWithSizePrice extends StyleProcess {
  sizePrices?: Record<string, number>; // { 'XS': 2.5, 'S': 2.5, 'M': 3.0 }
  sizePriceTouched?: Record<string, boolean>;
}

const norm = (v: unknown) => String(v || '').trim();

const isTempId = (id: any) => {
  const s = String(id ?? '').trim();
  if (!s) return true;
  return s.startsWith('-');
};

const StyleProcessTab: React.FC<Props> = ({
  styleId,
  readOnly,
  hidePrice = false,
  progressNode: _progressNode,
  processAssignee,
  processStartTime,
  processCompletedTime,
  onRefresh,
}) => {
  const { message } = App.useApp();
  const [data, setData] = useState<StyleProcessWithSizePrice[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [deletedIds, setDeletedIds] = useState<Array<string | number>>([]);
  const snapshotRef = useRef<StyleProcessWithSizePrice[] | null>(null);
  const [processTemplateKey, setProcessTemplateKey] = useState<string | undefined>(undefined);
  const [processTemplates, setProcessTemplates] = useState<TemplateLibrary[]>([]);
  const [templateSourceStyleNo, setTemplateSourceStyleNo] = useState('');
  const [templateLoading, setTemplateLoading] = useState(false);

  // 多码单价相关状态
  const [sizes, setSizes] = useState<string[]>([]);
  const showSizePrices = true; // 始终显示多码单价列
  const [newSizeName, setNewSizeName] = useState('');
  const [addSizePopoverOpen, setAddSizePopoverOpen] = useState(false);
  const defaultSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

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
      const res = await api.get<{ code: number; data: { records: unknown[]; total: number } | unknown[] }>('/template-library/list', {
        params: {
          page: 1,
          pageSize: 200,
          templateType: 'process',
          keyword: '',
          sourceStyleNo: sn,
        },
      });
      const result = res as any;
      if (result.code === 200) {
        // 兼容两种返回格式：分页格式 {records: [...]} 或 直接数组 [...]
        const data = result.data as { records?: unknown[] } | unknown[];
        const records = Array.isArray(data) ? data : ((data as { records?: unknown[] })?.records || []);
        setProcessTemplates(Array.isArray(records) ? records as TemplateLibrary[] : []);
        return;
      }
    } catch {
    // Intentionally empty
      // 忽略错误
    } finally {
      setTemplateLoading(false);
    }

    try {
      const res = await api.get<{ code: number; data: any[] }>('/template-library/type/process');
      const result = res as any;
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
      // 同时获取工序数据和多码单价数据
      const [processRes, sizePriceRes] = await Promise.all([
        api.get<StyleProcess[]>(`/style/process/list?styleId=${styleId}`),
        api.get<{ code: number; data: SizePrice[] }>(`/style/size-price/list`, { params: { styleId } }),
      ]);

      const processResult = processRes as any;
      const sizePriceResult = sizePriceRes as any;

      if (processResult.code === 200) {
        const processData = (processResult.data || []) as StyleProcess[];

        // 处理多码单价数据
        let sizePriceData: SizePrice[] = [];
        let sizeList: string[] = [...defaultSizes];

        if (sizePriceResult.code === 200 && sizePriceResult.data) {
          sizePriceData = sizePriceResult.data as SizePrice[];
          // 从已保存的数据中提取尺码列表
          const savedSizes = new Set<string>();
          sizePriceData.forEach((sp: SizePrice) => {
            if (sp.size) savedSizes.add(sp.size.trim());
          });
          if (savedSizes.size > 0) {
            sizeList = Array.from(savedSizes).sort((a, b) => {
              const order = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL'];
              const ia = order.indexOf(a);
              const ib = order.indexOf(b);
              if (ia >= 0 && ib >= 0) return ia - ib;
              if (ia >= 0) return -1;
              if (ib >= 0) return 1;
              return a.localeCompare(b);
            });
          }
        }
        setSizes(sizeList);

        // 合并工序数据和多码单价
        const mergedData: StyleProcessWithSizePrice[] = processData.map((proc) => {
          const sizePrices: Record<string, number> = {};
          const sizePriceTouched: Record<string, boolean> = {};
          sizeList.forEach((size) => {
            const found = sizePriceData.find(
              (sp) => sp.processCode === proc.processCode && sp.size === size
            );
            // 如果没有多码单价，使用工序基础单价
            sizePrices[size] = found ? toNumberSafe(found.price) : toNumberSafe(proc.price);
            sizePriceTouched[size] = Boolean(found);
          });
          return { ...proc, sizePrices, sizePriceTouched };
        });

        const sortedData = [...mergedData]
          .sort((a, b) => toNumberSafe(a.sortOrder) - toNumberSafe(b.sortOrder))
          .map((row, index) => ({
            ...row,
            sortOrder: index + 1,
            processCode: String(index + 1).padStart(2, '0'),
          }));

        setData(sortedData);
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

  const enterEdit = async () => {
    if (readOnly) return;
    if (editMode) return;

    // 首次编辑时调用开始API
    if (!processStartTime && styleId) {
      try {
        const res = await api.post(`/style/info/${styleId}/process/start`);
        if (res.code === 200) {
          // 刷新数据以获取最新的开始时间
          if (onRefresh) onRefresh();
        }
      } catch (error) {
        console.error('记录工序开始时间失败:', error);
      }
    }

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
    const nextSort = maxSort + 1;
    // 自动生成工序编码：01、02、03...
    const autoCode = String(nextSort).padStart(2, '0');
    // 初始化各尺码单价为0
    const sizePrices: Record<string, number> = {};
    const sizePriceTouched: Record<string, boolean> = {};
    sizes.forEach((s) => {
      sizePrices[s] = 0;
      sizePriceTouched[s] = false;
    });
    const newProcess: StyleProcessWithSizePrice = {
      id: newId,
      styleId,
      processCode: autoCode,
      processName: '',
      progressStage: '车缝', // 默认车缝节点
      machineType: '',
      standardTime: 0,
      price: 0,
      sortOrder: nextSort,
      sizePrices,
      sizePriceTouched,
    };
    setData((prev) => [...prev, newProcess]);
  };

  // 添加尺码
  const handleAddSize = () => {
    const trimmed = newSizeName.trim().toUpperCase();
    if (!trimmed) {
      message.warning('请输入尺码');
      return;
    }
    if (sizes.includes(trimmed)) {
      message.warning('该尺码已存在');
      return;
    }
    setSizes((prev) => [...prev, trimmed]);
    // 为所有工序添加该尺码的默认单价
    setData((prev) =>
      prev.map((row) => ({
        ...row,
        sizePrices: { ...(row.sizePrices || {}), [trimmed]: toNumberSafe(row.price) },
        sizePriceTouched: { ...(row.sizePriceTouched || {}), [trimmed]: false },
      }))
    );
    setNewSizeName('');
    message.success(`已添加尺码: ${trimmed}`);
  };

  // 删除尺码
  const handleRemoveSize = (size: string) => {
    setSizes((prev) => prev.filter((s) => s !== size));
    setData((prev) =>
      prev.map((row) => {
        const { [size]: _, ...restSizePrices } = row.sizePrices || {};
        const { [size]: __, ...restTouched } = row.sizePriceTouched || {};
        return { ...row, sizePrices: restSizePrices, sizePriceTouched: restTouched };
      })
    );
    message.success(`已删除尺码: ${size}`);
  };

  // 更新尺码单价
  const updateSizePrice = (id: string | number, size: string, value: number) => {
    setData((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
            ...r,
            sizePrices: { ...(r.sizePrices || {}), [size]: value },
            sizePriceTouched: { ...(r.sizePriceTouched || {}), [size]: true },
          }
          : r
      )
    );
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
      const result = res as any;
      if (result.code !== 200) {
        message.error(result.message || '导入失败');
        return;
      }
      message.success('已导入工艺模板');
      setProcessTemplateKey(undefined);
      fetchProcess();
    } catch (e: any) {
      message.error(e?.message || '导入失败');
    }
  };

  // 删除行
  const handleDelete = (id: string | number) => {
    if (readOnly) return;
    if (!editMode) enterEdit();
    if (!isTempId(id)) setDeletedIds((prev) => [...prev, id]);
    setData((prev) => {
      const filtered = prev.filter((x) => x.id !== id);
      // 删除后自动重新排序和重新生成编码
      return filtered.map((item, index) => ({
        ...item,
        sortOrder: index + 1,
        processCode: String(index + 1).padStart(2, '0'),
      }));
    });
  };

  const updateField = (id: string | number, field: keyof StyleProcess, value: any) => {
    setData((prev) => prev.map((r) => {
      if (r.id !== id) return r;
      if (field !== 'price') {
        return { ...r, [field]: value };
      }
      const nextPrice = toNumberSafe(value);
      const oldPrice = toNumberSafe(r.price);
      const nextSizePrices: Record<string, number> = { ...(r.sizePrices || {}) };
      const touched = r.sizePriceTouched || {};

      sizes.forEach((s) => {
        const current = toNumberSafe(nextSizePrices[s]);
        const isTouched = Boolean(touched[s]);
        if (!isTouched || current === oldPrice) {
          nextSizePrices[s] = nextPrice;
        }
      });

      return {
        ...r,
        price: nextPrice,
        sizePrices: nextSizePrices,
      };
    }));
  };

  const saveAll = async () => {
    if (readOnly) return;
    const rows = data.map((r, index) => ({
      ...r,
      sortOrder: index + 1,
      processCode: String(index + 1).padStart(2, '0'),
    }));
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
        const delBad = delResults.find((r: Record<string, unknown>) => (r as any)?.code !== 200);
        if (delBad) {
          message.error((delBad as any)?.message || '删除失败');
          return;
        }
      }

      const tasks: Array<Promise<unknown>> = [];
      rows.forEach((r) => {
        const payload: any = {
          id: r.id,
          styleId,
          processCode: norm(r.processCode),
          processName: norm(r.processName),
          progressStage: norm(r.progressStage) || '车缝',
          machineType: norm(r.machineType),
          standardTime: r.standardTime != null ? toNumberSafe(r.standardTime) : 0,
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
      const bad = results.find((r: Record<string, unknown>) => (r as any)?.code !== 200);
      if (bad) {
        message.error((bad as any)?.message || '保存失败');
        return;
      }

      // 保存多码单价数据（如果开启了多码单价显示）
      if (showSizePrices && sizes.length > 0) {
        try {
          const sizePriceList: SizePrice[] = [];
          rows.forEach((row) => {
            sizes.forEach((size) => {
              const price = toNumberSafe(row.sizePrices?.[size] ?? row.price);
              sizePriceList.push({
                styleId: Number(styleId),
                processCode: norm(row.processCode),
                processName: norm(row.processName),
                progressStage: norm(row.progressStage) || '车缝',
                size,
                price,
              });
            });
          });
          await api.post('/style/size-price/batch-save', sizePriceList);
        } catch (error) {
          console.error('保存多码单价失败:', error);
        }
      }

      message.success('保存成功，请点击“完成”按鈕锁定工序单价');
      setEditMode(false);
      snapshotRef.current = null;
      await fetchProcess();
      if (onRefresh) onRefresh(); // 刷新父组件数据
    } catch (e: any) {
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
        title: '排序',
        dataIndex: 'sortOrder',
        width: 80,
        render: (_: number, _record: StyleProcess, index: number) => index + 1,
      },
      {
        title: '工序编码',
        dataIndex: 'processCode',
        width: 100,
        ellipsis: true,
        render: (text: string) => text || '-',
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
        title: '进度节点',
        dataIndex: 'progressStage',
        width: 130,
        ellipsis: true,
        render: (text: string, record: StyleProcess) =>
          editableMode ? (
            <Select
              value={record.progressStage || '车缝'}
              style={{ width: '100%' }}
              onChange={(v) => updateField(record.id!, 'progressStage', v)}
              options={[
                { label: '采购', value: '采购' },
                { label: '裁剪', value: '裁剪' },
                { label: '车缝', value: '车缝' },
                { label: '二次工艺', value: '二次工艺' },
                { label: '尾部', value: '尾部' },
                { label: '入库', value: '入库' },
              ]}
            />
          ) : (
            record.progressStage || '车缝'
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
      ...(!hidePrice ? [{
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
      }] : []),
      // 多码单价列（动态生成）
      ...(showSizePrices ? sizes.map((size) => ({
        title: (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <span>{size}码</span>
            {editableMode && (
              <DeleteOutlined
                style={{ color: 'var(--color-danger)', cursor: 'pointer', fontSize: "var(--font-size-xs)" }}
                onClick={(e) => {
                  e.stopPropagation();
                  Modal.confirm({
                    title: `确定删除"${size}"码？`,
                    content: '删除后该尺码的单价数据将被清除',
                    onOk: () => handleRemoveSize(size),
                  });
                }}
              />
            )}
          </div>
        ),
        dataIndex: `sizePrice_${size}`,
        width: 90,
        render: (_: any, record: StyleProcessWithSizePrice) => {
          const price = record.sizePrices?.[size] ?? record.price ?? 0;
          return editableMode ? (
            <InputNumber
              value={price}
              min={0}
              step={0.01}
              prefix="¥"
              size="small"
              style={{ width: '100%' }}
              onChange={(v) => updateSizePrice(record.id!, size, toNumberSafe(v))}
            />
          ) : (
            `¥${toNumberSafe(price)}`
          );
        },
      })) : []),
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
  }, [data, editMode, readOnly, showSizePrices, sizes]);

  return (
    <div>
      {/* 进度节点 - 已隐藏 */}
      {/* {progressNode && (
        <div style={{
          marginBottom: 12,
          padding: '10px 16px',
          background: 'var(--primary-color)',

          color: 'var(--neutral-white)',
          fontSize: '15px',
          fontWeight: 600,
        }}>
          进度节点：{progressNode}
        </div>
      )} */}
      {/* 统一状态控制栏 */}
      <StyleStageControlBar
        stageName="工序单价"
        styleId={styleId}
        apiPath="process"
        status={processCompletedTime ? 'COMPLETED' : processStartTime ? 'IN_PROGRESS' : 'NOT_STARTED'}
        assignee={processAssignee}
        startTime={processStartTime}
        completedTime={processCompletedTime}
        readOnly={readOnly}
        onRefresh={onRefresh}
        onBeforeComplete={async () => {
          if (!data || data.length === 0) {
            message.error('请先配置工序单价');
            return false;
          }
          return true;
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div />
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

          <Button onClick={handleAdd} disabled={Boolean(readOnly)} type="primary">
            添加工序
          </Button>

          {/* 添加码数按钮 */}
          <Popover
            trigger="click"
            placement="bottomRight"
            open={addSizePopoverOpen}
            onOpenChange={setAddSizePopoverOpen}
            content={
              <div style={{ width: 200 }}>
                <div style={{ marginBottom: 8, fontWeight: 500 }}>添加新尺码</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Input
                    size="small"
                    placeholder="如: 3XL, 4XL"
                    value={newSizeName}
                    onChange={(e) => setNewSizeName(e.target.value)}
                    onPressEnter={() => {
                      handleAddSize();
                      setAddSizePopoverOpen(false);
                    }}
                    style={{ flex: 1 }}
                  />
                  <Button
                    size="small"
                    type="primary"
                    onClick={() => {
                      handleAddSize();
                      setAddSizePopoverOpen(false);
                    }}
                  >
                    添加
                  </Button>
                </div>
                <div style={{ marginTop: 8, fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-disabled)' }}>
                  当前: {sizes.join(', ')}
                </div>
              </div>
            }
          >
            <Button disabled={!editMode || Boolean(readOnly)}>
              添加码数
            </Button>
          </Popover>

          {!editMode || readOnly ? (
            <Button type="primary" onClick={enterEdit} disabled={loading || saving || Boolean(readOnly)}>
              编辑
            </Button>
          ) : (
            <>
              <Button type="primary" onClick={saveAll} loading={saving}>
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
        dataSource={data as unknown as any[]}
        columns={columns as unknown as any[]}
        pagination={false}
        loading={loading}
        rowKey="id"
        scroll={{ x: 'max-content' }}
        storageKey={`style-process-${String(styleId)}`}
        minColumnWidth={70}
      />
    </div>
  );
};

export default StyleProcessTab;
