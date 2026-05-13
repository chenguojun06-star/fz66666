import React, { useState, useEffect, useCallback, useRef } from 'react';
import { App, Switch, Button, Table, Input, InputNumber, Space, Popconfirm, Tooltip, Tag, Dropdown, Modal, Form } from 'antd';
import { SyncOutlined, PlusOutlined, DeleteOutlined, SaveOutlined, CloudUploadOutlined, EditOutlined, RollbackOutlined } from '@ant-design/icons';
import api from '@/utils/api';
import type { ProductSku } from '@/types/style';
import type { MenuProps } from 'antd';
import SmallModal from '@/components/common/SmallModal';

interface StyleSkuTabProps {
  styleId: string;
  styleNo: string;
  skc?: string;
  skuMode?: 'AUTO' | 'MANUAL';
  onModeChange?: (mode: 'AUTO' | 'MANUAL') => void;
  onRefresh?: () => void;
}

let tempIdCounter = -1;

const StyleSkuTab: React.FC<StyleSkuTabProps> = ({ styleId, styleNo, skc: initialSkc, skuMode: initialMode, onModeChange, onRefresh }) => {
  const { message } = App.useApp();
  const messageRef = useRef(message);
  messageRef.current = message;

  const [skuMode, setSkuMode] = useState<'AUTO' | 'MANUAL'>(initialMode || 'AUTO');
  const [skcValue, setSkcValue] = useState(initialSkc || '');
  const [skus, setSkus] = useState<ProductSku[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [editingData, setEditingData] = useState<Record<number | string, Partial<ProductSku>>>({});
  const [deletedIds, setDeletedIds] = useState<number[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [skcEditing, setSkcEditing] = useState(false);
  const [skcSaving, setSkcSaving] = useState(false);
  const [rollbackOpen, setRollbackOpen] = useState(false);
  const [rollbackForm] = Form.useForm();

  const fetchSkus = useCallback(async () => {
    if (!styleId) return;
    setLoading(true);
    try {
      const res = await api.post<{ code: number; data: ProductSku[] }>('/style/sku/list-by-style', { styleId });
      if (res.code === 200 && res.data) {
        setSkus(res.data);
        setEditingData({});
        setDeletedIds([]);
        setHasChanges(false);
        setIsEditing(false);
        setSkcEditing(false);
      }
    } catch {
      messageRef.current.error('获取SKU列表失败');
    } finally {
      setLoading(false);
    }
  }, [styleId]);

  useEffect(() => { fetchSkus(); }, [fetchSkus]);
  useEffect(() => { if (initialMode) setSkuMode(initialMode); }, [initialMode]);
  useEffect(() => { if (initialSkc) setSkcValue(initialSkc); }, [initialSkc]);

  const doToggleMode = async (newMode: 'AUTO' | 'MANUAL') => {
    try {
      const res = await api.put(`/style/sku/mode/${styleId}`, { skuMode: newMode });
      if (res.code === 200) {
        setSkuMode(newMode);
        onModeChange?.(newMode);
        messageRef.current.success(`已切换为${newMode === 'AUTO' ? '自动生成' : '手动编辑'}模式`);
        if (newMode === 'AUTO') fetchSkus();
      } else {
        messageRef.current.error(res.message || '切换模式失败');
      }
    } catch {
      messageRef.current.error('切换模式失败');
    }
  };

  const handleModeToggle = async (checked: boolean) => {
    const newMode = checked ? 'MANUAL' : 'AUTO';
    if (newMode === 'AUTO') {
      Modal.confirm({
        title: '确认切换为自动生成模式？',
        content: '切换后，所有手动编辑的SKU编码将被重置为自动生成的编码，此操作不可撤销。',
        okText: '确认切换',
        cancelText: '取消',
        onOk: () => doToggleMode(newMode),
      });
    } else {
      doToggleMode(newMode);
    }
  };

  const handleFieldChange = (rowKey: number | string, field: string, value: any) => {
    setEditingData(prev => ({ ...prev, [rowKey]: { ...prev[rowKey], [field]: value } }));
    setHasChanges(true);
  };

  const handleSaveSkc = async () => {
    if (!skcValue || !skcValue.trim()) {
      messageRef.current.error('SKC不能为空');
      return;
    }
    setSkcSaving(true);
    try {
      const res = await api.put(`/style/sku/skc/${styleId}`, { skc: skcValue.trim() });
      if (res.code === 200) {
        messageRef.current.success('SKC修改成功，已同步到关联的生产订单');
        setSkcEditing(false);
        onRefresh?.();
      } else {
        messageRef.current.error(res.message || 'SKC修改失败');
      }
    } catch {
      messageRef.current.error('SKC修改失败');
    } finally {
      setSkcSaving(false);
    }
  };

  const handleSave = async () => {
    if (!hasChanges && deletedIds.length === 0) {
      messageRef.current.info('没有需要保存的修改');
      return;
    }
    setSaving(true);
    try {
      const updatedSkus = skus.map(sku => {
        const key = sku.id ?? (sku as any)._tempKey;
        const merged = { ...sku, ...(editingData[key] || {}) };
        const { _tempKey, ...rest } = merged as any;
        return rest;
      });
      const res = await api.put(`/style/sku/batch/${styleId}`, {
        skuList: updatedSkus,
        deletedIds: deletedIds.length > 0 ? deletedIds : undefined,
      });
      if (res.code === 200) {
        messageRef.current.success('保存成功');
        setEditingData({});
        setDeletedIds([]);
        setHasChanges(false);
        setIsEditing(false);
        fetchSkus();
        onRefresh?.();
      } else {
        messageRef.current.error(res.message || '保存失败');
      }
    } catch {
      messageRef.current.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleSyncToProduction = async () => {
    setSyncing(true);
    try {
      const res = await api.post(`/style/sku/sync-to-production/${styleId}`);
      if (res.code === 200) {
        messageRef.current.success('SKU已同步到大货订单');
        fetchSkus();
      } else {
        messageRef.current.error(res.message || '同步失败');
      }
    } catch {
      messageRef.current.error('同步失败');
    } finally {
      setSyncing(false);
    }
  };

  const addRows = (count: number) => {
    const newSkus: (ProductSku & { _tempKey: number })[] = [];
    for (let i = 0; i < count; i++) {
      newSkus.push({
        skuCode: `${styleNo}-`,
        color: '',
        size: '',
        status: 'ENABLED',
        skuMode,
        manuallyEdited: skuMode === 'MANUAL' ? 1 : 0,
        _tempKey: tempIdCounter--,
      } as any);
    }
    setSkus(prev => [...prev, ...newSkus]);
    setHasChanges(true);
    if (count > 1) messageRef.current.success(`已添加${count}行`);
  };

  const addMenuItems: MenuProps['items'] = [
    { key: '1', label: '+1行', onClick: () => addRows(1) },
    { key: '5', label: '+5行', onClick: () => addRows(5) },
    { key: '10', label: '+10行', onClick: () => addRows(10) },
    { key: '20', label: '+20行', onClick: () => addRows(20) },
  ];

  const handleDeleteRow = (rowKey: number | string) => {
    const skuToDelete = skus.find(s => (s.id ?? (s as any)._tempKey) === rowKey);
    if (skuToDelete?.id) setDeletedIds(prev => [...prev, skuToDelete.id!]);
    setSkus(prev => prev.filter(s => (s.id ?? (s as any)._tempKey) !== rowKey));
    setEditingData(prev => { const next = { ...prev }; delete next[rowKey]; return next; });
    setHasChanges(true);
  };

  const handleCancelEdit = () => {
    setRollbackOpen(true);
  };

  const handleRollbackOk = async (values: { remark: string }) => {
    const remark = (values.remark || '').trim();
    if (remark) {
      try {
        await api.put(`/style/sku/rollback-remark/${styleId}`, { remark });
      } catch {
        messageRef.current.warning('退回备注保存失败，但编辑已退回');
      }
    }
    setIsEditing(false);
    setEditingData({});
    setDeletedIds([]);
    setHasChanges(false);
    setRollbackOpen(false);
    rollbackForm.resetFields();
    fetchSkus();
  };

  const getCellValue = (sku: ProductSku, field: string) => {
    const key = sku.id ?? (sku as any)._tempKey;
    if (editingData[key] && field in editingData[key]) return (editingData[key] as any)[field];
    return (sku as any)[field];
  };

  const getRowKey = (record: ProductSku) => {
    if (record.id) return record.id;
    return String((record as any)._tempKey ?? '');
  };

  const isManual = skuMode === 'MANUAL';
  const canEdit = isEditing;

  const columns = [
    {
      title: 'SKU编码', dataIndex: 'skuCode', key: 'skuCode', width: 220,
      render: (_: string, record: ProductSku) => {
        const key = getRowKey(record);
        return canEdit && isManual ? (
          <Input value={getCellValue(record, 'skuCode')} onChange={e => handleFieldChange(key, 'skuCode', e.target.value)} placeholder="款号-颜色-尺码" />
        ) : <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{record.skuCode}</span>;
      },
    },
    {
      title: '颜色', dataIndex: 'color', key: 'color', width: 120,
      render: (_: string, record: ProductSku) => {
        const key = getRowKey(record);
        return canEdit && isManual ? (
          <Input value={getCellValue(record, 'color')} onChange={e => handleFieldChange(key, 'color', e.target.value)} placeholder="颜色" />
        ) : record.color;
      },
    },
    {
      title: '尺码', dataIndex: 'size', key: 'size', width: 100,
      render: (_: string, record: ProductSku) => {
        const key = getRowKey(record);
        return canEdit && isManual ? (
          <Input value={getCellValue(record, 'size')} onChange={e => handleFieldChange(key, 'size', e.target.value)} placeholder="尺码" />
        ) : record.size;
      },
    },
    {
      title: '商品条码(69码)', dataIndex: 'barcode', key: 'barcode', width: 160,
      render: (_: string, record: ProductSku) => {
        const key = getRowKey(record);
        return canEdit ? (
          <Input value={getCellValue(record, 'barcode') || ''} onChange={e => handleFieldChange(key, 'barcode', e.target.value)} placeholder="商品条码" />
        ) : record.barcode || '-';
      },
    },
    {
      title: '成本价', dataIndex: 'costPrice', key: 'costPrice', width: 110,
      render: (_: number, record: ProductSku) => {
        const key = getRowKey(record);
        return canEdit ? (
          <InputNumber value={getCellValue(record, 'costPrice')} onChange={v => handleFieldChange(key, 'costPrice', v)} min={0} precision={2} prefix="¥" style={{ width: '100%' }} />
        ) : record.costPrice != null ? `¥${record.costPrice.toFixed(2)}` : '-';
      },
    },
    {
      title: '销售价', dataIndex: 'salesPrice', key: 'salesPrice', width: 110,
      render: (_: number, record: ProductSku) => {
        const key = getRowKey(record);
        return canEdit ? (
          <InputNumber value={getCellValue(record, 'salesPrice')} onChange={v => handleFieldChange(key, 'salesPrice', v)} min={0} precision={2} prefix="¥" style={{ width: '100%' }} />
        ) : record.salesPrice != null ? `¥${record.salesPrice.toFixed(2)}` : '-';
      },
    },
    {
      title: '库存', dataIndex: 'stockQuantity', key: 'stockQuantity', width: 80,
      render: (_: number, record: ProductSku) => record.stockQuantity ?? 0,
    },
    {
      title: '状态', key: 'status', width: 80,
      render: (_: any, record: ProductSku) =>
        record.manuallyEdited === 1 ? <Tag color="orange">已编辑</Tag> : <Tag color="blue">自动</Tag>,
    },
    {
      title: '备注', dataIndex: 'remark', key: 'remark', width: 150, ellipsis: true,
      render: (_: string, record: ProductSku) => {
        const key = getRowKey(record);
        const val = getCellValue(record, 'remark');
        return canEdit ? (
          <Input value={val || ''} onChange={e => handleFieldChange(key, 'remark', e.target.value)} placeholder="备注" />
        ) : (
          <Tooltip title={record.remark} placement="topLeft">
            <span style={{ color: record.remark ? 'var(--color-text-primary, #333)' : 'var(--color-text-quaternary, #bfbfbf)' }}>
              {record.remark || '-'}
            </span>
          </Tooltip>
        );
      },
    },
    ...(canEdit && isManual ? [{
      title: '操作', key: 'action', width: 60,
      render: (_: any, record: ProductSku) => {
        const key = getRowKey(record);
        return (
          <Popconfirm title="确定删除此SKU？" onConfirm={() => handleDeleteRow(key)}>
            <Button type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        );
      },
    }] : []),
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Space size="middle">
          <span style={{ fontWeight: 500, fontSize: 14 }}>SKU模式：</span>
          <Switch checked={isManual} onChange={handleModeToggle} checkedChildren="手动编辑" unCheckedChildren="自动生成" />
          <span style={{ fontSize: 12, color: 'var(--color-text-tertiary, #8c8c8c)' }}>
            {isManual ? '可自由编辑SKU编码、颜色、尺码等信息' : 'SKU编码按「款号+颜色+尺码」自动生成'}
          </span>
        </Space>

        <Space>
          {!isEditing ? (
            <Button type="primary" icon={<EditOutlined />} onClick={() => setIsEditing(true)}>
              编辑
            </Button>
          ) : (
            <>
              {isManual && (
                <Dropdown menu={{ items: addMenuItems }} trigger={['hover']}>
                  <Button icon={<PlusOutlined />}>新增SKU</Button>
                </Dropdown>
              )}
              <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
                保存
              </Button>
              <Button icon={<RollbackOutlined />} onClick={handleCancelEdit}>
                退回
              </Button>
            </>
          )}
          <Tooltip title="将当前SKU信息同步到关联的大货订单">
            <Button icon={<CloudUploadOutlined />} onClick={handleSyncToProduction} loading={syncing}>
              同步到大货
            </Button>
          </Tooltip>
          <Button icon={<SyncOutlined />} onClick={fetchSkus} loading={loading}>
            刷新
          </Button>
        </Space>
      </div>

      <div style={{ marginBottom: 16, padding: '12px 16px', background: 'var(--color-bg-container, #fafafa)', borderRadius: 6, border: '1px solid var(--color-border-light, #f0f0f0)' }}>
        <Space size="middle" align="center">
          <span style={{ fontWeight: 500, fontSize: 14 }}>SKC编号：</span>
          {skcEditing ? (
            <>
              <Input value={skcValue} onChange={e => setSkcValue(e.target.value)} style={{ width: 200 }} placeholder="默认跟随款号，可修改" onPressEnter={handleSaveSkc} />
              <Button type="link" onClick={handleSaveSkc} loading={skcSaving}>保存</Button>
              <Button type="link" onClick={() => { setSkcEditing(false); setSkcValue(initialSkc || ''); }}>取消</Button>
            </>
          ) : (
            <>
              <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 500 }}>{skcValue || initialSkc || '-'}</span>
              <Button type="link" onClick={() => setSkcEditing(true)}>修改SKC</Button>
            </>
          )}
          <span style={{ fontSize: 12, color: 'var(--color-text-tertiary, #8c8c8c)' }}>
            默认跟随款号自动生成，修改后会同步到关联的生产订单
          </span>
        </Space>
      </div>

      <Table
        dataSource={skus}
        columns={columns}
        rowKey={(record) => String(getRowKey(record))}
        loading={loading}
       
        pagination={false}
        scroll={{ y: 400 }}
        rowClassName={(_, index) => (index % 2 === 1 ? 'ant-table-row-striped' : '')}
      />

      <div style={{ marginTop: 12, fontSize: 12, color: 'var(--color-text-tertiary, #8c8c8c)', lineHeight: 1.8 }}>
        <div>自动生成模式：SKU编码按「款号+颜色+尺码」规则自动生成，如 {styleNo}-红色-S</div>
        <div>手动编辑模式：可自由修改SKU编码、颜色、尺码等信息，保存后系统不会覆盖您的修改</div>
        <div>新增SKU：鼠标悬停可选择添加1/5/10/20行</div>
      </div>
      <SmallModal
        open={rollbackOpen}
        title="退回编辑"
        okText="确认退回"
        okButtonProps={{ danger: true }}
        onOk={() => rollbackForm.submit()}
        onCancel={() => { setRollbackOpen(false); rollbackForm.resetFields(); }}
        destroyOnHidden
      >
        <Form form={rollbackForm} layout="vertical" onFinish={handleRollbackOk}>
          <p style={{ marginBottom: 8, color: 'var(--color-text-secondary, #666)' }}>确定退回当前编辑？所有未保存的修改将被丢弃。</p>
          <Form.Item name="remark" label="退回备注（可选）">
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} maxLength={200} showCount placeholder="请输入退回备注" autoFocus />
          </Form.Item>
        </Form>
      </SmallModal>
    </div>
  );
};

export default StyleSkuTab;
