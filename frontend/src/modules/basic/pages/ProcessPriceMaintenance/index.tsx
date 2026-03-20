import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  App,
  AutoComplete,
  Button,
  Card,
  Image,
  Input,
  InputNumber,
  Modal,
  Popover,
  Select,
  Space,
  Tag,
  Typography,
  Upload,
} from 'antd';
import { DeleteOutlined, SyncOutlined, UploadOutlined } from '@ant-design/icons';
import Layout from '@/components/Layout';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import DictAutoComplete from '@/components/common/DictAutoComplete';
import api, { toNumberSafe } from '@/utils/api';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';

const { Text } = Typography;

interface StyleProcessRow {
  id: string | number;
  processCode: string;
  processName: string;
  progressStage: string;
  machineType: string;
  difficulty?: string;
  standardTime: number;
  price: number;
  sortOrder: number;
  sizePrices?: Record<string, number>;
  sizePriceTouched?: Record<string, boolean>;
}

type MatchedScope = 'style' | 'empty';

const PROGRESS_STAGES = ['采购', '裁剪', '二次工艺', '车缝', '尾部', '入库'];
const DEFAULT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL'];

const norm = (v: unknown) => String(v || '').trim();

const buildRows = (content: any, fallbackSizes: string[] = DEFAULT_SIZES) => {
  const rawSteps = Array.isArray(content?.steps) ? content.steps : [];
  const rawSizes = Array.isArray(content?.sizes)
    ? content.sizes.map((s: unknown) => String(s || '').trim().toUpperCase()).filter(Boolean)
    : [];
  const sizes = (rawSizes.length ? rawSizes : fallbackSizes).slice().sort((a: string, b: string) => {
    const ia = SIZE_ORDER.indexOf(a); const ib = SIZE_ORDER.indexOf(b);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1; if (ib >= 0) return 1;
    return a.localeCompare(b);
  });
  const rows: StyleProcessRow[] = rawSteps.map((item: any, idx: number) => {
    const sizePrices: Record<string, number> = {};
    const sizePriceTouched: Record<string, boolean> = {};
    const basePrice = toNumberSafe(item?.unitPrice ?? item?.price);
    sizes.forEach((size: string) => {
      const sp = toNumberSafe(item?.sizePrices?.[size]);
      sizePrices[size] = sp || basePrice;
      sizePriceTouched[size] = item?.sizePrices?.[size] != null;
    });
    return {
      id: item?.processCode || `loaded-${idx}`,
      processCode: String(item?.processCode || String(idx + 1).padStart(2, '0')),
      processName: String(item?.processName || item?.name || ''),
      progressStage: String(item?.progressStage || '车缝'),
      machineType: String(item?.machineType || ''),
      difficulty: String(item?.difficulty || ''),
      standardTime: toNumberSafe(item?.standardTime),
      price: basePrice,
      sortOrder: idx + 1,
      sizePrices,
      sizePriceTouched,
    };
  });
  return { rows, sizes };
};

