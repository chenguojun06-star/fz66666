import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  App,
  AutoComplete,
  Button,
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
import ResizableModal from '@/components/common/ResizableModal';
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

interface SyncProcessPriceModalProps {
  open: boolean;
  onCancel: () => void;
}

type MatchedScope = 'style' | 'empty';

const PROGRESS_STAGES = ['采购', '裁剪', '二次工艺', '车缝', '尾部', '入库'];
const DEFAULT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL'];

const norm = (v: unknown) => String(v || '').trim();

const buildRowsFromContent = (content: any, fallbackSizes: string[] = DEFAULT_SIZES): { rows: StyleProcessRow[]; sizes: string[] } => {
  const rawSteps = Array.isArray(content?.steps) ? content.steps : [];
  const rawSizes = Array.isArray(content?.sizes)
    ? content.sizes.map((item: unknown) => String(item || '').trim().toUpperCase()).filter(Boolean)
    : [];
  const sizes = (rawSizes.length ? rawSizes : fallbackSizes).slice().sort((a, b) => {
    const ia = SIZE_ORDER.indexOf(a);
    const ib = SIZE_ORDER.indexOf(b);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return a.localeCompare(b);
  });

  const rows: StyleProcessRow[] = rawSteps.map((item: any, index: number) => {
    const sizePrices: Record<string, number> = {};
    const sizePriceTouched: Record<string, boolean> = {};
    sizes.forEach((size) => {
      const sizePrice = toNumberSafe(item?.sizePrices?.[size]);
      const basePrice = toNumberSafe(item?.unitPrice ?? item?.price);
      sizePrices[size] = sizePrice || basePrice;
      sizePriceTouched[size] = item?.sizePrices?.[size] != null;
    });

    return {
      id: item?.processCode || `loaded-${index}`,
      processCode: String(item?.processCode || String(index + 1).padStart(2, '0')),
      processName: String(item?.processName || item?.name || ''),
      progressStage: String(item?.progressStage || '车缝'),
      machineType: String(item?.machineType || ''),
      difficulty: String(item?.difficulty || ''),
      standardTime: toNumberSafe(item?.standardTime),
      price: toNumberSafe(item?.unitPrice ?? item?.price),
      sortOrder: index + 1,
      sizePrices,
      sizePriceTouched,
    };
  });

  return { rows, sizes };
};

