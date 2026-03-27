import React from 'react';
import OrderSizeQuantitySummary from './OrderSizeQuantitySummary';
import type { SizeQuantitySummaryData } from './orderInfoSummaryOrchestrator';

interface OrderInfoSummaryProps {
  styleNo?: string;
  styleName?: string;
  sampleSummary: SizeQuantitySummaryData;
  orderSummary: SizeQuantitySummaryData;
  totalOrderQuantity: number;
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--neutral-text)',
  marginBottom: 10,
};

const OrderInfoSummary: React.FC<OrderInfoSummaryProps> = ({
  styleNo,
  styleName,
  sampleSummary,
  orderSummary,
  totalOrderQuantity,
}) => {
  return (
    <div
      style={{
        border: '1px solid var(--table-border-color)',
        borderRadius: 8,
        padding: 12,
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
        gap: 20,
      }}
    >
      <div>
        <div style={sectionTitleStyle}>样衣库存</div>
        <div style={{ display: 'flex', gap: 16, marginBottom: 10, fontSize: 12, color: 'var(--neutral-text-light)', flexWrap: 'wrap' }}>
          <div>款号 <span style={{ color: 'var(--neutral-text)' }}>{styleNo || '-'}</span></div>
          <div>款名 <span style={{ color: 'var(--neutral-text)' }}>{styleName || '-'}</span></div>
        </div>
        <OrderSizeQuantitySummary sizes={sampleSummary.sizes} rows={sampleSummary.rows} totalLabel="样衣总数" />
      </div>
      <div>
        <div style={sectionTitleStyle}>大货信息</div>
        <OrderSizeQuantitySummary sizes={orderSummary.sizes} rows={orderSummary.rows} totalLabel="下单总数" />
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--neutral-text-light)' }}>
          订单总数量 <span style={{ color: 'var(--neutral-text)', fontWeight: 600 }}>{totalOrderQuantity || 0}</span>
        </div>
      </div>
    </div>
  );
};

export default OrderInfoSummary;
