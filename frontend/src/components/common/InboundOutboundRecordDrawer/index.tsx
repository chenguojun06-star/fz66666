import React from 'react';
import { Card, Tag, Space, Button } from 'antd';
import { Drawer } from 'antd';
import type { DrawerProps } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import { getMaterialTypeCategory, getBaseMaterialTypeLabel } from '@/utils/materialType';
import { formatDateTime } from '@/utils/datetime';
import { canViewPrice } from '@/utils/sensitiveDataMask';
import type { UserInfo } from '@/utils/AuthContext';

interface TransactionRecord {
  type: 'IN' | 'OUT' | string;
  typeLabel?: string;
  operationTime?: string | null;
  quantity?: number;
  operatorName?: string;
  warehouseLocation?: string;
  remark?: string;
  unitPrice?: number;
  amount?: number;
}

interface InboundOutboundRecordDrawerProps extends Omit<DrawerProps, 'title' | 'children'> {
  open: boolean;
  onClose: () => void;
  materialData?: {
    materialCode?: string;
    materialName?: string;
    materialType?: string;
    unit?: string;
  } | null;
  records: TransactionRecord[];
  loading?: boolean;
  user?: UserInfo | null;
}

const InboundOutboundRecordDrawer: React.FC<InboundOutboundRecordDrawerProps> = ({
  open,
  onClose,
  materialData,
  records,
  loading = false,
  user = null,
  ...restProps
}) => {
  const canSeePrice = canViewPrice(user);

  const columns = [
    {
      title: '类型',
      dataIndex: 'typeLabel',
      width: 80,
      render: (text: string, record: TransactionRecord) => (
        <Tag color={record.type === 'IN' ? 'blue' : 'orange'}>{text || record.type}</Tag>
      ),
    },
    {
      title: '日期',
      dataIndex: 'operationTime',
      width: 160,
      render: (v: string) => v ? formatDateTime(v) : '-',
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      width: 100,
      render: (v: number) => `${v ?? 0} ${materialData?.unit || ''}`,
    },
    {
      title: '单价',
      dataIndex: 'unitPrice',
      width: 100,
      align: 'right' as const,
      render: (v: number) => {
        if (!canSeePrice) return '***';
        return v != null && Number.isFinite(Number(v)) ? `¥${Number(v).toFixed(2)}` : '-';
      },
    },
    {
      title: '入库金额',
      dataIndex: 'inboundAmount',
      width: 120,
      align: 'right' as const,
      render: (_: any, record: TransactionRecord) => {
        if (!canSeePrice) return '***';
        if (record.type !== 'IN') return '-';
        const amount = record.amount ?? (Number(record.quantity || 0) * Number(record.unitPrice || 0));
        return amount ? `¥${Number(amount).toFixed(2)}` : '-';
      },
    },
    {
      title: '出库金额',
      dataIndex: 'outboundAmount',
      width: 120,
      align: 'right' as const,
      render: (_: any, record: TransactionRecord) => {
        if (!canSeePrice) return '***';
        if (record.type !== 'OUT') return '-';
        const amount = record.amount ?? (Number(record.quantity || 0) * Number(record.unitPrice || 0));
        return amount ? `¥${Number(amount).toFixed(2)}` : '-';
      },
    },
    {
      title: '操作人',
      dataIndex: 'operatorName',
      width: 100,
      render: (v: string) => v || '-',
    },
    {
      title: '库位',
      dataIndex: 'warehouseLocation',
      width: 100,
      render: (v: string) => v || '-',
    },
    {
      title: '备注',
      dataIndex: 'remark',
      render: (v: string) => v || '-',
    },
  ];

  return (
    <Drawer
      title="出入库记录"
      open={open}
      onClose={onClose}
      size="large"
      styles={{ wrapper: { width: '80%' }, body: { padding: 16 } }}
      footer={[
        <Button key="close" onClick={onClose}>
          关闭
        </Button>,
      ]}
      destroyOnHidden
      {...restProps}
    >
      {materialData && (
        <Card style={{ marginBottom: 16, background: 'var(--color-bg-subtle)' }}>
          <Space orientation="vertical" size={8} style={{ width: '100%' }}>
            <div>
              <strong style={{ fontSize: 'var(--font-size-lg)' }}>{materialData.materialCode}</strong>
              <Tag
                color={
                  getMaterialTypeCategory(materialData.materialType) === 'fabric' ? 'blue' :
                  getMaterialTypeCategory(materialData.materialType) === 'lining' ? 'cyan' : 'green'
                }
                style={{ marginLeft: 8 }}
              >
                {getBaseMaterialTypeLabel(materialData.materialType)}
              </Tag>
            </div>
            <div style={{ fontSize: 'var(--font-size-base)' }}>{materialData.materialName}</div>
          </Space>
        </Card>
      )}

      <ResizableTable
        storageKey="material-inventory-details-drawer"
        loading={loading}
        dataSource={records}
        rowKey={(r) => `${r.type}-${r.operationTime}-${records.indexOf(r)}`}
        columns={columns}
        pagination={false}
        scroll={{ y: 400 }}
      />
    </Drawer>
  );
};

export default InboundOutboundRecordDrawer;