const SyncProcessPriceModal: React.FC<SyncProcessPriceModalProps> = ({ open, onCancel }) => {
  const { message } = App.useApp();

  const [matchedScope, setMatchedScope] = useState<MatchedScope>('empty');
  const [templateId, setTemplateId] = useState<string | null>(null);

  const [styleInputVal, setStyleInputVal] = useState('');
  const [styleNoOptions, setStyleNoOptions] = useState<{ value: string; label: string }[]>([]);
  const [_styleNoLoading, setStyleNoLoading] = useState(false);
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
  const snapshotRef = useRef<StyleProcessRow[] | null>(null);

  const fetchStyleNoOptions = async (keyword: string) => {
    const seq = (styleNoSeq.current += 1);
    setStyleNoLoading(true);
    try {
      const res = await api.get<any>('/template-library/process-price-style-options', {
        params: { keyword: keyword.trim() },
      });
      if (seq !== styleNoSeq.current) return;
      const records: any[] = Array.isArray((res as any)?.data) ? (res as any).data : [];
      setStyleNoOptions(
        records
          .map((record: any) => {
            const styleNo = String(record?.styleNo || '').trim();
            const styleName = String(record?.styleName || '').trim();
            return {
              value: styleNo,
              label: styleName ? `${styleNo}（${styleName}）` : styleNo,
            };
          })
          .filter((record: any) => record.value)
      );
    } catch {
      // ignore
    } finally {
      if (seq === styleNoSeq.current) setStyleNoLoading(false);
    }
  };

  const scheduleStyleSearch = (keyword: string) => {
    if (styleNoTimer.current) window.clearTimeout(styleNoTimer.current);
    styleNoTimer.current = window.setTimeout(() => fetchStyleNoOptions(keyword), 250);
  };

  const resetEditingState = () => {
    setEditMode(false);
    snapshotRef.current = null;
  };

  const loadTemplate = async (styleNo?: string) => {
    setLoadingTemplate(true);
    setTemplateId(null);
    setMatchedScope('empty');
    setData([]);
    setSizes([...DEFAULT_SIZES]);
    setImageUrls([]);
    resetEditingState();
    try {
      const res = await api.get<any>('/template-library/process-price-template', {
        params: { styleNo: String(styleNo || '').trim() },
      });
      const payload = (res as any)?.data ?? {};
      const { rows, sizes: nextSizes } = buildRowsFromContent(payload?.content ?? {});
      setTemplateId(payload?.templateId || null);
      setMatchedScope((payload?.matchedScope as MatchedScope) || 'empty');
      setData(rows);
      setSizes(nextSizes.length ? nextSizes : [...DEFAULT_SIZES]);
      setImageUrls(Array.isArray(payload?.content?.images) ? payload.content.images.filter((item: unknown) => String(item || '').trim()) : []);
    } catch {
      message.error('加载工序单价模板失败');
    } finally {
      setLoadingTemplate(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    fetchStyleNoOptions('');
    setStyleInputVal('');
    setSelectedStyleNo('');
    setData([]);
    setSizes([...DEFAULT_SIZES]);
    setImageUrls([]);
    setTemplateId(null);
    setMatchedScope('empty');
  }, [open]);

  const handleUploadImage = async (file: File) => {
    if (!readyForScope) {
      message.error('请先输入款号');
      return Upload.LIST_IGNORE;
    }
    if (imageUrls.length >= 4) {
      message.warning('最多上传4张图片');
      return Upload.LIST_IGNORE;
    }
    setImageUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post<{ code: number; data: string; message?: string }>('/common/upload', formData);
      if (res.code !== 200 || !res.data) {
        message.error(res.message || '上传失败');
        return Upload.LIST_IGNORE;
      }
      setImageUrls((prev) => [...prev, res.data].slice(0, 4));
      message.success('图片已上传，保存后生效');
    } catch (e: any) {
      message.error(e?.message || '上传失败');
    } finally {
      setImageUploading(false);
    }
    return Upload.LIST_IGNORE;
  };

  const handleSelectStyle = (styleNo: string) => {
    const nextStyleNo = String(styleNo || '').trim();
    setSelectedStyleNo(nextStyleNo);
    setStyleInputVal(nextStyleNo);
    if (nextStyleNo) {
      loadTemplate(nextStyleNo);
    }
  };

  const enterEdit = () => {
    if (editMode) return;
    snapshotRef.current = JSON.parse(JSON.stringify(data));
    setEditMode(true);
  };

  const exitEdit = () => {
    if (snapshotRef.current) {
      setData(snapshotRef.current);
    }
    resetEditingState();
  };

  const handleAdd = () => {
    if (!editMode) enterEdit();
    const maxSort = data.length ? Math.max(...data.map((item) => toNumberSafe(item.sortOrder))) : 0;
    const nextSort = maxSort + 1;
    const sizePrices: Record<string, number> = {};
    const sizePriceTouched: Record<string, boolean> = {};
    sizes.forEach((size) => {
      sizePrices[size] = 0;
      sizePriceTouched[size] = false;
    });
    setData((prev) => [
      ...prev,
      {
        id: `tmp-${Date.now()}`,
        processCode: String(nextSort).padStart(2, '0'),
        processName: '',
        progressStage: '车缝',
        machineType: '',
        difficulty: '',
        standardTime: 0,
        price: 0,
        sortOrder: nextSort,
        sizePrices,
        sizePriceTouched,
      },
    ]);
  };

  const handleDelete = (id: string | number) => {
    if (!editMode) enterEdit();
    setData((prev) => prev
      .filter((item) => item.id !== id)
      .map((item, index) => ({
        ...item,
        sortOrder: index + 1,
        processCode: String(index + 1).padStart(2, '0'),
      }))
    );
  };

  const updateField = (id: string | number, field: keyof StyleProcessRow, value: any) => {
    setData((prev) => prev.map((row) => {
      if (row.id !== id) return row;
      if (field !== 'price') {
        return { ...row, [field]: value };
      }
      const nextPrice = toNumberSafe(value);
      const oldPrice = toNumberSafe(row.price);
      const nextSizePrices = { ...(row.sizePrices || {}) };
      const touched = row.sizePriceTouched || {};
      sizes.forEach((size) => {
        const current = toNumberSafe(nextSizePrices[size]);
        if (!touched[size] || current === oldPrice) {
          nextSizePrices[size] = nextPrice;
        }
      });
      return { ...row, price: nextPrice, sizePrices: nextSizePrices };
    }));
  };

  const updateSizePrice = (id: string | number, size: string, value: number) => {
    setData((prev) => prev.map((row) => row.id !== id ? row : {
      ...row,
      sizePrices: { ...(row.sizePrices || {}), [size]: value },
      sizePriceTouched: { ...(row.sizePriceTouched || {}), [size]: true },
    }));
  };

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
    setData((prev) => prev.map((row) => ({
      ...row,
      sizePrices: { ...(row.sizePrices || {}), [trimmed]: toNumberSafe(row.price) },
      sizePriceTouched: { ...(row.sizePriceTouched || {}), [trimmed]: false },
    })));
    setNewSizeName('');
    message.success(`已添加尺码: ${trimmed}`);
  };

  const handleRemoveSize = (size: string) => {
    setSizes((prev) => prev.filter((item) => item !== size));
    setData((prev) => prev.map((row) => {
      const { [size]: _removedPrice, ...nextSizePrices } = row.sizePrices || {};
      const { [size]: _removedTouched, ...nextTouched } = row.sizePriceTouched || {};
      return { ...row, sizePrices: nextSizePrices, sizePriceTouched: nextTouched };
    }));
  };

  const saveAll = async (): Promise<boolean> => {
    if (!selectedStyleNo.trim()) {
      message.error('请先输入要配置的款号');
      return false;
    }
    const rows = data.map((row, index) => ({
      ...row,
      sortOrder: index + 1,
      processCode: String(index + 1).padStart(2, '0'),
    }));
    if (!rows.length) {
      message.error('请先添加工序');
      return false;
    }
    const invalid = rows.find((row) => !norm(row.processName));
    if (invalid) {
      message.error('请完善必填项：工序名称');
      return false;
    }

    setSaving(true);
    try {
      const payload = {
        styleNo: selectedStyleNo.trim(),
        templateContent: {
          sizes,
          images: imageUrls,
          steps: rows.map((row) => ({
            processCode: norm(row.processCode),
            processName: norm(row.processName),
            progressStage: norm(row.progressStage) || '车缝',
            machineType: norm(row.machineType),
            difficulty: norm(row.difficulty),
            standardTime: toNumberSafe(row.standardTime),
            unitPrice: toNumberSafe(row.price),
            sizePrices: sizes.reduce((acc, size) => {
              acc[size] = toNumberSafe(row.sizePrices?.[size] ?? row.price);
              return acc;
            }, {} as Record<string, number>),
          })),
        },
      };
      const res = await api.post<any>('/template-library/process-price-template', payload);
      if ((res as any)?.code !== 200) {
        message.error((res as any)?.message || '保存失败');
        return false;
      }
      resetEditingState();
      await loadTemplate(selectedStyleNo.trim());
      message.success('款号工序单价已保存');
      return true;
    } catch (error: any) {
      message.error(error?.message || '保存失败');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const syncToOrders = async (): Promise<boolean> => {
    setSyncing(true);
    try {
      const res = await api.post<any>('/template-library/sync-process-prices', {
        styleNo: selectedStyleNo.trim(),
      });
      if ((res as any)?.code !== 200) {
        message.error((res as any)?.message || '同步失败');
        return false;
      }
      const result = (res as any)?.data || {};
      message.success(
        `${result.scopeLabel || '同步完成'}：${result.totalOrders || 0} 个订单，更新 ${result.totalSynced || 0} 条跟踪单价，刷新 ${result.workflowUpdatedNodes || 0} 个订单工价节点`
      );
      return true;
    } catch {
      message.error('同步失败');
      return false;
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveAndSync = async () => {
    if (await saveAll()) {
      await syncToOrders();
    }
  };

  const handleClose = () => {
    setMatchedScope('empty');
    setTemplateId(null);
    setStyleInputVal('');
    setSelectedStyleNo('');
    setData([]);
    setSizes([...DEFAULT_SIZES]);
    setImageUrls([]);
    resetEditingState();
    onCancel();
  };

  const isBusy = saving || syncing || loadingTemplate;
  const readyForScope = Boolean(selectedStyleNo.trim());

  const columns = useMemo(() => {
    const editable = editMode;
    const baseColumns = [
      {
        title: '排序',
        dataIndex: 'sortOrder',
        width: 60,
        align: 'center' as const,
        render: (_: any, __: StyleProcessRow, index: number) => index + 1,
      },
      {
        title: '工序编码',
        dataIndex: 'processCode',
        width: 88,
        ellipsis: true,
      },
      {
        title: '工序名称',
        dataIndex: 'processName',
        width: 150,
        ellipsis: true,
        render: (value: string, record: StyleProcessRow) => editable
          ? (
              <DictAutoComplete
                dictType="process_name"
                autoCollect
                size="small"
                value={value}
                onChange={(nextValue) => updateField(record.id, 'processName', nextValue as string)}
              />
            )
          : (value || '-'),
      },
      {
        title: '进度节点',
        dataIndex: 'progressStage',
        width: 110,
        render: (value: string, record: StyleProcessRow) => editable
          ? (
              <Select
                size="small"
                value={value || '车缝'}
                style={{ width: '100%' }}
                onChange={(nextValue) => updateField(record.id, 'progressStage', nextValue)}
                options={PROGRESS_STAGES.map((stage) => ({ value: stage, label: stage }))}
              />
            )
          : (value || '车缝'),
      },
      {
        title: '机器类型',
        dataIndex: 'machineType',
        width: 110,
        ellipsis: true,
        render: (value: string, record: StyleProcessRow) => editable
          ? (
              <DictAutoComplete
                dictType="machine_type"
                autoCollect
                size="small"
                value={value}
                placeholder="请选择或输入机器类型"
                onChange={(nextValue) => updateField(record.id, 'machineType', nextValue as string)}
              />
            )
          : (value || '-'),
      },
      {
        title: '工序难度',
        dataIndex: 'difficulty',
        width: 90,
        render: (value: string, record: StyleProcessRow) => editable
          ? (
              <Select
                size="small"
                value={value || undefined}
                allowClear
                placeholder="选择"
                style={{ width: '100%' }}
                onChange={(nextValue) => updateField(record.id, 'difficulty', nextValue)}
                options={[
                  { value: '易', label: '易' },
                  { value: '中', label: '中' },
                  { value: '难', label: '难' },
                ]}
              />
            )
          : (value || '-'),
      },
      {
        title: '标准工时(秒)',
        dataIndex: 'standardTime',
        width: 110,
        render: (value: number, record: StyleProcessRow) => editable
          ? (
              <InputNumber
                size="small"
                value={value}
                min={0}
                style={{ width: '100%' }}
                onChange={(nextValue) => updateField(record.id, 'standardTime', toNumberSafe(nextValue))}
              />
            )
          : value,
      },
      {
        title: '工价(元)',
        dataIndex: 'price',
        width: 110,
        render: (value: number, record: StyleProcessRow) => editable
          ? (
              <InputNumber
                size="small"
                value={value}
                min={0}
                step={0.01}
                prefix="¥"
                style={{ width: '100%' }}
                onChange={(nextValue) => updateField(record.id, 'price', nextValue)}
              />
            )
          : `¥${toNumberSafe(value)}`,
      },
    ];

    const sizeColumns = sizes.map((size) => ({
      title: (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <span>{size}码</span>
          {editable && (
            <DeleteOutlined
              style={{ color: 'var(--color-danger)', cursor: 'pointer', fontSize: 10 }}
              onClick={(event) => {
                event.stopPropagation();
                Modal.confirm({
                  width: '30vw',
                  title: `确定删除"${size}"码？`,
                  content: '删除后该尺码单价数据将被清除',
                  onOk: () => handleRemoveSize(size),
                });
              }}
            />
          )}
        </div>
      ),
      dataIndex: `size_${size}`,
      width: 90,
      render: (_: any, record: StyleProcessRow) => {
        const price = record.sizePrices?.[size] ?? record.price ?? 0;
        return editable
          ? (
              <InputNumber
                size="small"
                value={price}
                min={0}
                step={0.01}
                prefix="¥"
                style={{ width: '100%' }}
                onChange={(nextValue) => updateSizePrice(record.id, size, toNumberSafe(nextValue))}
              />
            )
          : `¥${toNumberSafe(price)}`;
      },
    }));

    const actionColumn = {
      title: '操作',
      dataIndex: 'action',
      width: 80,
      resizable: false,
      render: (_: any, record: StyleProcessRow) => editable
        ? (
            <RowActions
              maxInline={1}
              actions={[
                {
                  key: 'delete',
                  label: '删除',
                  danger: true,
                  onClick: () => Modal.confirm({
                    width: '30vw',
                    title: '确定删除?',
                    onOk: () => handleDelete(record.id),
                  }),
                },
              ]}
            />
          )
        : null,
    };

    return [...baseColumns, ...sizeColumns, actionColumn];
  }, [editMode, sizes, data]);

  return (
    <ResizableModal
      open={open}
      title="工序单价维护 · 同步到生产订单"
      width="60vw"
      initialHeight={Math.round(window.innerHeight * 0.82)}
      onCancel={handleClose}
      footer={
        <Space>
          <Button onClick={handleClose} disabled={isBusy}>关闭</Button>
          {editMode && (
            <Button
              disabled={saving}
              onClick={() => Modal.confirm({ width: '30vw', title: '放弃未保存的修改？', onOk: exitEdit })}
            >
              取消编辑
            </Button>
          )}
          <Button onClick={saveAll} disabled={isBusy || !readyForScope} loading={saving && !syncing}>
            保存款号单价
          </Button>
          <Button
            type="primary"
            icon={<SyncOutlined />}
            onClick={handleSaveAndSync}
            disabled={isBusy || !readyForScope}
            loading={syncing || saving}
          >
            保存并同步该款订单
          </Button>
        </Space>
      }
    >
      <Space orientation="vertical" style={{ width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Text style={{ whiteSpace: 'nowrap', flexShrink: 0, fontWeight: 500 }}>款号：</Text>
          <AutoComplete
            value={styleInputVal}
            style={{ width: 240 }}
            placeholder="可直接输入新款号或选择已有款号"
            options={styleNoOptions}
            onSearch={scheduleStyleSearch}
            onSelect={handleSelectStyle}
            onChange={(value) => {
              const next = String(value || '');
              setStyleInputVal(next);
              if (!next) {
                setSelectedStyleNo('');
                setTemplateId(null);
                setMatchedScope('empty');
                setData([]);
                setSizes([...DEFAULT_SIZES]);
              }
            }}
            onBlur={() => {
              const next = styleInputVal.trim();
              if (!next) {
                return;
              }
              if (next !== selectedStyleNo) {
                handleSelectStyle(next);
              }
            }}
            allowClear
            disabled={isBusy}
          />

          {selectedStyleNo && matchedScope === 'style' && <Tag color="success">当前编辑：{selectedStyleNo} 工价模板</Tag>}
          {selectedStyleNo && matchedScope === 'empty' && <Tag color="blue">新款号模板：{selectedStyleNo}</Tag>}
          {templateId && <Tag color="processing">模板已存在</Tag>}
          {loadingTemplate && <Tag color="processing">加载中...</Tag>}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Text type="secondary">
            可直接输入一个新款号独立配置工序单价；只有这个款号保存后，才允许同步到该款生产订单。
          </Text>

          <Space>
            <Button type="primary" onClick={handleAdd} disabled={isBusy || !readyForScope}>添加工序</Button>
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
                      onChange={(event) => setNewSizeName(event.target.value)}
                      onPressEnter={() => {
                        handleAddSize();
                        setAddSizePopoverOpen(false);
                      }}
                      style={{ flex: 1 }}
                    />
                    <Button size="small" type="primary" onClick={() => {
                      handleAddSize();
                      setAddSizePopoverOpen(false);
                    }}>
                      添加
                    </Button>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11, color: '#999' }}>当前: {sizes.join(', ')}</div>
                </div>
              }
            >
              <Button disabled={!editMode || !readyForScope}>添加码数</Button>
            </Popover>
            {!editMode ? (
              <Button type="primary" onClick={enterEdit} disabled={isBusy || !readyForScope}>编辑</Button>
            ) : (
              <>
                <Button type="primary" onClick={saveAll} loading={saving} disabled={syncing}>保存</Button>
                <Button disabled={saving} onClick={() => Modal.confirm({ width: '30vw', title: '放弃未保存的修改？', onOk: exitEdit })}>取消</Button>
              </>
            )}
          </Space>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 500, marginBottom: 8 }}>款号参考图</div>
            <div style={{ color: 'rgba(0,0,0,0.45)', fontSize: 12, marginBottom: 8 }}>
              图片只保存在当前工序单价模板，不回写上游款号资料。
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {imageUrls.map((url) => (
                <div key={url} style={{ position: 'relative' }}>
                  <Image
                    src={getFullAuthedFileUrl(url)}
                    width={72}
                    height={72}
                    style={{ objectFit: 'cover', borderRadius: 6, border: '1px solid #f0f0f0' }}
                  />
                  <Button
                    type="text"
                    danger
                    size="small"
                    style={{ position: 'absolute', top: -8, right: -8, background: '#fff', borderRadius: '50%' }}
                    onClick={() => setImageUrls((prev) => prev.filter((item) => item !== url))}
                  >
                    ×
                  </Button>
                </div>
              ))}
              {imageUrls.length < 4 && (
                <Upload
                  accept="image/*"
                  showUploadList={false}
                  beforeUpload={(file) => handleUploadImage(file as File)}
                  disabled={!readyForScope || imageUploading || isBusy}
                >
                  <Button icon={<UploadOutlined />} loading={imageUploading} disabled={!readyForScope || isBusy}>
                    上传图片
                  </Button>
                </Upload>
              )}
            </div>
          </div>
        </div>

        <ResizableTable
          bordered
          dataSource={data as any[]}
          columns={columns as any[]}
          pagination={false}
          loading={loadingTemplate}
          rowKey="id"
          scroll={{ x: 'max-content', y: 440 }}
          storageKey="sync-process-price-modal"
          minColumnWidth={70}
          locale={{
            emptyText: !selectedStyleNo
              ? '请先输入款号后再维护工序单价'
              : '当前规则暂无工序配置，点击「添加工序」开始维护',
          }}
        />
      </Space>
    </ResizableModal>
  );
};

export default SyncProcessPriceModal;

