import React from 'react';
import OrderColorSizeMatrix from '@/components/common/OrderColorSizeMatrix';
import type { SizeQuantityColorRow } from './orderInfoSummaryOrchestrator';

interface OrderSizeQuantitySummaryProps {
  sizes: string[];
  rows: SizeQuantityColorRow[];
  totalLabel?: string;
}

const OrderSizeQuantitySummary: React.FC<OrderSizeQuantitySummaryProps> = ({
  sizes,
  rows,
  totalLabel = '总数',
}) => {
  const items = React.useMemo(
    () => rows.flatMap((row) => sizes.map((size) => ({
      color: row.color,
      size,
      quantity: Number(row.quantities[size] || 0),
    }))),
    [rows, sizes],
  );

  return (
    <OrderColorSizeMatrix
      items={items}
      fallbackSize={sizes.join('/')}
      totalLabel={totalLabel}
      columnMinWidth={24}
      gap={10}
      fontSize={12}
    />
  );
};

export default OrderSizeQuantitySummary;