const ProcessPriceMaintenance: React.FC = () => {
  const { message } = App.useApp();

  const [matchedScope, setMatchedScope] = useState<MatchedScope>('empty');
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [styleInputVal, setStyleInputVal] = useState('');
  const [styleNoOptions, setStyleNoOptions] = useState<{ value: string; label: string }[]>([]);
  const [selectedStyleNo, setSelectedStyleNo] = useState('');
  const styleNoSeq = useRef(0);
  const styleNoTimer = useRef<number | undefined>(undefined);

  const [data, setData] = useState<StyleProcessRow[]>([]);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [sizes, setSizes] = useState<string[]>([...DEFAULT_SIZES]);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [imageUploading, setImageUploading] = useState(false);
  const [newSizeName, setNewSizeName] = useState('');
  const [addSizePopoverOpen, setAddSizePopoverOpen] = useState(false);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncCandidates, setSyncCandidates] = useState<Array<{id: string; orderNo: string; styleNo: string; status: string; orderQuantity: number}>>([]);
  const [syncSelectedIds, setSyncSelectedIds] = useState<string[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const snapshotRef = useRef<StyleProcessRow[] | null>(null);

  const isBusy = saving || syncing || loadingTemplate;
  const readyForScope = Boolean(selectedStyleNo.trim());

  const fetchStyleOptions = async (keyword: string) => {
    const seq = (styleNoSeq.current += 1);
    try {
      const res = await api.get<any>('/template-library/process-price-style-options', { params: { keyword: keyword.trim() } });
      if (seq !== styleNoSeq.current) return;
      const records: any[] = Array.isArray((res as any)?.data) ? (res as any).data : [];
      setStyleNoOptions(records.map((r: any) => {
        const styleNo = String(r?.styleNo || '').trim();
        const styleName = String(r?.styleName || '').trim();
        return { value: styleNo, label: styleName ? `${styleNo}（${styleName}）` : styleNo };
      }).filter((r: any) => r.value));
    } catch { /* ignore */ }
  };

  const scheduleSearch = (kw: string) => {
    if (styleNoTimer.current) window.clearTimeout(styleNoTimer.current);
    styleNoTimer.current = window.setTimeout(() => fetchStyleOptions(kw), 250);
  };

  const resetEdit = () => { setEditMode(false); snapshotRef.current = null; };

  const loadTemplate = async (styleNo?: string) => {
    setLoadingTemplate(true);
    setTemplateId(null); setMatchedScope('empty'); setData([]); setSizes([...DEFAULT_SIZES]); setImageUrls([]); resetEdit();
    try {
      const res = await api.get<any>('/template-library/process-price-template', { params: { styleNo: String(styleNo || '').trim() } });
      const payload = (res as any)?.data ?? {};
      const { rows, sizes: nextSizes } = buildRows(payload?.content ?? {});
      setTemplateId(payload?.templateId || null);
      setMatchedScope((payload?.matchedScope as MatchedScope) || 'empty');
      setData(rows);
      setSizes(nextSizes.length ? nextSizes : [...DEFAULT_SIZES]);
      setImageUrls(Array.isArray(payload?.content?.images) ? payload.content.images.filter((u: unknown) => String(u || '').trim()) : []);
    } catch { message.error('加载工序单价模板失败'); }
    finally { setLoadingTemplate(false); }
  };

  useEffect(() => { fetchStyleOptions(''); }, []);

  const handleSelectStyle = (styleNo: string) => {
    const next = String(styleNo || '').trim();
    setSelectedStyleNo(next); setStyleInputVal(next);
    if (next) loadTemplate(next);
  };

  const enterEdit = () => { if (editMode) return; snapshotRef.current = JSON.parse(JSON.stringify(data)); setEditMode(true); };
  const exitEdit = () => { if (snapshotRef.current) setData(snapshotRef.current); resetEdit(); };

  const handleAdd = () => {
    if (!editMode) enterEdit();
    const maxSort = data.length ? Math.max(...data.map((r) => toNumberSafe(r.sortOrder))) : 0;
    const nextSort = maxSort + 1;
    const sizePrices: Record<string, number> = {}; const sizePriceTouched: Record<string, boolean> = {};
    sizes.forEach((s) => { sizePrices[s] = 0; sizePriceTouched[s] = false; });
    setData((prev) => [...prev, { id: `tmp-${Date.now()}`, processCode: String(nextSort).padStart(2, '0'), processName: '', progressStage: '车缝', machineType: '', difficulty: '', standardTime: 0, price: 0, sortOrder: nextSort, sizePrices, sizePriceTouched }]);
  };

  const handleDelete = (id: string | number) => {
    if (!editMode) enterEdit();
    setData((prev) => prev.filter((r) => r.id !== id).map((r, i) => ({ ...r, sortOrder: i + 1, processCode: String(i + 1).padStart(2, '0') })));
  };

  const updateField = (id: string | number, field: keyof StyleProcessRow, value: any) => {
    setData((prev) => prev.map((row) => {
      if (row.id !== id) return row;
      if (field !== 'price') return { ...row, [field]: value };
      const nextPrice = toNumberSafe(value); const oldPrice = toNumberSafe(row.price);
      const nextSizePrices = { ...(row.sizePrices || {}) };
      const touched = row.sizePriceTouched || {};
      sizes.forEach((s) => {
        const cur = toNumberSafe(nextSizePrices[s]);
        if (!touched[s] || cur === oldPrice) nextSizePrices[s] = nextPrice;
      });
      return { ...row, price: nextPrice, sizePrices: nextSizePrices };
    }));
  };

  const updateSizePrice = (id: string | number, size: string, value: number) => {
    setData((prev) => prev.map((row) => row.id !== id ? row : { ...row, sizePrices: { ...(row.sizePrices || {}), [size]: value }, sizePriceTouched: { ...(row.sizePriceTouched || {}), [size]: true } }));
  };

  const handleAddSize = () => {
    const trimmed = newSizeName.trim().toUpperCase();
    if (!trimmed) { message.warning('请输入尺码'); return; }
    if (sizes.includes(trimmed)) { message.warning('该尺码已存在'); return; }
    setSizes((prev) => [...prev, trimmed]);
    setData((prev) => prev.map((r) => ({ ...r, sizePrices: { ...(r.sizePrices || {}), [trimmed]: toNumberSafe(r.price) }, sizePriceTouched: { ...(r.sizePriceTouched || {}), [trimmed]: false } })));
    setNewSizeName(''); message.success(`已添加尺码: ${trimmed}`);
  };

  const handleRemoveSize = (size: string) => {
    setSizes((prev) => prev.filter((s) => s !== size));
    setData((prev) => prev.map((row) => {
      const { [size]: _p, ...nextSP } = row.sizePrices || {}; const { [size]: _t, ...nextT } = row.sizePriceTouched || {};
      return { ...row, sizePrices: nextSP, sizePriceTouched: nextT };
    }));
  };

  const handleUploadImage = async (file: File) => {
    if (!readyForScope) { message.error('请先输入款号'); return Upload.LIST_IGNORE; }
    if (imageUrls.length >= 4) { message.warning('最多上传4张图片'); return Upload.LIST_IGNORE; }
    setImageUploading(true);
    try {
      const formData = new FormData(); formData.append('file', file);
      const res = await api.post<{ code: number; data: string; message?: string }>('/common/upload', formData);
      if (res.code !== 200 || !res.data) { message.error(res.message || '上传失败'); return Upload.LIST_IGNORE; }
      setImageUrls((prev) => [...prev, res.data].slice(0, 4)); message.success('图片已上传，保存后生效');
    } catch (e: any) { message.error(e?.message || '上传失败'); }
    finally { setImageUploading(false); }
    return Upload.LIST_IGNORE;
  };

  const buildPayload = () => ({
    styleNo: selectedStyleNo.trim(),
    templateContent: {
      sizes,
      images: imageUrls,
      steps: data.map((row, i) => ({
        processCode: norm(String(i + 1).padStart(2, '0')),
        processName: norm(row.processName),
        progressStage: norm(row.progressStage) || '车缝',
        machineType: norm(row.machineType),
        difficulty: norm(row.difficulty),
        standardTime: toNumberSafe(row.standardTime),
        unitPrice: toNumberSafe(row.price),
        sizePrices: sizes.reduce((acc, s) => { acc[s] = toNumberSafe(row.sizePrices?.[s] ?? row.price); return acc; }, {} as Record<string, number>),
      })),
    },
  });

  const saveAll = async (): Promise<boolean> => {
    if (!selectedStyleNo.trim()) { message.error('请先输入要配置的款号'); return false; }
    if (!data.length) { message.error('请先添加工序'); return false; }
    const invalid = data.find((r) => !norm(r.processName));
    if (invalid) { message.error('请完善必填项：工序名称'); return false; }
    setSaving(true);
    try {
      const res = await api.post<any>('/template-library/process-price-template', buildPayload());
      if ((res as any)?.code !== 200) { message.error((res as any)?.message || '保存失败'); return false; }
      resetEdit(); await loadTemplate(selectedStyleNo.trim()); message.success('款号工序单价已保存'); return true;
    } catch (e: any) { message.error(e?.message || '保存失败'); return false; }
    finally { setSaving(false); }
  };

  const openSyncModal = async () => {
    setLoadingCandidates(true);
    setSyncModalOpen(true);
    setSyncSelectedIds([]);
    try {
      const res = await api.get<any>('/template-library/sync-candidates', { params: { styleNo: selectedStyleNo.trim() } });
      const list: Array<{id: string; orderNo: string; styleNo: string; status: string; orderQuantity: number}> = Array.isArray((res as any)?.data) ? (res as any).data : [];
      setSyncCandidates(list);
      setSyncSelectedIds(list.map((o) => String(o.id)));
    } catch { message.error('加载候选订单失败'); setSyncModalOpen(false); }
    finally { setLoadingCandidates(false); }
  };

  const executeSyncOrders = async (orderIds: string[]) => {
    setSyncing(true);
    setSyncModalOpen(false);
    try {
      const res = await api.post<any>('/template-library/sync-process-prices', {
        styleNo: selectedStyleNo.trim(),
        orderIds: orderIds.length > 0 ? orderIds : undefined,
      });
      if ((res as any)?.code !== 200) { message.error((res as any)?.message || '同步失败'); return; }
      const result = (res as any)?.data || {};
      message.success(`同步完成：${result.successOrders ?? result.totalOrders ?? 0} 个订单，更新 ${result.totalSynced || 0} 条跟踪单价，刷新 ${result.workflowUpdatedNodes || 0} 个工价节点`);
    } catch { message.error('同步失败'); }
    finally { setSyncing(false); }
  };

  const handleSaveAndSync = async () => { if (await saveAll()) await openSyncModal(); };

  const columns = useMemo(() => {
    const editable = editMode;
    const base = [
      { title: '排序', dataIndex: 'sortOrder', width: 60, align: 'center' as const, render: (_: any, __: any, i: number) => i + 1 },
      { title: '工序编码', dataIndex: 'processCode', width: 88, ellipsis: true },
      {
        title: '工序名称', dataIndex: 'processName', width: 150, ellipsis: true,
        render: (v: string, r: StyleProcessRow) => editable
          ? <DictAutoComplete dictType="process_name" autoCollect size="small" value={v} onChange={(nv) => updateField(r.id, 'processName', nv as string)} />
          : (v || '-'),
      },
      {
        title: '进度节点', dataIndex: 'progressStage', width: 110,
        render: (v: string, r: StyleProcessRow) => editable
          ? <Select size="small" value={v || '车缝'} style={{ width: '100%' }} onChange={(nv) => updateField(r.id, 'progressStage', nv)} options={PROGRESS_STAGES.map((s) => ({ value: s, label: s }))} />
          : (v || '车缝'),
      },
      {
        title: '机器类型', dataIndex: 'machineType', width: 110, ellipsis: true,
        render: (v: string, r: StyleProcessRow) => editable
          ? <DictAutoComplete dictType="machine_type" autoCollect size="small" value={v} placeholder="请选择或输入" onChange={(nv) => updateField(r.id, 'machineType', nv as string)} />
          : (v || '-'),
      },
      {
        title: '工序难度', dataIndex: 'difficulty', width: 90,
        render: (v: string, r: StyleProcessRow) => editable
          ? <Select size="small" value={v || undefined} allowClear placeholder="选择" style={{ width: '100%' }} onChange={(nv) => updateField(r.id, 'difficulty', nv)} options={[{ value: '易', label: '易' }, { value: '中', label: '中' }, { value: '难', label: '难' }]} />
          : (v || '-'),
      },
      {
        title: '标准工时(秒)', dataIndex: 'standardTime', width: 110,
        render: (v: number, r: StyleProcessRow) => editable
          ? <InputNumber size="small" value={v} min={0} style={{ width: '100%' }} onChange={(nv) => updateField(r.id, 'standardTime', toNumberSafe(nv))} />
          : v,
      },
      {
        title: '工价(元)', dataIndex: 'price', width: 110,
        render: (v: number, r: StyleProcessRow) => editable
          ? <InputNumber size="small" value={v} min={0} step={0.01} prefix="¥" style={{ width: '100%' }} onChange={(nv) => updateField(r.id, 'price', nv)} />
          : `¥${toNumberSafe(v)}`,
      },
    ];

    const sizeCols = sizes.map((size) => ({
      title: (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <span>{size}码</span>
          {editable && <DeleteOutlined style={{ color: 'var(--color-danger)', cursor: 'pointer', fontSize: 10 }} onClick={(e) => { e.stopPropagation(); Modal.confirm({ width: '30vw', title: `确定删除"${size}"码？`, content: '删除后该尺码单价数据将被清除', onOk: () => handleRemoveSize(size) }); }} />}
        </div>
      ),
      dataIndex: `size_${size}`, width: 90,
      render: (_: any, r: StyleProcessRow) => {
        const price = r.sizePrices?.[size] ?? r.price ?? 0;
        return editable
          ? <InputNumber size="small" value={price} min={0} step={0.01} prefix="¥" style={{ width: '100%' }} onChange={(nv) => updateSizePrice(r.id, size, toNumberSafe(nv))} />
          : `¥${toNumberSafe(price)}`;
      },
    }));

    const actionCol = {
      title: '操作', dataIndex: 'action', width: 80, resizable: false,
      render: (_: any, r: StyleProcessRow) => editable
        ? <RowActions maxInline={1} actions={[{ key: 'delete', label: '删除', danger: true, onClick: () => Modal.confirm({ width: '30vw', title: '确定删除?', onOk: () => handleDelete(r.id) }) }]} />
        : null,
    };

    return [...base, ...sizeCols, actionCol];
  }, [editMode, sizes, data]);

  return (
    <Layout>
      <Card
        title="单价维护"
        styles={{ body: { padding: '12px 16px' } }}
        extra={
          <Space wrap>
            {!editMode ? (
              <Button type="primary" onClick={enterEdit} disabled={isBusy || !readyForScope}>编辑单价</Button>
            ) : (
              <>
                <Button type="primary" onClick={saveAll} loading={saving} disabled={syncing}>保存</Button>
                <Button disabled={saving} onClick={() => Modal.confirm({ width: '30vw', title: '放弃未保存的修改？', onOk: exitEdit })}>取消</Button>
              </>
            )}
            <Button onClick={handleAdd} disabled={isBusy || !readyForScope}>添加工序</Button>
            <Popover
              trigger="click"
              placement="bottomRight"
              open={addSizePopoverOpen}
              onOpenChange={setAddSizePopoverOpen}
              content={
                <div style={{ width: 200 }}>
                  <div style={{ marginBottom: 8, fontWeight: 500 }}>添加新尺码</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Input size="small" placeholder="如: 3XL, 4XL" value={newSizeName} onChange={(e) => setNewSizeName(e.target.value)} onPressEnter={() => { handleAddSize(); setAddSizePopoverOpen(false); }} style={{ flex: 1 }} />
                    <Button size="small" type="primary" onClick={() => { handleAddSize(); setAddSizePopoverOpen(false); }}>添加</Button>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11, color: '#999' }}>当前: {sizes.join(', ')}</div>
                </div>
              }
            >
              <Button disabled={!editMode || !readyForScope}>添加码数</Button>
            </Popover>
            <Button type="primary" icon={<SyncOutlined />} onClick={handleSaveAndSync} disabled={isBusy || !readyForScope} loading={syncing || saving}>保存并同步该款订单</Button>
          </Space>
        }
      >
        {/* 款号搜索栏 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <Text style={{ whiteSpace: 'nowrap', fontWeight: 500 }}>款号：</Text>
          <AutoComplete
            value={styleInputVal}
            style={{ width: 260 }}
            placeholder="可直接输入新款号或选择已有款号"
            options={styleNoOptions}
            onSearch={scheduleSearch}
            onSelect={handleSelectStyle}
            onChange={(v) => {
              const next = String(v || '');
              setStyleInputVal(next);
              if (!next) { setSelectedStyleNo(''); setTemplateId(null); setMatchedScope('empty'); setData([]); setSizes([...DEFAULT_SIZES]); }
            }}
            onBlur={() => { const next = styleInputVal.trim(); if (next && next !== selectedStyleNo) handleSelectStyle(next); }}
            allowClear
            disabled={isBusy}
          />
          {selectedStyleNo && matchedScope === 'style' && <Tag color="success">当前编辑：{selectedStyleNo} 工价模板</Tag>}
          {selectedStyleNo && matchedScope === 'empty' && <Tag color="blue">新款号模板：{selectedStyleNo}</Tag>}
          {templateId && <Tag color="processing">模板已存在</Tag>}
          {loadingTemplate && <Tag color="processing">加载中...</Tag>}
          <Text type="secondary" style={{ fontSize: 12 }}>可直接输入新款号配置工序单价；保存后可同步到该款生产订单。</Text>
        </div>

        {/* 参考图 */}
        {readyForScope && (
          <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>参考图：</Text>
            {imageUrls.map((url) => (
              <div key={url} style={{ position: 'relative' }}>
                <Image src={getFullAuthedFileUrl(url)} width={64} height={64} style={{ objectFit: 'cover', borderRadius: 6, border: '1px solid #f0f0f0' }} />
                <Button type="text" danger size="small" style={{ position: 'absolute', top: -8, right: -8, background: '#fff', borderRadius: '50%' }} onClick={() => setImageUrls((prev) => prev.filter((u) => u !== url))}>×</Button>
              </div>
            ))}
            {imageUrls.length < 4 && (
              <Upload accept="image/*" showUploadList={false} beforeUpload={(f) => handleUploadImage(f as File)} disabled={imageUploading || isBusy}>
                <Button icon={<UploadOutlined />} loading={imageUploading} disabled={isBusy} size="small">上传图片</Button>
              </Upload>
            )}
          </div>
        )}

        {/* 工序单价表格 */}
        <ResizableTable
          bordered
          dataSource={data as any[]}
          columns={columns as any[]}
          pagination={false}
          loading={loadingTemplate}
          rowKey="id"
          scroll={{ x: 'max-content', y: 'calc(100vh - 340px)' }}
          storageKey="process-price-maintenance"
          minColumnWidth={70}
          locale={{ emptyText: !selectedStyleNo ? '请先输入款号后再维护工序单价' : '当前款号暂无工序配置，点击「添加工序」开始维护' }}
        />
      </Card>

      <Modal
        title={`选择要同步的订单（款号：${selectedStyleNo}）`}
        open={syncModalOpen}
        width="52vw"
        onCancel={() => setSyncModalOpen(false)}
        footer={
          <Space>
            <Button onClick={() => setSyncModalOpen(false)}>取消</Button>
            <Button
              type="primary"
              loading={syncing}
              disabled={syncSelectedIds.length === 0}
              onClick={() => executeSyncOrders(syncSelectedIds)}
            >
              同步选中的 {syncSelectedIds.length} 个订单
            </Button>
          </Space>
        }
      >
        {loadingCandidates ? (
          <div style={{ textAlign: 'center', padding: 40 }}>加载中...</div>
        ) : syncCandidates.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>未找到该款号的生产订单</div>
        ) : (
          <ResizableTable
            rowKey="id"
            dataSource={syncCandidates as any[]}
            size="small"
            pagination={false}
            scroll={{ y: 400 }}
            storageKey="sync-order-select"
            rowSelection={{
              type: 'checkbox',
              selectedRowKeys: syncSelectedIds,
              onChange: (keys: React.Key[]) => setSyncSelectedIds(keys.map(String)),
            }}
            columns={[
              { title: '订单号', dataIndex: 'orderNo', width: 200 },
              { title: '状态', dataIndex: 'status', width: 100, render: (v: string) => v ? <Tag>{v}</Tag> : '-' },
              { title: '数量', dataIndex: 'orderQuantity', width: 90, align: 'center' as const },
            ]}
          />
        )}
      </Modal>
    </Layout>
  );
};

export default ProcessPriceMaintenance;
