import React from 'react';
import { Form, Tag, Tooltip } from 'antd';
import type { StockInfo } from './useStockCheck';

interface StockInfoDisplayProps {
  materialCode: string | undefined;
  stockInfo: StockInfo | null;
  unit: string | undefined;
}

const StockInfoDisplay: React.FC<StockInfoDisplayProps> = ({ materialCode, stockInfo, unit }) => {
  if (!materialCode) {
    return <div style={{ height: 32 }} />;
  }

  return (
    <Form.Item label="当前库存">
      {stockInfo ? (
        <div>
          <Tag color={stockInfo.quantity < stockInfo.safetyStock ? 'red' : 'green'}>
            {stockInfo.quantity} {unit || ''}
          </Tag>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--neutral-text-disabled)' }}>
            位置: {stockInfo.location}
          </span>
          {stockInfo.quantity < stockInfo.safetyStock && (
            <Tooltip title={`低于安全库存 (${stockInfo.safetyStock})`}>
              <Tag color="error" style={{ marginLeft: 8 }}>预警</Tag>
            </Tooltip>
          )}
        </div>
      ) : (
        <span style={{ color: 'var(--neutral-text-disabled)' }}>查询中...</span>
      )}
    </Form.Item>
  );
};

export default StockInfoDisplay;
