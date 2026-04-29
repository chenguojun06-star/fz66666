import React from 'react';
import { Card, Alert, Button, Space, Typography, Tag } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import DictAutoComplete from '@/components/common/DictAutoComplete';
import { WarehousingDetailRecord } from '../../types';

const { Text } = Typography;

interface Props {
  qcRecords: WarehousingDetailRecord[];
  warehouseValue: string;
  setWarehouseValue: (v: string) => void;
  warehousingLoading: boolean;
  onSubmit: () => void;
}

const WarehousingActionPanel: React.FC<Props> = ({
  qcRecords, warehouseValue, setWarehouseValue, warehousingLoading, onSubmit,
}) => {
  const pendingRecords = qcRecords.filter(r => {
    const qs = String(r.qualityStatus || '').trim().toLowerCase();
    return (!qs || qs === 'qualified') && Number(r.qualifiedQuantity || 0) > 0 && !String(r.warehouse || '').trim();
  });
  const pendingQty = pendingRecords.reduce((s, r) => s + (Number(r.qualifiedQuantity) || 0), 0);

  if (!pendingRecords.length) {
    return <Alert type="success" title="该订单所有合格质检记录均已入库完成！" showIcon />;
  }

  return (
    <>
      <Alert type="info" showIcon style={{ marginBottom: 16 }}
        title={`共 ${pendingRecords.length} 条合格记录待入库，合格数量合计 ${pendingQty} 件`} />

      <Card size="small" title="待入库记录" style={{ marginBottom: 16 }}>
        <ResizableTable<WarehousingDetailRecord>
          size="small" rowKey="id" pagination={false}
          dataSource={pendingRecords}
          resizableColumns={false}
          scroll={undefined}
          style={{ fontSize: 12 }}
          columns={[
            { title: '质检入库号', dataIndex: 'warehousingNo', key: 'wn', width: 110 },
            {
              title: '菲号', dataIndex: 'cuttingBundleQrCode', key: 'qr', width: 100, ellipsis: true,
              render: (v: unknown) => { const t = String(v || '').split('|')[0].trim(); if (!t) return '-'; const parts = t.split('-'); return parts.length > 3 ? parts.slice(-3).join('-') : t; },
            },
            { title: '颜色', dataIndex: 'color', key: 'c', width: 70 },
            { title: '尺码', dataIndex: 'size', key: 's', width: 60 },
            { title: '合格数', dataIndex: 'qualifiedQuantity', key: 'qq', width: 70, align: 'right' as const },
          ]}
        />
      </Card>

      <Card size="small" title="选择仓库并确认入库">
        <Space orientation="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Text strong style={{ marginRight: 8 }}>入库仓库：</Text>
            <Tag color="blue" style={{ marginRight: 8 }}>成品仓</Tag>
            <DictAutoComplete
              dictType="warehouse_location"
              placeholder="请选择或输入仓库"
              value={warehouseValue || undefined}
              onChange={(v) => setWarehouseValue(String(v || '').trim())}
              style={{ width: 200 }}
            />
          </div>
          <Button type="primary" size="large" icon={<InboxOutlined />}
            loading={warehousingLoading} onClick={onSubmit}
            disabled={!warehouseValue}>
            确认入库（{pendingRecords.length} 条记录）
          </Button>
        </Space>
      </Card>
    </>
  );
};

export default WarehousingActionPanel;
