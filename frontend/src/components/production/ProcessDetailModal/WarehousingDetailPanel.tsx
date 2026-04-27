import React from 'react';
import { formatDateTime } from '@/utils/datetime';
import ResizableTable from '@/components/common/ResizableTable';
import InfoItem from './InfoItem';
import type { ProductionOrder } from '@/types/production';

interface WarehousingDetailPanelProps {
  record: ProductionOrder;
  warehousingSkuRows: Array<{ color: string; size: string; quantity: number }>;
  onNavigateToPayroll: (processName: string) => void;
}

const WarehousingDetailPanel: React.FC<WarehousingDetailPanelProps> = ({
  record,
  warehousingSkuRows,
  onNavigateToPayroll,
}) => {
  const orderQty = record.orderQuantity || 0;
  const cuttingQty = record.cuttingQuantity || orderQty;
  const qualifiedQty = record.warehousingQualifiedQuantity || 0;
  const unqualifiedQty = record.unqualifiedQuantity || 0;
  const repairQty = (record.repairQuantity as number) || 0;
  const stockQty = record.inStockQuantity || 0;
  const qualifiedRate = cuttingQty > 0 ? Math.round((qualifiedQty / cuttingQty) * 100) : 0;

  return (
    <div>
      <OrderInfoGrid record={record} />
      <WarehouseOperationInfo record={record} onNavigateToPayroll={onNavigateToPayroll} />
      <WarehouseStatsCards
        qualifiedQty={qualifiedQty}
        unqualifiedQty={unqualifiedQty}
        repairQty={repairQty}
        stockQty={stockQty}
        qualifiedRate={qualifiedRate}
      />
      <WarehouseSizeTable warehousingSkuRows={warehousingSkuRows} />
    </div>
  );
};

const OrderInfoGrid: React.FC<{ record: ProductionOrder }> = ({ record }) => (
  <div style={{
    background: '#f8f9fa',
    padding: '12px',
    borderRadius: '6px',
    marginBottom: '12px',
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '12px',
    fontSize: '13px'
  }}>
    <InfoItem label="订单号" value={record.orderNo} />
    <InfoItem label="款号" value={record.styleNo} />
    <InfoItem label="款名" value={record.styleName} />
  </div>
);

const WarehouseOperationInfo: React.FC<{
  record: ProductionOrder;
  onNavigateToPayroll: (processName: string) => void;
}> = ({ record, onNavigateToPayroll }) => (
  <div style={{
    background: 'var(--color-bg-base)',
    border: '1px solid var(--color-border)',
    borderRadius: '6px',
    padding: '12px',
    marginBottom: '12px',
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '12px',
    fontSize: '13px'
  }}>
    <div>
      <span style={{ color: 'var(--color-text-secondary)' }}>入库单号：</span>
      <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
        {(record.warehousingOrderNo as any) || '-'}
      </span>
    </div>
    <div>
      <span style={{ color: 'var(--color-text-secondary)' }}>操作人：</span>
      {record.warehousingOperatorName ? (
        <a
          style={{ cursor: 'pointer', color: 'var(--color-primary)', fontWeight: 600 }}
          onClick={() => {
            if (record?.orderNo) {
              onNavigateToPayroll('入库');
            }
          }}
        >
          {record.warehousingOperatorName}
        </a>
      ) : (
        <span style={{ fontWeight: 600, color: '#111827' }}>-</span>
      )}
    </div>
    <div>
      <span style={{ color: 'var(--color-text-secondary)' }}>开始时间：</span>
      <span style={{ fontWeight: 500, color: '#111827' }}>
        {formatDateTime(record.warehousingStartTime)}
      </span>
    </div>
    <div>
      <span style={{ color: 'var(--color-text-secondary)' }}>完成时间：</span>
      <span style={{ fontWeight: 500, color: '#111827' }}>
        {formatDateTime(record.warehousingEndTime)}
      </span>
    </div>
  </div>
);

const WarehouseStatsCards: React.FC<{
  qualifiedQty: number;
  unqualifiedQty: number;
  repairQty: number;
  stockQty: number;
  qualifiedRate: number;
}> = ({ qualifiedQty, unqualifiedQty, repairQty, stockQty, qualifiedRate }) => (
  <div style={{
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '8px',
    marginBottom: '8px'
  }}>
    {[
      { label: '合格入库', value: qualifiedQty, color: 'var(--color-success)', percent: qualifiedRate },
      { label: '次品数', value: unqualifiedQty, color: '#dc2626' },
      { label: '返修数', value: repairQty, color: 'var(--color-warning)' },
      { label: '库存', value: stockQty, color: 'var(--color-primary)' },
    ].map((item) => (
      <div
        key={item.label}
        style={{
          background: 'var(--color-bg-base)',
          border: '1px solid var(--color-border)',
          borderRadius: '6px',
          padding: '8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}
      >
        <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
          {item.label}
        </span>
        <span style={{ fontSize: '18px', fontWeight: 700, color: item.color }}>
          {item.value as any}
        </span>
        {item.percent !== undefined && (
          <span style={{ fontSize: '10px', color: 'var(--color-text-tertiary)' }}>
            占比 {item.percent}%
          </span>
        )}
      </div>
    ))}
  </div>
);

const WarehouseSizeTable: React.FC<{
  warehousingSkuRows: Array<{ color: string; size: string; quantity: number }>;
}> = ({ warehousingSkuRows }) => (
  <div style={{
    background: 'var(--color-bg-base)',
    border: '1px solid var(--color-border)',
    borderRadius: '6px',
    padding: '12px',
  }}>
    <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: '#111827' }}>
      码数明细
    </div>
    <ResizableTable
      storageKey="process-detail-sizes"
      dataSource={warehousingSkuRows.map((sku, index) => ({
        key: index,
        color: sku.color,
        size: sku.size,
        quantity: sku.quantity,
      }))}
      columns={[
        { title: '颜色', dataIndex: 'color', key: 'color', width: 100 },
        { title: '尺码', dataIndex: 'size', key: 'size', width: 80 },
        {
          title: '数量',
          dataIndex: 'quantity',
          key: 'quantity',
          width: 80,
          align: 'right' as const,
          render: (v: number) => <span style={{ fontWeight: 600 }}>{v}</span>,
        },
      ]}
      pagination={false}
      size="small"
      locale={{ emptyText: '暂无码数明细' }}
      summary={(pageData) => {
        if (pageData.length === 0) return null;
        const total = pageData.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
        return (
          <ResizableTable.Summary.Row style={{ background: 'var(--color-bg-container)' }}>
            <ResizableTable.Summary.Cell index={0} colSpan={2}>
              <span style={{ fontWeight: 600 }}>合计</span>
            </ResizableTable.Summary.Cell>
            <ResizableTable.Summary.Cell index={1} align="right">
              <span style={{ fontWeight: 700, color: 'var(--color-success)' }}>{total} 件</span>
            </ResizableTable.Summary.Cell>
          </ResizableTable.Summary.Row>
        );
      }}
    />
  </div>
);

export default WarehousingDetailPanel;
