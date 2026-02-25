import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  App,
  AutoComplete,
  Button,
  Input,
  InputNumber,
  Modal,
  Popover,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd';
import { DeleteOutlined, SyncOutlined } from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import api, { toNumberSafe } from '@/utils/api';

const { Text } = Typography;

// ─── 类型定义 ───────────────────────────────────────────────────
interface StyleProcessRow {
  id: string | number;
  styleId?: string | number;
  processCode: string;
  processName: string;
  progressStage: string;
  machineType: string;
  standardTime: number;
  price: number;
  sortOrder: number;
  sizePrices?: Record<string, number>;
  sizePriceTouched?: Record<string, boolean>;
}

interface SizePrice {
  id?: string;
  styleId: number;
  processCode: string;
  processName: string;
  progressStage?: string;
  size: string;
  price: number;
}

interface SyncProcessPriceModalProps {
  open: boolean;
  onCancel: () => void;
}

// ─── 常量 ───────────────────────────────────────────────────────
const PROGRESS_STAGES = ['采购', '裁剪', '二次工艺', '车缝', '尾部', '入库'];
const DEFAULT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL'];

const norm = (v: unknown) => String(v || '').trim();
const isTempId = (id: unknown) => {
  const s = String(id ?? '').trim();
  return !s || s.startsWith('-');
};

