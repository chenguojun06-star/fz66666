import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, InputNumber, Space, Select, App, Popover, Tag, Tooltip, Dropdown } from 'antd';
import { modal } from '@/utils/antdStatic';
import { DeleteOutlined, BulbOutlined, LoadingOutlined, DownOutlined, PlusOutlined } from '@ant-design/icons';
import { StyleProcess, TemplateLibrary } from '@/types/style';
import api, { toNumberSafe } from '@/utils/api';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import DictAutoComplete from '@/components/common/DictAutoComplete';
import { intelligenceApi, ProcessPriceHintResponse, ProcessTemplateItem } from '@/services/production/productionApi';
import { CATEGORY_CODE_OPTIONS } from '@/utils/styleCategory';
import { useDictOptions } from '@/hooks/useDictOptions';

import { STAGE_ACCENT, STAGE_ACCENT_LIGHT } from '@/utils/stageStyles';
import StyleStageControlBar from './StyleStageControlBar';
import StyleQuoteSuggestionInlineCard from './StyleQuoteSuggestionInlineCard';
import ProcessCostSummary from './ProcessCostSummary';

interface Props {
  styleId: string | number;
  styleNo?: string;
  readOnly?: boolean;
  hidePrice?: boolean; // 是否隐藏单价列
  progressNode?: string; // 进度节点
  processAssignee?: string;
  processStartTime?: string;
  processCompletedTime?: string;
  onRefresh?: () => void; // 刷新父组件的回调
  onDataLoaded?: (data: any[]) => void; // 数据加载完成后通知父组件
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

const STAGE_ORDER = ['采购', '裁剪', '车缝', '二次工艺', '尾部', '入库'];

const StyleProcessTab: React.FC<Props> = ({
  styleId,
  styleNo,
  readOnly,
  hidePrice = false,
  progressNode: _progressNode,
  processAssignee,
  processStartTime,
  processCompletedTime,
  onRefresh,
  onDataLoaded,
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
  const [templateLoading, setTemplateLoading] = useState(false);

  // 多码单价相关状态
  const [sizes, setSizes] = useState<string[]>([]);
  const showSizePrices = true; // 始终显示多码单价列
  const [sizeOptions, setSizeOptions] = useState<Array<{ value: string; label: string }>>([]);
  const defaultSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

  // AI 工序单价提示状态
  const [priceHints, setPriceHints] = useState<Record<string | number, ProcessPriceHintResponse | null>>({});
  const [priceHintLoading, setPriceHintLoading] = useState<Record<string | number, boolean>>({});
  const hintTimerRef = useRef<Record<string | number, ReturnType<typeof setTimeout>>>({});

  const { options: categoryOptions } = useDictOptions('category', CATEGORY_CODE_OPTIONS);

  // 获取码数字典选项
  const fetchSizeDictOptions = async () => {
    try {
      const res = await api.get<{ code: number; data: { records: any[] } | any[] }>('/system/dict/list', {
        params: { dictType: 'size', page: 1, pageSize: 200 },
      });
      const result = res as any;
      if (result.code === 200) {
        const data = result.data as { records?: any[] } | any[];
        const records = Array.isArray(data) ? data : ((data as { records?: any[] })?.records || []);
        const options = (Array.isArray(records) ? records : [])
          .filter((item: any) => item.dictLabel)
          .map((item: any) => ({ value: item.dictLabel, label: item.dictLabel }));
        setSizeOptions(options);
      }
    } catch {
      // 忽略错误
    }
  };

  // AI 工序补全状态
  const [aiOpen, setAiOpen] = useState(false);
  const [aiCategory, setAiCategory] = useState<string | undefined>(undefined);
  const [aiLoading, setAiLoading] = useState(false);

  /** 防抖获取工序单价提示（延迟 600ms，避免每个字都请求） */
  const fetchPriceHint = useCallback((rowId: string | number, processName: string, standardTime?: number) => {
    if (hintTimerRef.current[rowId]) clearTimeout(hintTimerRef.current[rowId]);
    if (!processName || processName.trim().length < 1) {
      setPriceHints(prev => ({ ...prev, [rowId]: null }));
      return;
    }
    hintTimerRef.current[rowId] = setTimeout(async () => {
      setPriceHintLoading(prev => ({ ...prev, [rowId]: true }));
      try {
        const res = await intelligenceApi.getProcessPriceHint(processName.trim(), standardTime) as any;
        if (res?.code === 200 && res.data?.usageCount > 0) {
          setPriceHints(prev => ({ ...prev, [rowId]: res.data as ProcessPriceHintResponse }));
        } else {
          setPriceHints(prev => ({ ...prev, [rowId]: null }));
        }
      } catch {
        setPriceHints(prev => ({ ...prev, [rowId]: null }));
      } finally {
        setPriceHintLoading(prev => ({ ...prev, [rowId]: false }));
      }
    }, 600);
  }, []);

  /** AI 工序补全：按品类拉取高频工序并追加到表格 */
  const handleAiTemplate = useCallback(async () => {
    setAiLoading(true);
    try {
      const res = await intelligenceApi.getProcessTemplate(aiCategory) as any;
      if (res?.code === 200 && Array.isArray(res.data?.processes) && res.data.processes.length > 0) {
        const incoming: ProcessTemplateItem[] = res.data.processes;
        let addedCount = 0;
        setData(prev => {
          const existingNames = new Set(prev.map(r => String(r.processName || '').trim()));
          const base = prev.length;
          const toAdd: StyleProcessWithSizePrice[] = incoming
            .filter(p => !existingNames.has(String(p.processName || '').trim()))
            .map((p, idx) => ({
              id: -(Date.now() + idx) as unknown as number,
              styleId: Number(styleId),
              processCode: '',
              processName: p.processName,
              progressStage: p.progressStage ?? '',
              price: p.suggestedPrice,
              standardTime: p.avgStandardTime,
              sortOrder: (base + idx + 1) * 10,
            } as any));
          addedCount = toAdd.length;
          return [...prev, ...toAdd];
        });
        // 次帧提示（等 setData 完成）
        setTimeout(() => {
          if (addedCount > 0) {
            message.success(`AI已补全 ${addedCount} 道工序（${res.data.category || aiCategory || '历史数据'} · ${res.data.sampleStyleCount ?? '?'} 个样本）`);
          } else {
            message.info('所有工序已存在，无需重复补全');
          }
        }, 0);
        setAiOpen(false);
      } else {
        message.warning('暂无该品类的工序历史数据');
      }
    } catch {
      message.error('AI补全失败，请稍后重试');
    } finally {
      setAiLoading(false);
    }
  }, [aiCategory, styleId, message]);

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
      // 同时获取工序数据、多码单价数据和尺寸表数据
      const [processRes, sizePriceRes, sizeTableRes] = await Promise.all([
        api.get<StyleProcess[]>(`/style/process/list?styleId=${styleId}`),
        api.get<{ code: number; data: SizePrice[] }>(`/style/size-price/list`, { params: { styleId } }),
        api.get<{ code: number; data: Array<{ sizeName: string }> }>(`/style/size/list?styleId=${styleId}`),
      ]);

      const processResult = processRes as any;
      const sizePriceResult = sizePriceRes as any;
      const sizeTableResult = sizeTableRes as any;

      if (processResult.code === 200) {
        const processData = (processResult.data || []) as StyleProcess[];

        // 处理多码单价数据
        let sizePriceData: SizePrice[] = [];
        if (sizePriceResult.code === 200 && sizePriceResult.data) {
          sizePriceData = sizePriceResult.data as SizePrice[];
        }

        // 优先从尺寸表获取码数列表，实现尺寸表与工序单价联动
        let sizeList: string[] = [];

        // 从尺寸表提取码数
        if (sizeTableResult.code === 200 && sizeTableResult.data) {
          const sizeTableData = sizeTableResult.data;
          const sizeSet = new Set<string>();
          sizeTableData.forEach((item: any) => {
            const sizeName = String(item.sizeName || '').trim();
            if (sizeName) {
              // 支持多码合并的情况，如 "S,M,L" 或 "S M L"
              const parts = sizeName.split(/[,，\s]+/).map((s: string) => s.trim()).filter(Boolean);
              parts.forEach((s: string) => sizeSet.add(s));
            }
          });
          if (sizeSet.size > 0) {
            sizeList = Array.from(sizeSet).sort((a, b) => {
              const order = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL', '4XL', '5XL'];
              const ia = order.indexOf(a.toUpperCase());
              const ib = order.indexOf(b.toUpperCase());
              if (ia >= 0 && ib >= 0) return ia - ib;
              if (ia >= 0) return -1;
              if (ib >= 0) return 1;
              return a.localeCompare(b);
            });
          }
        }

        // 如果尺寸表没有数据，则从已保存的多码单价数据中提取
        if (sizeList.length === 0 && sizePriceData.length > 0) {
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
        onDataLoaded?.(sortedData);
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
  }, []);

  const enterEdit = async () => {
    if (readOnly) return;
    if (editMode) return;

    // 未开始时拦截，提示先点「开始」按钮
    if (!processStartTime) {
      message.warning('请先点击上方「开始工序单价」按钮再进行编辑');
      return;
    }

    snapshotRef.current = JSON.parse(JSON.stringify(data)) as StyleProcess[];
    setEditMode(true);
    // 进入编辑模式时，预加载所有已有工序名的 AI 单价提示
    data.forEach((row, idx) => {
      if (row.processName && row.id) {
        setTimeout(() => fetchPriceHint(row.id!, row.processName, row.standardTime ?? undefined), idx * 150);
      }
    });
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
  const handleAdd = async (targetStage?: string) => {
    if (readOnly) return;
    // 未开始时不允许添加行
    if (!processStartTime) {
      message.warning('请先点击上方「开始工序单价」按钮再进行编辑');
      return;
    }
    if (!editMode) await enterEdit();
    if (!editMode && !snapshotRef.current) return; // enterEdit 失败则不继续
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
      progressStage: targetStage || '车缝',
      machineType: '',
      standardTime: 0,
      price: 0,
      sortOrder: nextSort,
      sizePrices,
      sizePriceTouched,
    };
    setData((prev) => [...prev, newProcess]);
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
      await fetchProcess();
      void enterEdit();
    } catch (e: any) {
      message.error(e?.message || '导入失败');
    }
  };

  // 删除行
  const handleDelete = (id: string | number) => {
    if (readOnly) return;
    if (!processStartTime) {
      message.warning('请先点击上方「开始工序单价」按钮再进行编辑');
      return;
    }
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
        // 工序名称变化时，联动触发 AI 单价提示
        if (field === 'processName' && typeof value === 'string') {
          fetchPriceHint(id, value, r.standardTime ?? undefined);
        }
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
          description: norm(r.description),
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

  // 按进度节点分组排序 + rowSpan 计算
  const { sortedData, stageSpanMap } = useMemo(() => {
    const sorted = [...data].sort((a, b) => {
      const sa = STAGE_ORDER.indexOf(a.progressStage || '车缝');
      const sb = STAGE_ORDER.indexOf(b.progressStage || '车缝');
      if (sa !== sb) return sa - sb;
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    });
    const spanMap = new Map<number, { rowSpan: number; stage: string; count: number }>();
    let i = 0;
    while (i < sorted.length) {
      const stage = sorted[i].progressStage || '车缝';
      let j = i + 1;
      while (j < sorted.length && (sorted[j].progressStage || '车缝') === stage) j++;
      const count = j - i;
      spanMap.set(i, { rowSpan: count, stage, count });
      for (let k = i + 1; k < j; k++) spanMap.set(k, { rowSpan: 0, stage, count });
      i = j;
    }
    return { sortedData: sorted, stageSpanMap: spanMap };
  }, [data]);

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
            <DictAutoComplete
              dictType="process_name"
              autoCollect
              value={record.processName}
              placeholder="请选择或输入工序名称"
              popupMatchSelectWidth={false}
              styles={{ popup: { root: { minWidth: 260 } } }}
              onChange={(v) => updateField(record.id!, 'processName', v)}
            />
          ) : (
            text
          ),
      },
      {
        title: '进度节点',
        dataIndex: 'progressStage',
        width: 130,
        onCell: (_: StyleProcess, index?: number) => {
          const info = stageSpanMap.get(index ?? -1);
          return {
            rowSpan: info?.rowSpan ?? 1,
            style: info && info.rowSpan > 0
              ? { background: STAGE_ACCENT_LIGHT, borderLeft: `3px solid ${STAGE_ACCENT}`, verticalAlign: 'middle' as const, textAlign: 'center' as const }
              : undefined,
          };
        },
        render: (_: string, record: StyleProcess, index: number) => {
          const info = stageSpanMap.get(index);
          if (!info || info.rowSpan === 0) return null;
          const stage = record.progressStage || '车缝';
          return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <Tag style={{ background: STAGE_ACCENT, color: '#fff', border: 'none', fontWeight: 600, fontSize: 13 }}>{stage}</Tag>
              <span style={{ fontSize: 12, color: '#999' }}>{info.count} 个工序</span>
              {editableMode && (
                <Button type="link" size="small" icon={<PlusOutlined />} onClick={() => handleAdd(stage)} style={{ fontSize: 12, padding: 0 }}>
                  添加
                </Button>
              )}
            </div>
          );
        },
      },
      {
        title: '机器类型',
        dataIndex: 'machineType',
        width: 130,
        ellipsis: true,
        render: (text: string, record: StyleProcess) =>
          editableMode ? (
            <DictAutoComplete
              dictType="machine_type"
              autoCollect
              value={record.machineType}
              placeholder="请选择或输入机器类型"
              popupMatchSelectWidth={false}
              styles={{ popup: { root: { minWidth: 260 } } }}
              onChange={(v) => updateField(record.id!, 'machineType', v)}
            />
          ) : (
            text
          ),
      },
      {
        title: '难度',
        dataIndex: 'difficulty',
        width: 90,
        render: (text: string, record: StyleProcess) =>
          editableMode ? (
            <Select
              value={record.difficulty || undefined}
              style={{ width: '100%' }}
              allowClear
              placeholder="-"
              onChange={(v) => updateField(record.id!, 'difficulty', v ?? null)}
              options={[
                { label: '易', value: '易' },
                { label: '中', value: '中' },
                { label: '难', value: '难' },
              ]}
            />
          ) : (
            text || '-'
          ),
      },
      {
        title: '工序描述',
        dataIndex: 'description',
        width: 160,
        ellipsis: true,
        render: (text: string, record: StyleProcess) =>
          editableMode ? (
            <DictAutoComplete
              dictType="process_description"
              autoCollect
              value={record.description || ''}
              placeholder="请选择或输入工序描述"
              popupMatchSelectWidth={false}
              styles={{ popup: { root: { minWidth: 260 } } }}
              onChange={(v) => updateField(record.id!, 'description', v || null)}
            />
          ) : (
            <span title={text || ''}>{text || '-'}</span>
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
        width: 160,
        render: (text: number, record: StyleProcess) => {
          if (!editableMode) return `¥${toNumberSafe(text)}`;
          const hint = priceHints[record.id!];
          const loading = priceHintLoading[record.id!];
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <InputNumber
                value={record.price}
                min={0}
                step={0.01}
                prefix="¥"
                style={{ width: '100%' }}
                onChange={(v) => updateField(record.id!, 'price', v)}
              />
              {/* AI 单价提示卡片 */}
              {loading && (
                <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <LoadingOutlined style={{ fontSize: 10 }} /> 查询历史...
                </span>
              )}
              {!loading && hint && (
                <Tooltip title={hint.reasoning}>
                  <div
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      background: 'rgba(45,127,249,0.08)', borderRadius: 4,
                      padding: '2px 6px', cursor: 'pointer',
                    }}
                    onClick={() => {
                      updateField(record.id!, 'price', hint.suggestedPrice);
                    }}
                  >
                    <BulbOutlined style={{ fontSize: 11, color: '#2D7FF9' }} />
                    <span style={{ fontSize: 11, color: '#2D7FF9' }}>
                      建议 ¥{Number(hint.suggestedPrice).toFixed(2)}
                    </span>
                    <Tag
                      color="blue"
                      style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px', margin: 0, cursor: 'pointer' }}
                    >
                      采用
                    </Tag>
                    <span style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>
                      均¥{Number(hint.avgPrice).toFixed(2)} · {hint.usageCount}款
                    </span>
                  </div>
                </Tooltip>
              )}
            </div>
          );
        },
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
                  modal.confirm({
                    width: '30vw',
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
                    modal.confirm({
                      width: '30vw',
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
  }, [data, editMode, readOnly, showSizePrices, sizes, stageSpanMap]);

  return (
    <div>
      <StyleQuoteSuggestionInlineCard styleNo={styleNo} sourceStyleNo="" />

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
            disabled={Boolean(readOnly) || loading || saving || templateLoading || !processStartTime}
          >
            导入模板
          </Button>

          <Dropdown
            disabled={Boolean(readOnly) || !processStartTime || loading || saving}
            menu={{
              items: STAGE_ORDER.map(s => ({ key: s, label: s, icon: <PlusOutlined /> })),
              onClick: ({ key }) => handleAdd(key),
            }}
          >
            <Button type="primary" disabled={Boolean(readOnly) || !processStartTime || loading || saving}>
              添加工序 <DownOutlined />
            </Button>
          </Dropdown>

          {/* AI 工序补全按钮 */}
          <Popover
            trigger="click"
            placement="bottomRight"
            open={aiOpen}
            onOpenChange={(v) => { if (!aiLoading) setAiOpen(v); }}
            content={
              <div style={{ width: 260 }}>
                <div style={{ marginBottom: 8, fontWeight: 600, color: '#722ed1' }}> AI 智能 IE 指导价 & 全套工序生成</div>
                <div style={{ marginBottom: 8, fontSize: 12, color: '#888' }}>
                  选择品类，系统将基于 IE 数据库为您直接生成全套标准工序与智能指导单价。
                </div>
                <Select
                  style={{ width: '100%', marginBottom: 8 }}
                  placeholder="选择衣服品类（必选）"
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  value={aiCategory}
                  onChange={setAiCategory}
                  options={categoryOptions}
                />
                <Button
                  type="primary"
                  block
                  loading={aiLoading}
                  disabled={aiLoading || !aiCategory}
                  style={{ background: 'linear-gradient(135deg, #722ed1, #1677ff)', border: 'none' }}
                  onClick={handleAiTemplate}
                >
                  {aiLoading ? '生成中…' : ' 一键生成全套工序与指导价'}
                </Button>
              </div>
            }
          >
            <Button
              type="primary"
              disabled={Boolean(readOnly) || !editMode || loading || saving}
              icon={aiLoading ? <LoadingOutlined /> : <span style={{ marginRight: 4 }}></span>}
              style={{
                background: 'linear-gradient(135deg, #722ed1, #2f54eb)',
                borderColor: 'transparent',
                fontWeight: 500,
                boxShadow: '0 2px 6px rgba(114, 46, 209, 0.3)'
              }}
            >
              AI建议单价
            </Button>
          </Popover>

          {/* 添加码数 - 与尺寸表样式一致 */}
          <Select
            mode="multiple"
            allowClear
            showSearch
            placeholder="添加码数"
            style={{ minWidth: 120 }}
            disabled={!editMode || Boolean(readOnly)}
            options={sizeOptions.filter(opt => !sizes.includes(opt.value))}
            value={[]}
            onChange={(values) => {
              if (values.length === 0) return;
              const newSizes = [...sizes, ...values];
              const sortedSizes = newSizes.sort((a, b) => {
                const order = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL', '4XL', '5XL'];
                const ia = order.indexOf(a.toUpperCase());
                const ib = order.indexOf(b.toUpperCase());
                if (ia >= 0 && ib >= 0) return ia - ib;
                if (ia >= 0) return -1;
                if (ib >= 0) return 1;
                return a.localeCompare(b);
              });
              setSizes(sortedSizes);
              setData((prev) =>
                prev.map((row) => {
                  const nextSizePrices = { ...(row.sizePrices || {}) };
                  const nextTouched = { ...(row.sizePriceTouched || {}) };
                  values.forEach((s) => {
                    nextSizePrices[s] = toNumberSafe(row.price);
                    nextTouched[s] = false;
                  });
                  return { ...row, sizePrices: nextSizePrices, sizePriceTouched: nextTouched };
                })
              );
            }}
            filterOption={(input, option) =>
              String(option?.value || '').toLowerCase().includes(String(input || '').toLowerCase())
            }
            onSearch={(value) => {
              if (value && value.trim() && !sizeOptions.some(opt => opt.value === value.trim()) && !sizes.includes(value.trim())) {
                setSizeOptions(prev => [...prev, { value: value.trim(), label: value.trim() }]);
              }
            }}
            popupRender={(menu) => (
              <>
                {menu}
                <div style={{ padding: '8px', borderTop: '1px solid #f0f0f0' }}>
                  <Input
                    placeholder="输入新码数后回车添加"
                    size="small"
                    onPressEnter={(e) => {
                      const input = e.target as HTMLInputElement;
                      const val = input.value.trim().toUpperCase();
                      if (val && !sizes.includes(val) && !sizeOptions.some(opt => opt.value === val)) {
                        const sortedSizes = [...sizes, val].sort((a, b) => {
                          const order = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL', '4XL', '5XL'];
                          const ia = order.indexOf(a.toUpperCase());
                          const ib = order.indexOf(b.toUpperCase());
                          if (ia >= 0 && ib >= 0) return ia - ib;
                          if (ia >= 0) return -1;
                          if (ib >= 0) return 1;
                          return a.localeCompare(b);
                        });
                        setSizes(sortedSizes);
                        setData((prev) =>
                          prev.map((row) => ({
                            ...row,
                            sizePrices: { ...(row.sizePrices || {}), [val]: toNumberSafe(row.price) },
                            sizePriceTouched: { ...(row.sizePriceTouched || {}), [val]: false },
                          }))
                        );
                        input.value = '';
                      }
                    }}
                  />
                </div>
              </>
            )}
            onOpenChange={(open) => {
              if (open) fetchSizeDictOptions();
            }}
          />

          {!editMode || readOnly ? (
            <Button type="primary" onClick={enterEdit} disabled={loading || saving || Boolean(readOnly) || !processStartTime}>
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
                  modal.confirm({
                    width: '30vw',
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

      {/* 工序单价汇总 - 按进度节点分类 */}
      <ProcessCostSummary data={data} />

      <ResizableTable
        bordered
        dataSource={sortedData as unknown as any[]}
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
