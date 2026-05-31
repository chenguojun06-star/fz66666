import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, Alert, Button, Space, Typography, Select, Checkbox, Tooltip, Tag } from 'antd';
import { InboxOutlined, CopyOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import WarehouseLocationAutoComplete from '@/components/common/WarehouseLocationAutoComplete';
import { useWarehouseAreaOptions } from '@/hooks/useWarehouseAreaOptions';
import { WarehousingDetailRecord } from '../../types';

const { Text } = Typography;

type RowLocationState = {
  areaId: string;
  locationCode: string;
};

interface Props {
  qcRecords: WarehousingDetailRecord[];
  warehousingLoading: boolean;
  onSubmit: (items: { id: string; warehouse: string }[]) => Promise<void>;
}

const WarehousingActionPanel: React.FC<Props> = ({
  qcRecords, warehousingLoading, onSubmit,
}) => {
  const { selectOptions: finishedWarehouseOptions, areas } = useWarehouseAreaOptions('FINISHED');
  const defaultAreaId = useMemo(() => areas.length > 0 ? areas[0].id : '', [areas]);

  const pendingRecords = useMemo(() => qcRecords.filter(r => {
    const qs = String(r.qualityStatus || '').trim().toLowerCase();
    return (!qs || qs === 'qualified') && Number(r.qualifiedQuantity || 0) > 0 && !String(r.warehouse || '').trim();
  }), [qcRecords]);

  const pendingQty = pendingRecords.reduce((s, r) => s + (Number(r.qualifiedQuantity) || 0), 0);
  const allIds = useMemo(() => pendingRecords.map(r => String(r.id)), [pendingRecords]);

  const [selectedIds, setSelectedIds] = useState<string[]>(allIds);
  const [rowLocations, setRowLocations] = useState<Record<string, RowLocationState>>({});

  useEffect(() => {
    setSelectedIds(allIds);
  }, [allIds]);

  useEffect(() => {
    if (!defaultAreaId) return;
    setRowLocations(prev => {
      const next = { ...prev };
      let changed = false;
      for (const r of pendingRecords) {
        const id = String(r.id);
        if (!next[id]) {
          next[id] = { areaId: defaultAreaId, locationCode: '' };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [pendingRecords, defaultAreaId]);

  const allChecked = selectedIds.length === allIds.length && allIds.length > 0;
  const indeterminate = selectedIds.length > 0 && selectedIds.length < allIds.length;

  const handleToggleAll = useCallback(() => {
    setSelectedIds(allChecked ? [] : allIds);
  }, [allChecked, allIds]);

  const handleToggleRow = useCallback((id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }, []);

  const updateRowLocation = useCallback((id: string, field: keyof RowLocationState, value: string) => {
    setRowLocations(prev => ({
      ...prev,
      [id]: { ...(prev[id] || { areaId: defaultAreaId, locationCode: '' }), [field]: value },
    }));
  }, [defaultAreaId]);

  const handleBatchSetLocation = useCallback((areaId: string, locationCode: string) => {
    setRowLocations(prev => {
      const next = { ...prev };
      for (const id of selectedIds) {
        next[id] = { areaId, locationCode };
      }
      return next;
    });
  }, [selectedIds]);

  const [batchAreaId, setBatchAreaId] = useState<string>(defaultAreaId);
  const [batchLocationCode, setBatchLocationCode] = useState('');

  useEffect(() => {
    if (defaultAreaId && !batchAreaId) setBatchAreaId(defaultAreaId);
  }, [defaultAreaId, batchAreaId]);

  const handleSubmit = useCallback(async () => {
    if (selectedIds.length === 0) return;
    const items: { id: string; warehouse: string }[] = [];
    const missing: string[] = [];
    for (const id of selectedIds) {
      const loc = rowLocations[id];
      if (!loc || !loc.locationCode) {
        const r = pendingRecords.find(x => String(x.id) === id);
        missing.push(r ? String(r.cuttingBundleQrCode || id).split('|')[0] : id);
      } else {
        items.push({ id, warehouse: loc.locationCode });
      }
    }
    if (missing.length > 0) {
      return;
    }
    await onSubmit(items);
  }, [selectedIds, rowLocations, pendingRecords, onSubmit]);

  const selectedMissingLocation = useMemo(() => {
    return selectedIds.some(id => {
      const loc = rowLocations[id];
      return !loc || !loc.locationCode;
    });
  }, [selectedIds, rowLocations]);

  const locationGroups = useMemo(() => {
    const groups = new Map<string, number>();
    for (const id of selectedIds) {
      const loc = rowLocations[id];
      const key = loc?.locationCode || '(未选库位)';
      groups.set(key, (groups.get(key) || 0) + 1);
    }
    return groups;
  }, [selectedIds, rowLocations]);

  if (!pendingRecords.length) {
    return <Alert type="success" title="该订单所有合格质检记录均已入库完成！" showIcon />;
  }

  return (
    <>
      <Alert type="info" showIcon style={{ marginBottom: 16 }}
        title={`共 ${pendingRecords.length} 条合格记录待入库，合格数量合计 ${pendingQty} 件`} />

      <Card
        title={
          <Space>
            <span>待入库记录</span>
            <Checkbox indeterminate={indeterminate} checked={allChecked} onChange={handleToggleAll}>全选</Checkbox>
            {!allChecked && (
              <Text type="secondary" style={{ fontSize: 12 }}>已选 {selectedIds.length}/{pendingRecords.length} 条</Text>
            )}
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        <ResizableTable<WarehousingDetailRecord>
          rowKey="id" pagination={false}
          dataSource={pendingRecords}
          resizableColumns={false}
          scroll={{ x: 900 }}
          style={{ fontSize: 12 }}
          columns={[
            {
              title: '',
              key: 'select',
              width: 40,
              render: (_: unknown, r: WarehousingDetailRecord) => (
                <Checkbox
                  checked={selectedIds.includes(String(r.id))}
                  onChange={() => handleToggleRow(String(r.id))}
                />
              ),
            },
            { title: '质检入库号', dataIndex: 'warehousingNo', key: 'wn', width: 100 },
            {
              title: '菲号', dataIndex: 'cuttingBundleQrCode', key: 'qr', width: 90, ellipsis: true,
              render: (v: unknown) => { const t = String(v || '').split('|')[0].trim(); if (!t) return '-'; const parts = t.split('-'); return parts.length > 3 ? parts.slice(-3).join('-') : t; },
            },
            { title: '颜色', dataIndex: 'color', key: 'c', width: 60 },
            { title: '尺码', dataIndex: 'size', key: 's', width: 55 },
            { title: '合格数', dataIndex: 'qualifiedQuantity', key: 'qq', width: 65, align: 'right' as const },
            {
              title: '仓库',
              key: 'area',
              width: 140,
              render: (_: unknown, r: WarehousingDetailRecord) => {
                const id = String(r.id);
                const loc = rowLocations[id] || { areaId: defaultAreaId, locationCode: '' };
                return (
                  <Select
                    value={loc.areaId || undefined}
                    onChange={(v) => updateRowLocation(id, 'areaId', v)}
                    options={finishedWarehouseOptions}
                    style={{ width: '100%' }}
                    size="small"
                    placeholder="仓库"
                  />
                );
              },
            },
            {
              title: '库位',
              key: 'location',
              width: 160,
              render: (_: unknown, r: WarehousingDetailRecord) => {
                const id = String(r.id);
                const loc = rowLocations[id] || { areaId: defaultAreaId, locationCode: '' };
                return (
                  <WarehouseLocationAutoComplete
                    warehouseType="FINISHED"
                    areaId={loc.areaId}
                    placeholder="库位"
                    value={loc.locationCode || undefined}
                    onChange={(v) => updateRowLocation(id, 'locationCode', String(v || '').trim())}
                    style={{ width: '100%' }}
                  />
                );
              },
            },
          ]}
        />
      </Card>

      <Card title={
        <Space>
          <span>批量设置库位</span>
          <Tooltip title="为已选中的记录统一设置仓库和库位">
            <Text type="secondary" style={{ fontSize: 12 }}>(选中 {selectedIds.length} 条)</Text>
          </Tooltip>
        </Space>
      }>
        <Space style={{ width: '100%' }} size="middle" wrap>
          <Text strong>仓库：</Text>
          <Select
            value={batchAreaId || undefined}
            onChange={(v) => { setBatchAreaId(v); setBatchLocationCode(''); }}
            options={finishedWarehouseOptions}
            style={{ width: 180 }}
            placeholder="请选择仓库"
          />
          <Text strong>库位：</Text>
          <WarehouseLocationAutoComplete
            warehouseType="FINISHED"
            areaId={batchAreaId}
            placeholder="请选择或输入库位"
            value={batchLocationCode || undefined}
            onChange={(v) => setBatchLocationCode(String(v || '').trim())}
            style={{ width: 220 }}
          />
          <Button
            icon={<CopyOutlined />}
            disabled={!batchLocationCode || selectedIds.length === 0}
            onClick={() => handleBatchSetLocation(batchAreaId, batchLocationCode)}
          >
            应用到已选
          </Button>
        </Space>
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <Button type="primary" size="large" icon={<InboxOutlined />}
            loading={warehousingLoading} onClick={handleSubmit}
            disabled={selectedIds.length === 0 || selectedMissingLocation}>
            确认入库（{selectedIds.length} 条记录）
          </Button>
          {locationGroups.size > 0 && (
            <Space size={4} wrap>
              {Array.from(locationGroups.entries()).map(([loc, count]) => (
                <Tag key={loc} color={loc === '(未选库位)' ? 'error' : 'blue'} style={{ fontSize: 12 }}>
                  {loc}: {count}条
                </Tag>
              ))}
            </Space>
          )}
        </div>
      </Card>
    </>
  );
};

export default WarehousingActionPanel;