const SyncProcessPriceModal: React.FC<SyncProcessPriceModalProps> = ({ open, onCancel }) => {
  const { message } = App.useApp();

  // ─── 款号选择 ─────────────────────────────────────────────────
  const [styleInputVal, setStyleInputVal] = useState('');
  const [styleNoOptions, setStyleNoOptions] = useState<{ value: string; label: string }[]>([]);
  const [styleNoLoading, setStyleNoLoading] = useState(false);
  const styleNoSeq = useRef(0);
  const styleNoTimer = useRef<number | undefined>(undefined);

  const [selectedStyleNo, setSelectedStyleNo] = useState('');
  const [selectedStyleId, setSelectedStyleId] = useState<number | null>(null);

  // ─── 工序数据 ─────────────────────────────────────────────────
  const [data, setData] = useState<StyleProcessRow[]>([]);
  const [loadingProcess, setLoadingProcess] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [deletedIds, setDeletedIds] = useState<Array<string | number>>([]);
  const snapshotRef = useRef<StyleProcessRow[] | null>(null);

  // ─── 多码单价 ─────────────────────────────────────────────────
  const [sizes, setSizes] = useState<string[]>([...DEFAULT_SIZES]);
  const [newSizeName, setNewSizeName] = useState('');
  const [addSizePopoverOpen, setAddSizePopoverOpen] = useState(false);

  // ─── 工艺模板 ─────────────────────────────────────────────────
  const [processTemplates, setProcessTemplates] = useState<any[]>([]);
  const [processTemplateKey, setProcessTemplateKey] = useState<string | undefined>(undefined);
  const [templateSourceStyleNo, setTemplateSourceStyleNo] = useState('');
  const [templateLoading, setTemplateLoading] = useState(false);
  const [tplStyleOptions, setTplStyleOptions] = useState<{ value: string; label: string }[]>([]);
  const tplStyleTimer = useRef<number | undefined>(undefined);

  // ─── 搜索款号（主输入框）────────────────────────────────────────
  const fetchMainStyleOptions = async (keyword: string) => {
    const seq = (styleNoSeq.current += 1);
    setStyleNoLoading(true);
    try {
      const res = await api.get<any>('/style/info/list', {
        params: { page: 1, pageSize: 200, styleNo: keyword.trim() },
      });
      if (seq !== styleNoSeq.current) return;
      const records: any[] = (res as any)?.data?.records ?? [];
      setStyleNoOptions(
        records.map((r: any) => ({ value: String(r.styleNo || ''), label: String(r.styleNo || '') }))
      );
    } catch { /* ignore */ } finally {
      if (seq === styleNoSeq.current) setStyleNoLoading(false);
    }
  };

  const scheduleMainSearch = (kw: string) => {
    if (styleNoTimer.current) window.clearTimeout(styleNoTimer.current);
    styleNoTimer.current = window.setTimeout(() => fetchMainStyleOptions(kw), 250);
  };

  // ─── 搜索款号（模板来源筛选框）───────────────────────────────────
  const fetchTplStyleOptions = async (keyword: string) => {
    try {
      const res = await api.get<any>('/style/info/list', {
        params: { page: 1, pageSize: 200, styleNo: keyword.trim() },
      });
      const records: any[] = (res as any)?.data?.records ?? [];
      setTplStyleOptions(
        records.map((r: any) => ({ value: String(r.styleNo || ''), label: String(r.styleNo || '') }))
      );
    } catch { /* ignore */ }
  };

  const scheduleTplStyleSearch = (kw: string) => {
    if (tplStyleTimer.current) window.clearTimeout(tplStyleTimer.current);
    tplStyleTimer.current = window.setTimeout(() => fetchTplStyleOptions(kw), 250);
  };

  // ─── 加载工艺模板列表 ─────────────────────────────────────────
  const fetchProcessTemplates = async (sourceStyleNo?: string) => {
    setTemplateLoading(true);
    try {
      const res = await api.get<any>('/template-library/list', {
        params: { page: 1, pageSize: 200, templateType: 'process', keyword: '', sourceStyleNo: sourceStyleNo ?? '' },
      });
      const result = res as any;
      if (result?.code === 200) {
        const d = result.data;
        const records = Array.isArray(d) ? d : (d?.records ?? []);
        setProcessTemplates(records);
      }
    } catch { /* ignore */ } finally {
      setTemplateLoading(false);
    }
  };

  // ─── 挂载时初始加载 ───────────────────────────────────────────
  useEffect(() => {
    if (open) {
      fetchMainStyleOptions('');
      fetchProcessTemplates('');
      fetchTplStyleOptions('');
    }
  }, [open]);

  // ─── 加载指定款式的工序 ──────────────────────────────────────
  const loadStyleProcess = async (styleNo: string) => {
    if (!styleNo.trim()) return;
    setLoadingProcess(true);
    setData([]);
    setDeletedIds([]);
    setEditMode(false);
    snapshotRef.current = null;
    try {
      // 1. 精确匹配款号 → styleId
      const infoRes = await api.get<any>('/style/info/list', {
        params: { page: 1, pageSize: 10, styleNo: styleNo.trim() },
      });
      const records: any[] = (infoRes as any)?.data?.records ?? [];
      const matched = records.find((r: any) => r.styleNo === styleNo.trim());
      if (!matched) { message.warning('未找到该款号，请确认是否正确'); return; }
      const styleId = Number(matched.id);
      setSelectedStyleId(styleId);

      // 2. 同时拉工序 + 多码单价
      const [procRes, szRes] = await Promise.all([
        api.get<any>(`/style/process/list?styleId=${styleId}`),
        api.get<any>('/style/size-price/list', { params: { styleId } }),
      ]);
      const procList: any[] = (procRes as any)?.data ?? (Array.isArray(procRes) ? procRes : []);
      const szList: SizePrice[] = (szRes as any)?.data ?? [];

      // 从已保存数据提取尺码列表
      const savedSizes = new Set<string>();
      szList.forEach((sp) => sp.size && savedSizes.add(sp.size.trim()));
      if (savedSizes.size > 0) {
        const sorted = Array.from(savedSizes).sort((a, b) => {
          const ia = SIZE_ORDER.indexOf(a), ib = SIZE_ORDER.indexOf(b);
          if (ia >= 0 && ib >= 0) return ia - ib;
          if (ia >= 0) return -1; if (ib >= 0) return 1;
          return a.localeCompare(b);
        });
        setSizes(sorted);
      } else {
        setSizes([...DEFAULT_SIZES]);
      }
      const sizeList = savedSizes.size > 0 ? Array.from(savedSizes) : [...DEFAULT_SIZES];

      const rows: StyleProcessRow[] = procList
        .sort((a, b) => toNumberSafe(a.sortOrder) - toNumberSafe(b.sortOrder))
        .map((r, idx) => {
          const sizePrices: Record<string, number> = {};
          const sizePriceTouched: Record<string, boolean> = {};
          sizeList.forEach((sz) => {
            const found = szList.find((sp) => sp.processCode === r.processCode && sp.size === sz);
            sizePrices[sz] = found ? toNumberSafe(found.price) : toNumberSafe(r.price);
            sizePriceTouched[sz] = Boolean(found);
          });
          return {
            id: r.id, styleId,
            processCode: r.processCode || String(idx + 1).padStart(2, '0'),
            processName: r.processName || '',
            progressStage: r.progressStage || '车缝',
            machineType: r.machineType || '',
            standardTime: toNumberSafe(r.standardTime),
            price: toNumberSafe(r.price),
            sortOrder: toNumberSafe(r.sortOrder) || idx + 1,
            sizePrices, sizePriceTouched,
          };
        });

      setData(rows);
      if (!rows.length) message.info('该款式暂无工序配置，点击「添加工序」开始配置');
    } catch { message.error('加载工序数据失败'); }
    finally { setLoadingProcess(false); }
  };

  const handleSelectStyle = (styleNo: string) => {
    setSelectedStyleNo(styleNo);
    setStyleInputVal(styleNo);
    loadStyleProcess(styleNo);
  };

  // ─── 编辑模式 ─────────────────────────────────────────────────
  const enterEdit = () => {
    if (editMode) return;
    snapshotRef.current = JSON.parse(JSON.stringify(data));
    setEditMode(true);
  };

  const exitEdit = () => {
    if (snapshotRef.current) setData(snapshotRef.current);
    setDeletedIds([]);
    setEditMode(false);
    snapshotRef.current = null;
  };

  // ─── 增删改 ───────────────────────────────────────────────────
  const handleAdd = () => {
    if (!editMode) enterEdit();
    const maxSort = data.length ? Math.max(...data.map((d) => toNumberSafe(d.sortOrder))) : 0;
    const nextSort = maxSort + 1;
    const autoCode = String(nextSort).padStart(2, '0');
    const sizePrices: Record<string, number> = {};
    const sizePriceTouched: Record<string, boolean> = {};
    sizes.forEach((s) => { sizePrices[s] = 0; sizePriceTouched[s] = false; });
    setData((prev) => [...prev, {
      id: -Date.now(), styleId: selectedStyleId ?? undefined,
      processCode: autoCode, processName: '', progressStage: '车缝',
      machineType: '', standardTime: 0, price: 0,
      sortOrder: nextSort, sizePrices, sizePriceTouched,
    }]);
  };

  const handleDelete = (id: string | number) => {
    if (!editMode) enterEdit();
    if (!isTempId(id)) setDeletedIds((prev) => [...prev, id]);
    setData((prev) => prev.filter((x) => x.id !== id)
      .map((item, index) => ({ ...item, sortOrder: index + 1, processCode: String(index + 1).padStart(2, '0') }))
    );
  };

  const updateField = (id: string | number, field: keyof StyleProcessRow, value: any) => {
    setData((prev) => prev.map((r) => {
      if (r.id !== id) return r;
      if (field !== 'price') return { ...r, [field]: value };
      const nextPrice = toNumberSafe(value);
      const oldPrice = toNumberSafe(r.price);
      const nextSizePrices = { ...(r.sizePrices || {}) };
      const touched = r.sizePriceTouched || {};
      sizes.forEach((s) => {
        const cur = toNumberSafe(nextSizePrices[s]);
        if (!touched[s] || cur === oldPrice) nextSizePrices[s] = nextPrice;
      });
      return { ...r, price: nextPrice, sizePrices: nextSizePrices };
    }));
  };

  const updateSizePrice = (id: string | number, size: string, value: number) => {
    setData((prev) => prev.map((r) => r.id !== id ? r : {
      ...r,
      sizePrices: { ...(r.sizePrices || {}), [size]: value },
      sizePriceTouched: { ...(r.sizePriceTouched || {}), [size]: true },
    }));
  };

  // ─── 尺码管理 ─────────────────────────────────────────────────
  const handleAddSize = () => {
    const trimmed = newSizeName.trim().toUpperCase();
    if (!trimmed) { message.warning('请输入尺码'); return; }
    if (sizes.includes(trimmed)) { message.warning('该尺码已存在'); return; }
    setSizes((prev) => [...prev, trimmed]);
    setData((prev) => prev.map((row) => ({
      ...row,
      sizePrices: { ...(row.sizePrices || {}), [trimmed]: toNumberSafe(row.price) },
      sizePriceTouched: { ...(row.sizePriceTouched || {}), [trimmed]: false },
    })));
    setNewSizeName('');
    message.success(`已添加尺码: ${trimmed}`);
  };

  const handleRemoveSize = (size: string) => {
    setSizes((prev) => prev.filter((s) => s !== size));
    setData((prev) => prev.map((row) => {
      const { [size]: _a, ...sp } = row.sizePrices || {};
      const { [size]: _b, ...st } = row.sizePriceTouched || {};
      return { ...row, sizePrices: sp, sizePriceTouched: st };
    }));
  };

  // ─── 套用工艺模板 ─────────────────────────────────────────────
  const applyProcessTemplate = async (templateId: string) => {
    if (!selectedStyleId) { message.error('请先选择款号'); return; }
    if (editMode) { message.error('请先保存或取消编辑再导入模板'); return; }
    try {
      const res = await api.post<any>('/template-library/apply-to-style', {
        templateId, targetStyleId: selectedStyleId, mode: 'overwrite',
      });
      if ((res as any)?.code !== 200) { message.error((res as any)?.message || '导入失败'); return; }
      message.success('已导入工艺模板');
      setProcessTemplateKey(undefined);
      await loadStyleProcess(selectedStyleNo);
    } catch (e: any) { message.error(e?.message || '导入失败'); }
  };

  // ─── 保存到 t_style_process ──────────────────────────────────
  const saveAll = async (): Promise<boolean> => {
    if (!selectedStyleId) { message.error('请先选择款号'); return false; }
    const rows = data.map((r, idx) => ({
      ...r, sortOrder: idx + 1, processCode: String(idx + 1).padStart(2, '0'),
    }));
    if (!rows.length) { message.error('请先添加工序'); return false; }
    const invalid = rows.find((r) => !norm(r.processCode) || !norm(r.processName) || r.price == null);
    if (invalid) { message.error('请完善必填项：工序名称、工价'); return false; }

    setSaving(true);
    try {
      // 删除
      const delResults = await Promise.all(
        Array.from(new Set(deletedIds.map(String).filter(Boolean))).map((id) => api.delete(`/style/process/${id}`))
      );
      const delBad = delResults.find((r: any) => r?.code !== 200);
      if (delBad) { message.error((delBad as any)?.message || '删除失败'); return false; }

      // 新增/更新
      const results = await Promise.all(rows.map((r) => {
        const payload: any = {
          id: r.id, styleId: selectedStyleId,
          processCode: norm(r.processCode), processName: norm(r.processName),
          progressStage: norm(r.progressStage) || '车缝', machineType: norm(r.machineType),
          standardTime: toNumberSafe(r.standardTime), price: toNumberSafe(r.price),
          sortOrder: toNumberSafe(r.sortOrder),
        };
        if (!isTempId(r.id)) return api.put('/style/process', payload);
        const { id: _id, ...c } = payload; return api.post('/style/process', c);
      }));
      const bad = results.find((r: any) => r?.code !== 200);
      if (bad) { message.error((bad as any)?.message || '保存失败'); return false; }

      // 多码单价
      if (sizes.length > 0) {
        const szList: SizePrice[] = [];
        rows.forEach((row) => {
          sizes.forEach((sz) => {
            szList.push({
              styleId: selectedStyleId, processCode: norm(row.processCode),
              processName: norm(row.processName), progressStage: norm(row.progressStage) || '车缝',
              size: sz, price: toNumberSafe(row.sizePrices?.[sz] ?? row.price),
            });
          });
        });
        await api.post('/style/size-price/batch-save', szList);
      }

      setEditMode(false);
      snapshotRef.current = null;
      setDeletedIds([]);
      await loadStyleProcess(selectedStyleNo);
      return true;
    } catch (e: any) { message.error(e?.message || '保存失败'); return false; }
    finally { setSaving(false); }
  };

  // ─── 同步到生产订单 ───────────────────────────────────────────
  const syncToOrders = async (): Promise<boolean> => {
    setSyncing(true);
    try {
      const res = await api.post<any>('/template-library/sync-process-prices', { styleNo: selectedStyleNo.trim() });
      if ((res as any)?.code === 200) {
        const d = (res as any).data;
        message.success(`同步完成：${d?.totalOrders ?? 0} 个订单，共更新 ${d?.totalSynced ?? 0} 条工序单价`);
        return true;
      }
      message.error((res as any)?.message || '同步失败'); return false;
    } catch { message.error('同步失败'); return false; }
    finally { setSyncing(false); }
  };

  const handleSaveOnly = async () => { if (await saveAll()) message.success('款式工序单价已保存'); };
  const handleSaveAndSync = async () => { if (await saveAll()) await syncToOrders(); };

  const handleCancel = () => {
    setStyleInputVal(''); setSelectedStyleNo(''); setSelectedStyleId(null);
    setData([]); setDeletedIds([]); setEditMode(false); snapshotRef.current = null;
    setSizes([...DEFAULT_SIZES]);
    onCancel();
  };

  const isBusy = saving || syncing || loadingProcess || templateLoading;

  // ─── 表格列 ───────────────────────────────────────────────────
  const columns = useMemo(() => {
    const em = editMode;
    const base = [
      {
        title: '排序', dataIndex: 'sortOrder', width: 60, align: 'center' as const,
        render: (_: any, __: StyleProcessRow, idx: number) => idx + 1,
      },
      { title: '工序编码', dataIndex: 'processCode', width: 88, ellipsis: true },
      {
        title: '工序名称', dataIndex: 'processName', width: 150, ellipsis: true,
        render: (v: string, r: StyleProcessRow) => em
          ? <Input size="small" value={v} onChange={(e) => updateField(r.id, 'processName', e.target.value)} />
          : (v || '-'),
      },
      {
        title: '进度节点', dataIndex: 'progressStage', width: 110,
        render: (v: string, r: StyleProcessRow) => em
          ? <Select size="small" value={v || '车缝'} style={{ width: '100%' }}
              onChange={(val) => updateField(r.id, 'progressStage', val)}
              options={PROGRESS_STAGES.map((s) => ({ value: s, label: s }))} />
          : (v || '车缝'),
      },
      {
        title: '机器类型', dataIndex: 'machineType', width: 110, ellipsis: true,
        render: (v: string, r: StyleProcessRow) => em
          ? <Input size="small" value={v} placeholder="平车/锁眼/钉扣"
              onChange={(e) => updateField(r.id, 'machineType', e.target.value)} />
          : (v || '-'),
      },
      {
        title: '标准工时(秒)', dataIndex: 'standardTime', width: 110,
        render: (v: number, r: StyleProcessRow) => em
          ? <InputNumber size="small" value={v} min={0} style={{ width: '100%' }}
              onChange={(val) => updateField(r.id, 'standardTime', toNumberSafe(val))} />
          : v,
      },
      {
        title: '工价(元)', dataIndex: 'price', width: 110,
        render: (v: number, r: StyleProcessRow) => em
          ? <InputNumber size="small" value={v} min={0} step={0.01} prefix="¥" style={{ width: '100%' }}
              onChange={(val) => updateField(r.id, 'price', val)} />
          : `¥${toNumberSafe(v)}`,
      },
    ];

    const sizeCols = sizes.map((size) => ({
      title: (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <span>{size}码</span>
          {em && (
            <DeleteOutlined style={{ color: 'var(--color-danger)', cursor: 'pointer', fontSize: 10 }}
              onClick={(e) => {
                e.stopPropagation();
                Modal.confirm({ title: `确定删除"${size}"码？`, content: '删除后该尺码单价数据将被清除', onOk: () => handleRemoveSize(size) });
              }} />
          )}
        </div>
      ),
      dataIndex: `sz_${size}`, width: 90,
      render: (_: any, r: StyleProcessRow) => {
        const price = r.sizePrices?.[size] ?? r.price ?? 0;
        return em
          ? <InputNumber size="small" value={price} min={0} step={0.01} prefix="¥" style={{ width: '100%' }}
              onChange={(val) => updateSizePrice(r.id, size, toNumberSafe(val))} />
          : `¥${toNumberSafe(price)}`;
      },
    }));

    const opCol = {
      title: '操作', dataIndex: 'op', width: 80, resizable: false,
      render: (_: any, r: StyleProcessRow) => em
        ? <RowActions maxInline={1} actions={[{
            key: 'del', label: '删除', danger: true,
            onClick: () => Modal.confirm({ title: '确定删除?', onOk: () => handleDelete(r.id) }),
          }]} />
        : null,
    };

    return [...base, ...sizeCols, opCol];
  }, [data, editMode, sizes]);

  // ─── 渲染 ─────────────────────────────────────────────────────
  return (
    <ResizableModal
      open={open}
      title="工序单价维护 · 同步到生产订单"
      width="80vw"
      initialHeight={680}
      onCancel={handleCancel}
      footer={
        <Space>
          <Button onClick={handleCancel} disabled={isBusy}>关闭</Button>
          {editMode && (
            <Button disabled={saving} onClick={() => Modal.confirm({ title: '放弃未保存的修改？', onOk: exitEdit })}>
              取消编辑
            </Button>
          )}
          <Button onClick={handleSaveOnly} disabled={isBusy || !selectedStyleId} loading={saving && !syncing}>
            保存款式单价
          </Button>
          <Button type="primary" icon={<SyncOutlined />} onClick={handleSaveAndSync}
            disabled={isBusy || !selectedStyleId} loading={syncing || saving}>
            保存并同步到所有订单
          </Button>
        </Space>
      }
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        {/* 款号选择 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Text style={{ whiteSpace: 'nowrap', flexShrink: 0, fontWeight: 500 }}>款号：</Text>
          <AutoComplete
            value={styleInputVal}
            style={{ width: 220 }}
            placeholder="输入/选择款号"
            options={styleNoOptions}
            onSearch={scheduleMainSearch}
            onSelect={handleSelectStyle}
            onChange={(v) => {
              setStyleInputVal(String(v || ''));
              if (!v) { setSelectedStyleNo(''); setSelectedStyleId(null); setData([]); }
            }}
            onBlur={() => {
              if (styleInputVal.trim() && !selectedStyleId) handleSelectStyle(styleInputVal.trim());
            }}
            allowClear
            loading={styleNoLoading}
            disabled={isBusy}
          />
          {selectedStyleId && <Tag color="success">{data.length} 道工序</Tag>}
          {loadingProcess && <Tag color="processing">加载中...</Tag>}
          <div style={{ flex: 1 }} />
          {/* 工艺模板区 */}
          <Select allowClear showSearch filterOption={false} loading={styleNoLoading}
            value={templateSourceStyleNo || undefined} placeholder="来源款号筛选"
            style={{ width: 160 }} options={tplStyleOptions}
            onSearch={scheduleTplStyleSearch}
            onChange={(v) => setTemplateSourceStyleNo(String(v || ''))}
            onOpenChange={(o) => { if (o) fetchTplStyleOptions(''); }}
            disabled={isBusy}
          />
          <Button disabled={isBusy} onClick={() => fetchProcessTemplates(templateSourceStyleNo)}>筛选</Button>
          <Button disabled={isBusy} onClick={() => { setTemplateSourceStyleNo(''); fetchProcessTemplates(''); }}>全部</Button>
          <Select allowClear style={{ width: 200 }} placeholder="选择工艺模板"
            value={processTemplateKey} onChange={(v) => setProcessTemplateKey(v)}
            options={processTemplates.map((t) => ({
              value: String(t.id || ''), label: t.sourceStyleNo ? `${t.templateName}（${t.sourceStyleNo}）` : t.templateName,
            }))}
            disabled={isBusy}
          />
          <Button disabled={isBusy || !processTemplateKey}
            onClick={() => { if (!processTemplateKey) { message.error('请先选择模板'); return; } applyProcessTemplate(processTemplateKey); }}>
            导入模板
          </Button>
        </div>

        {/* 操作栏 */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button type="primary" onClick={handleAdd} disabled={!selectedStyleId || isBusy}>添加工序</Button>
          <Popover trigger="click" placement="bottomRight" open={addSizePopoverOpen} onOpenChange={setAddSizePopoverOpen}
            content={
              <div style={{ width: 200 }}>
                <div style={{ marginBottom: 8, fontWeight: 500 }}>添加新尺码</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Input size="small" placeholder="如: 3XL, 4XL" value={newSizeName}
                    onChange={(e) => setNewSizeName(e.target.value)}
                    onPressEnter={() => { handleAddSize(); setAddSizePopoverOpen(false); }}
                    style={{ flex: 1 }}
                  />
                  <Button size="small" type="primary" onClick={() => { handleAddSize(); setAddSizePopoverOpen(false); }}>添加</Button>
                </div>
                <div style={{ marginTop: 8, fontSize: 11, color: '#999' }}>当前: {sizes.join(', ')}</div>
              </div>
            }
          >
            <Button disabled={!editMode || !selectedStyleId}>添加码数</Button>
          </Popover>
          {!editMode
            ? <Button type="primary" onClick={enterEdit} disabled={!selectedStyleId || isBusy}>编辑</Button>
            : <>
                <Button type="primary" onClick={saveAll} loading={saving} disabled={syncing}>保存</Button>
                <Button disabled={saving} onClick={() => Modal.confirm({ title: '放弃未保存的修改？', onOk: exitEdit })}>取消</Button>
              </>
          }
        </div>

        {/* 工序表格 */}
        <ResizableTable
          bordered
          dataSource={data as any[]}
          columns={columns as any[]}
          pagination={false}
          loading={loadingProcess}
          rowKey="id"
          scroll={{ x: 'max-content', y: 440 }}
          storageKey="sync-process-price-modal"
          minColumnWidth={70}
          locale={{ emptyText: selectedStyleNo ? '该款式暂无工序配置，点击「添加工序」' : '请先在上方选择款号' }}
        />
      </Space>
    </ResizableModal>
  );
};

export default SyncProcessPriceModal;

