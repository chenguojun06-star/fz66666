import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, Alert, Button, Space, Typography, Select, Checkbox } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import WarehouseLocationAutoComplete from '@/components/common/WarehouseLocationAutoComplete';
import { useWarehouseAreaOptions } from '@/hooks/useWarehouseAreaOptions';
import { WarehousingDetailRecord } from '../../types';

const { Text } = Typography;

interface Props {
  qcRecords: WarehousingDetailRecord[];
  warehouseValue: string;
  setWarehouseValue: (v: string) => void;
  warehousingLoading: boolean;
  onSubmit: (selectedIds?: string[]) => void;
}

const WarehousingActionPanel: React.FC<Props> = ({
  qcRecords, warehouseValue, setWarehouseValue, warehousingLoading, onSubmit,
}) => {
  const { selectOptions: finishedWarehouseOptions, areas } = useWarehouseAreaOptions('FINISHED');
  const [selectedAreaId, setSelectedAreaId] = useState<string>('');

  useEffect(() => {
    if (areas.length > 0 && !selectedAreaId) {
      setSelectedAreaId(areas[0].id);
    }
  }, [areas, selectedAreaId]);

  const pendingRecords = useMemo(() => qcRecords.filter(r => {
    const qs = String(r.qualityStatus || '').trim().toLowerCase();
    return (!qs || qs === 'qualified') && Number(r.qualifiedQuantity || 0) > 0 && !String(r.warehouse || '').trim();
  }), [qcRecords]);

  const pendingQty = pendingRecords.reduce((s, r) => s + (Number(r.qualifiedQuantity) || 0), 0);
  const allIds = useMemo(() => pendingRecords.map(r => String(r.id)), [pendingRecords]);

  const [selectedIds, setSelectedIds] = useState<string[]>(allIds);

  useEffect(() => {
    setSelectedIds(allIds);
  }, [allIds]);

  const allChecked = selectedIds.length === allIds.length && allIds.length > 0;
  const indeterminate = selectedIds.length > 0 && selectedIds.length < allIds.length;

  const handleToggleAll = useCallback(() => {
    setSelectedIds(allChecked ? [] : allIds);
  }, [allChecked, allIds]);

  const handleToggleRow = useCallback((id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }, []);

  const handleSubmit = useCallback(() => {
    if (selectedIds.length === 0) return;
    onSubmit(selectedIds);
  }, [selectedIds, onSubmit]);

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
            <Checkbox
              indeterminate={indeterminate}
              checked={allChecked}
              onChange={handleToggleAll}
            >
              全选
            </Checkbox>
            {!allChecked && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                已选 {selectedIds.length}/{pendingRecords.length} 条
              </Text>
            )}
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        <ResizableTable<WarehousingDetailRecord>
          rowKey="id" pagination={false}
          dataSource={pendingRecords}
          resizableColumns={false}
          scroll={undefined}
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
          ]}
        />
      </Card>

      <Card title="选择仓库并确认入库">
        <Space orientation="vertical" style={{ width: '100%' }} size="middle">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Text strong>仓库：</Text>
            <Select
              value={selectedAreaId || undefined}
              onChange={(v) => { setSelectedAreaId(v); setWarehouseValue(''); }}
              options={finishedWarehouseOptions}
              style={{ width: 180 }}
              placeholder="请选择仓库"
            />
            <Text strong>入库仓位：</Text>
            <WarehouseLocationAutoComplete
              warehouseType="FINISHED"
              areaId={selectedAreaId}
              placeholder="请选择或输入仓位"
              value={warehouseValue || undefined}
              onChange={(v) => setWarehouseValue(String(v || '').trim())}
              style={{ width: 220 }}
            />
          </div>
          <Button type="primary" size="large" icon={<InboxOutlined />}
            loading={warehousingLoading} onClick={handleSubmit}
            disabled={!warehouseValue || selectedIds.length === 0}>
            确认入库（{selectedIds.length} 条记录）
          </Button>
        </Space>
      </Card>
    </>
  );
};

export default WarehousingActionPanel;