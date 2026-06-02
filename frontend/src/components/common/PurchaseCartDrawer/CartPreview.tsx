import React, { useMemo } from 'react';
import { Drawer, Button, Table, Empty, Statistic, App } from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { CartPreview, PurchaseGroup } from '@/types/purchaseCart';

interface CartPreviewDrawerProps {
  open: boolean;
  data: CartPreview | null;
  onClose: () => void;
  onConfirm: () => void;
  submitting: boolean;
}

interface PreviewRow extends PurchaseGroup {
  groupLabel: string;
}

export const CartPreviewDrawer: React.FC<CartPreviewDrawerProps> = ({
  open,
  data,
  onClose,
  onConfirm,
  submitting,
}) => {
  const { message } = App.useApp();

  const flatRows = useMemo<PreviewRow[]>(() => {
    if (!data?.purchaseGroups) return [];
    return data.purchaseGroups.map((group, idx) => ({
      ...group,
      groupLabel: `采购单 ${idx + 1}`,
    }));
  }, [data]);

  const handleConfirm = async () => {
    if (!data || data.purchaseGroups.length === 0) {
      message.warning('没有可下单的物料');
      return;
    }
    onConfirm();
  };

  const columns: ColumnsType<PreviewRow> = [
    {
      title: '采购单',
      dataIndex: 'groupLabel',
      width: 90,
      fixed: 'left',
      render: (text: string) => <span style={{ fontWeight: 600 }}>{text}</span>,
    },
    {
      title: '物料名称',
      dataIndex: 'materialName',
      width: 200,
      fixed: 'left',
      render: (name: string, row) => (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontWeight: 600 }}>{name}</span>
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{row.materialCode}</span>
          {row.specifications && (
            <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{row.specifications}</span>
          )}
        </div>
      ),
    },
    {
      title: '供应商',
      dataIndex: 'supplierName',
      width: 160,
      render: (name?: string) => name || <span style={{ color: 'var(--color-text-tertiary)' }}>-</span>,
    },
    {
      title: '总数量',
      dataIndex: 'totalQuantity',
      width: 110,
      align: 'right',
      render: (qty: number) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{qty}</span>,
    },
    {
      title: '金额',
      dataIndex: 'totalAmount',
      width: 130,
      align: 'right',
      render: (amount?: number) => amount
        ? <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-primary)' }}>¥{amount.toFixed(2)}</span>
        : <span style={{ color: 'var(--color-text-tertiary)' }}>-</span>,
    },
    {
      title: '来源',
      key: 'source',
      render: (_, row) => {
        if (!row.sourceItems || row.sourceItems.length === 0) {
          return <span style={{ color: 'var(--color-text-tertiary)' }}>-</span>;
        }
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {row.sourceItems.map((s, i) => (
              <span key={i} style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                {s.sourceNo || '-'} <span style={{ color: 'var(--color-text-tertiary)' }}>×{s.quantity}</span>
              </span>
            ))}
          </div>
        );
      },
    },
  ];

  return (
    <Drawer
      title="采购预览"
      placement="right"
      size="large"
      open={open}
      onClose={onClose}
      maskClosable={false}
      footer={
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            width: '100%',
          }}
        >
          <div style={{ display: 'flex', gap: 24 }}>
            <Statistic
              title="采购单数"
              value={data?.summary?.totalGroups ?? 0}
              valueStyle={{ fontSize: 16 }}
            />
            <Statistic
              title="物料件数"
              value={data?.summary?.totalItems ?? 0}
              valueStyle={{ fontSize: 16 }}
            />
            <Statistic
              title="合计金额"
              value={data?.summary?.totalAmount ?? 0}
              precision={2}
              prefix="¥"
              valueStyle={{ fontSize: 16, color: 'var(--color-primary)' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={onClose} disabled={submitting}>
              取消
            </Button>
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              onClick={handleConfirm}
              loading={submitting}
              disabled={!data || data.purchaseGroups.length === 0}
            >
              确认下单
            </Button>
          </div>
        </div>
      }
    >
      {!data || data.purchaseGroups.length === 0 ? (
        <Empty description="暂无预览数据" style={{ marginTop: 80 }} />
      ) : (
        <Table<PreviewRow>
          rowKey="groupKey"
          size="middle"
          columns={columns}
          dataSource={flatRows}
          pagination={false}
          scroll={{ x: 900 }}
        />
      )}
    </Drawer>
  );
};

export default CartPreviewDrawer;
