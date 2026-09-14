import React, { useMemo } from 'react';
import { Drawer, Button, Table, Empty, Statistic, App, Image } from 'antd';
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

// 来源类型 → 中文标签：合并采购单里明确区分样衣/大货各自贡献（D-296）
const SOURCE_TYPE_LABELS: Record<string, string> = {
  ORDER: '大货',
  SAMPLE: '样衣',
  BATCH: '批量',
  PURCHASE_TASK: '采购任务',
};

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
      render: (text: string) => <span className="u-fw-600">{text}</span>,
    },
    {
      title: '图片',
      dataIndex: 'styleImageUrl',
      width: 60,
      render: (url: string, row: any) => {
        const imgUrl = url || row.styleImageUrl;
        if (!imgUrl) {
          return (
            <div className="u-br-4 u-d-flex u-ai-center u-jc-center u-fs-10" style={{ width: 40, height: 40, background: 'var(--color-bg-base)', color: 'var(--color-text-tertiary)' }}>
              无图
            </div>
          );
        }
        return <Image src={imgUrl} width={40} height={40} className="u-br-4 u-objf-cover" />;
      },
    },
    {
      title: '物料名称',
      dataIndex: 'materialName',
      width: 200,
      fixed: 'left',
      render: (name: string, row) => (
        <div className="u-d-flex u-fd-column">
          <span className="u-fw-600">{name}</span>
          <span className="u-fs-12" style={{ color: 'var(--color-text-secondary)' }}>{row.materialCode}</span>
          {row.specifications && (
            <span className="u-fs-12" style={{ color: 'var(--color-text-tertiary)' }}>{row.specifications}</span>
          )}
          {row.color && (
            <span className="u-fs-12" style={{ color: 'var(--color-text-tertiary)' }}>颜色: {row.color}</span>
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
          <div className="u-d-flex u-fd-column" style={{ gap: 2 }}>
            {row.sourceItems.map((s, i) => (
              <span key={i} className="u-fs-12" style={{ color: 'var(--color-text-secondary)' }}>
                [{SOURCE_TYPE_LABELS[String(s.sourceType || '').toUpperCase()] || '来源'}] {s.sourceNo || '-'}{' '}
                <span style={{ color: 'var(--color-text-tertiary)' }}>×{s.quantity}</span>
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
      styles={{ wrapper: { width: '85%' } }}
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
          <div className="u-d-flex" style={{ gap: 24 }}>
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
          <div className="u-d-flex u-gap-8">
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
