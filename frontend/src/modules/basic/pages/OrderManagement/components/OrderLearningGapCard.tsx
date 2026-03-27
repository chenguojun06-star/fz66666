import React from 'react';
import { Alert } from 'antd';

interface OrderLearningGapCardProps {
  lines: string[];
}

const OrderLearningGapCard: React.FC<OrderLearningGapCardProps> = ({
  lines,
}) => {
  const effectiveLines = lines.length ? lines : ['当前方案与历史最优建议基本一致。'];

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {effectiveLines.map((line, index) => (
        <Alert
          key={`${line}-${index}`}
          type={index === 0 ? 'warning' : 'info'}
          showIcon
          message={line}
        />
      ))}
    </div>
  );
};

export default OrderLearningGapCard;
